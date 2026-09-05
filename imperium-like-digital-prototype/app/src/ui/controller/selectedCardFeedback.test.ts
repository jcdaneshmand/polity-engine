import { describe, expect, it } from "vitest";
import { getSelectedCardBlockedAction } from "./selectionModel";

describe("selected card feedback", () => {
  it("does not describe a playable card using an unrelated blocked turn action", () => {
    expect(getSelectedCardBlockedAction([
      { action: "revolt", enabled: false, reason: "No Unrest in hand" },
      { action: "play", enabled: true }
    ])).toBeUndefined();
  });
  it("selects the card-specific failure and keeps its provenance", () => {
    const blocked = { action: "play", enabled: false, reason: "No Action tokens", provenance: "requires_action_token" };
    expect(getSelectedCardBlockedAction([{ action: "revolt", enabled: false, reason: "No Unrest" }, blocked])).toEqual(blocked);
  });
  it("does not show another card action as blocked when one is legal", () => {
    expect(getSelectedCardBlockedAction([{ action: "exhaust", enabled: false, reason: "Exhausted" }, { action: "profit", enabled: true }])).toBeUndefined();
  });
});
