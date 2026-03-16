import { useEffect } from "react";

/**
 * Register global keyboard shortcuts on the document.
 *
 * Usage:
 *   useKeyboardShortcuts({
 *     "meta+k": () => setShowPalette(true),
 *     "meta+,": () => setShowSettings(true),
 *     "Escape": () => closeModals(),
 *   });
 *
 * "meta" maps to Cmd on Mac and Ctrl elsewhere.
 * Shortcuts are suppressed when the user is typing in an input/textarea/select.
 */
export function useKeyboardShortcuts(shortcutMap) {
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

    function handler(e) {
      // Don't fire when user is typing in form elements
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Still allow Escape from inputs
        if (e.key !== "Escape") return;
      }

      for (const [combo, fn] of Object.entries(shortcutMap)) {
        if (matches(e, combo, isMac)) {
          e.preventDefault();
          e.stopPropagation();
          fn();
          return;
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcutMap]);
}

function matches(e, combo, isMac) {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const needsMeta = parts.includes("meta");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  // Check modifier keys
  const metaHeld = isMac ? e.metaKey : e.ctrlKey;
  if (needsMeta && !metaHeld) return false;
  if (!needsMeta && metaHeld) return false;
  if (needsShift && !e.shiftKey) return false;
  if (needsAlt && !e.altKey) return false;

  // Check the actual key
  const eventKey = e.key.toLowerCase();
  if (key === "escape") return eventKey === "escape";
  if (key === ",") return eventKey === ",";
  return eventKey === key;
}
