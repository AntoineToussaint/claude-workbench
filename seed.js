// Seed the database with the initial repo
import { listRepos, createRepo } from "./db.js";

const repos = listRepos();
if (repos.length === 0) {
  createRepo({
    id: "tensorzero",
    url: "https://github.com/tensorzero/tensorzero",
    localDir: "/Users/antoine/Development/tensorzero/tensorzero",
    workDir: "/Users/antoine/Development/tensorzero",
    mode: "worktree",
  });
  console.log("Seeded tensorzero repo");
} else {
  console.log(`DB already has ${repos.length} repo(s), skipping seed`);
}
