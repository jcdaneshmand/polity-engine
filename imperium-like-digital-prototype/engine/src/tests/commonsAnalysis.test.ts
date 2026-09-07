import { describe, expect, it } from "vitest";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import { analyzeCommonsSetup } from "../setup/commonsAnalysis";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { getCommonsValidationProfile } from "../setup/registeredCommonsProfile";
import { normalizeSetupCardDb } from "../setup/setupCardNormalization";
import fictionalCards from "../../../data/fictional-regression/cards.json";
import { card, cardDb, nationDb, options } from "./commonsTestFixtures";

function completePool(playerCount: 2 | 3 | 4, args: { trade?: boolean; extraMain?: number } = {}): NormalizedCardRecord[] {
  const smallSize = playerCount === 2 ? 6 : playerCount === 3 ? 7 : 8;
  const fameSize = smallSize + (args.trade ? 1 : 0);
  return [
    ...(["region", "uncivilized", "civilized"] as const).flatMap((suit) => Array.from({ length: smallSize }, (_, index) => card({ id: `${suit}_${index}`, setupBannerSuit: suit }))),
    ...Array.from({ length: playerCount === 2 ? 5 : playerCount === 3 ? 4 : 3 }, (_, index) => card({ id: `tributary_${index}`, setupBannerSuit: "tributary" })),
    ...Array.from({ length: args.extraMain ?? 3 }, (_, index) => card({ id: `main_${index}`, setupBannerSuit: "none", smallDeckEligible: false })),
    ...Array.from({ length: fameSize }, (_, index) => card({ id: `fame_${index}`, setupBannerSuit: "fame", cardType: "fame", fameDeckEligible: true, marketEligible: false })),
    card({ id: "special_fame", setupBannerSuit: "fame", cardType: "fame", fameDeckEligible: true, marketEligible: false, tags: ["king_of_kings"] }),
    ...Array.from({ length: 4 }, (_, index) => card({ id: `unrest_${index}`, setupBannerSuit: "unrest", cardType: "unrest", unrestPileEligible: true, marketEligible: false }))
  ];
}

function analyze(cards: NormalizedCardRecord[], playerCount: 2 | 3 | 4, overrides: Partial<ReturnType<typeof options>> = {}) {
  return analyzeCommonsSetup({
    cardDb: cardDb(cards),
    nationDb,
    options: options({ playerCount, effectiveCommonsPlayerCount: playerCount, ...overrides }),
    profile: "standard"
  });
}

describe("Commons setup analysis", () => {
  it.each([2, 3, 4] as const)("accepts the source-backed %i-player boundary", (playerCount) => {
    const report = analyze(completePool(playerCount), playerCount);
    expect(report.status).toBe("ready");
    expect(report.issues.filter((issue) => issue.severity === "blocking")).toEqual([]);
    expect(report.counts.initialMarket).toBe(5);
    expect(report.counts.tributaryBottoms).toBe(3);
  });

  it.each([2, 3, 4] as const)("blocks one-below and accepts one-above the %i-player small-deck boundary", (playerCount) => {
    const boundary = completePool(playerCount);
    const below = analyze(boundary.filter((card) => card.id !== "region_0"), playerCount);
    const above = analyze([...boundary, card({ id: "region_extra", setupBannerSuit: "region" })], playerCount);
    expect(below.issues.map((issue) => issue.code)).toContain("region_deck_short");
    expect(above.status).toBe("ready");
  });

  it("blocks empty, duplicate, missing, and non-Commons custom selections with stable codes", () => {
    const cards = completePool(2);
    const nonCommons = card({ id: "nation_owned", ownership: "nation" });
    const report = analyzeCommonsSetup({
      cardDb: cardDb([...cards, nonCommons]),
      nationDb,
      options: options({ commonsSetId: "custom", customCommonsCardIds: [cards[0].id, cards[0].id, "missing", nonCommons.id] }),
      requestedCustomCardIds: [cards[0].id, cards[0].id, "missing", nonCommons.id],
      profile: "standard"
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "custom_selection_duplicate",
      "custom_cards_missing",
      "custom_cards_ineligible",
      "initial_market_underfilled"
    ]));

    const empty = analyzeCommonsSetup({ cardDb: cardDb(cards), nationDb, options: options({ commonsSetId: "custom", customCommonsCardIds: [] }), profile: "standard" });
    expect(empty.issues.map((issue) => issue.code)).toContain("custom_selection_empty");
  });

  it("uses the same post-replacement pool for counts and removals", () => {
    const cards = completePool(2);
    cards[0] = card({ ...cards[0], conflictsWithNationIds: ["test_nation_alpha"] });
    cards.push(card({ id: "region_replacement", setupBannerSuit: "region", commonsGroup: "replacement", replacementForCardId: cards[0].id }));
    const report = analyzeCommonsSetup({
      cardDb: cardDb(cards),
      nationDb,
      options: options({ selectedNationIds: ["test_nation_alpha"] }),
      profile: "standard"
    });
    expect(report.status).toBe("ready");
    expect(report.removals.replacements).toEqual(["region_replacement"]);
    expect(report.result.selectedCommonsCards).toContain("region_replacement");
  });

  it("analyzes Quick Setup and Trade Routes through launch construction", () => {
    const report = analyze(completePool(2, { trade: true }), 2, { enabledExpansions: ["trade_routes"], enabledVariants: ["quick_setup"] });
    expect(report.status).toBe("ready");
    expect(report.counts.ordinaryFame).toBe(7);
    expect(report.result.setupWarnings).toContain("CommonsDeckConstructionPath(quick)");
  });

  it("blocks setup-exile variants that would consume the Main deck", () => {
    const shortGame = analyze(completePool(2, { extraMain: 12 }), 2, { enabledVariants: ["short_game"] });
    const practice = analyze(completePool(2, { extraMain: 17 }), 2, { playerCount: 1, effectiveCommonsPlayerCount: 2, mode: "practice" });
    expect(shortGame.issues.map((issue) => issue.code)).toContain("short_game_main_deck_short");
    expect(practice.issues.map((issue) => issue.code)).toContain("practice_main_deck_short");
  });

  it("is pure and does not invoke the caller RNG", () => {
    const cards = completePool(2);
    const before = structuredClone(cards);
    let calls = 0;
    const report = analyzeCommonsSetup({ cardDb: cardDb(cards), nationDb, options: options(), rng: { next: () => { calls += 1; return 0.5; } }, profile: "standard" });
    expect(report.status).toBe("ready");
    expect(calls).toBe(0);
    expect(cards).toEqual(before);
  });

  it("allows only an explicit repository demo profile to use compact composition", () => {
    const compact = Array.from({ length: 5 }, (_, index) => card({ id: `demo_${index}`, smallDeckEligible: false }));
    const strict = analyzeCommonsSetup({ cardDb: cardDb(compact), nationDb, options: options(), profile: "standard" });
    const demo = analyzeCommonsSetup({ cardDb: cardDb(compact), nationDb, options: options(), profile: "builtin_demo" });
    expect(strict.status).toBe("blocked");
    expect(demo.status).toBe("ready");
    expect(demo.issues.map((issue) => issue.code)).toContain("compact_demo_composition");
  });

  it("recognizes the repository fictional composition but rejects altered metadata", () => {
    const normalized = normalizeSetupCardDb(Object.fromEntries((fictionalCards as any[]).map((candidate) => [candidate.id, candidate])) as any);
    expect(getCommonsValidationProfile({ usePrivateData: true, cards: normalized })).toBe("fictional_demo");
    const altered = structuredClone(normalized);
    altered.fixture_market_acquire.marketEligible = false;
    expect(getCommonsValidationProfile({ usePrivateData: true, cards: altered })).toBe("standard");
  });

  it("revalidates at authoritative launch instead of trusting a stale preview", () => {
    const cards = completePool(2);
    const valid = analyze(cards, 2);
    expect(valid.status).toBe("ready");
    const changedCards = cards.filter((candidate) => candidate.id !== "region_0");
    expect(() => createInitialGameStateFromPipeline({
      options: { playerCount: 2, mode: "multiplayer", commonsSetId: "classics", enabledExpansions: [], enabledVariants: [] },
      playerNationIds: { "1": "test_nation_alpha", "2": "test_nation_alpha" },
      cardDb: cardDb(changedCards),
      nationDb,
      commonsValidationProfile: "standard"
    })).toThrow(/region_deck_short/);
  });
});
