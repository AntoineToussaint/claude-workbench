import { useState, useEffect, useRef, useMemo } from "react";

/**
 * Command palette modal (Cmd+K).
 *
 * Props:
 *   isOpen, onClose, environments, launchers,
 *   onLaunch, onAssign, onShowSettings
 */
export function CommandPalette({ isOpen, onClose, environments, launchers, onLaunch, onAssign, onShowSettings }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Build command list
  const commands = useMemo(() => {
    const cmds = [];

    // --- Environment commands ---
    const envEntries = Object.entries(environments ?? {});
    for (const [color, env] of envEntries) {
      if (!env) continue;

      for (const launcher of launchers ?? []) {
        cmds.push({
          id: `launch-${launcher.id}-${color}`,
          icon: launcher.icon === "terminal" ? "terminal" : launcher.icon === "editor" ? "editor" : "app",
          title: `Open ${color} ${launcher.label.toLowerCase()}`,
          subtitle: env.issue?.title ?? env.branch,
          section: "Environments",
          action: () => onLaunch(launcher.id, color),
        });
      }

    }

    // --- Global actions ---
    cmds.push({
      id: "new-task",
      icon: "plus",
      title: "New Task",
      subtitle: "Assign a task to a free color slot",
      shortcut: "\u2318N",
      section: "Actions",
      action: () => onAssign(),
    });

    cmds.push({
      id: "settings",
      icon: "settings",
      title: "Settings",
      subtitle: "Manage projects and configuration",
      shortcut: "\u2318,",
      section: "Actions",
      action: () => onShowSettings(),
    });

    cmds.push({
      id: "close-modals",
      icon: "x",
      title: "Close all modals",
      subtitle: "Dismiss all open panels",
      shortcut: "Esc",
      section: "Navigation",
      action: () => onClose(),
    });

    return cmds;
  }, [environments, launchers, onLaunch, onAssign, onShowSettings]);

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) => {
      const haystack = `${cmd.title} ${cmd.subtitle ?? ""}`.toLowerCase();
      // Simple fuzzy: every character in the query appears in order
      let hi = 0;
      for (let qi = 0; qi < q.length; qi++) {
        const idx = haystack.indexOf(q[qi], hi);
        if (idx === -1) return false;
        hi = idx + 1;
      }
      return true;
    });
  }, [commands, query]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      // Autofocus after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(".palette-item.selected");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeSelected();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  function executeSelected() {
    const cmd = filtered[selectedIndex];
    if (cmd) {
      onClose();
      cmd.action();
    }
  }

  if (!isOpen) return null;

  // Group filtered results by section
  const sections = [];
  let currentSection = null;
  for (const cmd of filtered) {
    if (cmd.section !== currentSection) {
      currentSection = cmd.section;
      sections.push({ label: currentSection, items: [] });
    }
    sections[sections.length - 1].items.push(cmd);
  }

  let globalIdx = 0;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        <div className="palette-results" ref={listRef}>
          {filtered.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
          {sections.map((section) => (
            <div key={section.label}>
              <div className="palette-section-label">{section.label}</div>
              {section.items.map((cmd) => {
                const idx = globalIdx++;
                return (
                  <div
                    key={cmd.id}
                    className={`palette-item${idx === selectedIndex ? " selected" : ""}`}
                    onClick={() => { onClose(); cmd.action(); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="palette-icon">{renderIcon(cmd.icon)}</span>
                    <span className="palette-text">
                      <span className="palette-title">{cmd.title}</span>
                      {cmd.subtitle && <span className="palette-subtitle">{cmd.subtitle}</span>}
                    </span>
                    {cmd.shortcut && <span className="palette-shortcut">{cmd.shortcut}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderIcon(icon) {
  switch (icon) {
    case "terminal":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 4h16v12H4V4zm2 2v8h12V6H6zm-2 10h16v2H4v-2z"/>
        </svg>
      );
    case "editor":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 5h18v2.5L7.5 17H21v2H3v-2.5L16.5 7H3V5z"/>
        </svg>
      );
    case "pr":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 3a3 3 0 00-1 5.83v6.34a3.001 3.001 0 101.99.01V8.83A3.001 3.001 0 006 3zm0 2a1 1 0 110 2 1 1 0 010-2zm0 12a1 1 0 110 2 1 1 0 010-2zm12 0a1 1 0 10-.01 2A1 1 0 0018 17zm1-5.17V9a3 3 0 00-3-3h-1V3l-4 4 4 4V8h1a1 1 0 011 1v2.83a3.001 3.001 0 101.99.01z"/>
        </svg>
      );
    case "plus":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>
      );
    case "settings":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z"/>
        </svg>
      );
    case "x":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
        </svg>
      );
  }
}
