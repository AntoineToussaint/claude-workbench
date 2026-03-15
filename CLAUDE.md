# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Claude Workbench is a macOS/Linux desktop tool for running multiple Claude Code instances in parallel. Each instance gets a color-coded git worktree, a tmux session, and a dedicated terminal/editor. The web dashboard (React + Express) manages environments, launches terminals, monitors Claude Code state, and creates PRs.

## Commands

```bash
npx claude-workbench  # Quick start: auto-generates config, builds, opens browser
npm run dev           # Vite dev server with HMR (proxies /api to server port)
npm start             # Production: serves built frontend + API on configured port
npm run build         # Vite production build → dist/
npm test              # vitest run (all tests)
npm run dev:all       # Runs both backend and Vite dev server in parallel
```

For development, run `npm start` in one terminal (backend) and `npm run dev` in another (frontend with HMR). The Vite dev server reads the port from `workbench.config.json` and proxies `/api` requests to the backend.

## Architecture

**Backend** (Express, ES modules, better-sqlite3):
- `server.js` — Express app setup, mounts route modules under `/api`, serves static `dist/`
- `db.js` — SQLite database (`workbench.db`), schema (repos, environments, settings), all CRUD functions
- `routes/repos.js` — Repo CRUD, folder scanning (`/scan-folder`), cross-platform folder picker
- `routes/environments.js` — Environment lifecycle: assign issue → create worktree → inject CLAUDE.md → monitor status → release
- `routes/github.js` — GitHub integration via `gh` CLI: list issues, propose PR (optionally AI-generated), create PR
- `routes/launchers.js` — Terminal/editor launching: tmux session management, cross-platform terminal support, process tracking
- `lib/config.js` — Reads/auto-generates `workbench.config.json`, color definitions, Anthropic API key from `.env`
- `lib/platform.js` — Cross-platform detection: terminal, clipboard, editor, shell, window focus, folder picker
- `lib/github.js` — Extracts `owner/repo` from GitHub URLs

**Frontend** (React 19, single-file SPA):
- `src/App.jsx` — Entire UI in one file: environment cards, issue picker, repo picker, settings panel, PR creation modal, status polling (10s interval)
- `src/index.css` — All styles
- `src/main.jsx` — React root mount

**Key concepts:**
- **Colors** map to environment slots (blue, green, red, etc.). Each color can hold one active task.
- **Environments** link a color → repo → GitHub issue → git worktree → branch. Stored in SQLite.
- **Launchers** are configured in `workbench.config.json` (auto-generated on first run). Two types: `tmux-terminal` (creates tmux session with panes) and `command` (runs shell command with `{{path}}`/`{{color}}`/`{{branch}}` interpolation).
- **Status detection** reads tmux pane content to determine Claude Code state (working/approval/waiting/shell).
- **CLAUDE.md injection** — when assigning an issue, the app writes/appends task context to CLAUDE.md in the worktree so Claude Code picks it up.
- **Platform detection** — `lib/platform.js` auto-detects OS, terminal emulator, clipboard tool, editor, and folder picker. Config is auto-generated on first run with zero manual setup.

## External Dependencies

- **macOS or Linux** — cross-platform support via `lib/platform.js`
- **tmux** — terminal multiplexer for session management
- **gh** (GitHub CLI) — issues and PR operations
- **Terminal emulator** — auto-detected: Ghostty, Kitty, Alacritty, iTerm2, Terminal.app, gnome-terminal, xterm
- Optional: `ANTHROPIC_API_KEY` in `.env` enables LLM-powered scan summaries and PR generation (uses Haiku)

## Testing

Tests use Vitest:
- `test/server.test.js` — config parsing, state management, branch naming, CLAUDE.md injection, launcher config, color definitions, git worktree operations, GitHub URL parsing
- `test/platform.test.js` — platform detection, terminal spawn strategies, clipboard/folder picker/window focus commands, config generation

Tests create temp git repos in `test/.tmp-test/`. The server exports `app` without listening when imported by tests (`process.env.VITEST` check).
