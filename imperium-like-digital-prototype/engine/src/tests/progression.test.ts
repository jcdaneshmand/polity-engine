import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { resolveDevelopmentChoice } from "../game/moves";
import { drawCardWithReshuffleLifecycle } from "../game/zones";

const ctx = { currentPlayer: "0" } as any;

describe("reshuffle progression", () => {
  it("adds the top nation card to discard before shuffling", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.nationDeck).toEqual([]);
    expect(p.hand).toContain("test_action_lineage_record");
    expect(p.progressionTokens?.developmentArea).toBe(1);
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase - 1);
  });

  it("flips state when the accession card is added from the nation deck", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    p.accessionCardId = "test_action_lineage_record";
    p.nationDeck = ["test_action_lineage_record"];

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea[0]).toBe("civilized_state");
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(test_action_lineage_record)")).toBe(true);
  });

  it("creates a pending development choice when the nation deck is empty", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    });
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.discard).toEqual(["test_action_archive_survey"]);
  });

  it("resolves a paid development choice, shuffles, and resumes the interrupted draw", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.developmentArea).toEqual([]);
    expect(p.progressionTokens?.developmentArea).toBe(1);
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase - 1);
    expect(p.hand).toHaveLength(1);
    expect(["test_action_archive_survey", "test_action_scholars_circle"]).toContain(p.hand[0]);
  });

  it("triggers normal scoring when the last Development card is developed", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.scoring).toEqual({
      reason: "development_area_empty",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
    expect(G.gameover).toBeUndefined();
  });

  it("uses goods to cover development cost shortfalls atomically", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 1;
    p.resources.knowledge = 1;
    p.resources.goods = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2, knowledge: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.resources.knowledge).toBe(0);
    expect(p.resources.goods).toBe(0);
    expect(p.developmentArea).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(p.hand).toHaveLength(1);
  });

  it("does not offer development cards when total goods substitution cannot cover the full cost", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 1;
    p.resources.knowledge = 1;
    p.resources.goods = 1;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2, knowledge: 2 };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(1);
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.goods).toBe(1);
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(G.log.some((entry) => entry.message === "DevelopmentSkipped(no_payable_cards)")).toBe(true);
  });
});
