import { describe, expect, it } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { createInitialState } from "../game/initialState";
import { resolveChoice, resolveSolsticeOrderChoice, resolveUnrestAllocationChoice } from "../game/moves";
import { finalizeNormalScoring, triggerScoring } from "../game/scoring";
import type { Card, GameState, PlayerState } from "../game/state";
import { continuePausedSolstice, onTurnEnd } from "../game/turn";
import { defaultGameOptions } from "../options/gameOptions";

const PLAYER_IDS = ["seat-30", "seat-10", "seat-40", "seat-20"];

function card(id: string, effects: Card["effects"]): Card {
  return { id, displayName: id, type: "in_play", cardType: "in_play", suit: "none", cost: 0, tags: [], effects };
}

function timingFixture(playerCount: 3 | 4): { G: GameState; playOrder: string[] } {
  const G = createInitialState({
    usePrivateData: false,
    randomSeed: `solstice-interruption-${playerCount}`,
    options: { ...defaultGameOptions, playerCount, mode: "multiplayer" }
  });
  const originalPlayerIds = Object.keys(G.players);
  const playOrder = PLAYER_IDS.slice(0, playerCount);
  const players: Record<string, PlayerState> = {};
  const rulesets: NonNullable<GameState["activeNationRulesets"]> = {};
  for (let index = 0; index < playOrder.length; index += 1) {
    const playerId = playOrder[index];
    const originalPlayerId = originalPlayerIds[index];
    const player = G.players[originalPlayerId];
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.playArea = [];
    player.powerArea = [];
    player.stateArea = [];
    player.history = [];
    player.exile = [];
    player.developmentArea = [];
    player.nationDeck = [];
    player.resources = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };
    player.handSize = 0;
    players[playerId] = player;
    if (G.activeNationRulesets?.[originalPlayerId]) rulesets[playerId] = G.activeNationRulesets[originalPlayerId];
  }
  G.players = players;
  G.activeNationRulesets = rulesets;
  G.playOrder = playOrder;
  G.seatOrder = [...playOrder];
  G.cardDb = {};
  G.cardStates = {};
  G.market = [];
  G.marketRefillPool = [];
  G.log = [];
  return { G, playOrder };
}

function createExternalOrderChoice(): { G: GameState; playOrder: string[]; recipientId: string; sourceOwnerId: string } {
  const { G, playOrder } = timingFixture(3);
  const recipientId = playOrder[0];
  const sourceOwnerId = playOrder[2];
  G.cardDb.external_draw = card("external_draw", [{
    trigger: "on_solstice", op: "draw", count: 1, upTo: true, targetPlayerScope: "all"
  }]);
  G.cardDb.external_gain = card("external_gain", [{
    trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1, targetPlayerScope: "all"
  }]);
  G.cardDb.recipient_draw = card("recipient_draw", []);
  G.players[sourceOwnerId].playArea = ["external_draw", "external_gain"];
  G.players[recipientId].deck = ["recipient_draw"];

  onTurnEnd(G, { currentPlayer: playOrder.at(-1)!, playOrder } as any);
  return { G, playOrder, recipientId, sourceOwnerId };
}

describe("public Solstice timing and interruption contracts", () => {
  it.each([3, 4] as const)("resolves %s-player on/end-of-Solstice recipients in explicit play order", (playerCount) => {
    const { G, playOrder } = timingFixture(playerCount);
    const sourceOwnerId = playOrder.at(-2)!;
    G.cardDb.shared_clock = card("shared_clock", [
      { trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1, targetPlayerScope: "all" },
      { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1, targetPlayerScope: "all" }
    ]);
    G.players[sourceOwnerId].playArea = ["shared_clock"];

    onTurnEnd(G, { currentPlayer: playOrder.at(-1)!, playOrder } as any);

    expect(playOrder.map((playerId) => G.players[playerId].resources.materials)).toEqual(playOrder.map(() => 1));
    expect(playOrder.map((playerId) => G.players[playerId].resources.knowledge)).toEqual(playOrder.map(() => 1));
    expect(G.log.filter((entry) => entry.message === "Gained 1 materials.").map((entry) => entry.playerId)).toEqual(playOrder);
    expect(G.log.filter((entry) => entry.message === "Gained 1 knowledge.").map((entry) => entry.playerId)).toEqual(playOrder);
    expect(G.round).toBe(2);
  });

  it("keeps an external source owner distinct from the recipient and chooser", () => {
    const { G, playOrder, recipientId, sourceOwnerId } = createExternalOrderChoice();

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: recipientId,
      phase: "on_solstice",
      cardIds: ["external_draw", "external_gain"],
      sourcePlayerIds: { external_draw: sourceOwnerId, external_gain: sourceOwnerId }
    });
    resolveSolsticeOrderChoice(
      { G, ctx: { currentPlayer: recipientId } as any },
      ["external_draw", "external_gain"]
    );

    expect(G.pendingChoice).toMatchObject({ playerId: recipientId, sourceCardId: "external_draw" });
    expect(G.pendingSolsticeContinuation).toMatchObject({
      playerId: recipientId,
      cardIds: ["external_gain"],
      sourcePlayerIds: { external_draw: sourceOwnerId, external_gain: sourceOwnerId }
    });
    expect(G.players[sourceOwnerId].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: recipientId } as any }, 1);

    expect(G.players[recipientId].hand).toEqual(["recipient_draw"]);
    expect(G.players[recipientId].resources.knowledge).toBe(1);
    expect(G.pendingSolsticeOrderChoice?.playerId).toBe(playOrder[1]);
  });

  it("applies self, all, and opponent scopes to the intended Solstice recipients", () => {
    const { G, playOrder } = timingFixture(3);
    const sourceOwnerId = playOrder[1];
    G.cardDb.scope_matrix = card("scope_matrix", [
      { trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1 },
      { trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1, targetPlayerScope: "all" },
      { trigger: "on_solstice", op: "gain_resource", resource: "goods", amount: 1, targetPlayerScope: "others" }
    ]);
    G.players[sourceOwnerId].playArea = ["scope_matrix"];

    onTurnEnd(G, { currentPlayer: playOrder.at(-1)!, playOrder } as any);

    expect(playOrder.map((playerId) => G.players[playerId].resources.materials)).toEqual([0, 1, 0]);
    expect(playOrder.map((playerId) => G.players[playerId].resources.knowledge)).toEqual([1, 1, 1]);
    expect(playOrder.map((playerId) => G.players[playerId].resources.goods)).toEqual([1, 0, 1]);
  });

  it.each([
    { label: "first", order: ["pause", "gain_a", "gain_b"], remaining: ["gain_a", "gain_b"] },
    { label: "middle", order: ["gain_a", "pause", "gain_b"], remaining: ["gain_b"] },
    { label: "last", order: ["gain_a", "gain_b", "pause"], remaining: [] }
  ])("captures a choice pause at the $label source without replaying earlier cards", ({ order, remaining }) => {
    const { G, playOrder } = timingFixture(3);
    const playerId = playOrder[0];
    G.cardDb.pause = card("pause", [{
      trigger: "on_solstice",
      op: "choose_one",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
    }]);
    G.cardDb.gain_a = card("gain_a", [{ trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1 }]);
    G.cardDb.gain_b = card("gain_b", [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 }]);
    G.players[playerId].playArea = ["pause", "gain_a", "gain_b"];

    onTurnEnd(G, { currentPlayer: playOrder.at(-1)!, playOrder } as any);
    resolveSolsticeOrderChoice({ G, ctx: { currentPlayer: playerId } as any }, order);

    expect(G.pendingChoice?.sourceCardId).toBe("pause");
    expect(G.pendingSolsticeContinuation?.cardIds ?? []).toEqual(remaining);
    expect(G.players[playerId].resources.materials).toBe(order.indexOf("gain_a") < order.indexOf("pause") ? 1 : 0);
    expect(G.players[playerId].resources.knowledge).toBe(order.indexOf("gain_b") < order.indexOf("pause") ? 1 : 0);

    resolveChoice({ G, ctx: { currentPlayer: playerId } as any }, 0);
    expect(G.players[playerId].resources.goods).toBe(1);
    expect(G.players[playerId].resources.materials).toBe(1);
    expect(G.players[playerId].resources.knowledge).toBe(1);
  });

  it("rejects wrong, malformed, stale, and duplicate order submissions without advancing the cursor", () => {
    const { G, recipientId } = createExternalOrderChoice();
    const pendingBefore = structuredClone(G.pendingSolsticeOrderChoice);
    const cursorBefore = structuredClone(G.pausedSolstice);

    resolveSolsticeOrderChoice({ G, ctx: { currentPlayer: "seat-10" } as any }, ["external_draw", "external_gain"]);
    resolveSolsticeOrderChoice({ G, ctx: { currentPlayer: recipientId } as any }, ["external_draw", "external_draw"]);
    expect(G.pendingSolsticeOrderChoice).toEqual(pendingBefore);
    expect(G.pausedSolstice).toEqual(cursorBefore);
    expect(G.players[recipientId].hand).toEqual([]);

    delete G.pendingSolsticeOrderChoice!.sourcePlayerIds!.external_gain;
    resolveSolsticeOrderChoice({ G, ctx: { currentPlayer: recipientId } as any }, ["external_draw", "external_gain"]);
    expect(G.pendingSolsticeOrderChoice).toBeDefined();
    expect(G.pendingChoice).toBeUndefined();

    G.pendingSolsticeOrderChoice = pendingBefore;
    resolveSolsticeOrderChoice({ G, ctx: { currentPlayer: recipientId } as any }, ["external_gain", "external_draw"]);
    expect(G.pendingChoice?.sourceCardId).toBe("external_draw");
    expect(G.players[recipientId].resources.knowledge).toBe(1);
    const stateBeforeDuplicate = structuredClone({
      pendingChoice: G.pendingChoice,
      pendingSolsticeContinuation: G.pendingSolsticeContinuation,
      resources: G.players[recipientId].resources
    });
    resolveSolsticeOrderChoice({ G, ctx: { currentPlayer: recipientId } as any }, ["external_gain", "external_draw"]);
    expect({
      pendingChoice: G.pendingChoice,
      pendingSolsticeContinuation: G.pendingSolsticeContinuation,
      resources: G.players[recipientId].resources
    }).toEqual(stateBeforeDuplicate);
  });

  it("parks a malformed persisted continuation instead of guessing its source owner", () => {
    const { G, recipientId } = createExternalOrderChoice();
    resolveSolsticeOrderChoice(
      { G, ctx: { currentPlayer: recipientId } as any },
      ["external_draw", "external_gain"]
    );
    G.pendingChoice = undefined;
    delete G.pendingSolsticeContinuation!.sourcePlayerIds!.external_gain;
    const pendingBefore = structuredClone(G.pendingSolsticeContinuation);

    continuePausedSolstice(G, recipientId);

    expect(G.pendingSolsticeContinuation).toEqual(pendingBefore);
    expect(G.players[recipientId].resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("SolsticeContinuationRejected(malformed_or_wrong_actor)");
  });

  it("stops a nested and recipient-loop effect immediately when the final Unrest is taken", () => {
    const { G, playOrder } = timingFixture(3);
    const firstPlayerId = playOrder[0];
    G.cardDb.final_unrest = card("final_unrest", []);
    G.cardDb.final_unrest.type = "unrest";
    G.cardDb.final_unrest.cardType = "unrest";
    G.cardDb.final_unrest.suit = "unrest";
    G.unrestPile = ["final_unrest"];

    expect(runEffects({ G, playerId: firstPlayerId }, [
      {
        trigger: "on_play",
        op: "choose_one",
        choices: [[
          { trigger: "on_play", op: "take_unrest", count: 1, targetPlayerScope: "all" },
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 5 }
        ]]
      },
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 5 }
    ])).toBe(true);
    resolveChoice({ G, ctx: { currentPlayer: firstPlayerId } as any }, 0);
    expect(G.pendingUnrestAllocationChoice?.playerId).toBe(firstPlayerId);
    resolveUnrestAllocationChoice({ G, ctx: { currentPlayer: firstPlayerId } as any }, [firstPlayerId]);

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players[firstPlayerId].hand).toContain("final_unrest");
    expect(playOrder.slice(1).every((playerId) => !G.players[playerId].hand.includes("final_unrest"))).toBe(true);
    expect(G.players[firstPlayerId].resources.materials).toBe(0);
    expect(G.players[firstPlayerId].resources.knowledge).toBe(0);
  });

  it("finalizes a scoring boundary once even if finalization is invoked again", () => {
    const { G } = timingFixture(3);
    triggerScoring(G, "timing_once", PLAYER_IDS[0]);
    G.scoring = { ...G.scoring!, phase: "final_round", finalRound: G.round };

    finalizeNormalScoring(G);
    const finalized = structuredClone(G.gameover);
    finalizeNormalScoring(G);

    expect(G.gameover).toEqual(finalized);
    expect(G.log.filter((entry) => entry.message.startsWith("ScoringFinalized("))).toHaveLength(1);
  });

  it.each([1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108])(
    "replays a serialized bounded Solstice interruption for seed %s",
    (seed) => {
      const playerCount = seed % 2 === 0 ? 4 : 3;
      const { G, playOrder } = timingFixture(playerCount);
      const playerId = playOrder[0];
      G.cardDb.seed_pause = card("seed_pause", [{
        trigger: "on_solstice",
        op: "choose_one",
        choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
      }]);
      G.cardDb.seed_materials = card("seed_materials", [{ trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1 }]);
      G.cardDb.seed_knowledge = card("seed_knowledge", [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 }]);
      G.players[playerId].playArea = ["seed_pause", "seed_materials", "seed_knowledge"];
      onTurnEnd(G, { currentPlayer: playOrder.at(-1)!, playOrder } as any);

      const baseOrder = ["seed_pause", "seed_materials", "seed_knowledge"];
      const rotation = seed % baseOrder.length;
      const order = [...baseOrder.slice(rotation), ...baseOrder.slice(0, rotation)];
      resolveSolsticeOrderChoice({ G, ctx: { currentPlayer: playerId } as any }, order);
      expect(G.pendingChoice?.sourceCardId).toBe("seed_pause");

      const restored = JSON.parse(JSON.stringify(G)) as GameState;
      resolveChoice({ G, ctx: { currentPlayer: playerId } as any }, 0);
      resolveChoice({ G: restored, ctx: { currentPlayer: playerId } as any }, 0);

      expect(restored).toEqual(G);
      expect(G.players[playerId].resources).toMatchObject({ materials: 1, knowledge: 1, goods: 1 });
      expect(G.round).toBe(2);
    }
  );
});
