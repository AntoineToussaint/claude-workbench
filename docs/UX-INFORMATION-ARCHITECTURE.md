# Information Architecture

## The four layers

NEXUS organizes all information into four temporal layers. Every piece of UI belongs to exactly one.

```
Layer 0: DECIDE    (right now)     → Inbox
Layer 1: OBSERVE   (this session)  → System Map
Layer 2: PLAN      (this week)     → Objectives
Layer 3: RECALL    (any time)      → Timeline / History
```

### Layer 0: DECIDE

**What:** Binary or small-N choices that block agent progress.
**When:** Surfaced the moment an agent hits an ambiguity or gate.
**Where:** Decision inbox (Cmd+I overlay, or home screen on mobile).

Decision types:
| Type | Color | Example |
|------|-------|---------|
| Deploy gate | Yellow | "Canary 25% stable. Promote to 50%?" |
| Architecture | Purple | "Return new ID format or compat wrapper?" |
| Conflict | Red | "Agent B wants locked scope. Allow?" |
| Scope expansion | Indigo | "Fix requires touching auth/. Expand scope?" |
| Failure | Red | "Test suite red after 3 retries. Investigate or skip?" |
| External signal | Cyan | "Sentry spike: auth timeout +300%. Create objective?" |

Each decision card contains:
1. **Type badge** — color-coded, one word
2. **Question** — one sentence, plain language
3. **Evidence** — 2-3 metrics or context lines (inline, not behind a click)
4. **Actions** — 2-3 buttons, primary highlighted, keyboard shortcuts shown
5. **Source** — which agent/objective/signal produced this

Decisions are **ephemeral**. Once acted on, they disappear. The action is logged in the timeline.

### Layer 1: OBSERVE

**What:** Current state of all running systems.
**When:** Always visible as ambient context.
**Where:** System Map (default cockpit view).

Components:
- **Service cards** — one per deployable unit. Health pill, key metrics (p99, error rate, success rate), agent chips, OTEL sparkline.
- **Agent grid** — all active agents with name, current action, streaming bar.
- **Deploy status** — canary progress bar with stages, promote/hold/rollback buttons.
- **Scope locks** — who holds what, who's queued.
- **System pulse** — the single health indicator in the sidebar header.

This layer is **read-heavy, low-interaction**. The developer glances at it. Interaction only happens when something escalates to Layer 0.

### Layer 2: PLAN

**What:** Objectives and their sub-tasks, progress, dependencies.
**When:** When the developer wants strategic context.
**Where:** Objectives tab.

The objectives view uses a **three-column layout**:

```
Active (doing now)    |  Queued (next)       |  Completed (done)
                      |                      |
[Stripe v3 migrate]   |  [Pricing redesign]  |  [Auth rewrite] ✓
  5 agents · 80%      |    blocked: scope    |    3 days · 8 agents
  ████████░░           |    2 agents ready    |
                      |                      |
[Mobile onboarding]   |  [Infra k8s move]    |  [Logging v2] ✓
  3 agents · 45%      |    waiting: Stripe   |
  ████░░░░░            |                      |
```

Each objective card shows:
- Title + priority
- Agent count + progress bar
- Sub-objectives (expandable tree)
- Dependencies (which other objectives block this one)
- Estimated completion (based on agent velocity, not human guessing)

Objectives can be:
- Created from GitHub issues, Linear tickets, Sentry alerts, or manually
- Decomposed into sub-objectives automatically (agent-proposed, human-approved)
- Scoped with file path locks
- Assigned agent roles (architect, coder, tester, deployer)

### Layer 3: RECALL

**What:** Everything that happened, in chronological order.
**When:** When someone asks "what happened?" or "why is this like this?"
**Where:** Timeline panel (detachable, ideal for vertical monitor).

Timeline entries:
```
14:12  deployer    Canary stable 15min. Promoted to 25%.
14:07  coder-api   Architecture decision: new paymentIntent ID (human chose option 1)
14:05  tester      Test failure: currency conversion at pay.js:42
14:03  coder-api   Migrated charges.create → paymentIntents.create (+84 -31 in routes/pay.js)
14:00  deployer    Canary 5% deployed us-east-1
13:55  coder-api   Acquired EXCLUSIVE lock on api/payments/**
13:50  lock-mgr    Pricing redesign queued for billing/**
13:30  system      Objective "Stripe v3 migrate" started. 5 agents. Scope locked.
```

Each entry links to:
- The relevant diff/file (click to open file preview)
- The agent's full output (click agent name to expand)
- The decision that was made (if it was a Layer 0 escalation)

Timeline is **append-only, searchable, filterable** by agent, objective, type.

---

## Navigation model

### Desktop sidebar

```
NAVIGATE
  System Map
  Objectives (2 badge)
  Observability

PROJECTS
  ● Payments Rewrite (2 alert)
    ├ Migrate Stripe v3 (5 info)
    ├ Webhooks (⚠ warn)
    ├ DB migration ✓
    ├ Tests (3/8 info)
    ├ Refund flow ✓
    └ Invoice PDF
  ● Mobile App v3
  ● Infra Migration (1 alert)

LOCKS
  🔒 billing/** (Stripe)
  ⏳ billing/** (Pricing, queued)
```

The sidebar is a **tree** that mirrors the objective hierarchy. Clicking any node navigates the content area. Badges aggregate upward (a sub-objective warning shows on the parent project).

### iPad tab bar

```
[Map]  [Objectives]  [Status]  [Agents]
```

Four tabs, bottom-positioned. The "Map" tab is the service-level system map. "Objectives" is the three-column planner. "Status" is a condensed timeline. "Agents" lists all agents with their current state.

### iPhone tab bar

```
[Inbox]  [Status]  [Agents]
```

Three tabs. Inbox is the decision queue (Layer 0). Status is a minimal system pulse + deploy progress. Agents is a list with tap-to-expand.

### CLI

```
nexus                → interactive TUI with tab switching
nexus status         → Layer 1 (observe) in compact text
nexus inbox          → Layer 0 (decide) interactive
nexus objectives     → Layer 2 (plan) tree view
nexus timeline       → Layer 3 (recall) streaming log
nexus focus <name>   → drill into one objective
nexus watch <agent>  → tail one agent's output
```

---

## Data flow: signal to resolution

```
Signal arrives (Sentry alert, GitHub issue, human command, metric threshold)
    │
    ▼
Triage: is this a new objective or an update to an existing one?
    │
    ├─ New objective → decompose into sub-objectives → assign agents → acquire locks
    │
    └─ Update → route to relevant agent → agent acts → may escalate decision
                                                │
                                                ▼
                                    Decision surfaces in Layer 0 inbox
                                                │
                                    Human decides (1 tap/keystroke)
                                                │
                                                ▼
                                    Agent continues → deploys → validates
                                                │
                                                ▼
                                    Canary progresses through stages
                                                │
                                    Auto-promotes if thresholds met, or
                                    escalates if thresholds breached
                                                │
                                                ▼
                                    Objective marked complete
                                    Locks released
                                    Timeline entry logged
```

The human touches this flow at exactly one point: **decisions**. Everything else is automated.

---

## Entity model

```
Signal
  ├ source: sentry | github | linear | datadog | manual | metric
  ├ severity: critical | high | normal | low
  └ payload: { error, issue, alert, message }

Objective
  ├ title, description, priority
  ├ source: Signal
  ├ status: active | queued | blocked | completed
  ├ sub_objectives: Objective[]
  ├ agents: Agent[]
  ├ locks: Lock[]
  ├ progress: 0-100%
  └ decisions: Decision[]

Agent
  ├ role: architect | coder | tester | deployer | reviewer
  ├ objective: Objective
  ├ status: working | waiting | blocked | done
  ├ current_action: string (e.g., "editing pay.js")
  └ worktree: path

Lock
  ├ scope: glob pattern (e.g., "billing/**")
  ├ type: exclusive | shared
  ├ holder: Agent
  └ queue: Agent[] (waiting for this lock)

Decision
  ├ type: deploy | architecture | conflict | scope | failure | signal
  ├ question: string
  ├ evidence: { metrics, context, diffs }
  ├ options: { label, action, shortcut }[]
  ├ source: Agent | System
  ├ urgency: immediate | normal | low
  └ status: pending | resolved

Deploy
  ├ objective: Objective
  ├ version: string
  ├ stage: canary_5 | canary_25 | canary_50 | full
  ├ metrics: { p99, error_rate, success_rate }
  └ status: baking | promoting | rolling_back | complete
```
