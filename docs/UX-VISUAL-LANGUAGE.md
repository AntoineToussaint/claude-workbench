# Visual Language

## Design DNA

NEXUS looks like what happens when a Bloomberg terminal, a SpaceX mission control display, and Apple's design sensibility have a child. It's data-dense but calm. Information-rich but never noisy. Dark, glassy, and alive — things pulse, stream, and breathe.

---

## Color system

### Backgrounds (depth via layers)

```
Layer 0  --bg:      #06060c    Deepest void. The canvas.
Layer 1  --bg2:     #0a0a14    Topbar, secondary regions.
Layer 2  --surface:  #0f0f1a    Cards, sidebar, primary surfaces.
Layer 3  --surface2: #151525    Hover states, nested elements.
Layer 4  --surface3: #1a1a2e    Active states, elevated elements.
```

Each layer is only slightly lighter. The effect is subtle depth, not contrast. Like looking at a deep ocean at night — you sense the layers without seeing hard edges.

### Borders

```
--border:   #1e1e35    Default. Barely visible. Structure without noise.
--border2:  #2a2a45    Hover, focus, active. Slightly more presence.
```

Borders are structural, not decorative. They define regions at minimum opacity. On hover, they brighten to confirm the boundary is interactive.

### Text

```
--text:   #e4e4f0    Primary. High contrast but not pure white.
--text2:  #7878a0    Secondary. Labels, metadata, timestamps.
--text3:  #4a4a6a    Tertiary. Disabled, hints, chrome.
```

### Semantic colors

```
--accent:   #6366f1    Indigo. Primary action, active states, streaming.
--accent2:  #818cf8    Lighter indigo. Highlights, selected items.
--accent3:  #a5b4fc    Lightest indigo. Subtle accents, glow.

--green:    #22c55e    Health, success, done, promoted.
--green2:   #4ade80    Diff additions, positive deltas.

--red:      #ef4444    Error, failure, danger, exclusive locks.
--red2:     #f87171    Diff deletions, negative deltas.

--yellow:   #eab308    Warning, canary, deploying, queued.
--yellow2:  #facc15    Highlighted warnings.

--orange:   #f97316    Escalation, attention.
--cyan:     #22d3ee    External signals, integrations.
--purple:   #a855f7    Architecture decisions, design.
--pink:     #ec4899    Reserved.
```

### Color usage rules

1. **Green** is ONLY for "good" / "done" / "healthy." Never decorative.
2. **Red** is ONLY for "bad" / "error" / "danger." Never decorative.
3. **Yellow** means "in progress, needs attention soon." Canary stages.
4. **Indigo** is the brand color. Used for primary actions, active states, streaming animations.
5. **Agent colors** use the existing workbench palette (blue, green, red, yellow, etc.) to distinguish agents in the grid.

---

## Glassmorphism

Every surface is slightly translucent. This creates depth and the feeling that the UI is a physical layer over a deep dark void.

```css
.glass {
  background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  backdrop-filter: blur(12px);
}
```

On macOS with Electron: `vibrancy: 'under-window'` makes the entire window semi-transparent to the desktop behind. The glass effect layers on top of this.

On non-macOS: the glass effect still works because the background is dark enough that the transparency reads as subtle gradients rather than showing through to the desktop.

---

## Typography

```
Primary:     Inter (400, 500, 600, 700, 800)
Monospace:   JetBrains Mono (400, 500, 600)
```

### Scale

```
28px / 800    Screen headers (iPad), objective titles
20px / 700    Focus view titles
16px / 700    Metric values (JetBrains Mono)
15px / 600    Card titles, section headers
14px / 600    Service names, agent names
13px / 500    Body text, nav items, breadcrumbs
12px / 500    Secondary text, timeline entries
11px / 400    Metadata, badges, tooltips
10px / 600    Section labels (uppercase, 1.5px tracking)
9px  / 600    Micro labels (badge text, canary stages)
```

### Rules

- Section labels: ALWAYS uppercase + letter-spacing 1.5px + --text3 color
- Metric values: ALWAYS JetBrains Mono + color-coded by threshold
- Agent names: ALWAYS bold + color-coded by agent identity
- Timestamps: ALWAYS JetBrains Mono + --text3 + right-aligned
- Keyboard shortcuts: ALWAYS JetBrains Mono + --text3 background pill

---

## Animation

### Principles

1. Animations communicate state, not decorate.
2. Everything uses GPU-composited properties only: `transform`, `opacity`, `filter`.
3. Spring easing for entries: `cubic-bezier(0.16, 1, 0.3, 1)`.
4. Linear for continuous motion (streaming bars, canary progress).

### Catalog

| Animation | Used for | Duration | Easing |
|-----------|----------|----------|--------|
| Pulse | Active/working states | 2s loop | ease-in-out |
| Stream | Agent actively working | 2s loop | linear |
| Canary pulse | Deploy baking | 2s loop | linear |
| Fade in | Panel/modal entry | 250ms | spring |
| Scale up | Card hover | 150ms | spring |
| Slide in | Inbox overlay, toasts | 300ms | spring |
| Shimmer | Skeleton loading | 1.5s loop | linear |
| Badge bounce | New notification | 300ms | spring |

### The pulse

The system pulse dot in the sidebar uses a box-shadow animation that breathes:
```css
@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
  50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(34,197,94,0); }
}
```

When the system is healthy, this is the only moving element. The screen is calm.

### The streaming bar

Active agents show a gradient bar that slides horizontally:
```css
.streaming-bar {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), var(--accent2), transparent);
  background-size: 200% 100%;
  animation: stream 2s linear infinite;
}
```

This is the "agent is working" indicator. Visible in peripheral vision on a secondary monitor.

---

## Spatial model

### Card anatomy

```
+--[color accent line, 2px]------------------------------------------+
|                                                                      |
|  [Agent name, bold]                           [Status badge]         |
|  [Current action, secondary text]                                    |
|                                                                      |
|  [Streaming bar, if active]                                          |
|                                                                      |
|  [Metrics row: p99 | errors | success]                              |
|                                                                      |
+----------------------------------------------------------------------+
```

Cards have:
- **2px color accent** at top (indicates agent/objective identity)
- **16px border-radius** (consistent everywhere)
- **16px internal padding** (consistent everywhere)
- **8-10px gap** between cards in grids

### Grid system

```
Agents:        3-column grid (desktop), 2-column (iPad), 1-column (iPhone)
Services:      2-column grid (desktop/iPad), 1-column (iPhone)
Objectives:    3-column (active/queued/done), responsive to 2 then 1
Artifacts:     4-column (desktop), 3 (iPad), 2 (iPhone)
Locks:         3-column (desktop), 2 (iPad), stack (iPhone)
```

No fixed widths. Grids respond to container width. Minimum card width: 200px.

### Spacing scale

```
4px     Tight: between dots, icon gaps
6px     Compact: grid gaps, inline spacing
8px     Standard: card gaps, section padding
10px    Comfortable: nav item padding
12px    Generous: sidebar padding, section titles
14px    Card internal padding (mobile)
16px    Card internal padding (desktop)
20px    Page-level padding
```

---

## Iconography

No icon library. Icons are Unicode/emoji with consistent sizing:

```
◎  System Map (target)
⬡  Objectives (hexagon — structure)
◈  Observability (diamond — precision)
●  Project status dot (colored)
🔒 Exclusive lock
⏳ Queued lock
⚠  Warning
✓  Done
✕  Close
▼  Deploy marker
```

Icon size: 14px in nav items, 22px in tab bars, 13px inline.

This is intentional: no icon font dependencies, works everywhere (terminal, web, native), semantically meaningful.

---

## Dark mode only

There is no light mode. NEXUS is always dark.

Reasons:
1. Developers work in dark environments (IDEs, terminals).
2. OLED-friendly: true blacks (#06060c) save power on modern displays.
3. The glassmorphism effect requires dark backgrounds to read correctly.
4. Ambient awareness (peripheral monitoring) works better with low-brightness screens.
5. It looks like mission control. That's the vibe.
