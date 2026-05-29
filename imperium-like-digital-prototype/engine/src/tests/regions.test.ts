import { describe, expect, it } from "vitest";
import { abandonRegion, garrisonCard, recallRegion } from "../game/moves";
import { createInitialState } from "../game/initialState";

const ctx = { currentPlayer: "0" } as any;

describe("regions, garrison, and recall", () => {
  it("garrisons a card from hand under a region in play", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["0"].playArea = ["test_region"];
    G.players["0"].hand = ["test_action_archive_survey"];

    garrisonCard({ G, ctx }, "test_region", "test_action_archive_survey");

    expect(G.players["0"].hand).toEqual([]);
    expect(G.cardStates?.test_region?.garrisonedCardIds).toEqual(["test_action_archive_survey"]);
    expect(G.log.at(-1)?.message).toBe("Garrisoned(test_action_archive_survey/host=test_region)");
  });

  it("recalls a region, its garrisoned cards, and resources to the player", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["0"].playArea = ["test_region"];
    G.cardStates = {
      test_region: {
        resources: { materials: 2, knowledge: 1 },
        garrisonedCardIds: ["test_action_archive_survey"]
      }
    };

    recallRegion({ G, ctx }, "test_region");

    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].hand).toEqual(["test_region", "test_action_archive_survey"]);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.test_region).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("RegionRecalled(test_region/garrisoned=1)");
  });

  it("abandons a region and moves its garrisoned cards with it to discard", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["0"].playArea = ["test_region"];
    G.cardStates = {
      test_region: {
        garrisonedCardIds: ["test_action_archive_survey"]
      }
    };

    abandonRegion({ G, ctx }, "test_region");

    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].discard).toEqual(["test_region", "test_action_archive_survey"]);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.cardStates?.test_region).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("RegionAbandoned(test_region/garrisoned=1)");
  });

  it("rejects recall for non-region cards", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["test_action_archive_survey"];

    recallRegion({ G, ctx }, "test_action_archive_survey");

    expect(G.players["0"].playArea).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(recallRegion): card_not_region(test_action_archive_survey)");
  });
});
