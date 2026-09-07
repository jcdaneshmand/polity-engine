import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import { redactGameStateForPlayer } from "../game/playerView";
import { calculatePlayerScoreBreakdown } from "../game/scoring";
import type { GameState, ResourceName } from "../game/state";
import type { GameOptions, VariantId } from "../options/gameOptions";
import fictionalCards from "../../../data/fictional-regression/cards.json";
import fictionalNations from "../../../data/fictional-regression/nations.json";
import fictionalRulesets from "../../../data/fictional-regression/rulesets.json";

const runCount = Math.min(1_000, Math.max(1, Number(process.env.POLITY_PROPERTY_RUNS ?? 100)));
const replaySeed = process.env.POLITY_PROPERTY_SEED === undefined ? undefined : Number(process.env.POLITY_PROPERTY_SEED);
const replayPath = process.env.POLITY_PROPERTY_PATH;
const resources = ["materials", "knowledge", "influence", "unrest", "goods"] satisfies ResourceName[];
const fictionalPrivateData = { cards: fictionalCards as any, nations: fictionalNations as any, nationRulesets: fictionalRulesets as any, botStateTables: {}, botTradeRoutesTables: {} };
const fictionalCommonsCardIds = (fictionalCards as any[]).filter((card) => (card.ownership ?? "commons") === "commons" && card.commonsSetId === "custom" && (card.commonsGroup ?? "base") !== "replacement").map((card) => card.id);

function parameters(): fc.Parameters<unknown> {
  return {
    numRuns: runCount,
    ...(Number.isInteger(replaySeed) ? { seed: replaySeed } : {}),
    ...(replayPath ? { path: replayPath } : {}),
    verbose: 2
  };
}

const variantArbitrary = fc.subarray<VariantId>(["lowered_aggression", "quick_setup", "precious_cards", "short_game"], { maxLength: 3 });
const setupArbitrary = fc.record({
  mode: fc.constantFrom("multiplayer", "solo", "practice" as const),
  multiplayerCount: fc.integer({ min: 2, max: 4 }),
  variants: variantArbitrary,
  tradeRoutes: fc.boolean(),
  seed: fc.stringMatching(/^[a-z0-9]{1,18}$/)
}).map(({ mode, multiplayerCount, variants, tradeRoutes, seed }) => ({
  seed,
  options: {
    mode,
    playerCount: (mode === "multiplayer" ? multiplayerCount : 1) as 1 | 2 | 3 | 4,
    commonsSetId: "classics" as const,
    enabledExpansions: tradeRoutes ? ["trade_routes" as const] : [],
    enabledVariants: variants,
    ...(mode !== "multiplayer" ? { soloDifficulty: "chieftain" as const } : {})
  } satisfies GameOptions
}));

function playerCardZones(G: GameState, playerId: string): string[][] {
  const player = G.players[playerId];
  return [
    player.deck, player.hand, player.discard, player.playArea, player.history, player.exile,
    player.powerArea, player.stateArea, player.developmentArea, player.nationDeck,
    ...Object.values(player.sideAreas ?? {})
  ];
}

function expectNoCrossZoneOverlap(zones: string[][]): void {
  zones.forEach((zone, index) => {
    const otherZones = new Set(zones.filter((_, otherIndex) => otherIndex !== index).flat());
    expect(zone.some((cardId) => otherZones.has(cardId))).toBe(false);
  });
}

describe("property-based engine assurance", () => {
  it("builds deterministic valid states across modes, counts, variants, and construction paths", () => {
    fc.assert(fc.property(setupArbitrary, ({ options, seed }) => {
      const nationId = options.enabledExpansions.includes("trade_routes") ? "fixture_nation_traders" : "fixture_nation_progressors";
      const playerNationIds = Object.fromEntries(Array.from({ length: options.playerCount }, (_, index) => [String(index + 1), nationId]));
      const runtimeOptions = { ...options, commonsSetId: "custom" as const, customCommonsCardIds: fictionalCommonsCardIds };
      const setup = { options: runtimeOptions, randomSeed: seed, privateData: fictionalPrivateData, playerNationIds, ...(options.mode === "solo" ? { soloBotNationId: "fixture_nation_archivists" } : {}) };
      const first = createInitialGameState(setup);
      const replay = createInitialGameState(setup);
      expect(JSON.parse(JSON.stringify(replay))).toEqual(JSON.parse(JSON.stringify(first)));
      expect(first.playOrder).toHaveLength(options.playerCount);
      for (const [playerId, player] of Object.entries(first.players)) {
        expectNoCrossZoneOverlap(playerCardZones(first, playerId));
        for (const resource of resources) {
          expect(Number.isFinite(player.resources[resource])).toBe(true);
          expect(player.resources[resource]).toBeGreaterThanOrEqual(0);
        }
      }
      const sharedZones = [
        first.market, first.marketRefillPool, first.sharedDiscard,
        ...Object.values(first.marketDecks ?? {}), first.fameDeck?.available ?? [], first.unrestPile ?? []
      ];
      expectNoCrossZoneOverlap(sharedZones);
      const restored = JSON.parse(JSON.stringify(first)) as GameState;
      expect(restored).toEqual(first);
    }), parameters());
  });

  it("keeps scoring pure and additive for generated public resource vectors", () => {
    const vector = fc.record(Object.fromEntries(resources.map((resource) => [resource, fc.integer({ min: 0, max: 50 })])) as Record<ResourceName, fc.Arbitrary<number>>);
    fc.assert(fc.property(vector, (generated) => {
      const G = createInitialGameState({ options: { mode: "multiplayer", playerCount: 2, commonsSetId: "classics", enabledExpansions: [], enabledVariants: [] }, randomSeed: "property-score" });
      G.players["1"].resources = { ...generated };
      const before = JSON.stringify(G);
      const first = calculatePlayerScoreBreakdown(G, "1");
      const second = calculatePlayerScoreBreakdown(G, "1");
      expect(second).toEqual(first);
      expect(first.total).toBe(first.contributions.reduce((sum, contribution) => sum + contribution.score, 0));
      expect(JSON.stringify(G)).toBe(before);
    }), parameters());
  });

  it("never exposes generated opponent hidden identifiers through player or spectator views", () => {
    fc.assert(fc.property(fc.uniqueArray(fc.uuid(), { minLength: 3, maxLength: 12 }), (secretIds) => {
      const G = createInitialGameState({ options: { mode: "multiplayer", playerCount: 2, commonsSetId: "classics", enabledExpansions: [], enabledVariants: [] }, randomSeed: "property-view" });
      const [hand, deck, nation, ...side] = secretIds;
      G.players["2"].hand = [hand];
      G.players["2"].deck = [deck];
      G.players["2"].nationDeck = [nation];
      G.players["2"].sideAreas = { sealed: side };
      const playerView = JSON.stringify(redactGameStateForPlayer(G, "1"));
      const spectatorView = JSON.stringify(redactGameStateForPlayer(G));
      for (const secret of secretIds) {
        expect(playerView).not.toContain(secret);
        expect(spectatorView).not.toContain(secret);
      }
    }), parameters());
  });
});
