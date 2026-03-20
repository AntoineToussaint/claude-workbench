# Multi-Screen UX Architecture

## The developer's physical setup

Most serious developers run 2-3 displays:
- **Center**: 27-32" primary (Retina/4K) — where the eyes default
- **Left or Right**: secondary of similar size — peripheral/reference
- **Optional vertical**: a rotated 24-27" — feeds, logs, long-form

NEXUS should feel *native* to this setup, not crammed into a single window that the developer then manually resizes across screens.

---

## Window topology

### The Cockpit (primary screen)

The main NEXUS window. Always open. Contains:

```
+------------------------------------------------------------------+
|  [logo] NEXUS          [14 agents · 3 waiting]    [7 decisions]  |
|------------------------------------------------------------------|
|  Sidebar (260px)  |  Content Area                                |
|                   |                                              |
|  System Map       |  [System Map / Objectives / Focus]           |
|  Objectives       |                                              |
|  ----             |  Agents grid, deploy status, scope locks,    |
|  Projects         |  OTEL metrics, artifacts...                  |
|    Payments ▼     |                                              |
|      Stripe v3 •  |                                              |
|      Webhooks  ⚠  |                                              |
|    Mobile v3      |                                              |
|    Infra          |                                              |
|  ----             |                                              |
|  Locks            |                                              |
+------------------------------------------------------------------+
```

This is the "map" — where you see everything at a glance. Designed for the center screen where your eyes live.

### Detached Panels (secondary screens)

Any panel can be popped out into its own window:

- **Timeline** — chronological feed of all agent activity. Perfect for a vertical monitor.
- **File Preview / Diff** — code changes as agents make them. Live-updating.
- **Decision Queue** — expanded inbox with full evidence, diffs, metrics per decision.
- **Agent Detail** — focused view on one agent's output, like watching a Claude Code terminal.
- **OTEL Dashboard** — full-width metrics, sparklines, deploy markers.

**How to detach:** Cmd+click any panel header, or drag the panel header outside the main window. The panel becomes a new `BrowserWindow` that remembers its position on the correct display.

**How to re-dock:** Drag the detached window back over the cockpit, or Cmd+click the panel header again.

### CLI Mode (terminal panes)

For developers who live in tmux/terminals:

```
+-------------------------------+-------------------+
| $ nexus status                | $ nexus timeline  |
|                               |                   |
| Payments Rewrite              | 14:12 deployer    |
|   Stripe v3 ████████░░ 80%   |   canary stable   |
|     coder-api: editing pay.js | 14:07 coder-api   |
|     coder-ui: checkout form   |   paymentIntent?  |
|     tester: 3/8 ⚠            | 14:05 tester      |
|     deployer: canary 25%      |   currency fail   |
|   Webhooks ⚠ blocked         |                   |
|                               |                   |
| Mobile App v3                 | $ nexus watch api |
|   auth-flow ████████████ done |                   |
|                               | [live agent out]  |
+-------------------------------+-------------------+
```

`nexus` CLI commands are designed for 80-column panes and compose naturally in tmux layouts:
- `nexus status` — compact system map
- `nexus inbox` — interactive decision queue (arrow keys + y/n)
- `nexus timeline` — streaming event log
- `nexus watch <agent>` — tail an agent's output
- `nexus focus <objective>` — detailed objective view

---

## Screen-aware layout behaviors

### Single screen (laptop)

Standard mode. The cockpit fills the window. Panels are tabs, not side-by-side. The inbox is an overlay (Cmd+I). Optimized for 1280px+ width.

### Dual screen

NEXUS detects the second display on launch. Offers: "Open Timeline on [display name]?" If the user has a saved layout, restore it automatically.

Suggested dual layout:
- **Screen 1 (center):** Cockpit — system map + focus view
- **Screen 2 (side):** Timeline + file preview (split vertically)

### Triple screen

- **Screen 1 (center):** Cockpit
- **Screen 2 (left):** Agent detail / diff viewer / decision queue
- **Screen 3 (right/vertical):** Timeline + OTEL metrics

### Layout persistence

Each window's position, size, and display index is saved. On app launch, all windows restore to their saved positions. If a display is disconnected, those windows collapse back into the cockpit as tabs.

---

## Detachable panel protocol

### State sharing

All windows share the same backend connection (Express server). State sync uses:
1. **Polling** (current): each window polls `/api/environments/statuses` independently
2. **Future**: WebSocket broadcast from server. All windows receive updates simultaneously.

### Window lifecycle

```
Cockpit window closes → all detached panels close (they're children)
Panel window closes → panel returns to cockpit as a tab
App quits → save all window geometries → restore on next launch
Display disconnected → affected windows migrate to remaining displays
```

### IPC between windows

Electron `BrowserWindow` instances communicate via main process relay:
- Panel requests: "show me the diff for this artifact" → main process → cockpit highlights the artifact
- Cockpit commands: "detach timeline" → main process → creates new window with timeline URL
- Decision made in panel → main process → all windows update state

---

## Interaction model per form factor

### Desktop (Electron / Tauri)

Primary input: **keyboard + mouse**

| Action | Shortcut |
|--------|----------|
| Open decision inbox | Cmd+I |
| Next decision | Arrow down |
| Decide (primary action) | Y or Enter |
| Decide (secondary) | N |
| Hold decision | H |
| Command palette | Cmd+K |
| Focus objective | Cmd+1 through Cmd+9 |
| Detach panel | Cmd+click header |
| Switch view tab | Cmd+[ / Cmd+] |
| Search everything | Cmd+F |

Mouse is for spatial navigation (clicking agents, dragging panels). Keyboard is for everything else.

### iPad

Primary input: **touch + pencil**

- Bottom tab bar: Map / Objectives / Status / Agents
- Decision cards: swipe left to reject, right to approve
- Focus view: tap an objective card to drill in
- Split view: iPad multitasking puts NEXUS beside a terminal app
- Pencil: annotate diffs, draw on architecture diagrams (future)

### iPhone

Primary input: **thumb**

- Decision-first inbox as home screen
- Large buttons (48pt), bottom-reachable controls
- Notifications for decisions → tap notification → decision card
- Minimal: you shouldn't *need* to open the iPhone app, but when you do, you can unblock agents in 5 seconds

### CLI

Primary input: **keyboard only**

- TUI with arrow key navigation
- Vim-style bindings (j/k/g/G)
- Pipe-friendly: `nexus inbox --json | jq '.[] | select(.type == "deploy")'`
- Integrates with tmux, can auto-create pane layouts
- Color-coded output matching NEXUS color tokens

---

## The "glance test"

Every screen, on every form factor, must pass the glance test:

> In under 3 seconds of looking at the screen, can the developer answer: "Is everything okay, and do I need to do anything?"

- **Green pulse, no badges** → everything fine, go back to Factorio
- **Yellow badge on inbox** → something needs a decision, not urgent
- **Red badge, pulsing** → something is wrong, act now

If the screen requires reading text to determine system health, the design has failed.
