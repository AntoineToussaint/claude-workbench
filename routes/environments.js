import { Router } from "express";
import { exec } from "child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join, basename } from "path";
import {
  getRepoById, listEnvironments, getEnvironment,
  upsertEnvironment, deleteEnvironment,
} from "../db.js";
import { loadConfig, COLORS } from "../lib/config.js";
import { getGhRepo } from "../lib/github.js";
import { getMultiplexer } from "../lib/multiplexer/index.js";
import { getWebhookState } from "./webhooks.js";

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

  const colorDef = COLORS[color] ?? { hex: "#888888" };
  const rawMatches = colorDef.hex.replace("#", "").match(/\w{2}/g);
  const hexMatches = rawMatches?.length === 3 ? rawMatches : ["88", "88", "88"];
  const [r, g, b] = hexMatches.map((h) => parseInt(h, 16));
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

  if (env) {
    // Clean up injected "Current Task" section from CLAUDE.md
    cleanInjectedContext(env.path);

    if (removeWorktree) {
      const repo = getRepoById(env.repoId);
      if (repo?.mode === "worktree") {
        exec(`cd "${repo.repoDir}" && git worktree remove "${env.path}" --force 2>&1`, () => {});
      }
    }
  }

  deleteEnvironment(color);
  res.json({ ok: true });
});

function cleanInjectedContext(envPath) {
  if (!envPath) return;
  const claudePath = join(envPath, "CLAUDE.md");
  if (!existsSync(claudePath)) return;
  try {
    const content = readFileSync(claudePath, "utf-8");
    // Remove the injected "# Current Task" block and everything after it
    const marker = "\n\n# Current Task";
    const idx = content.indexOf(marker);
    if (idx !== -1) {
      const cleaned = content.slice(0, idx).trimEnd();
      if (cleaned) {
        writeFileSync(claudePath, cleaned + "\n");
      } else {
        unlinkSync(claudePath);
      }
    }
  } catch {}
}

// ── Batched status (all environments) ────────────────────────────────────────

router.get("/environments/statuses", (_req, res) => {
  const envs = listEnvironments();
  const colors = Object.keys(envs);
  if (colors.length === 0) return res.json({});

  const config = loadConfig();
  let pending = colors.length;
  const results = {};

  colors.forEach((color) => {
    fetchColorStatus(color, envs[color], config, (status) => {
      results[color] = status;
      if (--pending === 0) res.json(results);
    });
  });
});

function fetchColorStatus(color, env, config, cb) {
  if (!env) return cb({ active: false });

  const ghRepo = getGhRepo(env.repoId);
  const gitCmd = `cd "${env.path}" && git status --porcelain && echo "---BRANCH---" && (git rev-list --left-right --count origin/main...HEAD 2>/dev/null || git rev-list --left-right --count origin/master...HEAD 2>/dev/null || git rev-list --left-right --count main...HEAD 2>/dev/null || git rev-list --left-right --count master...HEAD 2>/dev/null || echo "0\t0")`;

  const isBaseBranch = ["main", "master"].includes(env.branch);
  const prCmd = ghRepo && !isBaseBranch
    ? `gh pr view "${env.branch}" --repo "${ghRepo}" --json number,url,state,title,mergedAt,statusCheckRollup 2>/dev/null`
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
      muxAlive: false,
      tmuxAlive: false, // backward compat alias
    };

    // Find the mux launcher (supports both "tmux-terminal" and "mux-terminal")
    const muxLauncher = (config.launchers ?? []).find(
      (l) => l.type === "tmux-terminal" || l.type === "mux-terminal"
    );
    const session = muxLauncher ? `wb-${muxLauncher.id}-${color}` : null;

    function finish() {
      if (!prCmd) return cb(status);
      exec(prCmd, (_prErr, prOut) => {
        try {
          const pr = JSON.parse(prOut ?? "{}");
          if (pr.number) {
            const checks = pr.statusCheckRollup ?? [];
            status.pr = { number: pr.number, url: pr.url, state: pr.state, title: pr.title, mergedAt: pr.mergedAt };
            status.checks = {
              total: checks.length,
              pass: checks.filter(c => c.status === "COMPLETED" && c.conclusion === "SUCCESS").length,
              fail: checks.filter(c => ["FAILURE", "TIMED_OUT", "CANCELLED"].includes(c.conclusion)).length,
              pending: checks.filter(c => c.status !== "COMPLETED").length,
              items: checks.map(c => ({
                name: c.name || c.context,
                status: c.conclusion || c.status || "PENDING",
                url: c.detailsUrl || c.targetUrl,
              })),
            };
          }
        } catch {}
        cb(status);
      });
    }

    if (!session) return finish();

    getMultiplexer().then((mux) => {
      const capabilities = mux.getCapabilities();

      mux.hasSession(session).then((alive) => {
        status.muxAlive = alive;
        status.tmuxAlive = alive; // backward compat
        if (!alive) {
          // If no session, try webhook state as fallback
          if (!capabilities.stateDetection) {
            const webhookState = getWebhookState(color);
            if (webhookState) status.claudeState = webhookState;
          }
          return finish();
        }

        if (!capabilities.stateDetection) {
          // Use webhook-based state detection for non-tmux multiplexers
          const webhookState = getWebhookState(color);
          if (webhookState) status.claudeState = webhookState;
          return finish();
        }

        // Capture pane content for state detection
        mux.capturePane(session, 0, 30).then((content) => {
          if (content) {
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
          } else {
            // capturePane returned null — try webhook fallback
            const webhookState = getWebhookState(color);
            if (webhookState) status.claudeState = webhookState;
          }
          finish();
        }).catch(() => finish());
      }).catch(() => finish());
    }).catch(() => finish());
  });
}

// ── Status (single — kept for backward compat) ──────────────────────────────

router.get("/environments/:color/status", (req, res) => {
  const { color } = req.params;
  const env = getEnvironment(color);
  if (!env) return res.json({ active: false });

  const ghRepo = getGhRepo(env.repoId);
  const config = loadConfig();

  const gitCmd = `cd "${env.path}" && git status --porcelain && echo "---BRANCH---" && (git rev-list --left-right --count origin/main...HEAD 2>/dev/null || git rev-list --left-right --count origin/master...HEAD 2>/dev/null || git rev-list --left-right --count main...HEAD 2>/dev/null || git rev-list --left-right --count master...HEAD 2>/dev/null || echo "0\t0")`;

  const isBaseBranch = ["main", "master"].includes(env.branch);
  const prCmd = ghRepo && !isBaseBranch
    ? `gh pr view "${env.branch}" --repo "${ghRepo}" --json number,url,state,title,mergedAt,statusCheckRollup 2>/dev/null`
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

    // Find the mux launcher (supports both "tmux-terminal" and "mux-terminal")
    const muxLauncher = (config.launchers ?? []).find(
      (l) => l.type === "tmux-terminal" || l.type === "mux-terminal"
    );
    const session = muxLauncher ? `wb-${muxLauncher.id}-${color}` : null;

    function finish() {
      if (!prCmd) return res.json(status);
      exec(prCmd, (_prErr, prOut) => {
        try {
          const pr = JSON.parse(prOut ?? "{}");
          if (pr.number) {
            const checks = pr.statusCheckRollup ?? [];
            status.pr = { number: pr.number, url: pr.url, state: pr.state, title: pr.title, mergedAt: pr.mergedAt };
            status.checks = {
              total: checks.length,
              pass: checks.filter(c => c.status === "COMPLETED" && c.conclusion === "SUCCESS").length,
              fail: checks.filter(c => ["FAILURE", "TIMED_OUT", "CANCELLED"].includes(c.conclusion)).length,
              pending: checks.filter(c => c.status !== "COMPLETED").length,
              items: checks.map(c => ({
                name: c.name || c.context,
                status: c.conclusion || c.status || "PENDING",
                url: c.detailsUrl || c.targetUrl,
              })),
            };
          }
        } catch {}
        res.json(status);
      });
    }

    if (!session) return finish();

    getMultiplexer().then((mux) => {
      const capabilities = mux.getCapabilities();

      mux.hasSession(session).then((alive) => {
        status.muxAlive = alive;
        status.tmuxAlive = alive; // backward compat
        if (!alive) {
          if (!capabilities.stateDetection) {
            const webhookState = getWebhookState(color);
            if (webhookState) status.claudeState = webhookState;
          }
          return finish();
        }

        if (!capabilities.stateDetection) {
          const webhookState = getWebhookState(color);
          if (webhookState) status.claudeState = webhookState;
          return finish();
        }

        // Detect Claude Code state from pane content (use scrollback for full picture)
        mux.capturePane(session, 0, 30).then((content) => {
          if (content) {
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
          } else {
            const webhookState = getWebhookState(color);
            if (webhookState) status.claudeState = webhookState;
          }
          finish();
        }).catch(() => finish());
      }).catch(() => finish());
    }).catch(() => finish());
  });
});

export default router;
