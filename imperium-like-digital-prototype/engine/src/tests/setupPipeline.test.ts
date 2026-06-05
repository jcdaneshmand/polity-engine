import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInitialGameState } from "../game/initialState";
import { currentStateMatches } from "../game/stateMatching";
import type { GameOptions } from "../options/gameOptions";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { card, cardDb, nationDb } from "./commonsTestFixtures";

describe("setup pipeline",()=>{
  it("default creates playable 2p",()=>{ const G=createInitialGameState(); expect(Object.keys(G.players).length).toBe(2); });
  it("records setup options independently from later caller mutations",()=>{
    const options: GameOptions = {
      playerCount:1,
      mode:"solo",
      enabledExpansions:["trade_routes"],
      enabledVariants:["short_game"],
      soloDifficulty:"chieftain",
      campaignMode:"standard",
      commonsSetId:"classics",
      replacementPolicy:"none",
      campaignProgress:{
        mode:"standard",
        playerNationId:"test_nation_sun_coast",
        wins:0,
        losses:0,
        currentDifficulty:"chieftain",
        defeatedBotNationIds:[],
        startingDeckAdditions:[],
        startingDeckRemovals:[],
        setAsideCommonsCardIds:[],
        doubleStartingResourcesForNextGame:false
      }
    };
    const G=createInitialGameStateFromPipeline({
      options,
      cardDb:cardDb([
        card({ id:"starter", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"bot_region", suit:"region", cardType:"attack", ownership:"bot", startingLocation:"bot_deck" })
      ]),
      nationDb:{
        human_before_setup:{ ...nationDb.test_nation_alpha, id:"human_before_setup", displayName:"Human Before Setup" },
        bot_before_setup:{ ...nationDb.test_nation_alpha, id:"bot_before_setup", displayName:"Bot Before Setup" },
        bot_after_setup:{ ...nationDb.test_nation_alpha, id:"bot_after_setup", displayName:"Bot After Setup" }
      },
      playerNationIds:{"0":"human_before_setup"},
      soloBotNationId:"bot_before_setup"
    });

    options.enabledExpansions.push("trade_routes");
    options.enabledVariants.push("precious_cards");
    options.campaignProgress!.defeatedBotNationIds.push("bot_after_setup");
    options.campaignProgress!.startingDeckAdditions.push("late_addition");

    expect(G.options).toBeDefined();
    const snapshot = G.options!;
    expect(snapshot.enabledExpansions).toEqual(["trade_routes"]);
    expect(snapshot.enabledVariants).toEqual(["short_game"]);
    expect(snapshot.campaignProgress?.defeatedBotNationIds).toEqual([]);
    expect(snapshot.campaignProgress?.startingDeckAdditions).toEqual([]);
  });
  it("uses explicitly provided player ids without creating player 0",()=> {
    const G=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"1":"test_nation_sun_coast","2":"test_nation_sun_coast"}
    });
    expect(Object.keys(G.players)).toEqual(["1","2"]);
    expect(G.playOrder).toEqual(["1","2"]);
    expect(G.players["0"]).toBeUndefined();
  });
  it("can create a game from uploaded in-memory private card and nation data",()=> {
    const G=createInitialGameState({
      options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"1":"uploaded_nation"},
      privateData:{
        cards:[
          card({id:"uploaded_starter",ownership:"nation",startingLocation:"draw_deck"}),
          card({id:"uploaded_market_1",displayName:"Uploaded Market 1",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"uploaded_market_2",displayName:"Uploaded Market 2",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"uploaded_market_3",displayName:"Uploaded Market 3",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"uploaded_market_4",displayName:"Uploaded Market 4",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"uploaded_market_5",displayName:"Uploaded Market 5",ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
        ],
        nations:[{
          id:"uploaded_nation",
          displayName:"Uploaded Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["uploaded_starter"],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);
    expect(Object.keys(G.players)).toEqual(["1"]);
    expect(G.players["1"].hand).toContain("uploaded_starter");
    expect(G.market).toEqual(["uploaded_market_1","uploaded_market_2","uploaded_market_3","uploaded_market_4","uploaded_market_5"]);
  });
  it("defaults missing imported nation and ruleset compatibility arrays during setup",()=> {
    const G=createInitialGameState({
      options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"1":"minimal_uploaded_nation"},
      privateData:{
        cards:[
          card({id:"minimal_starter",ownership:"nation",startingLocation:"draw_deck"}),
          card({id:"minimal_market_1",displayName:"Minimal Market 1",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"minimal_market_2",displayName:"Minimal Market 2",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"minimal_market_3",displayName:"Minimal Market 3",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"minimal_market_4",displayName:"Minimal Market 4",ownership:"commons",startingLocation:"market",commonsSetId:"custom"}),
          card({id:"minimal_market_5",displayName:"Minimal Market 5",ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
        ],
        nations:[{
          id:"minimal_uploaded_nation",
          displayName:"Minimal Uploaded Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["minimal_starter"],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:undefined,
          excludedExpansions:undefined,
          implemented:true,
          tested:true
        }],
        nationRulesets:[{
          nationId:"minimal_uploaded_nation",
          displayName:"Minimal Uploaded Ruleset",
          rulesetTags:undefined,
          requiredExpansions:undefined,
          excludedExpansions:undefined,
          setupOverrides:undefined,
          zoneOverrides:undefined,
          stateOverrides:undefined,
          reshuffleOverrides:undefined,
          cleanupOverrides:undefined,
          solsticeOverrides:undefined,
          scoringOverrides:undefined,
          collapseOverrides:undefined,
          botOverrides:undefined,
          shortGameOverrides:undefined,
          hookRules:undefined,
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["1"].hand).toContain("minimal_starter");
  });
  it("rejects a selected nation when its imported ruleset requires disabled Trade Routes",()=> {
    expect(() => createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"0":"trade_rules_nation","1":"trade_rules_nation"},
      privateData:{
        cards:[
          card({id:"trade_rules_starter",ownership:"nation",startingLocation:"draw_deck"})
        ],
        nations:[{
          id:"trade_rules_nation",
          displayName:"Trade Rules Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["trade_rules_starter"],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }],
        nationRulesets:[{
          nationId:"trade_rules_nation",
          displayName:"Trade Rules",
          rulesetTags:["trade_routes_required"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any)).toThrow("Ruleset requires disabled expansion trade_routes");
  });
  it("rejects a selected nation outside its allowed modes",()=> {
    const commons = Array.from({ length: 5 }, (_, index) =>
      card({id:`mode_market_${index + 1}`,displayName:`Mode Market ${index + 1}`,ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
    );

    expect(() => createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"0":"solo_only_nation","1":"solo_only_nation"},
      privateData:{
        cards:[
          card({id:"solo_starter",ownership:"nation",startingLocation:"draw_deck"}),
          ...commons
        ],
        nations:[{
          id:"solo_only_nation",
          displayName:"Solo Only Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["solo_starter"],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          allowedModes:["solo"],
          implemented:true,
          tested:true
        }]
      }
    } as any)).toThrow("Nation solo_only_nation not allowed in mode multiplayer.");
  });
  it("ignores Bot-only ruleset overrides in multiplayer setup",()=> {
    const commons = Array.from({ length: 5 }, (_, index) =>
      card({id:`multiplayer_market_${index + 1}`,displayName:`Multiplayer Market ${index + 1}`,ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
    );
    const G=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"0":"uploaded_nation","1":"uploaded_nation"},
      privateData:{
        cards:[
          card({id:"uploaded_starter",ownership:"nation",startingLocation:"draw_deck"}),
          ...commons
        ],
        nations:[{
          id:"uploaded_nation",
          displayName:"Uploaded Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["uploaded_starter"],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }],
        nationRulesets:[{
          nationId:"uploaded_nation",
          displayName:"Uploaded Ruleset",
          rulesetTags:["default_nation_deck"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[
            { op:"custom_bot_state_stack", cardIds:["bot_state_a","bot_state_b"] },
            { op:"bot_cleanup_market_resource", resource:"goods", count:2 }
          ],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.solo).toBeUndefined();
    expect(G.log.some((entry) => entry.message.includes("/bot/"))).toBe(false);
    expect(G.activeNationRulesets?.["0"].botOverrides).toEqual([]);
    expect(G.activeNationRulesets?.["1"].botOverrides).toEqual([]);
  });
  it("records setup-created side area metadata on game state",()=> {
    const commons = Array.from({ length: 5 }, (_, index) =>
      card({id:`side_area_market_${index + 1}`,displayName:`Side Area Market ${index + 1}`,ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
    );
    const G=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"0":"side_area_nation","1":"side_area_nation"},
      privateData:{
        cards:[
          card({id:"side_starter",ownership:"nation",startingLocation:"draw_deck"}),
          ...commons
        ],
        nations:[{
          id:"side_area_nation",
          displayName:"Side Area Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["side_starter"],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }],
        nationRulesets:[{
          nationId:"side_area_nation",
          displayName:"Side Area Ruleset",
          rulesetTags:["special_side_area"],
          requiredExpansions:[],
          setupOverrides:[
            { op:"create_side_area", areaId:"public_track", displayName:"Public Track", public:true },
            { op:"create_side_area", areaId:"private_track", displayName:"Private Track", public:false }
          ],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].sideAreas?.public_track).toEqual([]);
    expect(G.sideAreas?.["0"]?.public_track).toMatchObject({
      id:"public_track",
      displayName:"Public Track",
      visibility:"public",
      cardIds:[]
    });
    expect(G.sideAreas?.["0"]?.private_track).toMatchObject({
      id:"private_track",
      displayName:"Private Track",
      visibility:"private",
      cardIds:[]
    });
  });
  it("does not create a Development area for no-Development-area rulesets",()=> {
    const commons = Array.from({ length: 5 }, (_, index) =>
      card({id:`no_dev_market_${index + 1}`,displayName:`No Dev Market ${index + 1}`,ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
    );
    const G=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"0":"no_dev_nation","1":"no_dev_nation"},
      privateData:{
        cards:[
          card({id:"no_dev_starter",ownership:"nation",startingLocation:"draw_deck"}),
          card({id:"suppressed_dev_a",ownership:"nation",startingLocation:"development_area",cardType:"development"}),
          card({id:"suppressed_dev_b",ownership:"nation",startingLocation:"development_area",cardType:"development"}),
          ...commons
        ],
        nations:[{
          id:"no_dev_nation",
          displayName:"No Development Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["no_dev_starter"],
          nationDeckCardIds:[],
          developmentCardIds:["suppressed_dev_a","suppressed_dev_b"],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }],
        nationRulesets:[{
          nationId:"no_dev_nation",
          displayName:"No Development Ruleset",
          rulesetTags:["no_development_area"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].developmentArea).toEqual([]);
    expect(G.players["1"].developmentArea).toEqual([]);
    expect(G.players["0"].deck).toEqual([]);
    expect(G.players["0"].hand).toEqual(["no_dev_starter"]);
  });
  it("folds no-Accession cards into the hidden Nation deck during setup",()=> {
    const commons = Array.from({ length: 5 }, (_, index) =>
      card({id:`no_accession_market_${index + 1}`,displayName:`No Accession Market ${index + 1}`,ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
    );
    const G=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"0":"no_accession_nation","1":"no_accession_nation"},
      privateData:{
        cards:[
          card({id:"no_accession_starter",ownership:"nation",startingLocation:"draw_deck"}),
          card({id:"regular_nation_card",ownership:"nation",startingLocation:"nation_deck",cardType:"nation"}),
          card({id:"suppressed_accession",ownership:"nation",startingLocation:"nation_deck",cardType:"accession",tags:["accession"]}),
          ...commons
        ],
        nations:[{
          id:"no_accession_nation",
          displayName:"No Accession Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["no_accession_starter"],
          nationDeckCardIds:["regular_nation_card"],
          accessionCardId:"suppressed_accession",
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }],
        nationRulesets:[{
          nationId:"no_accession_nation",
          displayName:"No Accession Ruleset",
          rulesetTags:["no_accession"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].accessionCardId).toBeUndefined();
    expect(G.players["0"].nationDeck).toEqual(expect.arrayContaining(["regular_nation_card","suppressed_accession"]));
    expect(G.players["0"].nationDeck).toHaveLength(2);
    expect(G.players["1"].accessionCardId).toBeUndefined();
    expect(G.players["1"].nationDeck).toEqual(expect.arrayContaining(["regular_nation_card","suppressed_accession"]));
    expect(G.players["1"].nationDeck).toHaveLength(2);
  });
  it("folds setup-rule Accession placements for no-Accession rulesets",()=> {
    const commons = Array.from({ length: 5 }, (_, index) =>
      card({id:`setup_no_accession_market_${index + 1}`,displayName:`Setup No Accession Market ${index + 1}`,ownership:"commons",startingLocation:"market",commonsSetId:"custom"})
    );
    const G=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"custom"},
      playerNationIds:{"0":"setup_no_accession_nation","1":"setup_no_accession_nation"},
      privateData:{
        cards:[
          card({id:"setup_no_accession_starter",ownership:"nation",startingLocation:"draw_deck"}),
          card({id:"setup_rule_accession",ownership:"nation",startingLocation:"accession",cardType:"accession",tags:["accession"]}),
          ...commons
        ],
        nations:[{
          id:"setup_no_accession_nation",
          displayName:"Setup No Accession Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:["setup_no_accession_starter"],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[{ op:"place_card_in_area", cardId:"setup_rule_accession", area:"accession" }],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }],
        nationRulesets:[{
          nationId:"setup_no_accession_nation",
          displayName:"Setup No Accession Ruleset",
          rulesetTags:["no_accession"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].accessionCardId).toBeUndefined();
    expect(G.players["0"].nationDeck).toEqual(["setup_rule_accession"]);
    expect(G.players["1"].accessionCardId).toBeUndefined();
    expect(G.players["1"].nationDeck).toEqual(["setup_rule_accession"]);
  });
  it("short game setup exiles the top ten remaining Main deck cards into a public Exile zone",()=> {
    const cards = Array.from({ length: 15 }, (_, index) =>
      card({ id: `main_${index + 1}`, startingLocation: "market", setupBannerSuit: "none", smallDeckEligible: false, mainDeckEligible: true })
    );
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
      cardDb:cardDb(cards),
      nationDb,
      playerNationIds:{"0":"test_nation_alpha","1":"test_nation_alpha"}
    });

    expect(G.setupReport?.shortGameExiled).toBe(10);
    expect(G.globalSpecialZones?.exile).toMatchObject({
      id: "exile",
      displayName: "Exile",
      visibility: "public",
      scoresAsOwned: false,
      cardIds: ["main_6","main_7","main_8","main_9","main_10","main_11","main_12","main_13","main_14","main_15"]
    });
    expect(G.cardDb.main_15?.id).toBe("main_15");
  });
  it("practice setup exiles the top fifteen remaining Main deck cards into a public Exile zone",()=> {
    const cards = Array.from({ length: 20 }, (_, index) =>
      card({ id: `practice_main_${index + 1}`, startingLocation: "market", setupBannerSuit: "none", smallDeckEligible: false, mainDeckEligible: true })
    );
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]},
      cardDb:cardDb(cards),
      nationDb,
      playerNationIds:{"0":"test_nation_alpha"}
    });

    expect(G.setupReport?.practiceModeExiled).toBe(15);
    expect(G.globalSpecialZones?.exile?.cardIds).toEqual([
      "practice_main_6","practice_main_7","practice_main_8","practice_main_9","practice_main_10",
      "practice_main_11","practice_main_12","practice_main_13","practice_main_14","practice_main_15",
      "practice_main_16","practice_main_17","practice_main_18","practice_main_19","practice_main_20"
    ]);
    expect(G.cardDb.practice_main_20?.id).toBe("practice_main_20");
  });
  it("sets default State token capacity to 3 Actions and 5 Exhausts",()=>{
    const G=createInitialGameState();
    expect(G.players["0"].actionTokensBase).toBe(3);
    expect(G.players["0"].actionsRemaining).toBe(3);
    expect(G.players["0"].actionTokensAvailable).toBe(3);
    expect(G.players["0"].exhaustTokensBase).toBe(5);
    expect(G.players["0"].exhaustTokensAvailable).toBe(5);
  });
  it("adds the Trade Routes Exhaust token on top of the default State capacity",()=>{
    const G=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:["trade_routes"],enabledVariants:[]},
      playerNationIds:{"0":"test_nation_river_court","1":"test_nation_sun_coast"}
    });
    expect(G.players["0"].actionTokensBase).toBe(3);
    expect(G.players["0"].exhaustTokensBase).toBe(6);
    expect(G.players["0"].exhaustTokensAvailable).toBe(6);
  });
  it("uses the rulebook starting resource pool, with Goods replacing Progress for Trade Routes",()=>{
    const base=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"}
    });
    expect(base.players["0"].resources).toMatchObject({ materials:3, influence:2, knowledge:1, goods:0 });

    const tradeRoutes=createInitialGameState({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:["trade_routes"],enabledVariants:[]},
      playerNationIds:{"0":"test_nation_river_court","1":"test_nation_sun_coast"}
    });
    expect(tradeRoutes.players["0"].resources).toMatchObject({ materials:3, influence:2, knowledge:0, goods:1 });
  });
  it("applies the campaign loss carryover resource bonus to the next solo setup",()=>{
    const baseOptions: GameOptions = {
      playerCount:1,
      mode:"solo",
      enabledExpansions:[],
      enabledVariants:[],
      soloDifficulty:"chieftain",
      campaignMode:"standard",
      commonsSetId:"classics",
      replacementPolicy:"none",
      campaignProgress:{
        mode:"standard",
        playerNationId:"human_nation",
        wins:0,
        losses:1,
        currentDifficulty:"chieftain",
        defeatedBotNationIds:[],
        startingDeckAdditions:[],
        startingDeckRemovals:[],
        setAsideCommonsCardIds:[],
        doubleStartingResourcesForNextGame:true
      }
    };
    const G=createInitialGameStateFromPipeline({
      options:baseOptions,
      cardDb: cardDb([
        card({ id:"starter", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"bot_region", suit:"region", cardType:"attack", ownership:"bot", startingLocation:"bot_deck" })
      ]),
      nationDb:{
        human_nation:{ ...nationDb.test_nation_alpha, id:"human_nation", displayName:"Human Nation" },
        requested_bot:{ ...nationDb.test_nation_alpha, id:"requested_bot", displayName:"Requested Bot" }
      },
      playerNationIds:{"0":"human_nation"},
      soloBotNationId:"requested_bot"
    });

    expect(G.players["0"].resources).toMatchObject({ materials:6, influence:4, knowledge:2, goods:0 });
    expect(G.log.some((entry) => entry.message === "CampaignStartingResourceBonusApplied")).toBe(true);
  });
  it("applies campaign starting-deck additions and removals before the opening hand is drawn",()=>{
    const options: GameOptions = {
      playerCount:1,
      mode:"solo",
      enabledExpansions:[],
      enabledVariants:[],
      soloDifficulty:"warlord",
      campaignMode:"standard",
      commonsSetId:"classics",
      replacementPolicy:"none",
      campaignProgress:{
        mode:"standard",
        playerNationId:"human_nation",
        wins:1,
        losses:0,
        currentDifficulty:"warlord",
        defeatedBotNationIds:["first_bot"],
        startingDeckAdditions:["campaign_commons"],
        startingDeckRemovals:["starter_removed"],
        setAsideCommonsCardIds:[],
        doubleStartingResourcesForNextGame:false
      }
    };
    const G=createInitialGameStateFromPipeline({
      options,
      cardDb: cardDb([
        card({ id:"starter_keep_1", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"starter_keep_2", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"starter_removed", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"campaign_commons", ownership:"commons", startingLocation:"market", smallDeckEligible:false }),
        card({ id:"safe_market_1", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_2", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_3", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_4", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_5", suit:"none", smallDeckEligible:false }),
        card({ id:"bot_region", suit:"region", cardType:"attack", ownership:"bot", startingLocation:"bot_deck" })
      ]),
      nationDb:{
        human_nation:{ ...nationDb.test_nation_alpha, id:"human_nation", displayName:"Human Nation", startingDeckCardIds:["starter_keep_1","starter_keep_2","starter_removed"] },
        requested_bot:{ ...nationDb.test_nation_alpha, id:"requested_bot", displayName:"Requested Bot" }
      },
      playerNationIds:{"0":"human_nation"},
      soloBotNationId:"requested_bot"
    });
    const playerZones = [
      ...G.players["0"].hand,
      ...G.players["0"].deck,
      ...G.players["0"].discard,
      ...G.players["0"].playArea,
      ...G.players["0"].history,
      ...G.players["0"].exile
    ];

    expect(playerZones).toContain("campaign_commons");
    expect(playerZones).not.toContain("starter_removed");
    expect(G.log.some((entry) => entry.message === "CampaignStartingDeckCarryoverApplied(add=1/remove=1)")).toBe(true);
  });
  it("applies setup and short-game resource overrides using rulebook resource names",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
      playerNationIds:{"0":"alias_setup_nation","1":"alias_setup_nation"},
      cardDb:cardDb([
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"}),
        card({id:"market_5"})
      ]),
      nationDb:{
        alias_setup_nation:{
          id:"alias_setup_nation",
          displayName:"Alias Setup Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:[],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }
      },
      privateData:{
        nationRulesets:[{
          nationId:"alias_setup_nation",
          displayName:"Alias Setup Rules",
          rulesetTags:["short_game_exception"],
          requiredExpansions:[],
          setupOverrides:[
            { op:"set_initial_resources", resources:{ progress:2, population:1 } as any },
            { op:"gain_resource", resource:"progress" as any, count:1 }
          ],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[
            { op:"remove_starting_resource", resource:"population" as any, count:1 },
            { op:"remove_starting_resources", resources:["progress" as any] }
          ],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect((G.players["0"].resources as any).progress).toBeUndefined();
    expect((G.players["0"].resources as any).population).toBeUndefined();
  });
  it("sets a two-sided State card to its Barbarian side during default setup",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"two_sided_nation","1":"two_sided_nation"},
      cardDb:cardDb([
        card({id:"two_sided_state",ownership:"nation",startingLocation:"box",cardType:"state",tags:["barbarian","empire"]}),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"}),
        card({id:"market_5"})
      ]),
      nationDb:{
        two_sided_nation:{
          id:"two_sided_nation",
          displayName:"Two Sided Nation",
          powerCardIds:[],
          stateCardIds:["two_sided_state"],
          startingDeckCardIds:[],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }
      }
    });

    expect(G.cardStates?.two_sided_state?.activeState).toBe("uncivilized");
    expect(currentStateMatches(G,"0","barbarian")).toBe(true);
    expect(currentStateMatches(G,"0","empire")).toBe(false);
  });
  it("preserves explicit setup Action-token overrides when starting as a non-default State",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"state_token_override_nation","1":"state_token_override_nation"},
      cardDb:cardDb([
        card({id:"native_state",ownership:"nation",startingLocation:"box",cardType:"state",tags:["native"],stateActionTokens:3}),
        card({id:"alien_state",ownership:"nation",startingLocation:"box",cardType:"state",tags:["alien"],stateActionTokens:4}),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"}),
        card({id:"market_5"})
      ]),
      nationDb:{
        state_token_override_nation:{
          id:"state_token_override_nation",
          displayName:"State Token Override Nation",
          powerCardIds:[],
          stateCardIds:["native_state","alien_state"],
          startingDeckCardIds:[],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }
      },
      privateData:{
        nationRulesets:[{
          nationId:"state_token_override_nation",
          displayName:"State Token Override Rules",
          rulesetTags:["alternate_starting_state"],
          requiredExpansions:[],
          setupOverrides:[{ op:"set_action_tokens_base", count:2 }],
          zoneOverrides:[],
          stateOverrides:[{ op:"start_as_state", state:"alien" }],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].stateArea[0]).toBe("alien_state");
    expect(G.players["0"].actionTokensBase).toBe(2);
    expect(G.players["0"].actionsRemaining).toBe(2);
    expect(G.players["0"].actionTokensAvailable).toBe(2);
  });
  it("starts as empire when the ruleset tag requests it",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"empire_start_nation","1":"empire_start_nation"},
      cardDb:cardDb([
        card({id:"barbarian_state",ownership:"nation",startingLocation:"box",cardType:"state",tags:["barbarian"],stateActionTokens:3}),
        card({id:"empire_state",ownership:"nation",startingLocation:"box",cardType:"state",tags:["empire"],stateActionTokens:2}),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"}),
        card({id:"market_5"})
      ]),
      nationDb:{
        empire_start_nation:{
          id:"empire_start_nation",
          displayName:"Empire Start Nation",
          powerCardIds:[],
          stateCardIds:["barbarian_state","empire_state"],
          startingDeckCardIds:[],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }
      },
      privateData:{
        nationRulesets:[{
          nationId:"empire_start_nation",
          displayName:"Empire Start Rules",
          rulesetTags:["starts_as_empire"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].stateArea[0]).toBe("empire_state");
    expect(G.players["0"].actionTokensBase).toBe(2);
    expect(currentStateMatches(G,"0","empire")).toBe(true);
  });
  it("routes setup History placements through a nation History replacement zone",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"history_setup_nation","1":"history_setup_nation"},
      cardDb:cardDb([
        card({id:"setup_history_card",ownership:"nation",startingLocation:"box"}),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"}),
        card({id:"market_5"})
      ]),
      nationDb:{
        history_setup_nation:{
          id:"history_setup_nation",
          displayName:"History Setup Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:[],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[{op:"place_card_in_area",area:"history",cardId:"setup_history_card"}],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        } as any
      },
      privateData:{
        nationRulesets:[{
          nationId:"history_setup_nation",
          displayName:"History Setup Rules",
          rulesetTags:["alternate_history_zone"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[{op:"replace_history_with_zone",zoneId:"sunken",displayName:"Sunken",cardsScore:true} as any],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].sideAreas?.sunken).toEqual(["setup_history_card"]);
    expect(G.specialZones?.["0"]?.sunken).toMatchObject({
      id:"sunken",
      displayName:"Sunken",
      visibility:"private",
      scoresAsOwned:true,
      cardIds:["setup_history_card"]
    });
  });
  it("records metadata for alternate History zones created by disabled History",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"alternate_history_nation","1":"alternate_history_nation"},
      cardDb:cardDb([
        card({id:"alternate_history_card",ownership:"nation",startingLocation:"box"}),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"}),
        card({id:"market_5"})
      ]),
      nationDb:{
        alternate_history_nation:{
          id:"alternate_history_nation",
          displayName:"Alternate History Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:[],
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[{op:"place_card_in_area",area:"history",cardId:"alternate_history_card"}],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        } as any
      },
      privateData:{
        nationRulesets:[{
          nationId:"alternate_history_nation",
          displayName:"Alternate History Rules",
          rulesetTags:["alternate_history_zone"],
          requiredExpansions:[],
          setupOverrides:[],
          zoneOverrides:[{op:"disable_history",replacementBehavior:"alternate_zone"}],
          stateOverrides:[],
          reshuffleOverrides:[],
          cleanupOverrides:[],
          solsticeOverrides:[],
          scoringOverrides:[],
          collapseOverrides:[],
          botOverrides:[],
          shortGameOverrides:[],
          hookRules:[],
          implemented:true,
          tested:true
        }]
      }
    } as any);

    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].sideAreas?.alternate_history).toEqual(["alternate_history_card"]);
    expect(G.specialZones?.["0"]?.alternate_history).toMatchObject({
      id:"alternate_history",
      displayName:"Alternate History",
      visibility:"private",
      scoresAsOwned:true,
      cardIds:["alternate_history_card"]
    });
  });
  it("preserves imported suit icon metadata in the runtime card database",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"test_nation_alpha","1":"test_nation_alpha"},
      cardDb:cardDb([
        card({id:"multi_suit_card",suit:"multi",suitIcons:["civilized","uncivilized"],startingLocation:"market"}),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"})
      ]),
      nationDb
    });

    expect(G.cardDb.multi_suit_card.suitIcons).toEqual(["civilized","uncivilized"]);
  });
  it("preserves imported state requirements in the runtime card database",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"test_nation_alpha","1":"test_nation_alpha"},
      cardDb:cardDb([
        card({id:"empire_locked_card",stateRequirement:"empire",startingLocation:"market"}),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"})
      ]),
      nationDb
    });

    expect(G.cardDb.empire_locked_card.stateRequirement).toBe("empire");
  });
  it("draws an opening hand of five cards from each player's starting deck",()=>{
    const startingCards = Array.from({ length: 6 }, (_, index) => `starter_${index + 1}`);
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]},
      playerNationIds:{"0":"opening_hand_nation","1":"opening_hand_nation"},
      cardDb:cardDb([
        ...startingCards.map((id) => card({ id, ownership:"nation", startingLocation:"draw_deck" })),
        card({id:"market_1"}),
        card({id:"market_2"}),
        card({id:"market_3"}),
        card({id:"market_4"}),
        card({id:"market_5"})
      ]),
      nationDb:{
        opening_hand_nation:{
          id:"opening_hand_nation",
          displayName:"Opening Hand Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:startingCards,
          nationDeckCardIds:[],
          developmentCardIds:[],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }
      }
    });

    expect(G.players["0"].hand).toEqual(["starter_1","starter_2","starter_3","starter_4","starter_5"]);
    expect(G.players["0"].deck).toEqual(["starter_6"]);
    expect(G.players["1"].hand).toHaveLength(5);
  });
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
  it("preserves visible Tributary bottom-card metadata through full setup",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"classics",replacementPolicy:"none"},
      playerNationIds:{"0":"test_nation_alpha","1":"test_nation_alpha"},
      cardDb:cardDb([
        card({id:"region_0",setupBannerSuit:"region"}),
        card({id:"region_1",setupBannerSuit:"region"}),
        card({id:"uncivilized_0",setupBannerSuit:"uncivilized"}),
        card({id:"uncivilized_1",setupBannerSuit:"uncivilized"}),
        card({id:"civilized_0",setupBannerSuit:"civilized"}),
        card({id:"civilized_1",setupBannerSuit:"civilized"}),
        card({id:"tributary_region_bottom",setupBannerSuit:"tributary"}),
        card({id:"tributary_uncivilized_bottom",setupBannerSuit:"tributary"}),
        card({id:"tributary_civilized_bottom",setupBannerSuit:"tributary"}),
        card({id:"main_0",setupBannerSuit:"none",smallDeckEligible:false}),
        card({id:"main_1",setupBannerSuit:"none",smallDeckEligible:false})
      ]),
      nationDb
    });

    expect(G.market).toEqual(["region_0","uncivilized_0","civilized_0","main_0","main_1"]);
    expect(G.marketDeckBottomCards).toEqual({
      regionDeck:"tributary_region_bottom",
      uncivilizedDeck:"tributary_uncivilized_bottom",
      civilizedDeck:"tributary_civilized_bottom"
    });
  });
  it("sets up the Fame deck with its special bottom card unavailable",()=>{
    const G=createInitialGameState();
    expect(G.fameDeck).toEqual({
      available: ["placeholder_fame_1"],
      specialBottomCardId: "placeholder_fame_bottom",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    });
  });
  it("trims ordinary Fame cards to the player-count deck size above King of Kings",()=>{
    const setupArgs = {
      playerNationIds:{"0":"test_nation_alpha","1":"test_nation_alpha","2":"test_nation_alpha"},
      cardDb: cardDb([
        ...Array.from({ length: 5 }, (_, index) => card({
          id: `market_${index + 1}`,
          suit: "none",
          smallDeckEligible: false
        })),
        ...Array.from({ length: 9 }, (_, index) => card({
          id: `fame_${index + 1}`,
          suit: "fame",
          cardType: "fame",
          fameDeckEligible: true,
          marketEligible: false,
          mainDeckEligible: false
        })),
        card({
          id: "king_of_kings",
          suit: "fame",
          cardType: "fame",
          fameDeckEligible: true,
          marketEligible: false,
          mainDeckEligible: false,
          tags: ["king_of_kings"]
        })
      ]),
      nationDb,
      randomSeed: "fame-size"
    };

    const base = createInitialGameStateFromPipeline({
      ...setupArgs,
      options:{playerCount:3,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"classics",replacementPolicy:"none"}
    });
    const tradeRoutes = createInitialGameStateFromPipeline({
      ...setupArgs,
      options:{playerCount:3,mode:"multiplayer",enabledExpansions:["trade_routes"],enabledVariants:[],commonsSetId:"classics",replacementPolicy:"none"}
    });

    expect(base.fameDeck?.available).toHaveLength(7);
    expect(base.fameDeck?.available).not.toContain("king_of_kings");
    expect(base.fameDeck?.specialBottomCardId).toBe("king_of_kings");
    expect(tradeRoutes.fameDeck?.available).toHaveLength(8);
    expect(tradeRoutes.fameDeck?.specialBottomCardId).toBe("king_of_kings");
  });
  it("creates default players for 3p multiplayer",()=>{ const G=createInitialGameState({ options:{playerCount:3,mode:"multiplayer",enabledExpansions:[],enabledVariants:[]} }); expect(Object.keys(G.players).sort()).toEqual(["0","1","2"]); });
  it("invalid option-nation combo fails",()=>{ expect(()=>createInitialGameState({ options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain"}, playerNationIds:{"0":"test_nation_river_court"} })).toThrow(); });
  it("uses the requested solo bot nation instead of the first nation in the database",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain",commonsSetId:"classics",replacementPolicy:"none"},
      cardDb: cardDb([
        card({ id:"starter", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"bot_region", suit:"region", cardType:"attack", ownership:"bot", startingLocation:"bot_deck" })
      ]),
      nationDb:{
        first_nation:{ ...nationDb.test_nation_alpha, id:"first_nation", displayName:"First Nation" },
        requested_bot:{ ...nationDb.test_nation_alpha, id:"requested_bot", displayName:"Requested Bot" }
      },
      playerNationIds:{"0":"first_nation"},
      soloBotNationId:"requested_bot"
    });

    expect(G.solo?.bot.botNationId).toBe("requested_bot");
  });
  it("stores campaign-normalized Supreme Ruler difficulty in setup state",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain",campaignMode:"supreme_ruler",commonsSetId:"classics",replacementPolicy:"none"},
      cardDb: cardDb([
        card({ id:"starter", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"bot_region", suit:"region", cardType:"attack", ownership:"bot", startingLocation:"bot_deck" })
      ]),
      nationDb:{
        human_nation:{ ...nationDb.test_nation_alpha, id:"human_nation", displayName:"Human Nation" },
        requested_bot:{ ...nationDb.test_nation_alpha, id:"requested_bot", displayName:"Requested Bot" }
      },
      playerNationIds:{"0":"human_nation"},
      soloBotNationId:"requested_bot"
    });

    expect(G.options?.campaignMode).toBe("supreme_ruler");
    expect(G.options?.soloDifficulty).toBe("supreme_ruler");
    expect(G.solo?.bot.difficulty).toBe("supreme_ruler");
  });
  it("random solo bot setup skips nations excluded by the active ruleset options",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:["short_game"],soloDifficulty:"chieftain",commonsSetId:"classics",replacementPolicy:"none"},
      cardDb: cardDb([
        card({ id:"starter", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"bot_region", suit:"region", cardType:"attack", ownership:"bot", startingLocation:"bot_deck" })
      ]),
      nationDb:{
        excluded_bot:{ ...nationDb.test_nation_alpha, id:"excluded_bot", displayName:"Excluded Bot" },
        human_nation:{ ...nationDb.test_nation_alpha, id:"human_nation", displayName:"Human Nation" }
      },
      playerNationIds:{"0":"human_nation"},
      soloBotNationId:"random",
      privateData:{
        nationRulesets:[
          {
            nationId:"excluded_bot",
            displayName:"Excluded Bot Rules",
            rulesetTags:["short_game_excluded"],
            requiredExpansions:[],
            setupOverrides:[],
            zoneOverrides:[],
            stateOverrides:[],
            reshuffleOverrides:[],
            cleanupOverrides:[],
            solsticeOverrides:[],
            scoringOverrides:[],
            collapseOverrides:[],
            botOverrides:[],
            shortGameOverrides:[{ op:"excluded_from_short_game" }],
            hookRules:[],
            implemented:true,
            tested:true
          },
          {
            nationId:"human_nation",
            displayName:"Human Nation Rules",
            rulesetTags:["default_nation_deck"],
            requiredExpansions:[],
            setupOverrides:[],
            zoneOverrides:[],
            stateOverrides:[],
            reshuffleOverrides:[],
            cleanupOverrides:[],
            solsticeOverrides:[],
            scoringOverrides:[],
            collapseOverrides:[],
            botOverrides:[],
            shortGameOverrides:[],
            hookRules:[],
            implemented:true,
            tested:true
          }
        ]
      }
    } as any);

    expect(G.solo?.bot.botNationId).toBe("human_nation");
  });
  it("filters commons cards that conflict with the requested solo bot nation",()=>{
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain",commonsSetId:"classics",replacementPolicy:"none"},
      cardDb: cardDb([
        card({ id:"safe_market_1", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_2", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_3", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_4", suit:"none", smallDeckEligible:false }),
        card({ id:"safe_market_5", suit:"none", smallDeckEligible:false }),
        card({ id:"bot_conflict", suit:"none", smallDeckEligible:false, conflictsWithNationIds:["requested_bot"] }),
        card({ id:"starter", ownership:"nation", startingLocation:"draw_deck" }),
        card({ id:"bot_region", suit:"region", cardType:"attack", ownership:"bot", startingLocation:"bot_deck" })
      ]),
      nationDb:{
        human_nation:{ ...nationDb.test_nation_alpha, id:"human_nation", displayName:"Human Nation" },
        requested_bot:{ ...nationDb.test_nation_alpha, id:"requested_bot", displayName:"Requested Bot" }
      },
      playerNationIds:{"0":"human_nation"},
      soloBotNationId:"requested_bot"
    });

    expect([...(G.market ?? []), ...(G.marketDecks?.mainDeck ?? [])]).not.toContain("bot_conflict");
  });
  it("uses randomSeed to deterministically shuffle commons setup",()=>{
    const setupArgs = {
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"classics",replacementPolicy:"none"} as GameOptions,
      playerNationIds:{"0":"test_nation_alpha","1":"test_nation_alpha"},
      cardDb: cardDb(Array.from({ length: 12 }, (_, index) => card({
        id: `market_${index + 1}`,
        suit: "none",
        smallDeckEligible: false
      }))),
      nationDb
    };
    const sequence = (seed: string) => {
      const G = createInitialGameStateFromPipeline({ ...setupArgs, randomSeed: seed });
      return [...G.market, ...G.marketDecks!.mainDeck];
    };

    expect(sequence("seed-a")).toEqual(sequence("seed-a"));
    expect(sequence("seed-a")).not.toEqual(sequence("seed-b"));
  });
  it("shuffles regular Nation deck cards while leaving Accession separate and Development visible",()=>{
    const setupArgs = {
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:[],commonsSetId:"classics",replacementPolicy:"none"} as GameOptions,
      playerNationIds:{"0":"setup_nation","1":"setup_nation"},
      randomSeed:"parity-seed",
      cardDb: cardDb([
        ...Array.from({ length: 5 }, (_, index) => card({
          id: `market_${index + 1}`,
          suit: "none",
          smallDeckEligible: false
        })),
        ...["n1","n2","n3","n4","accession","dev1","dev2"].map((id) => card({
          id,
          ownership:"nation",
          startingLocation:"box",
          cardType: id === "accession" ? "accession" : id.startsWith("dev") ? "development" : "nation",
          tags: id === "accession" ? ["accession"] : []
        }))
      ]),
      nationDb:{
        setup_nation:{
          id:"setup_nation",
          displayName:"Setup Nation",
          powerCardIds:[],
          stateCardIds:[],
          startingDeckCardIds:[],
          nationDeckCardIds:["n1","n2","n3","n4"],
          accessionCardId:"accession",
          developmentCardIds:["dev1","dev2"],
          setupRules:[],
          passiveRules:[],
          actionTokensBase:3,
          exhaustTokensBase:5,
          requiredExpansions:[],
          implemented:true,
          tested:true
        }
      }
    };

    const G = createInitialGameStateFromPipeline(setupArgs);

    expect(G.players["0"].nationDeck).toEqual(["n3","n4","n2","n1"]);
    expect(G.players["0"].nationDeck).not.toContain("accession");
    expect(G.players["0"].accessionCardId).toBe("accession");
    expect(G.players["0"].developmentArea).toEqual(["dev1","dev2"]);
  });
  it("uses randomSeed to deterministically shuffle solo Bot setup",()=>{
    const setupArgs = {
      options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain",commonsSetId:"classics",replacementPolicy:"none"} as GameOptions,
      playerNationIds:{"0":"test_nation_alpha"},
      soloBotNationId:"bot_nation",
      cardDb: cardDb([
        ...Array.from({ length: 8 }, (_, index) => card({
          id: `market_${index + 1}`,
          suit: "none",
          smallDeckEligible: false
        })),
        ...Array.from({ length: 8 }, (_, index) => card({
          id: `bot_start_${index + 1}`,
          ownership: "bot",
          startingLocation: "bot_deck",
          smallDeckEligible: false,
          mainDeckEligible: false
        }))
      ]),
      nationDb:{
        ...nationDb,
        bot_nation:{ ...nationDb.test_nation_alpha, id:"bot_nation", displayName:"Bot Nation" }
      }
    };
    const sequence = (seed: string) => {
      const G = createInitialGameStateFromPipeline({ ...setupArgs, randomSeed: seed });
      const slotCards = Object.values(G.solo!.bot.slots).map((slot) => slot.cardId ?? "empty");
      return [...slotCards, ...G.solo!.bot.botDeck];
    };

    expect(sequence("seed-a")).toEqual(sequence("seed-a"));
    expect(sequence("seed-a")).not.toEqual(sequence("seed-b"));
  });
  it("passes randomSeed through the public initial-state entrypoint",()=>{
    const sequence = (seed: string) => {
      const G = createInitialGameState({ randomSeed: seed });
      return [...G.market, ...G.marketDecks!.mainDeck];
    };

    expect(sequence("seed-a")).toEqual(sequence("seed-a"));
    expect(sequence("seed-a")).not.toEqual(sequence("seed-b"));
  });
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
          id:"private_barbarian_state", displayName:"Private Barbarian", suit:"uncivilized", cardType:"state",
          cost:{materials:0,population:0,progress:0,goods:0},
          developmentCost:{materials:0,population:0,progress:0,goods:0},
          vp:{mode:"none",value:null}, startingLocation:"box", isTradeRouteExpansion:false,
          effects:[], tags:["barbarian"], implemented:true, tested:true, requiredExpansions:[], excludedExpansions:[]
        },
        {
          id:"private_empire_state", displayName:"Private Empire", suit:"civilized", cardType:"state",
          cost:{materials:0,population:0,progress:0,goods:0},
          developmentCost:{materials:0,population:0,progress:0,goods:0},
          vp:{mode:"none",value:null}, startingLocation:"box", isTradeRouteExpansion:false,
          effects:[], tags:["empire"], implemented:true, tested:true, requiredExpansions:[], excludedExpansions:[]
        },
        {
          id:"private_start", displayName:"Private Start", suit:"civilized", cardType:"action",
          cost:{materials:0,population:0,progress:0,goods:0},
          developmentCost:{materials:1,population:2,progress:3,goods:4},
          vp:{mode:"fixed",value:7}, startingLocation:"draw_deck", isTradeRouteExpansion:false,
          effects:[], tags:[], implemented:true, tested:true, requiredExpansions:[], excludedExpansions:[]
        },
        {
          id:"private_extra_unrest", displayName:"Private Extra Unrest", suit:"none", cardType:"action",
          cost:{materials:0,population:0,progress:0,goods:0},
          developmentCost:{materials:0,population:0,progress:0,goods:0},
          vp:{mode:"none",value:null}, startingLocation:"box", isTradeRouteExpansion:false,
          effects:[], tags:[], implemented:true, tested:true, requiredExpansions:[], excludedExpansions:[]
        }
      ]));
      fs.writeFileSync(privateNationPath, JSON.stringify([
        {
          id:"private_nation", displayName:"Private Nation", complexity:1,
          powerCardIds:["private_power"], stateCardIds:["private_barbarian_state","private_empire_state"], startingDeckCardIds:["private_start"],
          nationDeckCardIds:[], developmentCardIds:[], setupRules:[], passiveRules:[],
          actionTokensBase:1, exhaustTokensBase:1, requiredExpansions:[], excludedExpansions:[],
          implemented:true, tested:true
        }
      ]));
      fs.writeFileSync(privateRulesetPath, JSON.stringify([
        {
          nationId:"private_nation", displayName:"Private Rules", rulesetTags:["default_nation_deck"],
          requiredExpansions:[], excludedExpansions:[], setupOverrides:[{"op":"set_initial_resources","resources":{"materials":2}},{"op":"create_side_area","areaId":"quest_area","displayName":"Quest Area","public":true},{"op":"move_cards_to_unrest_supply","cardIds":["private_extra_unrest"]}],
          zoneOverrides:[{"op":"replace_history_with_zone","zoneId":"sunken","displayName":"Sunken","cardsScore":true}], stateOverrides:[{"op":"start_as_state","state":"empire"}], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[],
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
      expect(G.players["0"].stateArea).toEqual(["private_empire_state", "private_barbarian_state"]);
      expect(G.cardDb.private_start.vp).toEqual({ mode: "fixed", value: 7 });
      expect(G.cardDb.private_start.developmentCost).toEqual({ materials: 1, influence: 2, knowledge: 3, goods: 4 });
      expect(G.players["0"].resources.materials).toBe(2);
      expect(G.players["0"].sideAreas?.quest_area).toEqual([]);
      expect(G.players["0"].sideAreas?.sunken).toEqual([]);
      expect(G.unrestPile).toContain("private_extra_unrest");
      expect(G.activeNationRulesets?.["0"].nationId).toBe("private_nation");
      expect(G.activeNationStrategyProfiles?.["0"].displayName).toBe("Private Strategy");
    } finally {
      fs.rmSync(tmp, { recursive:true, force:true });
    }
  });
});
