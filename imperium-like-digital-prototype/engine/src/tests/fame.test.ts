import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { gainFameCardsForBot, peekFameCards, resolveBotKingOfKings, returnFameCardToTop, takeFameCard } from "../game/fame";

function addSoloBot(G: ReturnType<typeof createInitialState>, overrides: Record<string, unknown> = {}) {
  G.solo = {
    bot: {
      botId: "bot_0",
      botNationId: "bot_nation",
      botDeck: [],
      botDiscard: [],
      botHistory: [],
      botPlayArea: [],
      botDynastyDeck: [],
      botStateTableId: "placeholder_S",
      botStateSide: "S",
      slots: {},
      resources: {},
      difficulty: "chieftain",
      difficultyConfig: { botEffectsPerTurn: 3, botStartingResources: {} },
      botLog: [],
      ...overrides
    } as any,
    botStateTables: {}
  };
}

describe("Fame deck", () => {
  it("keeps the special bottom Fame card unavailable while ordinary Fame remains", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: ["fame_top", "fame_second"],
      specialBottomCardId: "fame_bottom",
      resolvedSpecialByPlayer: {}
    };

    expect(peekFameCards(G, 3)).toEqual(["fame_top", "fame_second"]);
    expect(takeFameCard(G, "0")).toBe("fame_top");
    expect(G.fameDeck.available).toEqual(["fame_second"]);
    expect(G.players["0"].discard).toContain("fame_top");
    expect(G.scoring).toBeUndefined();
  });

  it("returns Fame cards to the top above the special bottom card", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: ["fame_original_top"],
      specialBottomCardId: "fame_bottom",
      resolvedSpecialByPlayer: {}
    };

    returnFameCardToTop(G, "fame_returned");

    expect(G.fameDeck.available).toEqual(["fame_returned", "fame_original_top"]);
    expect(peekFameCards(G, 3)).toEqual(["fame_returned", "fame_original_top"]);
  });

  it("resolves the special bottom Fame card side A without triggering scoring", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: [],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    expect(peekFameCards(G, 1)).toEqual(["fame_bottom"]);
    expect(takeFameCard(G, "0")).toBe("fame_bottom");
    expect(G.fameDeck).toEqual({
      available: [],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    });
    expect(G.players["0"].discard).not.toContain("fame_bottom");
    expect(G.scoring).toBeUndefined();
  });

  it("does not peek the special bottom Fame card after it is face down", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: [],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "face_down",
      resolvedSpecialByPlayer: {}
    };

    expect(peekFameCards(G, 1)).toEqual([]);
  });

  it("resolves King of Kings for an uncivilized State by gaining 6 Progress", () => {
    const G = createInitialState();
    G.cardDb.uncivilized_state = {
      id: "uncivilized_state",
      displayName: "Barbarian",
      type: "state",
      cardType: "state",
      suit: "uncivilized",
      cost: 0,
      tags: ["barbarian"],
      effects: []
    };
    G.players["0"].stateArea = ["uncivilized_state"];
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    expect(takeFameCard(G, "0")).toBe("king_of_kings");

    expect(G.players["0"].resources.knowledge).toBe(6);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(G.fameDeck.specialBottomSide).toBe("B");
    expect(G.scoring).toBeUndefined();
  });

  it("resolves King of Kings for a civilized State by gaining 3 Progress and offering a free Develop", () => {
    const G = createInitialState();
    G.cardDb.civilized_state = {
      id: "civilized_state",
      displayName: "Empire",
      type: "state",
      cardType: "state",
      suit: "civilized",
      cost: 0,
      tags: ["empire"],
      effects: []
    };
    G.players["1"].stateArea = ["civilized_state"];
    G.players["1"].developmentArea = ["test_action_scholars_circle"];
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 99 };
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    };

    expect(takeFameCard(G, "1")).toBe("king_of_kings");

    expect(G.players["1"].resources.knowledge).toBe(3);
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "1",
      sourceCardId: "king_of_kings",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 0,
      resumeBehavior: "none",
      usesProgressionToken: false,
      free: true
    });
    expect(G.scoring).toEqual({
      reason: "fame_deck_terminal_condition",
      triggeredBy: "1",
      phase: "finish_current_round"
    });
  });

  it("uses the active side of a two-sided State card for King of Kings rewards", () => {
    const G = createInitialState();
    G.cardDb.two_sided_state = {
      id: "two_sided_state",
      displayName: "Barbarian / Empire",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["barbarian", "empire"],
      effects: []
    };
    G.players["0"].stateArea = ["two_sided_state"];
    G.players["0"].developmentArea = ["test_action_scholars_circle"];
    G.cardStates = { two_sided_state: { activeState: "civilized" } };
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    expect(takeFameCard(G, "0")).toBe("king_of_kings");

    expect(G.players["0"].resources.knowledge).toBe(3);
    expect(G.pendingDevelopmentChoice?.cardIds).toEqual(["test_action_scholars_circle"]);
  });

  it("prevents the same player from resolving either side of the special bottom Fame card twice", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: [],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    };

    expect(takeFameCard(G, "0")).toBeUndefined();
    expect(G.fameDeck.specialBottomCardId).toBe("fame_bottom");
    expect(G.fameDeck.specialBottomSide).toBe("B");
    expect(G.scoring).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("FameSpecialSkipped(already_resolved/fame_bottom)");
  });

  it("does not take the special bottom Fame card after it is face down", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: [],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "face_down",
      resolvedSpecialByPlayer: {}
    };

    expect(takeFameCard(G, "0")).toBeUndefined();
    expect(G.fameDeck.specialBottomCardId).toBe("fame_bottom");
    expect(G.scoring).toBeUndefined();
  });

  it("triggers scoring when a different player resolves side B of the special bottom Fame card", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: [],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    };

    expect(takeFameCard(G, "1")).toBe("fame_bottom");
    expect(G.fameDeck).toEqual({
      available: [],
      specialBottomSide: "face_down",
      resolvedSpecialByPlayer: { "0": true, "1": true }
    });
    expect(G.players["1"].discard).not.toContain("fame_bottom");
    expect(G.scoring).toEqual({
      reason: "fame_deck_terminal_condition",
      triggeredBy: "1",
      phase: "finish_current_round"
    });
  });

  it("resolves Bot King of Kings in a barbarian state by gaining 6 Progress and triggering scoring", () => {
    const G = createInitialState();
    addSoloBot(G, { botStateSide: "S" });
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    expect(resolveBotKingOfKings(G)).toBe(true);

    expect(G.solo?.bot.resources.knowledge).toBe(6);
    expect(G.fameDeck).toEqual({
      available: [],
      specialBottomSide: "face_down",
      resolvedSpecialByPlayer: { bot_0: true }
    });
    expect(G.scoring).toEqual({
      reason: "bot_king_of_kings",
      triggeredBy: "bot_0",
      phase: "finish_current_round"
    });
  });

  it("resolves Bot King of Kings in an empire state by gaining 3 Progress and moving the top Dynasty card to the Bot deck", () => {
    const G = createInitialState();
    addSoloBot(G, {
      botStateSide: "F",
      botDeck: ["existing_top"],
      botDynastyDeck: ["dynasty_top", "dynasty_next"]
    });
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: {}
    };

    expect(resolveBotKingOfKings(G)).toBe(true);

    expect(G.solo?.bot.resources.knowledge).toBe(3);
    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_next"]);
    expect(G.solo?.bot.botDeck).toEqual(["dynasty_top", "existing_top"]);
    expect(G.scoring?.reason).toBe("bot_king_of_kings");
  });

  it("keeps Bot King of Kings Dynasty placement above ordinary Fame gained earlier in the same effect", () => {
    const G = createInitialState();
    addSoloBot(G, {
      botStateSide: "F",
      botDeck: ["existing_top"],
      botDynastyDeck: ["dynasty_top"]
    });
    const bot = G.solo!.bot;
    G.fameDeck = {
      available: ["ordinary_fame"],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: {}
    };

    expect(gainFameCardsForBot(G, bot, 2)).toEqual(["ordinary_fame"]);

    expect(bot.botDeck).toEqual(["dynasty_top", "ordinary_fame", "existing_top"]);
    expect(bot.botDynastyDeck).toEqual([]);
    expect(G.scoring?.reason).toBe("bot_king_of_kings");
  });

  it("does nothing if the Bot would gain King of Kings after already resolving it", () => {
    const G = createInitialState();
    addSoloBot(G, {
      botStateSide: "F",
      botDeck: ["existing_top"],
      botDynastyDeck: ["dynasty_top"]
    });
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { bot_0: true }
    };

    expect(resolveBotKingOfKings(G)).toBe(false);

    expect(G.solo?.bot.resources.knowledge).toBeUndefined();
    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_top"]);
    expect(G.solo?.bot.botDeck).toEqual(["existing_top"]);
    expect(G.scoring).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("FameSpecialSkipped(already_resolved/king_of_kings)");
  });

  it("does nothing if the Bot would gain King of Kings after it is face down", () => {
    const G = createInitialState();
    addSoloBot(G, {
      botStateSide: "F",
      botDeck: ["existing_top"],
      botDynastyDeck: ["dynasty_top"]
    });
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "face_down",
      resolvedSpecialByPlayer: {}
    };

    expect(resolveBotKingOfKings(G)).toBe(false);
    expect(G.solo?.bot.resources.knowledge).toBeUndefined();
    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_top"]);
    expect(G.solo?.bot.botDeck).toEqual(["existing_top"]);
    expect(G.scoring).toBeUndefined();
  });
});
