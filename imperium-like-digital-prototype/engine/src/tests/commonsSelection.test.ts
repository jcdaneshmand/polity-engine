import { describe, expect, it } from "vitest";
import { selectCommonsCards } from "../setup/commonsSelection";
import { card, options } from "./commonsTestFixtures";

describe("commons selection", () => {
  it("selects only commons ownership cards", () => {
    const result = selectCommonsCards([
      card({ id: "commons_a", ownership: "commons" }),
      card({ id: "nation_a", ownership: "nation" }),
      card({ id: "bot_a", ownership: "bot" })
    ], options());
    expect(result.selectedCards.map((c) => c.id)).toEqual(["commons_a"]);
  });

  it("selects correct commonsSetId", () => {
    const result = selectCommonsCards([
      card({ id: "classics_a", commonsSetId: "classics" }),
      card({ id: "legends_a", commonsSetId: "legends" })
    ], options({ commonsSetId: "legends" }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["legends_a"]);
  });

  it("excludes replacement-group cards from normal Commons selection", () => {
    const result = selectCommonsCards([
      card({ id: "base_a", commonsGroup: "base" }),
      card({ id: "replacement_group_a", commonsGroup: "replacement", replacementGroupId: "group_a" })
    ], options());
    expect(result.selectedCards.map((c) => c.id)).toEqual(["base_a"]);
  });

  it("excludes 3+ and 4+ cards at effective count 2", () => {
    const result = selectCommonsCards([
      card({ id: "two_plus", playerCountRequirement: "2+" }),
      card({ id: "three_plus", playerCountRequirement: "3+" }),
      card({ id: "four_plus", playerCountRequirement: "4+" })
    ], options({ effectiveCommonsPlayerCount: 2 }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["two_plus"]);
    expect(result.removedForPlayerCount).toEqual(["three_plus", "four_plus"]);
  });

  it("includes 3+ at effective count 3", () => {
    const result = selectCommonsCards([
      card({ id: "three_plus", playerCountRequirement: "3+" }),
      card({ id: "four_plus", playerCountRequirement: "4+" })
    ], options({ playerCount: 3, effectiveCommonsPlayerCount: 3 }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["three_plus"]);
  });

  it("includes 4+ at effective count 4", () => {
    const result = selectCommonsCards([
      card({ id: "four_plus", playerCountRequirement: "4+" })
    ], options({ playerCount: 4, effectiveCommonsPlayerCount: 4 }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["four_plus"]);
  });

  it("trade_routes disabled excludes trade-route-only cards", () => {
    const result = selectCommonsCards([
      card({ id: "base_a", commonsSetId: "horizons" }),
      card({ id: "trade_route_a", commonsSetId: "horizons", commonsGroup: "trade_routes", requiredExpansions: ["trade_routes"] })
    ], options({ commonsSetId: "horizons" }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["base_a"]);
    expect(result.removedForExpansion).toEqual(["trade_route_a"]);
  });

  it("trade_routes enabled includes trade-route group placeholder cards", () => {
    const result = selectCommonsCards([
      card({ id: "trade_route_a", commonsSetId: "horizons", commonsGroup: "trade_routes", requiredExpansions: ["trade_routes"] })
    ], options({ commonsSetId: "horizons", enabledExpansions: ["trade_routes"] }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["trade_route_a"]);
  });

  it("trade_routes enabled excludes mutually exclusive non-trade-friendly alternate group when metadata indicates", () => {
    const result = selectCommonsCards([
      card({ id: "alternate_a", commonsSetId: "horizons", commonsGroup: "base", tags: ["trade_routes_alternate"] }),
      card({ id: "friendly_a", commonsSetId: "horizons", commonsGroup: "trade_friendly" })
    ], options({ commonsSetId: "horizons", enabledExpansions: ["trade_routes"] }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["friendly_a"]);
    expect(result.removedForExpansion).toEqual(["alternate_a"]);
  });

  it("excludes cards disallowed by the current mode", () => {
    const result = selectCommonsCards([
      card({ id: "solo_ok" }),
      card({ id: "multiplayer_only", allowedModes: ["multiplayer"] }),
      card({ id: "solo_disallowed", disallowedModes: ["solo"] })
    ], options({ mode: "solo" }));
    expect(result.selectedCards.map((c) => c.id)).toEqual(["solo_ok"]);
    expect(result.removedForVariant).toEqual(["multiplayer_only", "solo_disallowed"]);
  });
});
