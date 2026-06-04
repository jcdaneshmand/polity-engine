import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { acquireFromExile } from "../game/exile";

describe("Exile acquisition", () => {
  it("adds an Unrest when a non-Unrest card is acquired from Exile", () => {
    const G = createInitialState();
    const player = G.players["0"];
    player.exile = ["exiled_action"];
    G.cardDb.exiled_action = {
      id: "exiled_action",
      displayName: "Exiled Action",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.unrestPile = ["unrest_from_supply"];

    expect(acquireFromExile(G, { playerId: "0", cardId: "exiled_action" })).toBe(true);

    expect(player.exile).toEqual([]);
    expect(player.hand).toContain("exiled_action");
    expect(player.hand).toContain("unrest_from_supply");
    expect(player.discard).not.toContain("unrest_from_supply");
    expect(G.unrestPile).toEqual([]);
  });

  it("does not add extra Unrest when the acquired Exile card is Unrest", () => {
    const G = createInitialState();
    const player = G.players["0"];
    player.exile = ["exiled_unrest"];
    G.cardDb.exiled_unrest = {
      id: "exiled_unrest",
      displayName: "Exiled Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };
    G.unrestPile = ["unrest_from_supply"];

    expect(acquireFromExile(G, { playerId: "0", cardId: "exiled_unrest" })).toBe(true);

    expect(player.hand).toContain("exiled_unrest");
    expect(player.discard).not.toContain("unrest_from_supply");
    expect(G.unrestPile).toEqual(["unrest_from_supply"]);
  });

  it("does not add extra Unrest for imported Exile cards with an Unrest suit icon", () => {
    const G = createInitialState();
    const player = G.players["0"];
    player.exile = ["imported_exiled_unrest"];
    G.cardDb.imported_exiled_unrest = {
      id: "imported_exiled_unrest",
      displayName: "Imported Exiled Unrest",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: ["suit:unrest"],
      effects: []
    };
    G.unrestPile = ["unrest_from_supply"];

    expect(acquireFromExile(G, { playerId: "0", cardId: "imported_exiled_unrest" })).toBe(true);

    expect(player.hand).toContain("imported_exiled_unrest");
    expect(player.hand).not.toContain("unrest_from_supply");
    expect(G.unrestPile).toEqual(["unrest_from_supply"]);
  });

  it("does not finish Exile acquisition when required Unrest causes Collapse", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_action"];
    G.cardDb.exiled_action = {
      id: "exiled_action",
      displayName: "Exiled Action",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.unrestPile = [];

    expect(acquireFromExile(G, { playerId: "0", cardId: "exiled_action" })).toBe(false);

    expect(G.players["0"].exile).toEqual(["exiled_action"]);
    expect(G.players["0"].hand).not.toContain("exiled_action");
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
  });
});
