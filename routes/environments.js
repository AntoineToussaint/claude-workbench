import { Router } from "express";
import { exec } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import {
  getRepoById, listEnvironments, getEnvironment,
  upsertEnvironment, deleteEnvironment,
} from "../db.js";
import { loadConfig, COLORS, colorForName } from "../lib/config.js";
import { getGhRepo } from "../lib/github.js";
import { getMultiplexer } from "../lib/multiplexer/index.js";
import { tmuxSession } from "./launchers.js";
import { getWebhookState } from "./webhooks.js";
import { branchNameForIssue, injectIssueContext, cleanInjectedContext } from "../lib/environment.js";

const router = Router();

function parsePrData(pr) {
  if (!pr?.number) return null;

  const checks = pr.statusCheckRollup ?? [];
  const reviews = pr.reviews ?? [];
  const comments = pr.comments ?? [];
  const reviewRequests = pr.reviewRequests ?? [];

  // Determine review decision from latest review per author
  const latestByAuthor = {};
  for (const r of reviews) {
    const author = r.author?.login ?? "unknown";
    if (!latestByAuthor[author] || new Date(r.submittedAt) > new Date(latestByAuthor[author].submittedAt)) {
      latestByAuthor[author] = r;
    }
  }
  const latestReviews = Object.values(latestByAuthor);
  const approved = latestReviews.filter(r => r.state === "APPROVED").length;
  const changesRequested = latestReviews.filter(r => r.state === "CHANGES_REQUESTED").length;
  const reviewDecision = changesRequested > 0 ? "CHANGES_REQUESTED" : approved > 0 ? "APPROVED" : reviewRequests.length > 0 ? "REVIEW_REQUIRED" : null;

  return {
    pr: {
      number: pr.number, url: pr.url, state: pr.state,
      title: pr.title, mergedAt: pr.mergedAt,
      reviewDecision,
      reviewers: latestReviews.map(r => ({ login: r.author?.login, state: r.state })),
      pendingReviewers: reviewRequests.map(r => r.login ?? r.name ?? "unknown"),
      commentCount: comments.length,
    },
    checks: {
      total: checks.length,
      pass: checks.filter(c => c.status === "COMPLETED" && c.conclusion === "SUCCESS").length,
      fail: checks.filter(c => ["FAILURE", "TIMED_OUT", "CANCELLED"].includes(c.conclusion)).length,
      pending: checks.filter(c => c.status !== "COMPLETED").length,
      items: checks.map(c => ({
        name: c.name || c.context,
        status: c.conclusion || c.status || "PENDING",
        url: c.detailsUrl || c.targetUrl,
      })),
    },
  };
}

router.get("/environments", (_req, res) => {
  res.json(listEnvironments());
});

// ── Assign issue to environment ─────────────────────────────────────────────

router.post("/environments/:color/assign", async (req, res) => {
  const { color } = req.params;
  const { issue, repoId } = req.body;
  const repo = getRepoById(repoId);
  if (!repo) return res.status(400).json({ error: "No repo configured" });

  // Kill any existing mux session for this color to prevent stealing
  const existingEnv = getEnvironment(color);
  if (existingEnv) {
    try {
      const config = loadConfig();
      const muxLauncher = (config?.launchers ?? []).find(
        (l) => l.type === "tmux-terminal" || l.type === "mux-terminal"
      );
      if (muxLauncher) {
        const session = tmuxSession(muxLauncher.id, color);
        const mux = await getMultiplexer();
        const alive = await mux.hasSession(session);
        if (alive) await mux.killSession(session);
      }
    } catch {}
  }

  const repoName = basename(repo.repoDir);
  const envName = `${repoName}-${color}`;
  const branchName = branchNameForIssue(issue);

  // Direct mode: use repo directory as-is, no worktrees or branches
  if (repo.mode === "direct") {
    const envPath = repo.repoDir;
    upsertEnvironment(color, { issue, repoId: repo.id, branch: "", path: envPath });
    injectIssueContext(envPath, issue, "");
    return res.json({ ok: true, path: envPath, branch: "" });
  }

  const envPath = join(repo.workDir, envName);

  // Helper: save to DB + inject context only after git operation succeeds
  function finalize(branch, reused) {
    upsertEnvironment(color, { issue, repoId: repo.id, branch, path: envPath });
    injectIssueContext(envPath, issue, branch);
    res.json({ ok: true, path: envPath, branch, reused: !!reused });
  }

  if (repo.mode === "worktree") {
    if (existsSync(envPath)) {
      exec(`cd "${envPath}" && git rev-parse --abbrev-ref HEAD 2>/dev/null`, (err, stdout) => {
        const currentBranch = (stdout ?? "").trim();
        if (currentBranch === branchName) return finalize(branchName, true);
        exec(`cd "${envPath}" && git checkout "${branchName}" 2>&1 || cd "${envPath}" && git checkout -b "${branchName}" 2>&1`, (err2, stdout2) => {
          if (err2) console.warn(`Worktree branch switch: ${stdout2 || err2.message}`);
          finalize(branchName, true);
        });
      });
      return;
    }
    const cmd = `cd "${repo.repoDir}" && git worktree add "${envPath}" -b "${branchName}" 2>&1 || git worktree add "${envPath}" "${branchName}" 2>&1`;
    exec(cmd, (err, stdout) => {
      if (err && !existsSync(envPath)) {
        return res.status(500).json({ error: stdout || err.message });
      }
      finalize(branchName);
    });
  } else {
    // Clone mode
    if (existsSync(envPath)) {
      exec(`cd "${envPath}" && git rev-parse --abbrev-ref HEAD 2>/dev/null`, (err, stdout) => {
        const currentBranch = (stdout ?? "").trim();
        if (currentBranch === branchName) return finalize(branchName, true);
        const cmd = `cd "${envPath}" && git fetch origin 2>&1 && (git checkout "${branchName}" 2>&1 || git checkout -b "${branchName}" 2>&1)`;
        exec(cmd, (err2, stdout2) => {
          if (err2) console.warn(`Clone mode branch setup: ${stdout2 || err2.message}`);
          finalize(branchName, true);
        });
      });
    } else {
      // Determine clone source: prefer remote URL, fallback to local_dir, fallback to first existing sibling clone
      let cloneSource = repo.repoDir;
      exec(`git -C "${repo.repoDir}" rev-parse --is-inside-work-tree 2>/dev/null`, (_chkErr, chkOut) => {
        if ((chkOut ?? "").trim() !== "true") {
          if (repo.repo) {
            cloneSource = repo.repo;
          } else {
            try {
              const siblings = readdirSync(repo.workDir).filter(d => d.startsWith(repoName + "-"));
              for (const s of siblings) {
                const sp = join(repo.workDir, s);
                if (existsSync(join(sp, ".git"))) { cloneSource = sp; break; }
              }
            } catch {}
          }
        }
        const cmd = `git clone "${cloneSource}" "${envPath}" 2>&1 && cd "${envPath}" && (git checkout "${branchName}" 2>&1 || git checkout -b "${branchName}" 2>&1)`;
        exec(cmd, (err, stdout) => {
          if (err && !existsSync(envPath)) return res.status(500).json({ error: stdout || err.message });
          finalize(branchName);
        });
      });
    }
  }
});


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

  const colorDef = colorForName(color);
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

router.post("/environments/:color/release", async (req, res) => {
  const { color } = req.params;
  const { removeWorktree } = req.body ?? {};
  const env = getEnvironment(color);

  if (env) {
    // Kill the mux session (closes the terminal window)
    try {
      const config = loadConfig();
      const muxLauncher = (config?.launchers ?? []).find(
        (l) => l.type === "tmux-terminal" || l.type === "mux-terminal"
      );
      if (muxLauncher) {
        const session = tmuxSession(muxLauncher.id, color);
        const mux = await getMultiplexer();
        const alive = await mux.hasSession(session);
        if (alive) await mux.killSession(session);
      }
    } catch {}

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
  // Get actual current branch + git status in one shot
  const gitCmd = `cd "${env.path}" && git rev-parse --abbrev-ref HEAD 2>/dev/null && echo "---GITSTATUS---" && git status --porcelain && echo "---BRANCH---" && (BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/||') && git rev-list --left-right --count "$BASE"...HEAD 2>/dev/null || git rev-list --left-right --count origin/main...HEAD 2>/dev/null || git rev-list --left-right --count origin/master...HEAD 2>/dev/null || echo "0\t0")`;

  exec(gitCmd, (_err, gitOut) => {
    const output = gitOut ?? "";
    const branchSplit = output.split("---GITSTATUS---");
    const actualBranch = (branchSplit[0] ?? "").trim() || env.branch;
    const rest = branchSplit[1] ?? "";
    const parts = rest.split("---BRANCH---");
    const dirty = (parts[0] ?? "").trim().split("\n").filter(Boolean);
    const counts = (parts[1] ?? "0\t0").trim().split("\t");

    const isBaseBranch = ["main", "master"].includes(actualBranch);
    const prCmd = ghRepo && !isBaseBranch
      ? `gh pr view "${actualBranch}" --repo "${ghRepo}" --json number,url,state,title,mergedAt,statusCheckRollup,reviews,comments,reviewRequests 2>/dev/null`
      : null;

    const status = {
      active: true,
      branch: actualBranch,
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
          const prData = parsePrData(JSON.parse(prOut ?? "{}"));
          if (prData) { status.pr = prData.pr; status.checks = prData.checks; }
        } catch {}
        cb(status);
      });
    }

    if (!session) return finish();

    getMultiplexer().then((mux) => {
      const capabilities = mux.getCapabilities();

      mux.hasSession(session).then((alive) => {
        status.muxAlive = alive;
        status.tmuxAlive = alive;
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
}

// ── Status (single — kept for backward compat) ──────────────────────────────

router.get("/environments/:color/status", (req, res) => {
  const { color } = req.params;
  const env = getEnvironment(color);
  if (!env) return res.json({ active: false });

  const ghRepo = getGhRepo(env.repoId);
  const config = loadConfig();

  const gitCmd = `cd "${env.path}" && git rev-parse --abbrev-ref HEAD 2>/dev/null && echo "---GITSTATUS---" && git status --porcelain && echo "---BRANCH---" && (BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/||') && git rev-list --left-right --count "$BASE"...HEAD 2>/dev/null || git rev-list --left-right --count origin/main...HEAD 2>/dev/null || git rev-list --left-right --count origin/master...HEAD 2>/dev/null || echo "0\t0")`;

  exec(gitCmd, (_err, gitOut) => {
    const output = gitOut ?? "";
    const branchSplit = output.split("---GITSTATUS---");
    const actualBranch = (branchSplit[0] ?? "").trim() || env.branch;
    const rest = branchSplit[1] ?? "";
    const parts = rest.split("---BRANCH---");
    const dirty = (parts[0] ?? "").trim().split("\n").filter(Boolean);
    const counts = (parts[1] ?? "0\t0").trim().split("\t");

    const isBaseBranch = ["main", "master"].includes(actualBranch);
    const prCmd = ghRepo && !isBaseBranch
      ? `gh pr view "${actualBranch}" --repo "${ghRepo}" --json number,url,state,title,mergedAt,statusCheckRollup,reviews,comments,reviewRequests 2>/dev/null`
      : null;

    const status = {
      active: true,
      branch: actualBranch,
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
          const prData = parsePrData(JSON.parse(prOut ?? "{}"));
          if (prData) { status.pr = prData.pr; status.checks = prData.checks; }
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
