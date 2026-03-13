import { getRepoById } from "../db.js";

export function getGhRepo(repoId) {
  const repo = getRepoById(repoId);
  const repoUrl = repo?.repo ?? "";
  const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  return match?.[1] ?? null;
}
