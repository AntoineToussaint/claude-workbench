# Setapp-Quality Desktop App Plan

## Priority Order

1. Foundation (component split + design tokens)
2. Visual polish (cards, header, modals)
3. Toast notifications (replace alert())
4. Electron native feel (window state, IPC)
5. Animations & micro-interactions
6. App icon & branding
7. Dock badge + system notifications
8. Command palette + keyboard shortcuts
9. Packaging & distribution
10. Performance & advanced features

---

## Phase 1: Foundation — Component Split & Design Tokens

Break `src/App.jsx` (1300-line monolith) into proper components:

```
src/
  components/
    layout/Header.jsx
    cards/EnvCard.jsx
    cards/StatusBar.jsx
    modals/TaskPickerModal.jsx
    modals/SettingsPanel.jsx
    modals/RepoPickerModal.jsx
    modals/EditTaskModal.jsx
    modals/CreatePrModal.jsx
    modals/ReleaseModal.jsx
    dnd/SortableCard.jsx
    dnd/SortableSection.jsx
    wizard/SetupWizard.jsx
    shared/Toast.jsx
    shared/CommandPalette.jsx
    shared/Tooltip.jsx
  hooks/
    useApi.js
    usePolling.js
    useKeyboardShortcuts.js
    useToast.js
  lib/
    api.js
    icons.jsx
    theme.js
  App.jsx              -- slim orchestrator, ~200 lines
```

Split `src/index.css` (950 lines) into:
```
src/styles/
  tokens.css       -- CSS custom properties
  base.css         -- reset, body, root
  layout.css       -- header, board, sections
  cards.css        -- env cards, status bar
  modals.css       -- all modal styles
  animations.css   -- keyframes, transitions
  scrollbar.css    -- custom scrollbar
  wizard.css       -- setup wizard
```

### Design tokens (`tokens.css`)

**Layered backgrounds with depth:**
- `--bg-base: #0c0c0c` (deepest)
- `--bg-surface: #141416` (cards)
- `--bg-elevated: #1c1c1e` (modals)
- `--bg-overlay: #242428` (hover/active)

**Glassmorphism:**
- `--glass-bg: rgba(28, 28, 30, 0.72)`
- `--glass-blur: 24px`
- `--glass-border: rgba(255, 255, 255, 0.08)`

**Borders:**
- `--border-subtle: rgba(255, 255, 255, 0.06)`
- `--border-medium: rgba(255, 255, 255, 0.10)`
- `--border-strong: rgba(255, 255, 255, 0.16)`

**Shadows (elevation):**
- `--shadow-sm: 0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.15)`
- `--shadow-md: 0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.2)`
- `--shadow-lg: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)`

**Animation:**
- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (spring deceleration)
- `--duration-fast: 150ms`
- `--duration-normal: 250ms`
- `--duration-slow: 400ms`

**Typography:** Inter font (shipped locally, weights 400/500/600), `-apple-system` fallback.

**Radius:** `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-xl: 20px`

---

## Phase 2: Visual Polish

### 2A. Environment cards (hero element)

- Glass surface: `background: var(--glass-bg); backdrop-filter: blur(24px); border-radius: 16px; box-shadow: var(--shadow-md)`
- Color accent: subtle gradient glow via `box-shadow: inset 0 1px 0 0 ${hex}40, 0 -1px 40px -16px ${hex}20` + `::before` gradient line at top
- Status dot: breathing ripple animation for "working" state (`box-shadow` pulse from 0 to 8px)
- Hover: `transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: var(--border-medium)` with spring easing
- Empty slots: pulsing dashed outline with color gradient at 3% opacity, centered "+" icon

### 2B. Header / title bar

- `background: var(--glass-bg); backdrop-filter: blur(20px)`
- Add `vibrancy: 'under-window'` to Electron BrowserWindow for native macOS frosted glass
- Refined wordmark: `font-weight: 500; letter-spacing: 0.02em; font-size: 13px` (drop the uppercase)

### 2C. Modals

- Backdrop: `background: rgba(0,0,0,0.5); backdrop-filter: blur(8px)`
- Surface: `background: var(--bg-elevated); border-radius: 20px; box-shadow: var(--shadow-lg)`
- Entry: scale 0.95 -> 1.0 + opacity 0 -> 1 + translateY(8px) -> 0, 250ms spring
- Exit: reverse animation with `isClosing` state + `onAnimationEnd` to unmount

### 2D. Custom scrollbars

6px width, transparent track, `rgba(255,255,255,0.1)` thumb, 3px radius.

### 2E. Loading & empty states

- Skeleton cards with shimmer animation instead of "Loading..." text
- Empty project state: dashed outline card with "No tasks running" + styled "+ New Task" button
- Onboarding hero: app icon + "Run multiple Claude Code instances in parallel" + gradient "Add Project" button

---

## Phase 3: Electron Native Feel

### 3A. Window state persistence

Save/restore position, size, isMaximized to JSON in `app.getPath('userData')`. Debounce resize/move events. No new dependencies needed.

### 3B. Expanded IPC bridge (`preload.js`)

Expose:
- `getWindowState()` / `onWindowStateChange(cb)`
- `showNotification(title, body)`
- `setBadge(count)` -- dock badge
- `getAppVersion()`
- `checkForUpdates()`

### 3C. Dock badge

Count environments with `claudeState === "approval"` or `"waiting"` in the polling effect. Call `window.electronAPI?.setBadge(count)`. Backend: `app.setBadgeCount(count)`.

### 3D. System notifications

On state transition to "approval"/"waiting" when window is not focused, send native notification via main process.

### 3E. Native menu enhancements

- File: "New Task" (Cmd+N), "Open Project..." (Cmd+O)
- View: "Command Palette" (Cmd+K)
- Help: "Check for Updates...", "About Claude Workbench"

### 3F. Vibrancy

Add to BrowserWindow: `vibrancy: 'under-window', visualEffectState: 'active', transparent: true`. Set `body` background to transparent/semi-transparent.

---

## Phase 4: Toast Notifications

Replace all `alert()` and `confirm()` calls with a proper toast system.

- `useToast` hook + context provider managing `{ id, type, title, message, duration }` queue
- Toast component: fixed top-right, slide-in from right, glass surface, color-coded left border, auto-dismiss progress bar (4s success, 8s error)
- `useConfirm` hook: promise-based styled confirmation modal replacing native `confirm()`

---

## Phase 5: App Icon & Branding

- Design: rounded rect, dark bg, 3-4 parallel colored lines (blue/green/red/yellow) converging — representing parallel Claude instances
- Generate `icon.icns` (macOS), `icon.png` (Linux), `icon.ico` (Windows)
- Tray icon: 22x22 @2x monochrome template image for menu bar
- Tray menu: active environment count, quick-access per environment, Show/Hide, Quit
- Splash screen: 400x300 frameless centered window with icon + wordmark + loading animation, shown while Express server starts

---

## Phase 6: Packaging & Distribution

- **Code signing:** Remove `identity: null`, set `APPLE_ID` / `APPLE_TEAM_ID` env vars
- **Auto-updater:** `electron-updater` + GitHub releases publish config
- **DMG:** Custom 660x400 dark background image with icon + arrow to Applications
- **Universal binary:** `arch: [universal]` for arm64+x64
- **Fix postinstall:** Replace `npx @electron/rebuild` hack with proper electron-builder `npmRebuild: true`

---

## Phase 7: Command Palette & Keyboard Shortcuts

### Command palette (Cmd+K)
- Fuzzy search across environments, actions, navigation
- Centered modal with search input + results list + keyboard nav (arrows + Enter)
- Each result: icon, title, subtitle, shortcut badge

### Global shortcuts
- `Cmd+K` — Command palette
- `Cmd+N` — New task
- `Cmd+,` — Settings
- `Cmd+1-8` — Focus environment by slot
- `Cmd+Shift+T` — Launch terminal for focused env
- `Escape` — Close modal
- `Cmd+/` — Shortcuts cheat sheet

---

## Phase 8: Performance

- `React.memo()` on `EnvCard` with custom comparator
- Extract polling into `usePolling.js` with AbortController
- `useCallback` for all handler functions
- `contain: content` on cards and sections
- All animations on `transform`/`opacity` only (GPU composited)
- Lazy mount modals with `React.lazy()` + `Suspense`

---

## Phase 9: Advanced Features

- **Activity log:** Slide-out panel with chronological actions, stored in SQLite `activity_log` table
- **Connection status:** Green/red dot in header + "Reconnecting..." banner on disconnect
- **Search/filter:** Header search input to filter cards by issue title, branch, color

---

## Technical Decisions

- **No Tailwind** — CSS custom properties + clean file structure
- **No component library** — Bespoke UI with proper tokens
- **Framer Motion** — One new dep for mount/unmount animations, springs, layout animations
- **Inter font** — Shipped locally in `src/assets/fonts/` (weights 400, 500, 600)
