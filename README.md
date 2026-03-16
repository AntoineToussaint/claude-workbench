# Claude Workbench

Parallel coding environment manager for Claude Code. Run multiple Claude Code instances side-by-side, each in its own color-coded git worktree with dedicated terminals and editors.

## Quick Start

```bash
npx claude-workbench          # auto-generates config, builds, opens browser
```

Or run locally:

```bash
pnpm install
pnpm build
pnpm start
```

Open http://localhost:3232

### Electron (Desktop App)

```bash
pnpm electron:dev             # build + launch desktop app
pnpm electron:build           # package as .dmg / .zip
```

## Usage

1. **Scan Folder** — point at a directory with existing worktrees (e.g. `project-blue`, `project-red`) and the workbench auto-detects repos, branches, and generates descriptions
2. **Or add a repo** — pick a git repo, then assign GitHub issues to color slots. Each gets its own worktree and branch
3. **Launch** — click your terminal to open a fullscreen tmux session with Claude Code + shell, or open in your editor
4. **Monitor** — the dashboard shows real-time status: working, needs your attention, idle, changed files, PRs
5. **Create PR** — generates branch name, title, and body from the diff (uses Claude if API key is set)

## Configuration

The config file `workbench.config.json` is auto-generated on first run with sensible defaults for your platform. Edit it to customize:

```json
{
  "port": 3232,
  "launchers": [
    {
      "id": "ghostty",
      "label": "Ghostty",
      "type": "tmux-terminal",
      "app": "/Applications/Ghostty.app/Contents/MacOS/ghostty",
      "fullscreen": true,
      "panes": [
        { "cmd": "claude --continue", "focus": true },
        { "cmd": null }
      ]
    },
    {
      "id": "zed",
      "label": "Zed",
      "type": "command",
      "cmd": "zed \"{{path}}\""
    }
  ]
}
```

### Launchers

- **tmux-terminal**: Opens a terminal app attached to a tmux session. Panes are split horizontally. An objective panel auto-displays at the top.
- **command**: Runs a shell command with `{{path}}`, `{{color}}`, `{{branch}}` interpolation.

### API Key (optional)

Create a `.env` file with your Anthropic API key to enable LLM-powered features (scan summaries, PR generation):

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Requirements

- Node.js 18+
- [GitHub CLI](https://cli.github.com/) (`gh`) — for issues and PRs
- [tmux](https://github.com/tmux/tmux) — terminal multiplexer
- macOS or Linux (cross-platform support via auto-detection)
- A terminal emulator — auto-detected: Ghostty, Kitty, Alacritty, iTerm2, Terminal.app, gnome-terminal, xterm

## Development

```bash
pnpm dev           # Vite dev server with HMR
pnpm dev:all       # Backend + Vite dev server in parallel
pnpm test          # Run tests (vitest)
pnpm build         # Production build
```

## License

MIT
