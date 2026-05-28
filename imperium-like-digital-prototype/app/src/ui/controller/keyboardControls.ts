import type { Selection } from "./selectionModel";

export function handleBoardKeyDown(e: KeyboardEvent, handlers: { onEndTurn: () => void; onClear: () => void; onCyclePanel: () => void; onShortcut: (key: "innovate"|"revolt") => void; }) {
  if (e.key === "Escape") handlers.onClear();
  if (e.key === "Tab") { e.preventDefault(); handlers.onCyclePanel(); }
  if (e.key.toLowerCase() === "e") handlers.onEndTurn();
  if (e.key.toLowerCase() === "i") handlers.onShortcut("innovate");
  if (e.key.toLowerCase() === "r") handlers.onShortcut("revolt");
}

export function moveSelectionPlaceholder(current: Selection | null): Selection | null { return current; }
