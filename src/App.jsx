import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import api from "./lib/api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider, useToast } from "./hooks/useToast.jsx";
import { ConfirmProvider, useConfirm } from "./hooks/useConfirm.jsx";
import { SetupWizard } from "./components/SetupWizard";
import { TaskPickerModal } from "./components/TaskPickerModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { RepoPickerModal } from "./components/RepoPickerModal";
import { SortableCard } from "./components/SortableCard";
import { SortableSection } from "./components/SortableSection";
import { ReleaseModal } from "./components/ReleaseModal";
import { EnvCard } from "./components/EnvCard";
import { CommandPalette } from "./components/CommandPalette";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

// ── Main app ────────────────────────────────────────────────────────────────

function AppInner() {
  const toast = useToast();
  const confirm = useConfirm();
  const [config, setConfig] = useState(null);
  const [envs, setEnvs] = useState({});
  const [statuses, setStatuses] = useState({});
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [pickerColor, setPickerColor] = useState(null);
  const [pickerRepoId, setPickerRepoId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [releaseColor, setReleaseColor] = useState(null);
  const [cardOrder, setCardOrder] = useState({});
  const [sectionOrder, setSectionOrder] = useState(null);
  const [showPalette, setShowPalette] = useState(false);
  const [connected, setConnected] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDragId, setActiveDragId] = useState(null);
  const [activeCardDrag, setActiveCardDrag] = useState(null);
  const pollRef = useRef(null);
  const abortRef = useRef(null);
  const prevStatesRef = useRef({});

  const closeAllModals = useCallback(() => {
    setShowPalette(false);
    setShowSettings(false);
    setPickerColor(null);
    setPickerRepoId(null);
    setReleaseColor(null);
  }, []);

  useKeyboardShortcuts({
    "meta+k": () => setShowPalette((v) => !v),
    "meta+,": () => setShowSettings(true),
    "Escape": closeAllModals,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    api("/config").then((r) => !r.error && setConfig(r));
    api("/environments").then((r) => !r.error && setEnvs(r));
    api("/layout").then((r) => {
      if (r.cardOrder) setCardOrder(r.cardOrder);
      if (r.sectionOrder) setSectionOrder(r.sectionOrder);
    });
    // Request browser notification permission (no-op in Electron)
    if (!window.electronAPI && Notification?.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Batched status polling with AbortController
  useEffect(() => {
    function pollStatuses() {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/environments/statuses", { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setConnected(true);
          // Notify on state transitions to approval/waiting
          for (const [color, s] of Object.entries(data)) {
            const prev = prevStatesRef.current[color];
            const title = s.claudeState === "approval" && prev !== "approval"
              ? `${color}: Needs approval`
              : s.claudeState === "waiting" && prev !== "waiting"
              ? `${color}: Waiting for input`
              : null;
            if (title) {
              const body = envs[color]?.issue?.title ?? "";
              if (window.electronAPI?.showNotification) {
                window.electronAPI.showNotification(title, body);
              } else if (Notification?.permission === "granted") {
                new Notification(title, { body });
              }
            }
          }
          prevStatesRef.current = Object.fromEntries(
            Object.entries(data).map(([c, s]) => [c, s.claudeState])
          );
          setStatuses(data);
          // Update dock badge with attention-needing count
          if (window.electronAPI?.setBadge) {
            const attentionCount = Object.values(data).filter(
              (s) => s.claudeState === "approval" || s.claudeState === "waiting"
            ).length;
            window.electronAPI.setBadge(attentionCount);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setConnected(false);
        });
    }

    pollStatuses();
    pollRef.current = setInterval(pollStatuses, 10000);
    return () => {
      clearInterval(pollRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [envs]);

  function fetchIssuesForRepo(repoId) {
    setIssuesLoading(true);
    api(`/github/issues?repo=${encodeURIComponent(repoId)}`)
      .then((data) => setIssues(Array.isArray(data) ? data : []))
      .finally(() => setIssuesLoading(false));
  }

  const handleAssign = useCallback((color) => {
    const repos = config?.repos ?? [];
    if (repos.length === 1) {
      setPickerColor(color);
      setPickerRepoId(repos[0].id);
      fetchIssuesForRepo(repos[0].id);
    } else {
      setPickerColor(color);
      setPickerRepoId(null);
    }
  }, [config]);

  const handleNewTask = useCallback(async () => {
    const colors = config?.colors ?? [];
    const used = new Set(Object.keys(envs));
    const free = colors.filter((c) => !used.has(c.name));
    if (free.length > 0) {
      handleAssign(free[0].name);
    } else {
      // All colors used — generate a new one
      const newColor = await api("/colors/next", { method: "POST" });
      if (newColor.name) {
        // Add to config so the UI knows about it
        setConfig((prev) => ({
          ...prev,
          colors: [...(prev?.colors ?? []), newColor],
        }));
        handleAssign(newColor.name);
      }
    }
  }, [config, envs, handleAssign]);

  function handlePickRepo(repoId) {
    setPickerRepoId(repoId);
    fetchIssuesForRepo(repoId);
  }

  async function handlePick(issue) {
    const color = pickerColor;
    const repoId = pickerRepoId;
    setPickerColor(null);
    setPickerRepoId(null);
    toast.info("Creating environment...", `${color}: ${issue.title}`);
    const result = await api(`/environments/${color}/assign`, {
      method: "POST",
      body: JSON.stringify({ issue, repoId }),
    });
    if (result.ok) {
      toast.success("Environment ready", `${color}: ${issue.title}`);
      const updated = await api("/environments");
      if (!updated.error) setEnvs(updated);
    } else {
      toast.error("Failed to create environment", result.error ?? "Unknown error");
    }
  }

  const handleRelease = useCallback((color) => {
    setReleaseColor(color);
  }, []);

  async function confirmRelease() {
    const color = releaseColor;
    setReleaseColor(null);
    await api(`/environments/${color}/release`, {
      method: "POST",
      body: JSON.stringify({ removeWorktree: true }),
    });
    setStatuses((prev) => { const n = { ...prev }; delete n[color]; return n; });
    const updated = await api("/environments");
    if (!updated.error) setEnvs(updated);
  }

  const handleLaunch = useCallback((launcherId, color) => {
    api("/launch", {
      method: "POST",
      body: JSON.stringify({ launcherId, color }),
    });
  }, []);

  const handleUpdateTask = useCallback(async (color, updates) => {
    await api(`/environments/${color}/issue`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    const updated = await api("/environments");
    if (!updated.error) setEnvs(updated);
  }, []);

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function persistLayout(newCardOrder, newSectionOrder) {
    const body = {};
    if (newCardOrder !== undefined) body.cardOrder = newCardOrder;
    if (newSectionOrder !== undefined) body.sectionOrder = newSectionOrder;
    api("/layout", { method: "PUT", body: JSON.stringify(body) });
  }

  function handleCardDragEnd(repoId, event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentOrder = cardOrder[repoId] ?? envsByRepoColors(repoId);
    const oldIndex = currentOrder.indexOf(active.id);
    const newIndex = currentOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    const updated = { ...cardOrder, [repoId]: newOrder };
    setCardOrder(updated);
    persistLayout(updated, undefined);
  }

  function handleSectionDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentOrder = orderedRepos.map((r) => r.id);
    const oldIndex = currentOrder.indexOf(active.id);
    const newIndex = currentOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    setSectionOrder(newOrder);
    persistLayout(undefined, newOrder);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!config) return (
    <div className="app">
      <header className="app-header">
        <div className="skeleton skeleton-text" style={{ width: 140 }} />
        <div style={{ marginLeft: "auto" }}>
          <div className="skeleton skeleton-btn" />
        </div>
      </header>
      <main className="board-sections">
        <div className="skeleton-section">
          <div className="skeleton skeleton-text" style={{ width: 120, marginBottom: 12 }} />
          <div className="project-envs">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-card-header">
                  <div className="skeleton skeleton-dot" />
                  <div className="skeleton skeleton-text" style={{ width: 60 }} />
                </div>
                <div className="skeleton-card-body">
                  <div className="skeleton skeleton-text" style={{ width: "80%" }} />
                  <div className="skeleton skeleton-text" style={{ width: "60%" }} />
                  <div className="skeleton skeleton-text" style={{ width: 100, marginTop: 12 }} />
                  <div className="skeleton-card-actions">
                    <div className="skeleton skeleton-btn" />
                    <div className="skeleton skeleton-btn" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );

  if (config.setupRequired) {
    return (
      <SetupWizard onComplete={() => {
        api("/config").then((r) => !r.error && setConfig(r));
      }} />
    );
  }

  const launchers = config.launchers ?? [];
  const repos = config.repos ?? [];
  const multiRepo = repos.length > 1;
  const hasRepos = repos.length > 0;

  if (!hasRepos) {
    return (
      <div className="app">
        <div className="onboarding">
          <div className="onboarding-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
              <line x1="4" y1="16" x2="44" y2="16" stroke="currentColor" strokeWidth="2" />
              <circle cx="10" cy="12" r="1.5" fill="#EF4444" />
              <circle cx="15" cy="12" r="1.5" fill="#F59E0B" />
              <circle cx="20" cy="12" r="1.5" fill="#22C55E" />
              <line x1="12" y1="24" x2="24" y2="24" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="30" x2="32" y2="30" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="36" x2="20" y2="36" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1>Claude Workbench</h1>
          <p>Run multiple Claude Code instances in parallel.</p>
          <p className="onboarding-sub">Each gets a color-coded worktree, terminal, and editor.</p>
          <button className="onboarding-btn" onClick={() => setShowSettings(true)}>
            + Add Project
          </button>
          <span className="onboarding-hint">or press <kbd>&#8984;</kbd> + <kbd>,</kbd></span>
        </div>
        {showSettings && (
          <SettingsPanel
            repos={repos}
            onClose={() => setShowSettings(false)}
            onReposChanged={() => { api("/config").then((r) => !r.error && setConfig(r)); api("/environments").then((r) => !r.error && setEnvs(r)); }}
          />
        )}
      </div>
    );
  }

  // Group environments by repo
  const envsByRepo = {};
  for (const [color, env] of Object.entries(envs)) {
    const rid = env.repoId ?? "unknown";
    if (!envsByRepo[rid]) envsByRepo[rid] = [];
    envsByRepo[rid].push({ color, env, colorDef: config.colors.find((c) => c.name === color) });
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    for (const [rid, repoEnvs] of Object.entries(envsByRepo)) {
      envsByRepo[rid] = repoEnvs.filter(({ color, env }) =>
        color.toLowerCase().includes(q) ||
        (env?.issue?.title ?? "").toLowerCase().includes(q) ||
        (env?.branch ?? "").toLowerCase().includes(q) ||
        (env?.issue?.body ?? "").toLowerCase().includes(q)
      );
      if (envsByRepo[rid].length === 0) delete envsByRepo[rid];
    }
  }

  function envsByRepoColors(repoId) {
    return (envsByRepo[repoId] ?? []).map((e) => e.color);
  }

  // Sort envs within each repo by persisted card order
  for (const [repoId, repoEnvs] of Object.entries(envsByRepo)) {
    const order = cardOrder[repoId];
    if (order) {
      repoEnvs.sort((a, b) => {
        const ai = order.indexOf(a.color);
        const bi = order.indexOf(b.color);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
  }

  // Sort repos by persisted section order
  const orderedRepos = sectionOrder
    ? [...repos].sort((a, b) => {
        const ai = sectionOrder.indexOf(a.id);
        const bi = sectionOrder.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : repos;

  const usedColors = new Set(Object.keys(envs));
  const freeColors = (config.colors ?? []).filter((c) => !usedColors.has(c.name));

  return (
    <div className="app">
      {!connected && <div className="reconnecting-banner">Reconnecting to server...</div>}
      <header className="app-header">
        <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} title={connected ? 'Connected' : 'Connection lost'} />
        <h1>Claude Workbench</h1>
        <input
          className="header-search"
          type="text"
          placeholder="Filter tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="Manage projects">
          + Project
        </button>
        {window.location.port === "5173" && (
          <button
            className="settings-btn"
            style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
            onClick={async () => {
              await api("/config", { method: "PUT", body: JSON.stringify({ _reset: true }) });
              // Wipe config to trigger onboarding
              await fetch("/api/setup/reset", { method: "POST" });
              setConfig({ setupRequired: true });
            }}
            title="Reset to onboarding (dev only)"
          >
            Reset
          </button>
        )}
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveDragId(e.active.id)} onDragEnd={(e) => { setActiveDragId(null); handleSectionDragEnd(e); }}>
        <SortableContext items={orderedRepos.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <main className="board-sections">
            {orderedRepos.map((repo) => {
              const repoEnvs = envsByRepo[repo.id] ?? [];
              const cardIds = repoEnvs.map((e) => e.color);
              // Hide empty repos when filtering (but always show when not filtering)
              if (searchQuery && repoEnvs.length === 0) return null;
              return (
                <SortableSection key={repo.id} id={repo.id}>
                  {({ dragHandleProps }) => (<>
                  <div className="project-header" {...dragHandleProps} style={{ cursor: "grab" }}>
                      <button
                        className="new-task-btn"
                        style={{ borderColor: freeColors[0]?.hex ?? "#888", color: freeColors[0]?.hex ?? "#888" }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={async () => {
                          let color;
                          if (freeColors.length > 0) {
                            color = freeColors[0].name;
                          } else {
                            // Generate a new color slot
                            const newColor = await api("/colors/next", { method: "POST" });
                            if (!newColor.name) return toast.error("Failed to generate color");
                            setConfig((prev) => ({
                              ...prev,
                              colors: [...(prev?.colors ?? []), newColor],
                            }));
                            color = newColor.name;
                          }
                          setPickerColor(color);
                          setPickerRepoId(repo.id);
                          fetchIssuesForRepo(repo.id);
                        }}
                      >
                        +
                      </button>
                    <span className="project-name">{repo.id}</span>
                    {repo.repo && <span className="project-url">{repo.repo.split("/").slice(-2).join("/")}</span>}
                    <span className="project-env-count">{repoEnvs.length}</span>
                    <button
                      className="project-delete-btn"
                      title="Remove project"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={async () => {
                        if (!(await confirm("Remove project?", `Remove project "${repo.id}"? This will release all its environments.`, { confirmText: "Remove", danger: true }))) return;
                        await api(`/repos/${encodeURIComponent(repo.id)}`, { method: "DELETE" });
                        api("/config").then((r) => !r.error && setConfig(r));
                        api("/environments").then((r) => !r.error && setEnvs(r));
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {repoEnvs.length > 0 ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={(e) => setActiveCardDrag(e.active.id)}
                      onDragEnd={(event) => { setActiveCardDrag(null); handleCardDragEnd(repo.id, event); }}
                    >
                      <SortableContext items={cardIds} strategy={horizontalListSortingStrategy}>
                        <div className="project-envs">
                          {repoEnvs.map(({ color, env, colorDef }) => (
                            <SortableCard key={color} id={color}>
                              {({ dragHandleProps: cardDragProps }) => (
                              <EnvCard
                                dragHandleProps={cardDragProps}
                                color={colorDef ?? { name: color, hex: "#888", bg: "#111" }}
                                env={env}
                                status={statuses[color]}
                                launchers={launchers}
                                multiRepo={multiRepo}
                                onAssign={handleAssign}
                                onRelease={handleRelease}
                                onLaunch={handleLaunch}
                                onUpdateTask={handleUpdateTask}
                              />
                              )}
                            </SortableCard>
                          ))}
                        </div>
                      </SortableContext>
                      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
                        {activeCardDrag ? (() => {
                          const cd = (config.colors ?? []).find((c) => c.name === activeCardDrag);
                          const cardEnv = envs[activeCardDrag];
                          return (
                            <div className="env-card" style={{ "--card-color": cd?.hex ?? "#888", "--card-color-alpha": `${cd?.hex ?? "#888"}30`, cursor: "grabbing", boxShadow: "var(--shadow-lg)" }}>
                              <div className="env-header">
                                <span className="env-dot" style={{ background: cd?.hex ?? "#888" }} />
                                <span className="env-name">{activeCardDrag}</span>
                              </div>
                              {cardEnv?.issue && (
                                <div className="env-body" style={{ padding: "8px 16px" }}>
                                  <span className="env-task-title">{cardEnv.issue.title}</span>
                                </div>
                              )}
                            </div>
                          );
                        })() : null}
                      </DragOverlay>
                    </DndContext>
                  ) : (
                    <div className="project-empty">No active tasks — click + to assign one</div>
                  )}
                  </>)}
                </SortableSection>
              );
            })}
            {searchQuery && Object.keys(envsByRepo).length === 0 && (
              <div className="search-empty">No tasks matching "{searchQuery}"</div>
            )}
          </main>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeDragId ? (() => {
            const repo = repos.find((r) => r.id === activeDragId);
            if (repo) {
              const count = (envsByRepo[repo.id] ?? []).length;
              return (
                <div className="project-header drag-overlay" style={{ cursor: "grabbing", background: "var(--bg-surface)", border: "1px solid var(--border-medium)", borderRadius: "var(--radius-sm)", padding: "8px 16px", boxShadow: "var(--shadow-lg)" }}>
                  <span className="project-name">{repo.id}</span>
                  {repo.repo && <span className="project-url">{repo.repo.split("/").slice(-2).join("/")}</span>}
                  <span className="project-env-count">{count}</span>
                </div>
              );
            }
            return null;
          })() : null}
        </DragOverlay>
      </DndContext>
      {pickerColor && !pickerRepoId && repos.length > 1 && (
        <RepoPickerModal
          repos={repos}
          onPick={handlePickRepo}
          onClose={() => setPickerColor(null)}
        />
      )}
      {pickerColor && pickerRepoId && (
        <TaskPickerModal
          issues={issues}
          loading={issuesLoading}
          onPick={handlePick}
          onClose={() => { setPickerColor(null); setPickerRepoId(null); }}
        />
      )}
      {releaseColor && (
        <ReleaseModal
          color={releaseColor}
          status={statuses[releaseColor]}
          onClose={() => setReleaseColor(null)}
          onConfirm={confirmRelease}
        />
      )}
      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        environments={envs}
        launchers={launchers}
        onLaunch={handleLaunch}
        onAssign={handleNewTask}
        onShowSettings={() => setShowSettings(true)}
      />
      {showSettings && (
        <SettingsPanel
          repos={repos}
          onClose={() => setShowSettings(false)}
          onReposChanged={() => { api("/config").then((r) => !r.error && setConfig(r)); api("/environments").then((r) => !r.error && setEnvs(r)); }}
        />
      )}
      <footer className="app-footer">
        <span>Built {new Date(__BUILD_TIME__).toLocaleString()}</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <AppInner />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
