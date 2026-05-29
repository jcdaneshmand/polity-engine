import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInitialGameState } from "../game/initialState";

describe("setup pipeline",()=>{
  it("default creates playable 2p",()=>{ const G=createInitialGameState(); expect(Object.keys(G.players).length).toBe(2); });
  it("builds source deck state for market refill",()=>{
    const G=createInitialGameState();
    expect(G.marketDecks).toEqual({
      mainDeck: expect.any(Array),
      regionDeck: expect.any(Array),
      uncivilizedDeck: expect.any(Array),
      civilizedDeck: expect.any(Array),
      tributaryDeck: expect.any(Array)
    });
    expect(G.marketRefillPool).toEqual([]);
  });
  it("sets up the Fame deck with its special bottom card unavailable",()=>{
    const G=createInitialGameState();
    expect(G.fameDeck).toEqual({
      available: ["placeholder_fame_1"],
      specialBottomCardId: "placeholder_fame_bottom",
      resolvedSpecialByPlayer: {}
    });
  });
  it("creates default players for 3p multiplayer",()=>{ const G=createInitialGameState({ options:{playerCount:3,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]} }); expect(Object.keys(G.players).sort()).toEqual(["0","1","2"]); });
  it("invalid option-nation combo fails",()=>{ expect(()=>createInitialGameState({ options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain"}, playerNationIds:{"0":"test_nation_river_court"} })).toThrow(); });
  it("uses generated private replacements automatically when they exist",()=>{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-private-"));
    try {
      fs.mkdirSync(path.join(tmp, "generated-private"));
      const privateCardPath = path.join(tmp, "generated-private", "cards.normalized.json");
      const privateNationPath = path.join(tmp, "generated-private", "nations.normalized.json");
      const privateRulesetPath = path.join(tmp, "generated-private", "nation-rulesets.normalized.json");
      const privateStrategyPath = path.join(tmp, "generated-private", "nation-strategy.normalized.json");
      fs.writeFileSync(privateCardPath, JSON.stringify([
        {
          id:"private_power", displayName:"Private Power", suit:"none", cardType:"power",
          cost:{materials:0,population:0,progress:0,goods:0},
          developmentCost:{materials:0,population:0,progress:0,goods:0},
          vp:{mode:"none",value:null}, startingLocation:"box", isTradeRouteExpansion:false,
          effects:[], tags:[], implemented:true, tested:true, requiredExpansions:[], excludedExpansions:[]
        },
        {
          id:"private_state", displayName:"Private State", suit:"none", cardType:"state",
          cost:{materials:0,population:0,progress:0,goods:0},
          developmentCost:{materials:0,population:0,progress:0,goods:0},
          vp:{mode:"none",value:null}, startingLocation:"box", isTradeRouteExpansion:false,
          effects:[], tags:[], implemented:true, tested:true, requiredExpansions:[], excludedExpansions:[]
        },
        {
          id:"private_start", displayName:"Private Start", suit:"civilized", cardType:"action",
          cost:{materials:0,population:0,progress:0,goods:0},
          developmentCost:{materials:0,population:0,progress:0,goods:0},
          vp:{mode:"none",value:null}, startingLocation:"draw_deck", isTradeRouteExpansion:false,
          effects:[], tags:[], implemented:true, tested:true, requiredExpansions:[], excludedExpansions:[]
        }
      ]));
      fs.writeFileSync(privateNationPath, JSON.stringify([
        {
          id:"private_nation", displayName:"Private Nation", complexity:1,
          powerCardIds:["private_power"], stateCardIds:["private_state"], startingDeckCardIds:["private_start"],
          nationDeckCardIds:[], developmentCardIds:[], setupRules:[], passiveRules:[],
          actionTokensBase:1, exhaustTokensBase:1, requiredExpansions:[], excludedExpansions:[],
          implemented:true, tested:true
        }
      ]));
      fs.writeFileSync(privateRulesetPath, JSON.stringify([
        {
          nationId:"private_nation", displayName:"Private Rules", rulesetTags:["default_nation_deck"],
          requiredExpansions:[], excludedExpansions:[], setupOverrides:[{"op":"set_initial_resources","resources":{"materials":2}}],
          zoneOverrides:[], stateOverrides:[], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[],
          scoringOverrides:[], collapseOverrides:[], botOverrides:[], shortGameOverrides:[], hookRules:[],
          publicSummary:"Private rules", implemented:true, tested:true
        }
      ]));
      fs.writeFileSync(privateStrategyPath, JSON.stringify([
        {
          nationId:"private_nation", displayName:"Private Strategy", complexity:3, aggression:"peaceful",
          publicPlaceholderSummary:"Private strategy", implemented:true, tested:true
        }
      ]));

      const G = createInitialGameState({
        playerNationIds: { "0":"private_nation", "1":"private_nation" },
        privateCardPath,
        privateNationPath,
        privateRulesetPath,
        privateStrategyPath
      });

      expect(G.players["0"].powerArea).toEqual(["private_power"]);
      expect(G.players["0"].resources.materials).toBe(2);
      expect(G.activeNationRulesets?.["0"].nationId).toBe("private_nation");
      expect(G.activeNationStrategyProfiles?.["0"].displayName).toBe("Private Strategy");
    } finally {
      fs.rmSync(tmp, { recursive:true, force:true });
    }
  });
});
