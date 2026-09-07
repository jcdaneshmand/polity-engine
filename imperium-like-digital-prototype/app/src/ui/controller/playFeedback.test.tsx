import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionMenu } from "../layout/ActionMenu";
import { formatPublicGameEvent, summarizeLastLogEntry } from "../layout/GameLogPanel";
import { getAvailableActionsForSelection } from "./selectionModel";

function game(resources: Record<string, number>) {
  return {
    currentTurnType: "activate",
    cardDb: { costly: { id: "costly", displayName: "Costly", type: "action", cardType: "action", cost: 3, tags: [], effects: [] } },
    players: { "1": { hand: ["costly"], actionsRemaining: 1, actionTokensAvailable: 1, resources } }
  };
}

describe("play feedback", () => {
  it("renders the same substitute payment selected by the engine explainer", () => {
    const actions = getAvailableActionsForSelection(
      { kind: "hand_card", id: "costly", playerId: "1" },
      game({ materials: 1, influence: 0, knowledge: 0, goods: 1, unrest: 0 }),
      { currentPlayer: "1" }
    );
    const play = actions.find((action) => action.action === "play");
    expect(play).toMatchObject({ enabled: true, paymentExplanation: { kind: "alternative", payment: { materials: 1, goods: 1 } } });
    const html = renderToStaticMarkup(<ActionMenu actions={actions} onAction={() => undefined} />);
    expect(html).toContain("Payment: 1 materials, 1 goods (includes substitution)");
  });

  it("recomputes an unavailable reason from the current resources", () => {
    const actions = getAvailableActionsForSelection(
      { kind: "hand_card", id: "costly", playerId: "1" },
      game({ materials: 1, influence: 0, knowledge: 0, goods: 0, unrest: 0 }),
      { currentPlayer: "1" }
    );
    expect(actions.find((action) => action.action === "play")).toMatchObject({
      enabled: false,
      reason: "Cannot pay 3 materials",
      paymentExplanation: { kind: "unavailable" }
    });
  });

  it("formats structured resource and terminal events without parsing log messages", () => {
    const resourceEvent = { type: "resource_change" as const, reason: "steal" as const, changes: [
      { playerId: "2", resource: "materials" as const, amount: -2 },
      { playerId: "1", resource: "materials" as const, amount: 2 }
    ] };
    expect(formatPublicGameEvent(resourceEvent)).toBe("Steal: Player 2 -2 Materials, Player 1 +2 Materials.");
    expect(summarizeLastLogEntry([{ message: "deliberately unparseable", event: resourceEvent }])).toBe("Steal: Player 2 -2 Materials, Player 1 +2 Materials.");
    expect(formatPublicGameEvent({ type: "terminal", winner: "1", reason: "deck_empty", scoring: "normal" })).toBe("Scoring complete. Winner: Player 1.");
  });
});
