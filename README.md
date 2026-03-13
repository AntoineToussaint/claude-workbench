# Claude Workbench

Parallel coding environment manager for Claude Code. Run multiple Claude Code instances side-by-side, each in its own color-coded git worktree with dedicated terminals and editors.

## Quick Start

```bash
npm install
npm run build
cp .env.example .env  # add your Anthropic API key (optional, enables LLM summaries)
npm start
```

Open http://localhost:3232

## Usage

1. **Scan Folder** — point at a directory with existing worktrees (e.g. `project-blue`, `project-red`) and the workbench auto-detects repos, branches, and generates descriptions
2. **Or add a repo** — pick a git repo, then assign GitHub issues to color slots. Each gets its own worktree and branch
3. **Launch** — click Ghostty to open a fullscreen tmux session with Claude Code + shell, or open in your editor
4. **Monitor** — the dashboard shows real-time status: working, needs your attention, idle, changed files, PRs
5. **Create PR** — generates branch name, title, and body from the diff (uses Claude if API key is set)

## Configuration

Edit `workbench.config.json`:

```json
{
  "colors": ["blue", "green", "red", "yellow", "black", "purple", "orange", "cyan"],
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
- macOS (uses AppleScript for folder picker and window focus)
- [Ghostty](https://ghostty.org/) or another terminal emulator

## Development

```bash
npm run dev    # Vite dev server with HMR
npm test       # Run tests
npm run build  # Production build
```

## License

MIT
