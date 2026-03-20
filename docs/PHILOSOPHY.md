# NEXUS — Engineering Philosophy & Design Vision

## Where this comes from

This document captures the thinking behind the viz/ mockups (desktop.html, ipad.html, iphone.html, future.html, index.html) and extrapolates where the product goes next. The mockups prototype a single coherent scenario — a Stripe v3 payment migration — across four form factors, testing how the same information and decisions adapt from iPhone to multi-monitor desktop.

Everything below is rooted in what's already been explored. The mockups are the foundation, not a separate thing.

---

## The scenario that drives everything

The viz mockups tell one story, and it's the right one to test against because it hits every surface of the system:

**"Migrate payments from Stripe charges.create (v2) to paymentIntents (v3)"**

This scenario exercises:
- **5 specialized agents** working in parallel (architect, coder-api, coder-ui, tester, deployer)
- **Canary deployment** ramping through 4 stages (5% → 25% → 50% → 100%) with live OTEL metrics (p99: 31ms, errors: 0.01%, success: 99.3%)
- **Scope locks** preventing collisions (billing/**, api/payments/**, db/migrations/** all locked; Pricing redesign queued behind Stripe)
- **4 decision types** surfaced to the human: deploy gates, architecture choices, conflict resolution, scope expansion
- **Live code diffs** attributed per agent (coder-api changed routes/pay.js: charges.create → paymentIntents.create)
- **Cross-concern blocking** (tester waiting on coder-api; Pricing redesign blocked by scope lock)
- **Service-level observability** (api-gateway, payment-service, postgres-primary, event-queue — all with health metrics and sparklines)

This isn't a hypothetical. This is the kind of workload that NEXUS must handle as its baseline.

---

## What we're building (not what it replaces)

### The human is an orchestrator, not a typist

The mockups show a world where the developer doesn't write code. They:
1. **See** what's happening across all agents and services (System Map)
2. **Decide** when agents surface ambiguity or gates (Inbox / Decision cards)
3. **Steer** by approving scope changes, architecture choices, and deploy promotions
4. **Drill in** when something needs attention (Focus view with agents, deploy, locks, artifacts, timeline)

The `future.html` mockup is the fullest expression of this — sidebar nav, 4-tab content (System Map / Objectives / Focus / OTEL), dual-pane Focus view with timeline and file preview, and a stacked decision overlay.

### PRs are replaced by objective-level approval

The mockups never show a PR. There's no "review this diff" screen. Instead:
- The **Objectives** view (3-column kanban in future.html, list in iPad) shows progress: in-progress, blocked, done today
- The **Focus** view shows what each agent is doing, what files they've touched (Artifacts grid), and what the deploy metrics look like
- **Decisions** are the approval points — but they're scoped to intent ("Promote canary to 25%?"), not implementation ("LGTM on this diff")

The diff viewer exists (File tab in desktop.html, right pane in future.html) but it's context for a decision, not the decision itself. The code is shown with agent attribution tags (`coder-api` next to each changed line) so you know *who* changed what, but you're not "reviewing" it — the tests and canary are reviewing it.

### Conflicts are replaced by scope locks

Every mockup shows the Scope & Locks section. The pattern is consistent:
- `billing/**` — EXCLUSIVE — held by coder-api (Stripe billing objective)
- `api/payments/**` — SHARED — held by coder-api
- `db/migrations/**` — EXCLUSIVE — held by deployer
- `billing/**` — QUEUED — Pricing redesign waiting for release

When locks collide, it's a **decision card** (type: CONFLICT): "Pricing redesign needs billing/**. Allow concurrent or keep queued?" The human resolves it with one tap. No merge conflicts. No 3 AM rebases.

### Signals trigger objectives automatically

The mockups show objectives appearing from external signals:
- future.html includes an error state: "Notification service — Agent errored: SMTP connection refused on staging. Needs human input."
- The iPhone home screen has a "Needs you (4)" section — decisions surfaced from running objectives
- The OTEL tab shows canary deploy markers on latency/error charts — metrics that could trigger auto-rollback or escalation

The pattern: Signal (Sentry spike, test failure, metric threshold, customer ticket) → Objective created → Agents assigned → Scope locked → Work happens → Decisions surface when needed → Deploy → Validate → Complete.

---

## How multi-screen actually works

### What the mockups already show

The viz/ files explore 4 distinct form factors, each with its own information density:

**Desktop (desktop.html, future.html)** — Sidebar + dual-pane content. Full agent grids, deploy boxes with canary stages, scope locks, artifact grids, code diffs with agent tags, OTEL charts with traces. This is the cockpit.

**iPad (ipad.html)** — 5-tab bottom bar (Map / Objectives / Focus / Inbox / OTEL). 2x2 service card grid, swipeable decision stack (Tinder-like with touch gestures), 3-column agent grid in Focus. Touch-first but information-rich.

**iPhone (iphone.html)** — 3-tab bottom bar (Home / Focus / Health). Decision-first home screen. Stacked decision cards with evidence metrics. Minimal agent rows. Sparkline mini-charts. Designed for 5-second interactions.

**Combined (index.html)** — Platform switcher showing all 4 variants. The meta-level design tool.

### What comes next: multi-monitor desktop

Developers with 2-3 screens need more than a single maximized window. The future.html layout already has natural panel boundaries:

**Detachable panels:**
- The right pane (Timeline + File Preview) can pop out to a second monitor
- The OTEL tab can become a persistent monitoring window on a vertical display
- The decision inbox overlay can become a dedicated decision window
- An agent detail view (expanding one agent card to full output) can go to a third screen

**Layout:**
- Screen 1 (center): Cockpit — sidebar + System Map or Objectives or Focus left pane
- Screen 2 (side): Timeline + File Preview (live-updating as agents work)
- Screen 3 (vertical, optional): OTEL dashboards + streaming activity log

Each detached panel is an Electron `BrowserWindow`. They share backend state via the Express API. Window positions persist per-display. If a display disconnects, panels collapse back as tabs.

### CLI as a first-class surface

The mockup scenario maps directly to CLI output:

```
$ nexus status
  Payments Rewrite
    Stripe v3 ████████░░ 60%  canary 5%  5 agents
      coder-api: editing pay.js          coder-ui: checkout form
      tester: 3/8 ⚠                     deployer: canary 12min
    Invoice PDF ████░░░░░ 35%  coding  2 agents
    Auth v2 ████████░ 80%  testing  3 agents
    Pricing ⏳ blocked (billing/** locked by Stripe)

$ nexus inbox
  [1/4] ⚡ DEPLOY GATE — Canary 5% → 25%? p99:31ms err:0.01% success:99.3%
        (y)es promote  (h)old  (r)ollback

$ nexus watch coder-api
  [streaming agent output...]

$ nexus timeline
  14:12 deployer    Canary stable. Promote?
  14:07 coder-api   paymentIntent ID or compat?
  14:05 tester      currency conversion failed pay.js:42
  ...
```

CLI commands are tmux-pane-friendly (80col default). `nexus inbox` is interactive with y/n/h keys. `nexus timeline` streams. `nexus watch <agent>` tails output. These compose into a tmux layout that mirrors the multi-monitor desktop.

---

## Decision-first design

The most important design decision in the mockups: **the iPhone home screen is a decision queue, not a dashboard.**

This is the philosophical core. On every form factor:

| Form factor | Where decisions live | How you interact |
|------------|---------------------|-----------------|
| iPhone | Home screen, scrollable cards | Tap buttons: Hold / Promote |
| iPad | Dedicated Inbox tab, swipeable card stack | Swipe left/right, or tap |
| Desktop | Overlay (Cmd+I), stacked cards with keyboard shortcuts | Y/N/H or click |
| future.html | Same overlay, plus inline decision buttons in Timeline | Click or keyboard |

Decisions have a taxonomy (established across all mockups):
- **Deploy gate** (yellow ⚡) — canary promotion, rollback, hold
- **Architecture** (purple ◆) — API design choices, breaking changes
- **Conflict** (red ⚠) — scope lock contention, concurrent access
- **Scope expand** (indigo ◎) — agent needs to touch files outside its scope

Each decision card always includes:
1. Type badge (color-coded)
2. Source (which project › objective › agent)
3. Question (one sentence, plain language)
4. Evidence (metrics when relevant — p99, error rate, success rate)
5. Actions (2-3 buttons with keyboard shortcuts on desktop)

---

## The glance test

Every mockup passes this test: **in under 3 seconds, can you tell if everything is okay and if you need to do anything?**

- **System pulse**: green dot + "All systems nominal" (every form factor)
- **Badge counts**: 7 decisions on inbox tab (iPad), 4 on home badge (iPhone), "7 decisions" button in topbar (desktop)
- **Canary bar**: animated gradient tells you a deploy is baking without reading any text
- **Streaming bars**: animated gradient on active agents — visible in peripheral vision
- **Color-coded metrics**: green = good, yellow = watch, red = act

If the pulse is green and there are no badges, the developer doesn't need to be here. That's intentional.

---

## What's explored vs what's production

### Already in the mockups (viz/)
- System Map with 4 service cards, metrics, sparklines, canary progress, agent chips
- Objectives view (kanban in future.html, list in iPad/iPhone)
- Focus view with agent grid, deploy box, scope locks, artifacts, timeline
- Decision inbox with 4 typed cards, swipe gestures (iPad), keyboard shortcuts (desktop)
- OTEL panel with latency charts, error rate charts, distributed traces
- Code diff viewer with agent attribution
- Cross-platform tab/sidebar navigation
- Consistent visual language (indigo/purple theme, glass cards, streaming bars, pulse dots)

### Not yet in the mockups but implied
- **Multi-window detachment** — panels popping out to separate monitors
- **CLI TUI** — terminal interface for tmux users
- **Signal ingestion** — Sentry/Datadog/Linear triggering objectives automatically
- **Agent spawning** — UI for creating new objectives and assigning agent roles
- **Lock negotiation** — automatic queuing and conflict resolution before human escalation
- **Auto-promotion** — canary advances automatically if thresholds hold, only escalates on violation
- **History/search** — timeline becomes searchable archive ("what happened with the Stripe migration?")
- **Real-time updates** — WebSocket push instead of polling (current workbench uses 10s polling)

### The bridge from current Workbench to NEXUS

The current Claude Workbench (the production app) manages color-coded environment cards with GitHub issue assignments, tmux terminals, and status polling. NEXUS is the evolution:

| Workbench today | NEXUS tomorrow |
|----------------|---------------|
| Color = environment slot | Color = agent identity within an objective |
| 1 issue = 1 environment | 1 objective = N agents across M repos |
| Manual terminal launch | Agents auto-spawn with scope locks |
| Status polling (tmux scrape) | Event-driven timeline + metrics |
| PR creation modal | Canary deployment with auto-promotion |
| GitHub issues list | Signal-triggered objectives |
| Card-based dashboard | Decision-first inbox + ambient system map |

The path isn't a rewrite — it's an expansion. The current Workbench's backend (Express, SQLite, tmux, gh CLI) forms the foundation. NEXUS adds the objective/agent/lock/decision layer on top.

---

## 10 years in the future

The mockups already feel like they're from 2030. Here's what 2036 looks like:

- **Voice-driven decisions**: "Promote the canary" from your AirPods while walking the dog
- **Spatial system map**: 3D topology of services, agents, and data flow — navigated with trackpad gestures or VR
- **Natural language objectives**: "Migrate to the new Stripe API" → system decomposes into sub-objectives, assigns agents, acquires locks, deploys
- **Predictive escalation**: system surfaces decisions BEFORE they become blockers ("tester will need coder-api's output in ~8 min, should we parallelize?")
- **Cross-company orchestration**: your NEXUS talks to a vendor's NEXUS to coordinate API changes
- **Zero-screen mode**: the system runs autonomously. The developer gets a daily summary email. Decisions that pass confidence thresholds are auto-resolved. The human only appears for genuinely novel judgment calls.

But the philosophy stays the same: **surface decisions, hide machinery, respect the human's attention.**
