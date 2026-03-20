# Screen-Aware UX: How NEXUS Transforms with Real Estate

## The core idea

NEXUS doesn't just *rearrange panels* when you add screens. It **changes what's possible**. More screens = more ambient awareness = less polling = faster decisions = the human can supervise more agents simultaneously.

This isn't responsive design. It's **progressive capability**.

---

## 1 Screen: Surgeon Mode

**Physical:** Laptop, or single 27" monitor.
**Personality:** Focused. One thing at a time. Modal.

### What changes:
- **Tabs, not panels.** System Map, Objectives, Focus, OTEL are tabs. You see one at a time.
- **Decisions are overlays.** Cmd+I opens the inbox on top of everything. You deal with it, close it, go back.
- **Timeline is hidden.** It's a tab in the Focus view's right pane, not persistent. You check it when you want context.
- **No live diff.** You see code when you click an artifact in Focus view. It's on-demand.
- **Notifications do heavy lifting.** Since you can't see the system map while focusing on an objective, the dock badge and desktop notifications tell you when something needs attention.

### What's magic:
- **Auto-switch on escalation.** If you're in Objectives view and a canary starts failing, NEXUS auto-switches to Focus view for that objective. The screen *comes to you* because you only have one.
- **Cmd+I is muscle memory.** On 1 screen, the inbox overlay becomes the primary interaction pattern. Everything else is context for decisions.
- **Compact mode.** Cards show less detail (no sparklines, no artifact lists). Just name, status, badge. Drill in for more.

---

## 2 Screens: Pilot Mode

**Physical:** Primary 27"+ center, secondary 24-27" to the side.
**Personality:** Split attention. Ambient awareness begins.

### What changes:
- **Cockpit stays on screen 1.** Sidebar + System Map (or Objectives/Focus). This is command.
- **Screen 2 is the depth panel.** It shows *what the cockpit can't*: Timeline (top half) + Live Diff (bottom half).
- **Timeline becomes persistent.** You don't tab into it anymore — it's always visible on screen 2. This changes the developer's relationship with time. They see events as they happen without actively looking.
- **Decisions can appear on screen 2.** Instead of an overlay that blocks the cockpit, the decision inbox can occupy the top of screen 2. You make decisions on the side without losing system map context.

### What's magic:
- **Peripheral streaming.** The streaming bars on active agents are visible in your peripheral vision on screen 1 while you read a diff on screen 2. You *sense* agents working without looking at them.
- **Context + decision on different screens.** When a deploy gate decision appears, screen 2 shows the decision card WHILE screen 1 auto-navigates to the Focus view for that objective with the canary metrics. You see the question and the evidence simultaneously without any clicking.
- **Drag to detach.** Drag the Timeline tab header to screen 2 and it pops out. Drag it back and it re-docks. The UX teaches you the multi-screen model naturally.

---

## 3 Screens: Commander Mode

**Physical:** 3 monitors in a curve, or 2 + 1 vertical.
**Personality:** Always-on command center. Minimal modal interactions.

### What changes:
- **Nothing is hidden.** Every major panel has a permanent home:
  - Screen 1 (left): Decisions + Diff viewer
  - Screen 2 (center): Cockpit with sidebar, System Map / Focus
  - Screen 3 (right, possibly vertical): Timeline + OTEL
- **Decisions have their own screen.** This is a fundamental shift. Decisions aren't interruptions anymore — they're a persistent queue that you work through at your own pace, like an email inbox.
- **OTEL is always visible.** Latency charts, error rates, and traces update in real-time on screen 3. You don't need to switch to an OTEL tab. The canary deploy marker moves across the chart as time passes. You watch the system respond to your agents' work.
- **The inbox count drops from a badge to nothing.** With decisions always visible on screen 1, there's no badge needed. You can see the queue. The visual treatment shifts from "notification" to "workspace."

### What's magic:
- **Decision + Evidence + Diff, all at once.** Screen 1 shows the deploy gate decision card with evidence metrics. Screen 2 shows the Focus view with the canary progress. Screen 3 shows the OTEL chart with the live latency line. THREE sources of information for ONE decision. Zero clicks.
- **The vertical monitor is a timeline.** On a rotated display, the timeline becomes a deep scrollable history. 30+ events visible at once. The developer can "scan" hours of agent activity in a glance. This is impossible on a single landscape monitor.
- **Audio cues replace visual badges.** With 3 screens, the developer's eyes might be anywhere. Subtle audio (a soft chime for new decisions, a different tone for deploy gates vs architecture questions) becomes the notification layer. The screen doesn't need to flash — the sound tells you which screen to look at.

---

## 6 Screens: Mission Control

**Physical:** 6 monitors in a 3x2 or 2x3 grid. Or 4 monitors + 2 verticals.
**Personality:** Total ambient awareness. Every panel is always visible. Zero tabs, zero modals.

### What changes:
- **One panel per screen.** No split panels, no tabs, no overlays. Each screen shows exactly one thing at maximum size:
  - Decisions (full screen, stacked cards with evidence, 1 decision visible with full context)
  - System Map (full screen, 4+ service cards with expanded metrics and full sparklines)
  - Objectives (full screen, 3-column kanban with all objectives visible)
  - Timeline (full screen, scrolling chronological feed, possibly vertical monitor)
  - OTEL (full screen, multiple charts stacked, real-time traces)
  - Live Diff (full screen, full file with syntax highlighting and agent attribution)
- **Information density maxes out.** Each panel can now show MORE detail because it has an entire screen. Service cards expand to show full sparkline charts. Objective cards show all child tasks. The diff viewer shows more file context.
- **Decisions become spatial.** Instead of a stack of cards, the Decisions screen becomes a **spatial layout** — deploy gates on the left, architecture on top-right, conflicts bottom-right. You can see all 7 decisions at once without scrolling.

### What's magic:
- **The developer stops "using" the tool.** They just... exist in it. NEXUS becomes the environment, not an app. It's always there, always updating, always showing the truth. The developer's job is to sit in the center, make a decision when one appears, and trust that the system will tell them when they're needed.
- **Pattern recognition across screens.** With 6 screens, the developer starts noticing patterns they couldn't see before. "Every time the tester fails, the OTEL chart shows a latency spike 30 seconds later." This isn't something NEXUS tells them — it's something they SEE because the information is all simultaneously visible.
- **Gesture/gaze routing.** In 2030, eye tracking + gesture control means the developer looks at a decision card and says "approve." But even today, the spatial arrangement means the developer develops muscle memory: "decisions are always top-left, timeline is always bottom-right." The physical layout becomes part of the interaction model.
- **The empty state is peaceful.** When all objectives are complete and all services are healthy, 6 screens of calm green pulses and flat sparklines is deeply satisfying. It's a visual reward for good engineering.

---

## The spectrum

```
Screens:  1          2          3          6
Mode:     Surgeon    Pilot      Commander  Mission Control

Tabs:     4          2          0          0
Modals:   Yes        Some       Rare       Never
Badges:   Essential  Helpful    Optional   Unnecessary
Sound:    Off        Off        Helpful    Essential

Decisions: Overlay   Side panel Dedicated  Spatial
Timeline:  Tab       Persistent Always-on  Full screen
OTEL:      Tab       Hidden     Persistent Full screen
Diff:      On-demand Split      Dedicated  Full screen

Info density: Compact  Normal    Expanded   Maximum
Agent count:  5-8      8-15      15-30      30+

Human state:  Focused  Aware     Commanding Ambient
```

---

## Implementation: screen detection

On app launch and on display change:

```javascript
const displays = screen.getAllDisplays(); // Electron API
const screenCount = displays.length;

if (screenCount === 1) {
  // Surgeon mode: tabs, overlays, compact cards
  applyMode('surgeon');
} else if (screenCount === 2) {
  // Pilot mode: detach timeline+diff to screen 2
  applyMode('pilot');
  offerDetach('timeline+diff', displays[1]);
} else if (screenCount >= 3) {
  // Commander/Mission Control: offer full layout
  applyMode('commander');
  offerLayoutRestore(savedLayout);
}
```

The app ASKS on first detection: "I see 3 screens. Want me to set up Commander mode?" Then remembers the layout.

When a screen disconnects, affected windows collapse back as tabs. When it reconnects, they pop back out. Seamless.

---

## What makes this feel 10 years ahead

1. **The app is screen-aware.** No other developer tool does this. VS Code doesn't rearrange itself when you plug in a monitor. Grafana doesn't. NEXUS does.

2. **More screens = less interaction.** This is counterintuitive. Most apps on more screens still require the same clicking. NEXUS on 6 screens requires LESS clicking because you can see everything simultaneously. Decisions become faster. Context-switching drops to zero.

3. **The empty state is the goal.** The most satisfying view is 6 screens of green pulses and completed objectives. The UX rewards automation by becoming calm.

4. **It trains your peripheral vision.** After a week with NEXUS on 3 screens, you start noticing streaming bars stop without looking directly at them. You hear the decision chime and know which screen to glance at. The tool becomes an extension of your senses.

5. **It respects that screens are PHYSICAL space.** Decisions on the left, because that's where your non-dominant hand rests on the keyboard shortcuts. Timeline on the right, because you scan it like reading (left to right). OTEL below, because you glance down at gauges like a car dashboard. The spatial metaphor is intentional.
