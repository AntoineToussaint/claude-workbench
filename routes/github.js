import { Router } from "express";
import { exec } from "child_process";
import { getRepoById, getEnvironment, upsertEnvironment } from "../db.js";
import { getGhRepo } from "../lib/github.js";
import { getAnthropicKey } from "../lib/config.js";

const router = Router();

// ── List issues ─────────────────────────────────────────────────────────────

router.get("/github/issues", (req, res) => {
  const repo = getRepoById(req.query.repo);
  const ghRepo = getGhRepo(req.query.repo);
  if (!ghRepo) return res.status(400).json({ error: "No GitHub repo configured" });
  const limit = req.query.limit ?? 30;

  exec(`gh issue list --repo "${ghRepo}" --state open --limit ${limit} --json number,title,url,body,labels`, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      res.json(JSON.parse(stdout));
    } catch {
      res.status(500).json({ error: "Failed to parse gh output" });
    }
  });
});

// ── Propose PR (uses Claude to generate branch, title, body from diff) ──────

router.post("/environments/:color/propose-pr", (req, res) => {
  const { color } = req.params;
  const env = getEnvironment(color);
  if (!env) return res.status(400).json({ error: "No environment" });

  const ghRepo = getGhRepo(env.repoId);
  if (!ghRepo) return res.status(400).json({ error: "No GitHub repo" });

  const isBaseBranch = ["main", "master"].includes(env.branch);

  // Get diff summary and recent commits
  const diffCmd = `cd "${env.path}" && git diff --stat HEAD 2>/dev/null && echo "---DIFF_CONTENT---" && git diff HEAD 2>/dev/null | head -500 && echo "---LOG---" && git log --oneline -10 2>/dev/null`;

  exec(diffCmd, { maxBuffer: 1024 * 1024 }, async (_err, diffOut) => {
    const parts = (diffOut ?? "").split("---DIFF_CONTENT---");
    const diffStat = (parts[0] ?? "").trim();
    const rest = (parts[1] ?? "").split("---LOG---");
    const diffContent = (rest[0] ?? "").trim();
    const gitLog = (rest[1] ?? "").trim();

    // If no API key, generate a proposal from git context
    const apiKey = getAnthropicKey();
    if (!apiKey) {
      // Derive branch name from first meaningful commit or diff
      const commits = gitLog.split("\n").filter(Boolean);
      const firstCommit = commits.find((c) => !c.toLowerCase().includes("merge")) || commits[0] || "";
      const commitMsg = firstCommit.replace(/^[a-f0-9]+\s+/, "").trim();

      let branch = env.branch;
      if (isBaseBranch) {
        // Generate branch name from commit message or diff files
        const slug = (commitMsg || `${color}-changes`)
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
        branch = `pr/${slug}`;
      }

      // Title: use commit message, branch name, or issue title
      const title = !isBaseBranch
        ? env.branch.replace(/[-_/]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : commitMsg || env.issue?.title || "Changes";

      const bodyParts = [];
      if (diffStat) bodyParts.push(`## Changes\n\n\`\`\`\n${diffStat}\n\`\`\``);
      if (commits.length > 0) bodyParts.push(`## Commits\n\n${commits.slice(0, 10).map((c) => `- ${c}`).join("\n")}`);

      return res.json({
        branch,
        title,
        body: bodyParts.join("\n\n") || "",
        needsBranch: isBaseBranch,
      });
    }

    // Use Claude to generate PR content
    try {
      const prompt = `You are helping create a GitHub pull request. Based on the git diff and context below, generate:
1. A short branch name (kebab-case, max 50 chars, no "main" or "master")
2. A concise PR title (max 70 chars)
3. A PR body with a summary section and test plan

Context:
- Repository: ${ghRepo}
- Current branch: ${env.branch}
- Issue: ${env.issue?.title || "none"}
- Issue body: ${(env.issue?.body || "none").slice(0, 500)}

Git diff stat:
${diffStat}

Diff (truncated):
${diffContent.slice(0, 3000)}

Recent commits:
${gitLog}

Respond in this exact JSON format (no markdown fences):
{"branch": "...", "title": "...", "body": "..."}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text ?? "";
      const parsed = JSON.parse(text);

      res.json({
        branch: isBaseBranch ? parsed.branch : env.branch,
        title: parsed.title,
        body: parsed.body,
        needsBranch: isBaseBranch,
      });
    } catch (aiErr) {
      // Fallback if AI fails — same logic as no-key path
      const commits = gitLog.split("\n").filter(Boolean);
      const firstCommit = commits.find((c) => !c.toLowerCase().includes("merge")) || commits[0] || "";
      const commitMsg = firstCommit.replace(/^[a-f0-9]+\s+/, "").trim();
      const slug = (commitMsg || `${color}-changes`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
      res.json({
        branch: isBaseBranch ? `pr/${slug}` : env.branch,
        title: !isBaseBranch ? env.branch.replace(/[-_/]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : commitMsg || "Changes",
        body: diffStat ? `## Changes\n\n\`\`\`\n${diffStat}\n\`\`\`` : "",
        needsBranch: isBaseBranch,
      });
    }
  });
});

// ── Create PR ───────────────────────────────────────────────────────────────

router.post("/environments/:color/create-pr", (req, res) => {
  const { color } = req.params;
  const { branch: newBranch, title: prTitle, body: prBody } = req.body ?? {};
  const env = getEnvironment(color);
  if (!env) return res.status(400).json({ error: "No environment" });

  const repo = getRepoById(env.repoId);
  const ghRepo = getGhRepo(env.repoId);
  if (!ghRepo) return res.status(400).json({ error: "No GitHub repo" });

  const isBaseBranch = ["main", "master"].includes(env.branch);
  const targetBranch = newBranch || env.branch;

  // Title/body: use provided values or generate from issue
  const title = prTitle || (env.issue?.number
    ? `${env.issue.title} (#${env.issue.number})`
    : env.issue?.title || "Pull Request");
  const body = prBody || (env.issue?.number
    ? `Resolves #${env.issue.number}\n\n${env.issue.body ?? ""}`
    : env.issue?.body || "").slice(0, 4000);

  function createPr(branchName) {
    const pushCmd = `cd "${env.path}" && git push -u origin "${branchName}" 2>&1`;
    exec(pushCmd, (_pushErr, pushOut) => {
      // Escape for shell
      const safeTitle = title.replace(/"/g, '\\"').replace(/`/g, '\\`');
      const safeBody = body.replace(/"/g, '\\"').replace(/`/g, '\\`');
      const prCmd = `cd "${env.path}" && gh pr create --repo "${ghRepo}" --title "${safeTitle}" --body "${safeBody}" --head "${branchName}" 2>&1`;
      exec(prCmd, (err, stdout) => {
        if (err) return res.status(500).json({ error: stdout || err.message });
        // Update env with new branch name if changed
        if (branchName !== env.branch) {
          upsertEnvironment(color, { ...env, branch: branchName });
        }
        res.json({ ok: true, output: stdout.trim() });
      });
    });
  }

  if (isBaseBranch && targetBranch !== env.branch) {
    // Need to create a new branch, add changes, commit
    const commitMsg = title.replace(/"/g, '\\"');
    const branchCmd = `cd "${env.path}" && git checkout -b "${targetBranch}" && git add -A && git commit -m "${commitMsg}" 2>&1`;
    exec(branchCmd, (err, stdout) => {
      if (err) return res.status(500).json({ error: stdout || err.message });
      createPr(targetBranch);
    });
  } else {
    createPr(targetBranch);
  }
});

export default router;
