import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { runEffects } from "../cards/effectRunner";

describe("zones/history", () => {
  it("move self to history removes from play and discard", () => {
    const G = createInitialState();
    const id = "test_action_lineage_record";
    G.players["0"].playArea = [id];
    G.players["0"].discard = [id];
    runEffects({ G, playerId: "0", selfCardId: id }, [{ trigger: "on_play", op: "move_self_to_history" }]);
    expect(G.players["0"].playArea).not.toContain(id);
    expect(G.players["0"].discard).not.toContain(id);
    expect(G.players["0"].history).toContain(id);
  });
});
