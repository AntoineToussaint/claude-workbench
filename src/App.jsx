import { useState, useEffect, useRef } from "react";
import {
  DndContext,
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
import { CreatePrModal } from "./components/CreatePrModal";
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
  const [prProposal, setPrProposal] = useState(null);
  const [showPalette, setShowPalette] = useState(false);
  const pollRef = useRef(null);
  const abortRef = useRef(null);

  function closeAllModals() {
    setShowPalette(false);
    setShowSettings(false);
    setPickerColor(null);
    setPickerRepoId(null);
    setReleaseColor(null);
    setPrProposal(null);
  }

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
          setStatuses(data);
          // Update dock badge with attention-needing count
          if (window.electronAPI?.setBadge) {
            const attentionCount = Object.values(data).filter(
              (s) => s.claudeState === "approval" || s.claudeState === "waiting"
            ).length;
            window.electronAPI.setBadge(attentionCount);
          }
        })
        .catch(() => {}); // aborted or network error — ignore
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
      .then(setIssues)
      .finally(() => setIssuesLoading(false));
  }

  function handleAssign(color) {
    const repos = config?.repos ?? [];
    if (repos.length === 1) {
      setPickerColor(color);
      setPickerRepoId(repos[0].id);
      fetchIssuesForRepo(repos[0].id);
    } else {
      setPickerColor(color);
      setPickerRepoId(null);
    }
  }

  function handleNewTask() {
    const colors = config?.colors ?? [];
    const used = new Set(Object.keys(envs));
    const free = colors.filter((c) => !used.has(c.name));
    if (free.length === 0) return;
    handleAssign(free[0].name);
  }

  function handlePickRepo(repoId) {
    setPickerRepoId(repoId);
    fetchIssuesForRepo(repoId);
  }

  async function handlePick(issue) {
    const color = pickerColor;
    const repoId = pickerRepoId;
    setPickerColor(null);
    setPickerRepoId(null);
    const result = await api(`/environments/${color}/assign`, {
      method: "POST",
      body: JSON.stringify({ issue, repoId }),
    });
    if (result.ok) {
      const updated = await api("/environments");
      if (!updated.error) setEnvs(updated);
    }
  }

  function handleRelease(color) {
    setReleaseColor(color);
  }

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

  function handleLaunch(launcherId, color) {
    api("/launch", {
      method: "POST",
      body: JSON.stringify({ launcherId, color }),
    });
  }

  async function handleUpdateTask(color, updates) {
    await api(`/environments/${color}/issue`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    const updated = await api("/environments");
    if (!updated.error) setEnvs(updated);
  }

  async function handleCreatePr(color) {
    const proposal = await api(`/environments/${color}/propose-pr`, { method: "POST" });
    if (proposal.error) return toast.error("PR proposal failed", proposal.error);
    setPrProposal({ color, ...proposal });
  }

  async function handleSubmitPr({ branch, title, body }) {
    const color = prProposal.color;
    const result = await api(`/environments/${color}/create-pr`, {
      method: "POST",
      body: JSON.stringify({ branch, title, body }),
    });
    setPrProposal(null);
    if (result.ok) {
      toast.success("PR created", result.output);
      // Refresh status for this color
      const s = await api(`/environments/${color}/status`);
      if (!s.error) setStatuses((prev) => ({ ...prev, [color]: s }));
      const updated = await api("/environments");
      if (!updated.error) setEnvs(updated);
    } else {
      toast.error("PR creation failed", result.error);
    }
  }

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
  const freeColors = config.colors.filter((c) => !usedColors.has(c.name));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Claude Workbench</h1>
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="Manage projects">
          + Project
        </button>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
        <SortableContext items={orderedRepos.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <main className="board-sections">
            {orderedRepos.map((repo) => {
              const repoEnvs = envsByRepo[repo.id] ?? [];
              const cardIds = repoEnvs.map((e) => e.color);
              return (
                <SortableSection key={repo.id} id={repo.id}>
                  <div className="project-header">
                    {freeColors.length > 0 && (
                      <button
                        className="new-task-btn"
                        style={{ borderColor: freeColors[0].hex, color: freeColors[0].hex }}
                        onClick={() => {
                          setPickerColor(freeColors[0].name);
                          setPickerRepoId(repo.id);
                          fetchIssuesForRepo(repo.id);
                        }}
                      >
                        +
                      </button>
                    )}
                    <span className="project-name">{repo.id}</span>
                    {repo.repo && <span className="project-url">{repo.repo.split("/").slice(-2).join("/")}</span>}
                    <span className="project-env-count">{repoEnvs.length}</span>
                    <button
                      className="project-delete-btn"
                      title="Remove project"
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
                  {repoEnvs.length > 0 && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => handleCardDragEnd(repo.id, event)}
                    >
                      <SortableContext items={cardIds} strategy={horizontalListSortingStrategy}>
                        <div className="project-envs">
                          {repoEnvs.map(({ color, env, colorDef }) => (
                            <SortableCard key={color} id={color}>
                              <EnvCard
                                color={colorDef ?? { name: color, hex: "#888", bg: "#111" }}
                                env={env}
                                status={statuses[color]}
                                launchers={launchers}
                                multiRepo={multiRepo}
                                onAssign={handleAssign}
                                onRelease={handleRelease}
                                onLaunch={handleLaunch}
                                onCreatePr={handleCreatePr}
                                onUpdateTask={handleUpdateTask}
                              />
                            </SortableCard>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </SortableSection>
              );
            })}
          </main>
        </SortableContext>
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
      {prProposal && (
        <CreatePrModal
          proposal={prProposal}
          onClose={() => setPrProposal(null)}
          onSubmit={handleSubmitPr}
        />
      )}
      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        environments={envs}
        launchers={launchers}
        onLaunch={handleLaunch}
        onCreatePr={handleCreatePr}
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
