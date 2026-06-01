import type { Selection } from "./selectionModel";

function isEditableTarget(target: EventTarget | null): boolean {
  const tagName = String((target as { tagName?: string } | null)?.tagName ?? "").toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function handleBoardKeyDown(e: KeyboardEvent, handlers: { onEndTurn: () => void; onClear: () => void; onCyclePanel: () => void; onShortcut: (key: "innovate"|"revolt") => void; onZoom?: () => void; }) {
  if (isEditableTarget(e.target)) return;
  if (e.key === "Escape") handlers.onClear();
  if (e.key === "Tab") { e.preventDefault(); handlers.onCyclePanel(); }
  if (e.key.toLowerCase() === "e") handlers.onEndTurn();
  if (e.key.toLowerCase() === "i") handlers.onShortcut("innovate");
  if (e.key.toLowerCase() === "r") handlers.onShortcut("revolt");
  if (e.key.toLowerCase() === "z") handlers.onZoom?.();
}

export function moveSelectionPlaceholder(current: Selection | null): Selection | null { return current; }
