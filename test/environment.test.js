import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  sanitizeBranchSegment,
  branchNameForIssue,
  injectIssueContext,
  cleanInjectedContext,
} from "../lib/environment.js";

const TEMP = join(import.meta.dirname, ".tmp-env-test");

beforeEach(() => mkdirSync(TEMP, { recursive: true }));
afterEach(() => rmSync(TEMP, { recursive: true, force: true }));

// ── Branch naming ────────────────────────────────────────────────────────────

describe("sanitizeBranchSegment", () => {
  it("lowercases and replaces special chars with hyphens", () => {
    expect(sanitizeBranchSegment("Fix: weird BUG!", 50)).toBe("fix-weird-bug");
  });

  it("collapses consecutive special chars into one hyphen", () => {
    expect(sanitizeBranchSegment("a!!!b???c", 50)).toBe("a-b-c");
  });

  it("strips leading and trailing hyphens", () => {
    expect(sanitizeBranchSegment("--hello--", 50)).toBe("hello");
    expect(sanitizeBranchSegment("(hello)", 50)).toBe("hello");
  });

  it("truncates to maxLen", () => {
    expect(sanitizeBranchSegment("a".repeat(100), 10)).toBe("a".repeat(10));
  });

  it("handles empty string", () => {
    expect(sanitizeBranchSegment("", 50)).toBe("");
  });

  it("handles all-special-chars input", () => {
    expect(sanitizeBranchSegment("!@#$%^&*()", 50)).toBe("");
  });

  it("handles unicode/emoji", () => {
    const result = sanitizeBranchSegment("fix 🐛 bug", 50);
    expect(result).toBe("fix-bug");
    expect(result).not.toContain("🐛");
  });
});

describe("branchNameForIssue", () => {
  it("creates issue branch from GitHub issue", () => {
    const branch = branchNameForIssue({ number: 42, title: "Fix auth bug" });
    expect(branch).toBe("issue-42-fix-auth-bug");
  });

  it("creates task branch from custom issue", () => {
    const branch = branchNameForIssue({ custom: true, title: "Add dark mode" });
    expect(branch).toBe("task-add-dark-mode");
  });

  it("truncates long issue titles", () => {
    const branch = branchNameForIssue({ number: 1, title: "A".repeat(100) });
    // "issue-1-" is 8 chars, plus 40 chars max for title
    expect(branch.length).toBeLessThanOrEqual(48);
  });

  it("handles special characters in title", () => {
    const branch = branchNameForIssue({ number: 99, title: "Fix: weird (bug) with special chars!" });
    expect(branch).toBe("issue-99-fix-weird-bug-with-special-chars");
    expect(branch).not.toMatch(/[^a-z0-9-]/);
  });

  it("does not produce trailing hyphen", () => {
    const branch = branchNameForIssue({ number: 1, title: "Fix bug!" });
    expect(branch).not.toMatch(/-$/);
  });
});

// ── CLAUDE.md injection ──────────────────────────────────────────────────────

describe("injectIssueContext", () => {
  it("creates CLAUDE.md when none exists", () => {
    const envPath = join(TEMP, "new-env");
    mkdirSync(envPath);

    injectIssueContext(envPath, { number: 42, title: "Fix auth", body: "Auth broken" }, "issue-42-fix-auth");

    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content).toContain("# Current Task");
    expect(content).toContain("issue #42");
    expect(content).toContain("**Fix auth**");
    expect(content).toContain("Auth broken");
    expect(content).toContain("`issue-42-fix-auth`");
  });

  it("appends to existing CLAUDE.md", () => {
    const envPath = join(TEMP, "existing-env");
    mkdirSync(envPath);
    writeFileSync(join(envPath, "CLAUDE.md"), "# My Project\n\nExisting instructions.");

    injectIssueContext(envPath, { number: 1, title: "Task" }, "issue-1-task");

    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content.startsWith("# My Project")).toBe(true);
    expect(content).toContain("Existing instructions.");
    expect(content).toContain("# Current Task");
  });

  it("includes labels when present", () => {
    const envPath = join(TEMP, "labels-env");
    mkdirSync(envPath);

    injectIssueContext(envPath, {
      number: 5,
      title: "Bug",
      labels: [{ name: "bug" }, { name: "urgent" }],
    }, "issue-5-bug");

    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content).toContain("Labels: bug, urgent");
  });

  it("includes GitHub URL when present", () => {
    const envPath = join(TEMP, "url-env");
    mkdirSync(envPath);

    injectIssueContext(envPath, {
      number: 10,
      title: "Feature",
      url: "https://github.com/org/repo/issues/10",
    }, "issue-10-feature");

    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content).toContain("https://github.com/org/repo/issues/10");
  });
});

// ── CLAUDE.md cleanup ────────────────────────────────────────────────────────

describe("cleanInjectedContext", () => {
  it("removes injected block from middle of file", () => {
    const envPath = join(TEMP, "clean-mid");
    mkdirSync(envPath);
    writeFileSync(
      join(envPath, "CLAUDE.md"),
      "# Project\n\nKeep this.\n\n# Current Task\n\nRemove this."
    );

    const result = cleanInjectedContext(envPath);

    expect(result).toBe(true);
    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content).toBe("# Project\n\nKeep this.\n");
    expect(content).not.toContain("Current Task");
    expect(content).not.toContain("Remove this");
  });

  it("deletes file when content is only the injected block", () => {
    const envPath = join(TEMP, "clean-only");
    mkdirSync(envPath);
    writeFileSync(join(envPath, "CLAUDE.md"), "# Current Task\n\nJust this.");

    const result = cleanInjectedContext(envPath);

    expect(result).toBe(true);
    expect(existsSync(join(envPath, "CLAUDE.md"))).toBe(false);
  });

  it("returns false when no marker found", () => {
    const envPath = join(TEMP, "clean-none");
    mkdirSync(envPath);
    writeFileSync(join(envPath, "CLAUDE.md"), "# Project\n\nNo injected content here.");

    const result = cleanInjectedContext(envPath);

    expect(result).toBe(false);
    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content).toBe("# Project\n\nNo injected content here.");
  });

  it("returns false for missing directory", () => {
    expect(cleanInjectedContext("/nonexistent/path")).toBe(false);
  });

  it("returns false for null path", () => {
    expect(cleanInjectedContext(null)).toBe(false);
  });

  it("handles file with no CLAUDE.md", () => {
    const envPath = join(TEMP, "clean-no-file");
    mkdirSync(envPath);
    expect(cleanInjectedContext(envPath)).toBe(false);
  });

  it("preserves content before injected block with proper trailing newline", () => {
    const envPath = join(TEMP, "clean-preserve");
    mkdirSync(envPath);
    writeFileSync(
      join(envPath, "CLAUDE.md"),
      "Line 1\nLine 2\nLine 3\n\n# Current Task\n\nStuff"
    );

    cleanInjectedContext(envPath);

    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content).toBe("Line 1\nLine 2\nLine 3\n");
  });

  it("handles multiple inject/clean cycles without corruption", () => {
    const envPath = join(TEMP, "clean-cycle");
    mkdirSync(envPath);
    writeFileSync(join(envPath, "CLAUDE.md"), "# Original\n\nKeep.");

    // Inject, clean, inject, clean
    injectIssueContext(envPath, { number: 1, title: "First" }, "b1");
    cleanInjectedContext(envPath);
    injectIssueContext(envPath, { number: 2, title: "Second" }, "b2");
    cleanInjectedContext(envPath);

    const content = readFileSync(join(envPath, "CLAUDE.md"), "utf-8");
    expect(content).toBe("# Original\n\nKeep.\n");
    expect(content).not.toContain("First");
    expect(content).not.toContain("Second");
  });
});
