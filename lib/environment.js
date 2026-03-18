import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

/**
 * Sanitize a string for use in git branch names.
 * Keeps only [a-z0-9], collapses runs of non-alphanumerics to a single hyphen,
 * strips leading/trailing hyphens, and truncates to `maxLen`.
 */
export function sanitizeBranchSegment(str, maxLen) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

/**
 * Generate a branch name from an issue.
 */
export function branchNameForIssue(issue) {
  if (issue.custom) {
    return `task-${sanitizeBranchSegment(issue.title, 50)}`;
  }
  return `issue-${issue.number}-${sanitizeBranchSegment(issue.title, 40)}`;
}

/**
 * Inject issue context into CLAUDE.md at the given environment path.
 * Appends to existing file or creates a new one.
 */
export function injectIssueContext(envPath, issue, branchName) {
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

/**
 * Remove the injected "# Current Task" block from CLAUDE.md.
 * Handles both mid-file (\n\n# Current Task) and start-of-file.
 * Returns true if cleanup happened, false otherwise.
 */
export function cleanInjectedContext(envPath) {
  if (!envPath) return false;
  const claudePath = join(envPath, "CLAUDE.md");
  if (!existsSync(claudePath)) return false;
  try {
    const content = readFileSync(claudePath, "utf-8");
    let idx = content.indexOf("\n\n# Current Task");
    if (idx === -1 && content.startsWith("# Current Task")) idx = 0;
    if (idx !== -1) {
      const cleaned = content.slice(0, idx).trimEnd();
      if (cleaned) {
        writeFileSync(claudePath, cleaned + "\n");
      } else {
        unlinkSync(claudePath);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
