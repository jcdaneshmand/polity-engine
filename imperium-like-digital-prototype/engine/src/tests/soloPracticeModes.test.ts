import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import { endTurnMove, resolveCleanupMarketResource, resolveExileChoice, skipExileChoice } from "../game/moves";
import { onTurnEnd } from "../game/turn";

describe("solo/practice modes",()=>{
  it("practice creates a 12-turn market churn clock and finite Progress pool",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 12 });
  });
  it("practice cleanup spends one churn Progress token onto the market and ticks the clock",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.market = ["test_action_foundry_shift"];
    G.players["0"].hand = [];

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0"] } as any);

    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "PracticeMarketChurn(test_action_foundry_shift/knowledge/1)")).toBe(true);
  });
  it("practice cleanup uses the chosen cleanup market card as the single churn Progress placement",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "0", playOrder: ["0"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketResources = {};
    G.players["0"].hand = [];

    endTurnMove({ G, ctx, events: { endTurn } });
    expect(G.pendingCleanupMarketResourceChoice?.cardIds).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);

    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 11 });
    expect(G.marketResources?.test_action_archive_survey?.knowledge).toBe(1);
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBeUndefined();
    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "practice_market_churn",
      source: "market",
      cardIds: ["test_action_foundry_shift"],
      optional: true
    });
  });
  it("practice lifecycle cleanup waits for the player-chosen Market card before placing churn Progress",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketResources = {};
    G.players["0"].hand = [];

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0"] } as any);

    expect(G.pendingCleanupMarketResourceChoice).toEqual({
      playerId: "0",
      resource: "knowledge",
      amount: 1,
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey"]
    });
    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 12 });
    expect(G.marketResources).toEqual({});
  });
  it("practice offers the optional market Exile before voluntary cleanup discard",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "0", playOrder: ["0"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketResources = {};
    G.players["0"].hand = ["test_action_scholars_circle"];

    endTurnMove({ G, ctx, events: { endTurn } });
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.pendingExileChoice?.sourceCardId).toBe("practice_market_churn");
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();

    skipExileChoice({ G, ctx, events: { endTurn } });

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"]
    });
    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 11 });
  });
  it("practice does not offer optional market Exile when automatic churn leaves no tokenless market cards",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.market = ["test_action_foundry_shift"];
    G.marketResources = {};
    G.players["0"].hand = ["test_action_scholars_circle"];

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0"] } as any);

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();
    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
  });
  it("practice cleanup pauses for an optional market Exile choice after churn",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "0", playOrder: ["0"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey", "test_action_scholars_circle"];
    G.marketResources = { test_action_archive_survey: { knowledge: 1 } };
    G.players["0"].hand = [];

    onTurnEnd(G, ctx);
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "practice_market_churn",
      source: "market",
      cardIds: ["test_action_scholars_circle"],
      optional: true
    });
    expect(G.pausedSolstice).toBeUndefined();
    expect(G.pendingPracticeMarketExileBeforeCleanup).toEqual({ playerId: "0" });
  });
  it("practice market Exile choice resumes the cleanup handoff without ticking twice",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "0", playOrder: ["0"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketRefillPool = ["test_action_scholars_circle"];
    G.marketDecks = undefined;
    G.unrestPile = ["unrest_from_supply"];
    G.players["0"].hand = [];

    onTurnEnd(G, ctx);
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");
    resolveExileChoice({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
    expect(G.players["0"].exile).toContain("test_action_archive_survey");
    expect(G.pausedSolstice).toBeUndefined();
  });
  it("practice market Exile choice can be skipped and still resumes cleanup",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "0", playOrder: ["0"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.players["0"].hand = [];

    onTurnEnd(G, ctx);
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");
    skipExileChoice({ G, ctx, events: { endTurn } });

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
    expect(G.players["0"].exile).toEqual([]);
  });
  it("practice triggers scoring when the twelfth turn has been played",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.practiceClock = { turnsRemaining: 1, progressTokens: 1 };
    G.market = ["test_action_foundry_shift"];
    G.players["0"].hand = [];

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0"] } as any);

    expect(G.practiceClock).toEqual({ turnsRemaining: 0, progressTokens: 0 });
    expect(G.gameover?.reason).toBe("normal_scoring:practice_turn_limit");
    expect(G.scoring).toBeUndefined();
  });
  it("solo creates bot",()=>{ const G=createInitialGameState({ options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain"} }); expect(G.solo?.bot.botId).toBe("bot_0"); });
});
