import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { endTurnMove, playCard } from "../game/moves";

const ctx = { currentPlayer: "0" } as any;

describe("turn loop", () => {
  it("play card that draws", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    playCard(G, ctx, card);
    expect(G.players["0"].playArea).toContain(card);
  });

  it("end turn sends hand and playArea to discard", () => {
    const G = createInitialState();
    G.players["0"].hand = ["a"]; G.players["0"].playArea = ["b"];
    endTurnMove(G, ctx);
    expect(G.players["0"].discard).toEqual(["a", "b"]);
  });
});
