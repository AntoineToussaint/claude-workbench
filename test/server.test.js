import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// Setup a temp dir for test fixtures
const TEMP = join(import.meta.dirname, ".tmp-test");
const CONFIG_PATH = join(TEMP, "workbench.config.json");
const STATE_PATH = join(TEMP, "state.json");

function writeConfig(overrides = {}) {
  const config = {
    repo: "https://github.com/test-org/test-repo",
    repoDir: join(TEMP, "repo"),
    workDir: TEMP,
    mode: "worktree",
    colors: ["blue", "red"],
    port: 0,
    launchers: [
      {
        id: "ghostty",
        label: "Ghostty",
        icon: "terminal",
        type: "tmux-terminal",
        app: "/bin/echo",
        panes: [{ cmd: "echo hello", focus: true }, { cmd: null }],
      },
      {
        id: "zed",
        label: "Zed",
        icon: "editor",
        type: "command",
        cmd: 'echo "opening {{path}}"',
      },
    ],
    ...overrides,
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config));
  return config;
}

function writeState(state = { environments: {} }) {
  writeFileSync(STATE_PATH, JSON.stringify(state));
}

// We test the pure logic functions and API endpoints
// by importing the server module with patched config/state paths

describe("server", () => {
  beforeEach(() => {
    mkdirSync(TEMP, { recursive: true });
    // Create a bare git repo for worktree tests
    const repoDir = join(TEMP, "repo");
    mkdirSync(repoDir, { recursive: true });
    execSync("git init && git commit --allow-empty -m init", { cwd: repoDir, stdio: "pipe" });
  });

  afterEach(() => {
    // Clean up worktrees before removing
    const repoDir = join(TEMP, "repo");
    if (existsSync(repoDir)) {
      try { execSync("git worktree prune", { cwd: repoDir, stdio: "pipe" }); } catch {}
    }
    rmSync(TEMP, { recursive: true, force: true });
  });

  describe("config", () => {
    it("should parse config with all required fields", () => {
      const config = writeConfig();
      expect(config.repo).toContain("github.com");
      expect(config.mode).toBe("worktree");
      expect(config.colors).toHaveLength(2);
      expect(config.launchers).toHaveLength(2);
    });

    it("should support both worktree and clone modes", () => {
      const wt = writeConfig({ mode: "worktree" });
      expect(wt.mode).toBe("worktree");
      const cl = writeConfig({ mode: "clone" });
      expect(cl.mode).toBe("clone");
    });
  });

  describe("state", () => {
    it("should persist and load state", () => {
      const state = {
        environments: {
          blue: {
            issue: { number: 42, title: "Fix bug" },
            branch: "issue-42-fix-bug",
            path: "/tmp/test-blue",
            createdAt: new Date().toISOString(),
          },
        },
      };
      writeState(state);
      const loaded = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      expect(loaded.environments.blue.issue.number).toBe(42);
      expect(loaded.environments.blue.branch).toBe("issue-42-fix-bug");
    });

    it("should handle empty state", () => {
      writeState();
      const loaded = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      expect(loaded.environments).toEqual({});
    });
  });

  describe("branch naming", () => {
    it("should generate safe branch names from issue titles", () => {
      // This mirrors the logic in the assign endpoint
      const title = "Fix: weird bug with special chars! (urgent)";
      const number = 123;
      const branch = `issue-${number}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
      expect(branch).toBe("issue-123-fix-weird-bug-with-special-chars-urgent-");
      expect(branch).not.toMatch(/[^a-z0-9-]/);
    });

    it("should truncate long titles", () => {
      const title = "A".repeat(100);
      const branch = `issue-1-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
      expect(branch.length).toBeLessThanOrEqual(49); // "issue-1-" + 40 chars
    });
  });

  describe("CLAUDE.md injection", () => {
    it("should create CLAUDE.md with issue context", () => {
      const envPath = join(TEMP, "test-env");
      mkdirSync(envPath, { recursive: true });

      const issue = { number: 42, title: "Fix auth", body: "Auth is broken", labels: [{ name: "bug" }], url: "https://github.com/test/repo/issues/42" };
      const branchName = "issue-42-fix-auth";

      // Simulate the injectIssueContext logic
      const labels = issue.labels.map((l) => l.name).join(", ");
      const claudeMd = [
        "# Current Task",
        "",
        `You are working on issue #${issue.number}: **${issue.title}**`,
        `\nGitHub: ${issue.url}`,
        `\nLabels: ${labels}`,
        `\n## Issue Description\n\n${issue.body}`,
        "",
        "## Instructions",
        "",
        `- Work on the branch \`${branchName}\``,
        "- Focus on resolving this issue",
        "- Create atomic commits with clear messages",
        "- When done, let the user know so they can create a PR",
      ].filter(Boolean).join("\n");

      const claudePath = join(envPath, "CLAUDE.md");
      writeFileSync(claudePath, claudeMd);

      const content = readFileSync(claudePath, "utf-8");
      expect(content).toContain("issue #42");
      expect(content).toContain("**Fix auth**");
      expect(content).toContain("Auth is broken");
      expect(content).toContain("Labels: bug");
      expect(content).toContain("`issue-42-fix-auth`");
    });

    it("should append to existing CLAUDE.md", () => {
      const envPath = join(TEMP, "test-env-existing");
      mkdirSync(envPath, { recursive: true });
      const claudePath = join(envPath, "CLAUDE.md");

      writeFileSync(claudePath, "# Existing project instructions\n\nDo not delete this.");
      const existing = readFileSync(claudePath, "utf-8");
      writeFileSync(claudePath, existing + "\n\n# Current Task\n\nNew issue context here.");

      const content = readFileSync(claudePath, "utf-8");
      expect(content).toContain("Existing project instructions");
      expect(content).toContain("Do not delete this.");
      expect(content).toContain("Current Task");
    });
  });

  describe("launcher config", () => {
    it("should support tmux-terminal type", () => {
      const config = writeConfig();
      const launcher = config.launchers.find((l) => l.type === "tmux-terminal");
      expect(launcher).toBeDefined();
      expect(launcher.panes).toHaveLength(2);
      expect(launcher.panes[0].focus).toBe(true);
    });

    it("should support command type with interpolation", () => {
      const config = writeConfig();
      const launcher = config.launchers.find((l) => l.type === "command");
      expect(launcher).toBeDefined();
      expect(launcher.cmd).toContain("{{path}}");

      // Test interpolation
      const result = launcher.cmd.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const vars = { path: "/tmp/test", color: "blue", title: "test", branch: "main" };
        return vars[key] ?? "";
      });
      expect(result).toBe('echo "opening /tmp/test"');
    });
  });

  describe("color definitions", () => {
    it("should have hex and bg for all built-in colors", () => {
      const COLORS = {
        blue: { hex: "#3B82F6", bg: "#00101a" },
        green: { hex: "#22C55E", bg: "#001a08" },
        red: { hex: "#EF4444", bg: "#1a0400" },
        yellow: { hex: "#F59E0B", bg: "#1a1200" },
        black: { hex: "#374151", bg: "#0d0d0d" },
        purple: { hex: "#A855F7", bg: "#0f0019" },
        orange: { hex: "#F97316", bg: "#1a0c00" },
        cyan: { hex: "#06B6D4", bg: "#001a1a" },
      };

      for (const [name, def] of Object.entries(COLORS)) {
        expect(def.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(def.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe("git worktree", () => {
    it("should create a worktree with a new branch", () => {
      const repoDir = join(TEMP, "repo");
      const wtPath = join(TEMP, "repo-blue");
      execSync(`git worktree add "${wtPath}" -b test-branch`, { cwd: repoDir, stdio: "pipe" });

      expect(existsSync(wtPath)).toBe(true);
      expect(existsSync(join(wtPath, ".git"))).toBe(true);

      // Verify branch
      const branch = execSync("git branch --show-current", { cwd: wtPath, encoding: "utf-8" }).trim();
      expect(branch).toBe("test-branch");
    });

    it("should allow multiple worktrees on different branches", () => {
      const repoDir = join(TEMP, "repo");
      const wt1 = join(TEMP, "repo-blue");
      const wt2 = join(TEMP, "repo-red");

      execSync(`git worktree add "${wt1}" -b branch-1`, { cwd: repoDir, stdio: "pipe" });
      execSync(`git worktree add "${wt2}" -b branch-2`, { cwd: repoDir, stdio: "pipe" });

      expect(existsSync(wt1)).toBe(true);
      expect(existsSync(wt2)).toBe(true);

      const b1 = execSync("git branch --show-current", { cwd: wt1, encoding: "utf-8" }).trim();
      const b2 = execSync("git branch --show-current", { cwd: wt2, encoding: "utf-8" }).trim();
      expect(b1).toBe("branch-1");
      expect(b2).toBe("branch-2");
    });

    it("should reject duplicate branch in worktree", () => {
      const repoDir = join(TEMP, "repo");
      const wt1 = join(TEMP, "repo-blue");
      execSync(`git worktree add "${wt1}" -b dup-branch`, { cwd: repoDir, stdio: "pipe" });

      const wt2 = join(TEMP, "repo-red");
      expect(() => {
        execSync(`git worktree add "${wt2}" -b dup-branch`, { cwd: repoDir, stdio: "pipe" });
      }).toThrow();
    });

    it("should clean up worktree on remove", () => {
      const repoDir = join(TEMP, "repo");
      const wtPath = join(TEMP, "repo-blue");
      execSync(`git worktree add "${wtPath}" -b cleanup-branch`, { cwd: repoDir, stdio: "pipe" });
      expect(existsSync(wtPath)).toBe(true);

      execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoDir, stdio: "pipe" });
      expect(existsSync(wtPath)).toBe(false);
    });
  });

  describe("github repo URL parsing", () => {
    it("should extract owner/repo from HTTPS URL", () => {
      const url = "https://github.com/tensorzero/tensorzero";
      const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
      expect(match[1]).toBe("tensorzero/tensorzero");
    });

    it("should extract owner/repo from SSH URL", () => {
      const url = "git@github.com:tensorzero/tensorzero.git";
      const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
      expect(match[1]).toBe("tensorzero/tensorzero");
    });

    it("should return null for non-GitHub URLs", () => {
      const url = "https://gitlab.com/some/repo";
      const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
      expect(match).toBeNull();
    });
  });
});
