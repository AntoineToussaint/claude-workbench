import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.WORKBENCH_DB_PATH || join(__dirname, "workbench.db");

// --reset flag wipes the DB
if (process.argv.includes("--reset")) {
  const { unlinkSync } = await import("fs");
  try { unlinkSync(DB_PATH); } catch {}
  try { unlinkSync(DB_PATH + "-wal"); } catch {}
  try { unlinkSync(DB_PATH + "-shm"); } catch {}
  console.log("Database reset.");
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    url TEXT DEFAULT '',
    local_dir TEXT NOT NULL,
    work_dir TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'worktree'
  );

  CREATE TABLE IF NOT EXISTS environments (
    color TEXT PRIMARY KEY,
    repo_id TEXT REFERENCES repos(id) ON DELETE SET NULL,
    issue_json TEXT NOT NULL DEFAULT '{}',
    branch TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Repos CRUD ─────────────────────────────────────────────────────────────

const stmts = {
  listRepos: db.prepare("SELECT * FROM repos ORDER BY id"),
  getRepo: db.prepare("SELECT * FROM repos WHERE id = ?"),
  insertRepo: db.prepare("INSERT INTO repos (id, url, local_dir, work_dir, mode) VALUES (@id, @url, @localDir, @workDir, @mode)"),
  updateRepo: db.prepare("UPDATE repos SET url = @url, local_dir = @localDir, work_dir = @workDir, mode = @mode WHERE id = @id"),
  deleteRepo: db.prepare("DELETE FROM repos WHERE id = ?"),

  listEnvs: db.prepare("SELECT * FROM environments ORDER BY color"),
  getEnv: db.prepare("SELECT * FROM environments WHERE color = ?"),
  upsertEnv: db.prepare(`
    INSERT INTO environments (color, repo_id, issue_json, branch, path, created_at)
    VALUES (@color, @repoId, @issueJson, @branch, @path, datetime('now'))
    ON CONFLICT(color) DO UPDATE SET
      repo_id = @repoId, issue_json = @issueJson, branch = @branch, path = @path, created_at = datetime('now')
  `),
  deleteEnv: db.prepare("DELETE FROM environments WHERE color = ?"),

  getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
  setSetting: db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"),
};

export function listRepos() {
  return stmts.listRepos.all().map(normalizeRepo);
}

export function getRepoById(id) {
  const row = stmts.getRepo.get(id);
  return row ? normalizeRepo(row) : null;
}

export function createRepo({ id, url, localDir, workDir, mode }) {
  stmts.insertRepo.run({ id, url: url ?? "", localDir, workDir, mode: mode ?? "worktree" });
  return getRepoById(id);
}

export function updateRepo({ id, url, localDir, workDir, mode }) {
  stmts.updateRepo.run({ id, url: url ?? "", localDir, workDir, mode: mode ?? "worktree" });
  return getRepoById(id);
}

export function deleteRepo(id) {
  stmts.deleteRepo.run(id);
}

function normalizeRepo(row) {
  return {
    id: row.id,
    repo: row.url,
    repoDir: row.local_dir,
    workDir: row.work_dir,
    mode: row.mode,
  };
}

// ── Environments CRUD ──────────────────────────────────────────────────────

export function listEnvironments() {
  const rows = stmts.listEnvs.all();
  const envs = {};
  for (const row of rows) {
    envs[row.color] = {
      issue: JSON.parse(row.issue_json),
      repoId: row.repo_id,
      branch: row.branch,
      path: row.path,
      createdAt: row.created_at,
    };
  }
  return envs;
}

export function getEnvironment(color) {
  const row = stmts.getEnv.get(color);
  if (!row) return null;
  return {
    issue: JSON.parse(row.issue_json),
    repoId: row.repo_id,
    branch: row.branch,
    path: row.path,
    createdAt: row.created_at,
  };
}

export function upsertEnvironment(color, { issue, repoId, branch, path }) {
  stmts.upsertEnv.run({
    color,
    repoId,
    issueJson: JSON.stringify(issue),
    branch,
    path,
  });
}

export function deleteEnvironment(color) {
  stmts.deleteEnv.run(color);
}

// ── Settings ───────────────────────────────────────────────────────────────

export function getSetting(key, defaultValue) {
  const row = stmts.getSetting.get(key);
  return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
  stmts.setSetting.run(key, value);
}

export { db };
