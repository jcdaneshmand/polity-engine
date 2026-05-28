import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";

describe("setup pipeline",()=>{
  it("default creates playable 2p",()=>{ const G=createInitialGameState(); expect(Object.keys(G.players).length).toBe(2); });
  it("invalid option-nation combo fails",()=>{ expect(()=>createInitialGameState({ options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain"}, playerNationIds:{"0":"test_nation_river_court"} })).toThrow(); });
});
