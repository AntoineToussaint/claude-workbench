import { Router } from "express";
import { exec } from "child_process";
import { statSync } from "fs";
import { basename, dirname, join } from "path";
import {
  listRepos, getRepoById, createRepo, updateRepo, deleteRepo,
  listEnvironments, upsertEnvironment, deleteEnvironment,
} from "../db.js";
import { COLORS, getAnthropicKey } from "../lib/config.js";
import { getFolderPickerCommand } from "../lib/platform.js";

const router = Router();

router.get("/repos", (_req, res) => {
  res.json(listRepos());
});

router.post("/repos", (req, res) => {
  const { id, url, localDir, workDir, mode } = req.body;
  if (!id || !localDir || !workDir) {
    return res.status(400).json({ error: "id, localDir, and workDir are required" });
  }
  try {
    res.json(createRepo({ id, url, localDir, workDir, mode }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/repos/:id", (req, res) => {
  const { url, localDir, workDir, mode } = req.body;
  try {
    res.json(updateRepo({ id: req.params.id, url, localDir, workDir, mode }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/repos/:id", (req, res) => {
  const envs = listEnvironments();
  for (const [color, env] of Object.entries(envs)) {
    if (env.repoId === req.params.id) deleteEnvironment(color);
  }
  deleteRepo(req.params.id);
  res.json({ ok: true });
});

// One-click: pick a folder → auto-detect → create repo
router.post("/add-repo", (req, res) => {
  const { dir: providedDir } = req.body ?? {};

  if (providedDir) {
    // Manual path entry (used when no folder picker is available)
    const folder = providedDir.trim().replace(/\/$/, "");
    const id = basename(folder);
    const workDir = dirname(folder);
    exec(`git -C "${folder}" remote get-url origin 2>/dev/null`, (_gitErr, gitOut) => {
      const url = (gitOut ?? "").trim();
      try {
        res.json(createRepo({ id, url, localDir: folder, workDir, mode: "worktree" }));
      } catch (dbErr) {
        res.status(400).json({ error: dbErr.message });
      }
    });
    return;
  }

  const script = getFolderPickerCommand("Select a git repository");
  if (!script) return res.json({ error: "no_folder_picker" });

  exec(script, (err, stdout) => {
    if (err) return res.status(400).json({ error: "Cancelled" });
    const folder = stdout.trim().replace(/\/$/, "");
    const id = basename(folder);
    const workDir = dirname(folder);

    exec(`git -C "${folder}" remote get-url origin 2>/dev/null`, (_gitErr, gitOut) => {
      const url = (gitOut ?? "").trim();
      try {
        res.json(createRepo({ id, url, localDir: folder, workDir, mode: "worktree" }));
      } catch (dbErr) {
        res.status(400).json({ error: dbErr.message });
      }
    });
  });
});

// Scan folder for existing worktrees
router.post("/scan-folder", (req, res) => {
  const { dir: providedDir } = req.body ?? {};

  function doScan(selectedDir) {
    const colorNames = Object.keys(COLORS);

    exec(`ls -d "${selectedDir}"/*/`, (lsErr, lsOut) => {
      if (lsErr) return res.status(400).json({ error: "Could not list directory" });

      const dirs = (lsOut ?? "").trim().split("\n").filter(Boolean).map((d) => d.replace(/\/$/, ""));
      const envDirs = [];
      const repoDirs = [];

      for (const dir of dirs) {
        const dirName = basename(dir);
        const colorMatch = colorNames.find((c) => dirName.endsWith(`-${c}`));
        if (colorMatch) {
          const repoName = dirName.slice(0, -(colorMatch.length + 1));
          envDirs.push({ dir, dirName, color: colorMatch, repoName, workDir: dirname(dir) });
        } else {
          repoDirs.push({ dir, dirName });
        }
      }

      const selectedName = basename(selectedDir);
      if (envDirs.some((e) => e.repoName === selectedName) && !repoDirs.some((r) => r.dirName === selectedName)) {
        repoDirs.push({ dir: selectedDir, dirName: selectedName });
      }

      // Deep scan subdirs
      const deepTasks = repoDirs.map((rd) =>
        new Promise((resolve) => {
          exec(`ls -d "${rd.dir}"/*/`, (_e, out) => {
            if (!out) return resolve();
            for (const sd of out.trim().split("\n").filter(Boolean).map((d) => d.replace(/\/$/, ""))) {
              const sdName = basename(sd);
              const cm = colorNames.find((c) => sdName.endsWith(`-${c}`));
              if (cm && !envDirs.some((e) => e.dir === sd)) {
                envDirs.push({ dir: sd, dirName: sdName, color: cm, repoName: sdName.slice(0, -(cm.length + 1)), workDir: rd.dir });
              }
            }
            resolve();
          });
        })
      );

      Promise.all(deepTasks)
        .then(() => importDetectedRepos(envDirs, repoDirs))
        .then((imported) => res.json({ ok: true, imported }));
    });
  }

  if (providedDir) {
    doScan(providedDir.replace(/\/$/, ""));
  } else {
    const script = getFolderPickerCommand("Select a project or work directory");
    if (!script) return res.json({ error: "no_folder_picker" });

    exec(script, (err, stdout) => {
      if (err) return res.status(400).json({ error: "Cancelled" });
      doScan(stdout.trim().replace(/\/$/, ""));
    });
  }
});

function importDetectedRepos(envDirs, repoDirs) {
  const seenRepos = new Set();
  const repoTasks = [];

  for (const env of envDirs) {
    if (seenRepos.has(env.repoName)) continue;
    seenRepos.add(env.repoName);

    const mainDir = repoDirs.find((r) => r.dirName === env.repoName);
    const repoDir = mainDir?.dir;
    if (!repoDir) continue;

    // Detect mode: .git file = worktree, .git directory = clone
    const sampleDir = envDirs.find((e2) => e2.repoName === env.repoName)?.dir;
    let mode = "worktree";
    if (sampleDir) {
      try {
        const gitPath = join(sampleDir, ".git");
        mode = statSync(gitPath).isDirectory() ? "clone" : "worktree";
      } catch {}
    }

    repoTasks.push(
      new Promise((resolve) => {
        exec(`git -C "${repoDir}" remote get-url origin 2>/dev/null`, (_e, out) => {
          const url = (out ?? "").trim();
          if (url) {
            try { createRepo({ id: env.repoName, url, localDir: repoDir, workDir: env.workDir, mode }); } catch {}
            return resolve();
          }
          if (!sampleDir) {
            try { createRepo({ id: env.repoName, url: "", localDir: repoDir, workDir: env.workDir, mode }); } catch {}
            return resolve();
          }
          exec(`git -C "${sampleDir}" remote get-url origin 2>/dev/null`, (_e2, out2) => {
            const url2 = (out2 ?? "").trim();
            try { createRepo({ id: env.repoName, url: url2, localDir: repoDir, workDir: env.workDir, mode }); } catch {}
            resolve();
          });
        });
      })
    );
  }

  return Promise.all(repoTasks).then(() => {
    const imported = [];
    const envTasks = envDirs.map((env) => {
      const repo = getRepoById(env.repoName);
      if (!repo) return Promise.resolve();
      return new Promise((resolve) => {
        // Gather branch, diff snippet, and dirty file paths
        const cmd = `cd "${env.dir}" && git rev-parse --abbrev-ref HEAD 2>/dev/null && echo "---SEP---" && git status --porcelain 2>/dev/null | head -20 && echo "---SEP---" && git diff HEAD 2>/dev/null | head -200`;
        exec(cmd, { maxBuffer: 512 * 1024 }, async (_e, out) => {
          const parts = (out ?? "").split("---SEP---");
          const branch = (parts[0] ?? "").trim() || env.color;
          const dirtyFiles = (parts[1] ?? "").trim();
          const diffSnippet = (parts[2] ?? "").trim();

          // Feature branch — just use branch name
          const isBase = ["main", "master"].includes(branch);
          let title, body;
          if (!isBase && branch) {
            title = branch.replace(/[-_/]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            body = null;
          } else {
            // Main branch — try LLM to summarize, fallback to heuristic
            const summary = await summarizeChanges(dirtyFiles, diffSnippet, env.dirName);
            title = summary.title;
            body = summary.body;
          }

          const issue = { number: 0, title, body, custom: true, labels: [] };
          upsertEnvironment(env.color, { issue, repoId: env.repoName, branch, path: env.dir });

          imported.push({ color: env.color, repo: env.repoName, path: env.dir });
          resolve();
        });
      });
    });
    return Promise.all(envTasks).then(() => imported);
  });
}

async function summarizeChanges(dirtyFiles, diffSnippet, dirName) {
  const files = dirtyFiles.split("\n").filter(Boolean);
  const fileList = files.map((l) => l.slice(3).trim());

  // No changes at all
  if (fileList.length === 0 && !diffSnippet) {
    return { title: `${dirName} (clean)`, body: null };
  }

  // Try LLM
  const apiKey = getAnthropicKey();
  if (apiKey && (dirtyFiles || diffSnippet)) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          messages: [{ role: "user", content:
            `Summarize this git working directory in one short title (max 60 chars) and a 1-2 sentence description. The title should describe WHAT the changes do, not where they are.\n\nChanged files:\n${dirtyFiles}\n\nDiff (truncated):\n${diffSnippet.slice(0, 3000)}\n\nRespond as JSON: {"title": "...", "body": "..."}`
          }],
        }),
      });
      const data = await resp.json();
      const text = (data.content?.[0]?.text ?? "").replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(text);
      if (parsed.title) return parsed;
    } catch (err) {
      console.error("LLM summarize failed:", err.message);
    }
  }

  // Heuristic fallback
  const dirs = fileList.map((f) => {
    const p = f.split("/");
    return p.length > 2 ? p.slice(0, 3).join("/") : p[0];
  });
  const unique = [...new Set(dirs)];
  const title = unique.length <= 3
    ? `Changes in ${unique.join(", ")}`
    : `${fileList.length} files changed across ${unique.length} areas`;
  const body = files.slice(0, 10).map((l) => `  ${l}`).join("\n");
  return { title, body: body || null };
}

export default router;
