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

  it("moves garrisoned cards with their host when the host moves to history", () => {
    const G = createInitialState();
    const hostId = "test_region";
    const garrisonedId = "test_action_archive_survey";
    G.cardDb[hostId] = {
      id: hostId,
      displayName: "Test Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].playArea = [hostId];
    G.cardStates = {
      [hostId]: {
        garrisonedCardIds: [garrisonedId]
      }
    };

    runEffects({ G, playerId: "0", selfCardId: hostId }, [{ trigger: "on_play", op: "move_self_to_history" }]);

    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].history).toEqual([hostId, garrisonedId]);
    expect(G.cardStates?.[hostId]).toBeUndefined();
  });

  it("moves resource markers from a host moved to history into the player's pool", () => {
    const G = createInitialState();
    const hostId = "test_region";
    G.cardDb[hostId] = {
      id: hostId,
      displayName: "Test Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].playArea = [hostId];
    G.players["0"].resources.materials = 0;
    G.cardStates = {
      [hostId]: {
        resources: { materials: 2 }
      }
    };

    runEffects({ G, playerId: "0", selfCardId: hostId }, [{ trigger: "on_play", op: "move_self_to_history" }]);

    expect(G.players["0"].history).toEqual([hostId]);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.cardStates?.[hostId]).toBeUndefined();
  });
});
