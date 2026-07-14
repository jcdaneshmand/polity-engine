import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import { playCard, resolveAcquireChoice } from "../game/moves";

const fixtureRoot = path.resolve(__dirname, "../../../data/fictional-regression");
const ctx = { currentPlayer: "1", playOrder: ["1", "2"] } as any;

function readJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, fileName), "utf8")) as T;
}

function createFixtureGame() {
  return createInitialGameState({
    options: {
      playerCount: 2,
      mode: "multiplayer",
      enabledExpansions: [],
      enabledVariants: [],
      commonsSetId: "custom"
    },
    playerNationIds: {
      "1": "fixture_nation_surveyors",
      "2": "fixture_nation_archivists"
    },
    privateData: {
      cards: readJson<any[]>("cards.json"),
      nations: readJson<any[]>("nations.json"),
      nationRulesets: readJson<any[]>("rulesets.json")
    }
  });
}

describe("fictional scenario smoke", () => {
  it("plays a deterministic fixture action and keeps state serializable", () => {
    const G = createFixtureGame();
    const player = G.players["1"];
    expect(player.hand).toContain("fixture_action_gain_materials");
    const materialsBefore = player.resources.materials;

    playCard({ G, ctx }, "fixture_action_gain_materials");

    expect(player.resources.materials).toBe(materialsBefore + 1);
    expect(player.discard).toContain("fixture_action_gain_materials");
    expect(G.pendingChoice).toBeUndefined();
    expect(JSON.parse(JSON.stringify(G)).cardDb.fixture_action_gain_materials).toBeDefined();
  });

  it("opens and resolves a fixture acquire choice", () => {
    const G = createFixtureGame();
    const player = G.players["1"];
    expect(player.hand).toContain("fixture_action_choose_market");

    playCard({ G, ctx }, "fixture_action_choose_market");

    expect(G.pendingAcquireChoice?.playerId).toBe("1");
    expect(G.pendingAcquireChoice?.cardIds.length).toBeGreaterThan(1);
    const selectedCardId = G.pendingAcquireChoice!.cardIds[0];

    resolveAcquireChoice({ G, ctx }, selectedCardId);

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(player.hand).toContain(selectedCardId);
    expect(G.market.map((slot) => slot.cardId)).not.toContain(selectedCardId);
  });

  it("moves fixture Unrest from the supply to the active player", () => {
    const G = createFixtureGame();
    const player = G.players["1"];
    expect(player.hand).toContain("fixture_action_take_unrest");
    expect(G.unrestPile).toContain("fixture_unrest");
    const unrestBefore = G.unrestPile.length;

    playCard({ G, ctx }, "fixture_action_take_unrest");

    expect(G.unrestPile.length).toBe(unrestBefore - 1);
    expect(player.hand).toContain("fixture_unrest");
  });
});
