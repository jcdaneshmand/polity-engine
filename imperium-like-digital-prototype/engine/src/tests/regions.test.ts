import { describe, expect, it } from "vitest";
import { abandonRegion, garrisonCard, recallRegion, resolveReactiveExhaustChoice } from "../game/moves";
import { createInitialState } from "../game/initialState";

const ctx = { currentPlayer: "1" } as any;

describe("regions, garrison, and recall", () => {
  it("garrisons a card from hand under a region in play", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["test_region"];
    G.players["1"].hand = ["test_action_archive_survey"];

    garrisonCard({ G, ctx }, "test_region", "test_action_archive_survey");

    expect(G.players["1"].hand).toEqual([]);
    expect(G.cardStates?.test_region?.garrisonedCardIds).toEqual(["test_action_archive_survey"]);
    expect(G.log.at(-1)?.message).toBe("Garrisoned(test_action_archive_survey/host=test_region)");
  });

  it("recalls a region, its garrisoned cards, and resources to the player", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["test_region"];
    G.cardStates = {
      test_region: {
        resources: { materials: 2, knowledge: 1 },
        garrisonedCardIds: ["test_action_archive_survey"]
      }
    };

    recallRegion({ G, ctx }, "test_region");

    expect(G.players["1"].playArea).toEqual([]);
    expect(G.players["1"].hand).toEqual(["test_region", "test_action_archive_survey"]);
    expect(G.players["1"].resources.materials).toBe(2);
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.cardStates?.test_region).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("RegionRecalled(test_region/garrisoned=1)");
  });

  it("recalls imported cards with a Region suit icon as Regions", () => {
    const G = createInitialState();
    G.cardDb.imported_region = { id: "imported_region", displayName: "Imported Region", type: "action", cardType: "action", suit: "multi", cost: 0, tags: ["suit:region"], effects: [] };
    G.players["1"].playArea = ["imported_region"];
    G.cardStates = {
      imported_region: {
        resources: { materials: 1 }
      }
    };

    recallRegion({ G, ctx }, "imported_region");

    expect(G.players["1"].playArea).toEqual([]);
    expect(G.players["1"].hand).toEqual(["imported_region"]);
    expect(G.players["1"].resources.materials).toBe(1);
    expect(G.cardStates?.imported_region).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("RegionRecalled(imported_region/garrisoned=0)");
  });

  it("abandons a region and moves its garrisoned cards with it to discard", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["test_region"];
    G.cardStates = {
      test_region: {
        garrisonedCardIds: ["test_action_archive_survey"]
      }
    };

    abandonRegion({ G, ctx }, "test_region");

    expect(G.players["1"].playArea).toEqual([]);
    expect(G.players["1"].discard).toEqual(["test_region", "test_action_archive_survey"]);
    expect(G.players["1"].hand).toEqual([]);
    expect(G.cardStates?.test_region).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("RegionAbandoned(test_region/garrisoned=1)");
  });

  it("moves resources on an abandoned region to the player's resource pool", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["test_region"];
    G.players["1"].resources.materials = 1;
    G.cardStates = {
      test_region: {
        resources: { materials: 2, goods: 1 }
      }
    };

    abandonRegion({ G, ctx }, "test_region");

    expect(G.players["1"].discard).toEqual(["test_region"]);
    expect(G.players["1"].resources.materials).toBe(3);
    expect(G.players["1"].resources.goods).toBe(1);
    expect(G.cardStates?.test_region).toBeUndefined();
  });

  it("collects rulebook-named region resources into canonical player pools", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["test_region"];
    G.cardStates = {
      test_region: {
        resources: { progress: 2, population: 1 } as any
      }
    };

    recallRegion({ G, ctx }, "test_region");

    expect(G.players["1"].resources.knowledge).toBe(2);
    expect(G.players["1"].resources.influence).toBe(1);
    expect((G.players["1"].resources as any).progress).toBeUndefined();
    expect((G.players["1"].resources as any).population).toBeUndefined();
    expect(G.cardStates?.test_region).toBeUndefined();
  });

  it("moves resources from garrisoned cards and clears their runtime state when the host leaves play", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["test_region"];
    G.cardStates = {
      test_region: {
        garrisonedCardIds: ["test_action_archive_survey"]
      },
      test_action_archive_survey: {
        resources: { knowledge: 2 },
        exhausted: true
      }
    };

    abandonRegion({ G, ctx }, "test_region");

    expect(G.players["1"].discard).toEqual(["test_region", "test_action_archive_survey"]);
    expect(G.players["1"].resources.knowledge).toBe(2);
    expect(G.cardStates?.test_region).toBeUndefined();
    expect(G.cardStates?.test_action_archive_survey).toBeUndefined();
  });

  it("opens source-suited reactive Exhaust windows after recalling garrisoned resources", () => {
    const G = createInitialState();
    G.cardDb.test_region = { id: "test_region", displayName: "Test Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.cardDb.civilized_child = { id: "civilized_child", displayName: "Civilized Child", type: "action", cardType: "action", suit: "civilized", cost: 0, tags: [], effects: [] };
    G.cardDb.reactive_exhaust = {
      id: "reactive_exhaust",
      displayName: "Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "influence",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };
    G.players["1"].playArea = ["test_region", "reactive_exhaust"];
    G.players["1"].exhaustTokensAvailable = 1;
    G.cardStates = {
      test_region: { garrisonedCardIds: ["civilized_child"] },
      civilized_child: { resources: { knowledge: 1 } }
    };

    recallRegion({ G, ctx }, "test_region");

    expect(G.players["1"].hand).toEqual(["test_region", "civilized_child"]);
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["reactive_exhaust"],
      resolvingPlayerId: "1",
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: "civilized_child",
      eventSourceWasInPlay: true
    });

    resolveReactiveExhaustChoice({ G, ctx }, "reactive_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["1"].resources.influence).toBe(1);
  });

  it("recalls a targeted garrisoned region without moving its host", () => {
    const G = createInitialState();
    G.cardDb.host_region = { id: "host_region", displayName: "Host Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.cardDb.child_region = { id: "child_region", displayName: "Child Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["host_region"];
    G.cardStates = {
      host_region: { garrisonedCardIds: ["child_region"] },
      child_region: { resources: { knowledge: 1 } }
    };

    recallRegion({ G, ctx }, "child_region");

    expect(G.players["1"].playArea).toEqual(["host_region"]);
    expect(G.cardStates?.host_region?.garrisonedCardIds).toEqual([]);
    expect(G.players["1"].hand).toEqual(["child_region"]);
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.cardStates?.child_region).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("RegionRecalled(child_region/garrisoned=0)");
  });

  it("abandons a targeted garrisoned region without moving its host", () => {
    const G = createInitialState();
    G.cardDb.host_region = { id: "host_region", displayName: "Host Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.cardDb.child_region = { id: "child_region", displayName: "Child Region", type: "region", cardType: "region", suit: "region", cost: 0, tags: [], effects: [] };
    G.players["1"].playArea = ["host_region"];
    G.cardStates = {
      host_region: { garrisonedCardIds: ["child_region"] },
      child_region: { resources: { materials: 1 } }
    };

    abandonRegion({ G, ctx }, "child_region");

    expect(G.players["1"].playArea).toEqual(["host_region"]);
    expect(G.cardStates?.host_region?.garrisonedCardIds).toEqual([]);
    expect(G.players["1"].discard).toEqual(["child_region"]);
    expect(G.players["1"].resources.materials).toBe(1);
    expect(G.cardStates?.child_region).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("RegionAbandoned(child_region/garrisoned=0)");
  });

  it("rejects recall for non-region cards", () => {
    const G = createInitialState();
    G.players["1"].playArea = ["test_action_archive_survey"];

    recallRegion({ G, ctx }, "test_action_archive_survey");

    expect(G.players["1"].playArea).toEqual(["test_action_archive_survey"]);
    expect(G.players["1"].hand).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(recallRegion): card_not_region(test_action_archive_survey)");
  });
});
