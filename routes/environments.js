import { Router } from "express";
import { exec } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, basename } from "path";
import {
  getRepoById, listEnvironments, getEnvironment,
  upsertEnvironment, deleteEnvironment,
} from "../db.js";
import { loadConfig, COLORS } from "../lib/config.js";
import { getGhRepo } from "../lib/github.js";

const router = Router();

router.get("/environments", (_req, res) => {
  res.json(listEnvironments());
});

// ── Assign issue to environment ─────────────────────────────────────────────

router.post("/environments/:color/assign", (req, res) => {
  const { color } = req.params;
  const { issue, repoId } = req.body;
  const repo = getRepoById(repoId);
  if (!repo) return res.status(400).json({ error: "No repo configured" });

  const repoName = basename(repo.repoDir);
  const envName = `${repoName}-${color}`;
  const envPath = join(repo.workDir, envName);
  const branchName = issue.custom
    ? `task-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`
    : `issue-${issue.number}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

  upsertEnvironment(color, { issue, repoId: repo.id, branch: branchName, path: envPath });

  if (repo.mode === "worktree") {
    const cmd = `cd "${repo.repoDir}" && git worktree add "${envPath}" -b "${branchName}" 2>&1 || git worktree add "${envPath}" "${branchName}" 2>&1`;
    exec(cmd, (err, stdout) => {
      if (err && !existsSync(envPath)) {
        return res.status(500).json({ error: stdout || err.message });
      }
      injectIssueContext(envPath, issue, branchName);
      res.json({ ok: true, path: envPath, branch: branchName });
    });
  } else {
    if (existsSync(envPath)) {
      injectIssueContext(envPath, issue, branchName);
      return res.json({ ok: true, path: envPath, branch: branchName, existed: true });
    }
    const cmd = `git clone "${repo.repoDir}" "${envPath}" && cd "${envPath}" && git checkout -b "${branchName}" 2>&1`;
    exec(cmd, (err, stdout) => {
      if (err) return res.status(500).json({ error: stdout || err.message });
      injectIssueContext(envPath, issue, branchName);
      res.json({ ok: true, path: envPath, branch: branchName });
    });
  }
});

function injectIssueContext(envPath, issue, branchName) {
  const labels = (issue.labels ?? []).map((l) => l.name).join(", ");
  const claudeMd = [
    `# Current Task`,
    ``,
    `You are working on issue #${issue.number}: **${issue.title}**`,
    issue.url ? `\nGitHub: ${issue.url}` : "",
    labels ? `\nLabels: ${labels}` : "",
    issue.body ? `\n## Issue Description\n\n${issue.body}` : "",
    ``,
    `## Instructions`,
    ``,
    `- Work on the branch \`${branchName}\``,
    `- Focus on resolving this issue`,
    `- Create atomic commits with clear messages`,
    `- When done, let the user know so they can create a PR`,
  ].filter(Boolean).join("\n");

  const claudePath = join(envPath, "CLAUDE.md");
  if (existsSync(claudePath)) {
    const existing = readFileSync(claudePath, "utf-8");
    writeFileSync(claudePath, existing + "\n\n" + claudeMd);
  } else {
    writeFileSync(claudePath, claudeMd);
  }
}

// ── Update issue ────────────────────────────────────────────────────────────

router.patch("/environments/:color/issue", (req, res) => {
  const { color } = req.params;
  const env = getEnvironment(color);
  if (!env) return res.status(404).json({ error: "No environment" });

  const { title, body } = req.body;
  const updatedIssue = { ...env.issue };
  if (title !== undefined) updatedIssue.title = title;
  if (body !== undefined) updatedIssue.body = body;

  upsertEnvironment(color, { ...env, issue: updatedIssue });
  res.json({ ok: true, issue: updatedIssue });
});

// ── Objective (for tmux pane display) ────────────────────────────────────────

router.get("/environments/:color/objective", (req, res) => {
  const { color } = req.params;
  const env = getEnvironment(color);
  if (!env) return res.type("text").send("No environment assigned");

  const colorDef = COLORS[color] ?? { hex: "#888" };
  const [r, g, b] = colorDef.hex.match(/\w{2}/g).map((h) => parseInt(h, 16));
  const c = (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
  const dim = (text) => `\x1b[2m${text}\x1b[0m`;
  const bold = (text) => `\x1b[1m${text}\x1b[0m`;

  const issue = env.issue ?? {};
  const title = issue.custom ? issue.title : `#${issue.number}: ${issue.title}`;
  const lines = [
    ``,
    `  ${c("■")} ${bold(color.toUpperCase())}`,
    ``,
    `  ${bold(title)}`,
    ``,
    `  ${dim("branch")}  ${c(env.branch)}`,
  ];
  if (issue.body) {
    lines.push(``, `  ${dim("description")}`);
    for (const l of issue.body.split("\n").slice(0, 4)) {
      lines.push(`  ${dim(l)}`);
    }
  }
  lines.push(``);
  res.type("text").send(lines.join("\n"));
});

// ── Release environment ─────────────────────────────────────────────────────

router.post("/environments/:color/release", (req, res) => {
  const { color } = req.params;
  const { removeWorktree } = req.body ?? {};
  const env = getEnvironment(color);

  if (env && removeWorktree) {
    const repo = getRepoById(env.repoId);
    if (repo?.mode === "worktree") {
      exec(`cd "${repo.repoDir}" && git worktree remove "${env.path}" --force 2>&1`, () => {});
    }
  }

  deleteEnvironment(color);
  res.json({ ok: true });
});

// ── Status ──────────────────────────────────────────────────────────────────

router.get("/environments/:color/status", (req, res) => {
  const { color } = req.params;
  const env = getEnvironment(color);
  if (!env) return res.json({ active: false });

  const ghRepo = getGhRepo(env.repoId);
  const config = loadConfig();

  const gitCmd = `cd "${env.path}" && git status --porcelain && echo "---BRANCH---" && (git rev-list --left-right --count origin/main...HEAD 2>/dev/null || git rev-list --left-right --count origin/master...HEAD 2>/dev/null || git rev-list --left-right --count main...HEAD 2>/dev/null || git rev-list --left-right --count master...HEAD 2>/dev/null || echo "0\t0")`;

  const isBaseBranch = ["main", "master"].includes(env.branch);
  const prCmd = ghRepo && !isBaseBranch
    ? `gh pr list --repo "${ghRepo}" --head "${env.branch}" --state open --json number,url,state,title,mergedAt --limit 1`
    : null;

  exec(gitCmd, (_err, gitOut) => {
    const parts = (gitOut ?? "").split("---BRANCH---");
    const dirty = (parts[0] ?? "").trim().split("\n").filter(Boolean);
    const counts = (parts[1] ?? "0\t0").trim().split("\t");

    const status = {
      active: true,
      branch: env.branch,
      dirty: dirty.length > 0,
      changedFiles: dirty.length,
      behind: parseInt(counts[0]) || 0,
      ahead: parseInt(counts[1]) || 0,
      pr: null,
      tmuxAlive: false,
    };

    const tmuxLauncher = (config.launchers ?? []).find((l) => l.type === "tmux-terminal");
    const session = tmuxLauncher ? `wb-${tmuxLauncher.id}-${color}` : null;

    function finish() {
      if (!prCmd) return res.json(status);
      exec(prCmd, (_prErr, prOut) => {
        try {
          const prs = JSON.parse(prOut ?? "[]");
          status.pr = prs[0] ?? null;
        } catch {}
        res.json(status);
      });
    }

    if (!session) return finish();

    exec(`tmux has-session -t ${session} 2>/dev/null`, (tmuxErr) => {
      status.tmuxAlive = !tmuxErr;
      if (tmuxErr) return finish();

      // Detect Claude Code state from pane content (use scrollback for full picture)
      exec(`tmux capture-pane -t ${session}:.0 -p -S -30 2>/dev/null`, (_capErr, capOut) => {
        const content = capOut ?? "";
        const lines = content.split("\n").filter((l) => l.trim());
        const lastLine = lines[lines.length - 1] ?? "";
        const tail = lines.slice(-8).join("\n");

        if (tail.match(/esc to interrupt/i)) {
          status.claudeState = "working";
        } else if (tail.match(/Do you want to (proceed|make this edit)/)) {
          status.claudeState = "approval";
        } else if (lastLine.match(/^[\s]*>/)) {
          status.claudeState = "waiting";
        } else if (lastLine.match(/^[\s]*[$%#]\s*$/)) {
          status.claudeState = "shell";
        }
        finish();
      });
    });
  });
});

export default router;
