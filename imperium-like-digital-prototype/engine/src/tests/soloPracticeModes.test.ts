import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";

describe("solo/practice modes",()=>{
  it("practice creates clock",()=>{ const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} }); expect(G.practiceClock?.turnsRemaining).toBe(12); });
  it("solo creates bot",()=>{ const G=createInitialGameState({ options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain"} }); expect(G.solo?.bot.botId).toBe("bot_0"); });
});
