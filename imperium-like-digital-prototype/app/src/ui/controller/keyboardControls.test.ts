import { describe, expect, it } from "vitest";
import { handleBoardKeyDown } from "./keyboardControls";

function keyboardEvent(key: string, target?: EventTarget): KeyboardEvent {
  return {
    key,
    target,
    preventDefault: () => undefined
  } as KeyboardEvent;
}

describe("board keyboard controls", () => {
  it.each([{ key: "Tab" }, { key: "e", repeat: true }, { key: "e", ctrlKey: true }, { key: "e", metaKey: true }, { key: "e", isComposing: true }, { key: "e", target: { isContentEditable: true } }])("preserves browser and typing input %j", (input) => {
    let calls = 0;
    const called = () => { calls++; };
    handleBoardKeyDown({ ...keyboardEvent(input.key), ...input } as KeyboardEvent, { onEndTurn: called, onClear: called, onCyclePanel: called, onShortcut: called });
    expect(calls).toBe(0);
  });
  it("opens card zoom from the keyboard", () => {
    let zoomed = false;

    handleBoardKeyDown(keyboardEvent("z"), {
      onEndTurn: () => undefined,
      onClear: () => undefined,
      onCyclePanel: () => undefined,
      onShortcut: () => undefined,
      onZoom: () => {
        zoomed = true;
      }
    });

    expect(zoomed).toBe(true);
  });

  it("does not trigger board shortcuts while typing in form fields", () => {
    let endedTurn = false;

    handleBoardKeyDown(keyboardEvent("e", { tagName: "INPUT" } as unknown as EventTarget), {
      onEndTurn: () => {
        endedTurn = true;
      },
      onClear: () => undefined,
      onCyclePanel: () => undefined,
      onShortcut: () => undefined,
      onZoom: () => undefined
    });

    expect(endedTurn).toBe(false);
  });
});
