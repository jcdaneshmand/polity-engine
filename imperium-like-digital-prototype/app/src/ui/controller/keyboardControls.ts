import type { Selection } from "./selectionModel";

function isEditableTarget(target: EventTarget | null): boolean {
  const tagName = String((target as { tagName?: string } | null)?.tagName ?? "").toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT"
    || Boolean((target as HTMLElement | null)?.isContentEditable);
}

export function handleBoardKeyDown(e: KeyboardEvent, handlers: { onEndTurn: () => void; onClear: () => void; onCyclePanel: () => void; onShortcut: (key: "innovate"|"revolt") => void; onZoom?: () => void; }) {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || isEditableTarget(e.target)) return;
  if (typeof document !== "undefined" && document.querySelector('[aria-modal="true"]')) return;
  if (e.key === "Escape") handlers.onClear();
  if (e.key.toLowerCase() === "e") handlers.onEndTurn();
  if (e.key.toLowerCase() === "i") handlers.onShortcut("innovate");
  if (e.key.toLowerCase() === "r") handlers.onShortcut("revolt");
  if (e.key.toLowerCase() === "z") handlers.onZoom?.();
}

export function moveSelectionPlaceholder(current: Selection | null): Selection | null { return current; }
