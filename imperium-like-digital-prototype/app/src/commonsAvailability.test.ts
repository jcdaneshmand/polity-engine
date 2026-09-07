import { describe, expect, it } from "vitest";
import { loadCardDb } from "../../engine/src/cards/cardLoader";
import { loadNationDb } from "../../engine/src/nations/nationLoader";
import { normalizeSetupCardDb } from "../../engine/src/setup/setupCardNormalization";
import { analyzeAllBaseSetAvailability, analyzeBaseSetAvailability, type BaseCommonsSetId } from "./commonsAvailability";

function card(id: string, setId: BaseCommonsSetId, suit: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: id,
    suit,
    setupBannerSuit: suit,
    cardType: suit === "fame" || suit === "unrest" ? suit : "action",
    cost: { materials: 0, population: 0, progress: 0, goods: 0 },
    developmentCost: { materials: 0, population: 0, progress: 0, goods: 0 },
    vp: { mode: "none", value: null },
    startingLocation: suit === "unrest" ? "unrest_pile" : "market",
    ownership: "commons",
    commonsSetId: setId,
    commonsGroup: "base",
    marketEligible: suit !== "fame" && suit !== "unrest",
    fameDeckEligible: suit === "fame",
    unrestPileEligible: suit === "unrest",
    smallDeckEligible: true,
    effects: [],
    tags: [],
    implemented: true,
    tested: true,
    requiredExpansions: [],
    excludedExpansions: [],
    ...overrides
  } as any;
}

function completeSet(setId: BaseCommonsSetId) {
  return [
    ...(["region", "uncivilized", "civilized"] as const).flatMap((suit) => Array.from({ length: 6 }, (_, index) => card(`${setId}_${suit}_${index}`, setId, suit))),
    ...Array.from({ length: 5 }, (_, index) => card(`${setId}_tributary_${index}`, setId, "tributary")),
    ...Array.from({ length: 3 }, (_, index) => card(`${setId}_main_${index}`, setId, "none", { smallDeckEligible: false })),
    ...Array.from({ length: 6 }, (_, index) => card(`${setId}_fame_${index}`, setId, "fame")),
    card(`${setId}_special_fame`, setId, "fame", { tags: ["king_of_kings"] }),
    ...Array.from({ length: 4 }, (_, index) => card(`${setId}_unrest_${index}`, setId, "unrest"))
  ];
}

const baseOptions = {
  playerCount: 2 as const,
  effectiveCommonsPlayerCount: 2 as const,
  enabledExpansions: [],
  enabledVariants: [],
  mode: "multiplayer" as const,
  selectedNationIds: [],
  replacementPolicy: "use_replacements" as const
};

describe("base Commons availability", () => {
  it("labels only the built-in Classics fixture as playable Demo Data", () => {
    const report = analyzeAllBaseSetAvailability({
      cardDb: normalizeSetupCardDb(loadCardDb()),
      nationDb: loadNationDb(),
      options: baseOptions,
      profile: "builtin_demo"
    });
    expect(report.classics).toMatchObject({ status: "demo", statusLabel: "Demo Data", disabled: false, sourceCount: 10 });
    expect(report.legends).toMatchObject({ status: "no_cards", statusLabel: "No Cards Loaded", disabled: true, sourceCount: 0 });
    expect(report.horizons).toMatchObject({ status: "no_cards", statusLabel: "No Cards Loaded", disabled: true, sourceCount: 0 });
  });

  it.each(["classics", "legends", "horizons"] as BaseCommonsSetId[])("marks a complete %s fixture available", (setId) => {
    const cards = completeSet(setId);
    const report = analyzeBaseSetAvailability({ setId, cardDb: Object.fromEntries(cards.map((candidate) => [candidate.id, candidate])), nationDb: {}, options: baseOptions, profile: "standard" });
    expect(report).toMatchObject({ status: "available", statusLabel: "Available", disabled: false });
  });

  it("distinguishes incomplete from no cards and recomputes for player/module changes", () => {
    const cards = completeSet("classics");
    const cardDb = Object.fromEntries(cards.map((candidate) => [candidate.id, candidate]));
    const twoPlayer = analyzeBaseSetAvailability({ setId: "classics", cardDb, nationDb: {}, options: baseOptions, profile: "standard" });
    const fourPlayer = analyzeBaseSetAvailability({ setId: "classics", cardDb, nationDb: {}, options: { ...baseOptions, playerCount: 4, effectiveCommonsPlayerCount: 4 }, profile: "standard" });
    const trade = analyzeBaseSetAvailability({ setId: "classics", cardDb, nationDb: {}, options: { ...baseOptions, enabledExpansions: ["trade_routes"] }, profile: "standard" });
    const empty = analyzeBaseSetAvailability({ setId: "legends", cardDb, nationDb: {}, options: baseOptions, profile: "standard" });
    expect(twoPlayer.status).toBe("available");
    expect(fourPlayer).toMatchObject({ status: "incomplete", disabled: true });
    expect(trade.analysis.issues.map((issue) => issue.code)).toContain("ordinary_fame_short");
    expect(empty).toMatchObject({ status: "no_cards", disabled: true });
  });
});
