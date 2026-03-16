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
import { SetupWizard } from "./components/SetupWizard";
import { TaskPickerModal } from "./components/TaskPickerModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { RepoPickerModal } from "./components/RepoPickerModal";
import { CreatePrModal } from "./components/CreatePrModal";
import { SortableCard } from "./components/SortableCard";
import { SortableSection } from "./components/SortableSection";
import { ReleaseModal } from "./components/ReleaseModal";
import { EnvCard } from "./components/EnvCard";

// ── Main app ────────────────────────────────────────────────────────────────

function AppInner() {
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
  const pollRef = useRef(null);
  const abortRef = useRef(null);

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
        .then((data) => setStatuses(data))
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
    if (proposal.error) return alert(`Failed: ${proposal.error}`);
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
      alert(`PR created: ${result.output}`);
      // Refresh status for this color
      const s = await api(`/environments/${color}/status`);
      if (!s.error) setStatuses((prev) => ({ ...prev, [color]: s }));
      const updated = await api("/environments");
      if (!updated.error) setEnvs(updated);
    } else {
      alert(`Failed: ${result.error}`);
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

  if (!config) return <div className="loading">Loading...</div>;

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
          <h1>Claude Workbench</h1>
          <p>Add a project to get started.</p>
          <button className="onboarding-btn" onClick={() => setShowSettings(true)}>
            + Add Project
          </button>
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
                        if (!confirm(`Remove project "${repo.id}"? This will release all its environments.`)) return;
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
      <AppInner />
    </ErrorBoundary>
  );
}
