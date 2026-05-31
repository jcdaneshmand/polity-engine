import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";

const cards:any = {
  a:{id:"a",displayName:"A",suit:"region",cardType:"attack",cost:{materials:0,population:0,progress:0,goods:0},developmentCost:{materials:0,population:0,progress:0,goods:0},vp:{mode:"none",value:null},startingLocation:"box",isTradeRouteExpansion:false,effects:[],tags:["aggressive"],implemented:false,tested:false,requiredExpansions:[],delayableInLoweredAggression:true,allowedModes:["multiplayer","solo","practice"]}
};
const nation:any = {id:"test_nation_sun_coast",displayName:"N",powerCardIds:[],stateCardIds:[],startingDeckCardIds:["a"],nationDeckCardIds:[],developmentCardIds:[],setupRules:[],passiveRules:[],actionTokensBase:1,exhaustTokensBase:1,requiredExpansions:[],implemented:false,tested:false};

const mainDeckCard = (id: string): any => ({
  id,
  displayName: id,
  suit: "none",
  cardType: "action",
  cost: { materials: 0, population: 0, progress: 0, goods: 0 },
  developmentCost: { materials: 0, population: 0, progress: 0, goods: 0 },
  vp: { mode: "none", value: null },
  startingLocation: "market",
  isTradeRouteExpansion: false,
  effects: [],
  tags: [],
  implemented: false,
  tested: false,
  requiredExpansions: [],
  excludedExpansions: [],
  allowedModes: ["multiplayer", "solo", "practice"],
  disallowedModes: [],
  ownership: "commons",
  commonsSetId: "classics",
  commonsGroup: "base",
  smallDeckEligible: false
});

const nationProgressionCard = (id: string): any => ({
  ...mainDeckCard(id),
  startingLocation: "nation_deck",
  ownership: "nation"
});

describe("variants",()=>{
  it("lowered aggression delays count",()=>{ const G=createInitialGameStateFromPipeline({ options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["lowered_aggression"]}, cardDb:cards, nationDb:{test_nation_sun_coast:nation}, playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"} }); expect(G.setupReport?.delayedAggressiveCount).toBeGreaterThanOrEqual(1); });
  it("quick_setup path used",()=>{ const G=createInitialGameStateFromPipeline({ options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["quick_setup"]}, cardDb:cards, nationDb:{test_nation_sun_coast:nation}, playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"} }); expect(G.setupReport?.usedQuickSetup).toBe(true); });
  it("short game setup exiles the top ten Main deck cards and advances two Nation cards per player",()=>{
    const marketCards = Object.fromEntries(Array.from({ length: 15 }, (_, index) => {
      const id = `main_${index + 1}`;
      return [id, mainDeckCard(id)];
    }));
    const nationCards = Object.fromEntries(["n1","n2","n3","n4"].map((id) => [id, nationProgressionCard(id)]));
    const shortNation = {
      ...nation,
      startingDeckCardIds: [],
      nationDeckCardIds: ["n1", "n2", "n3", "n4"]
    };
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
      cardDb:{...marketCards, ...nationCards},
      nationDb:{test_nation_sun_coast:shortNation},
      playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"}
    });

    expect(G.market).toEqual(["main_1", "main_2", "main_3", "main_4", "main_5"]);
    expect(G.marketDecks?.mainDeck).toEqual([]);
    expect(G.setupReport?.shortGameExiled).toBe(10);
    expect(G.players["0"].discard).toEqual(["n1", "n2"]);
    expect(G.players["0"].nationDeck).toEqual(["n3", "n4"]);
    expect(G.players["1"].discard).toEqual(["n1", "n2"]);
    expect(G.setupReport?.shortGameNationAdvanced).toBe(4);
  });
  it("practice setup exiles the top fifteen Main deck cards after Market setup",()=>{
    const marketCards = Object.fromEntries(Array.from({ length: 20 }, (_, index) => {
      const id = `main_${index + 1}`;
      return [id, mainDeckCard(id)];
    }));
    const G=createInitialGameStateFromPipeline({
      options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]},
      cardDb:marketCards,
      nationDb:{test_nation_sun_coast:{...nation, startingDeckCardIds:[]}},
      playerNationIds:{"0":"test_nation_sun_coast"}
    });

    expect(G.market).toEqual(["main_1", "main_2", "main_3", "main_4", "main_5"]);
    expect(G.marketDecks?.mainDeck).toEqual([]);
    expect(G.setupReport?.practiceModeExiled).toBe(15);
  });
  it("short game setup can remove starting Progress for nation exceptions",()=>{
    const rulesetPath = path.join(os.tmpdir(), `polity-short-game-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId:"test_nation_sun_coast",
        displayName:"Short Game Resource Exception",
        rulesetTags:["short_game_exception"],
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
        shortGameOverrides:[{op:"remove_starting_resource",resource:"knowledge",count:4}],
        hookRules:[],
        implemented:true,
        tested:true
      }]));
      const shortNation = {
        ...nation,
        startingDeckCardIds: [],
        nationDeckCardIds: [],
        setupRules: [{ op:"gain_resource", resource:"progress", count:6 }]
      };

      const G=createInitialGameStateFromPipeline({
        options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
        cardDb:{},
        nationDb:{test_nation_sun_coast:shortNation},
        playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"},
        usePrivateRules:true,
        privateRulesetPath:rulesetPath
      });

      expect(G.players["0"].resources.knowledge).toBe(3);
      expect(G.players["1"].resources.knowledge).toBe(3);
    } finally {
      fs.rmSync(rulesetPath, { force:true });
    }
  });
  it("short game setup can remove all starting non-Unrest resources for nation exceptions",()=>{
    const rulesetPath = path.join(os.tmpdir(), `polity-short-game-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId:"test_nation_sun_coast",
        displayName:"Short Game All Resource Exception",
        rulesetTags:["short_game_exception"],
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
        shortGameOverrides:[{op:"remove_starting_resources",resources:["materials","influence","knowledge","goods"]}],
        hookRules:[],
        implemented:true,
        tested:true
      }]));
      const shortNation = {
        ...nation,
        startingDeckCardIds: [],
        nationDeckCardIds: [],
        setupRules: [
          { op:"gain_resource", resource:"materials", count:2 },
          { op:"gain_resource", resource:"influence", count:3 },
          { op:"gain_resource", resource:"progress", count:4 },
          { op:"gain_resource", resource:"goods", count:5 },
          { op:"gain_resource", resource:"unrest", count:1 }
        ]
      };

      const G=createInitialGameStateFromPipeline({
        options:{playerCount:2,mode:"multiplayer",enabledExpansions:["trade_routes"],enabledVariants:["short_game"]},
        cardDb:{},
        nationDb:{test_nation_sun_coast:shortNation},
        playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"},
        usePrivateRules:true,
        privateRulesetPath:rulesetPath
      });

      expect(G.players["0"].resources).toMatchObject({ materials:0, influence:0, knowledge:0, goods:0, unrest:1 });
      expect(G.players["1"].resources).toMatchObject({ materials:0, influence:0, knowledge:0, goods:0, unrest:1 });
    } finally {
      fs.rmSync(rulesetPath, { force:true });
    }
  });
  it("short game setup can develop one Development for free and remove another",()=>{
    const rulesetPath = path.join(os.tmpdir(), `polity-short-game-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId:"test_nation_sun_coast",
        displayName:"Short Game Development Exception",
        rulesetTags:["short_game_exception"],
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
        shortGameOverrides:[{op:"develop_one_remove_one_development",developCardId:"dev_keep",removeCardId:"dev_remove"}],
        hookRules:[],
        implemented:true,
        tested:true
      }]));
      const shortNation = {
        ...nation,
        startingDeckCardIds: [],
        nationDeckCardIds: [],
        developmentCardIds: ["dev_keep", "dev_remove"]
      };

      const G=createInitialGameStateFromPipeline({
        options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
        cardDb:{
          dev_keep: nationProgressionCard("dev_keep"),
          dev_remove: nationProgressionCard("dev_remove")
        },
        nationDb:{test_nation_sun_coast:shortNation},
        playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"},
        usePrivateRules:true,
        privateRulesetPath:rulesetPath
      });

      expect(G.players["0"].discard).toEqual(["dev_keep"]);
      expect(G.players["0"].exile).toEqual(["dev_remove"]);
      expect(G.players["0"].developmentArea).toEqual([]);
      expect(G.players["1"].discard).toEqual(["dev_keep"]);
      expect(G.players["1"].exile).toEqual(["dev_remove"]);
      expect(G.players["1"].developmentArea).toEqual([]);
    } finally {
      fs.rmSync(rulesetPath, { force:true });
    }
  });
  it("short game setup can move selected Development cards to discard",()=>{
    const rulesetPath = path.join(os.tmpdir(), `polity-short-game-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId:"test_nation_sun_coast",
        displayName:"Short Game Development Discard Exception",
        rulesetTags:["short_game_exception"],
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
        shortGameOverrides:[{op:"move_development_cards_to_discard",cardIds:["winter_card","summer_card"]}],
        hookRules:[],
        implemented:true,
        tested:true
      }]));
      const shortNation = {
        ...nation,
        startingDeckCardIds: [],
        nationDeckCardIds: [],
        developmentCardIds: ["winter_card", "summer_card", "other_card"]
      };

      const G=createInitialGameStateFromPipeline({
        options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
        cardDb:{
          winter_card: nationProgressionCard("winter_card"),
          summer_card: nationProgressionCard("summer_card"),
          other_card: nationProgressionCard("other_card")
        },
        nationDb:{test_nation_sun_coast:shortNation},
        playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"},
        usePrivateRules:true,
        privateRulesetPath:rulesetPath
      });

      expect(G.players["0"].discard).toEqual(["winter_card", "summer_card"]);
      expect(G.players["0"].developmentArea).toEqual(["other_card"]);
      expect(G.players["1"].discard).toEqual(["winter_card", "summer_card"]);
      expect(G.players["1"].developmentArea).toEqual(["other_card"]);
    } finally {
      fs.rmSync(rulesetPath, { force:true });
    }
  });
  it("short game setup can move one advanced Nation card into a side area",()=>{
    const rulesetPath = path.join(os.tmpdir(), `polity-short-game-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId:"test_nation_sun_coast",
        displayName:"Short Game Side Area Exception",
        rulesetTags:["short_game_exception"],
        requiredExpansions:[],
        setupOverrides:[{op:"create_side_area",areaId:"mana_track",displayName:"Mana",public:true}],
        zoneOverrides:[],
        stateOverrides:[],
        reshuffleOverrides:[],
        cleanupOverrides:[],
        solsticeOverrides:[],
        scoringOverrides:[],
        collapseOverrides:[],
        botOverrides:[],
        shortGameOverrides:[{op:"move_one_advanced_nation_card_to_side_area",areaId:"mana_track"}],
        hookRules:[],
        implemented:true,
        tested:true
      }]));
      const shortNation = {
        ...nation,
        startingDeckCardIds: [],
        nationDeckCardIds: ["n1", "n2", "n3"]
      };

      const G=createInitialGameStateFromPipeline({
        options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
        cardDb:{
          n1: nationProgressionCard("n1"),
          n2: nationProgressionCard("n2"),
          n3: nationProgressionCard("n3")
        },
        nationDb:{test_nation_sun_coast:shortNation},
        playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"},
        usePrivateRules:true,
        privateRulesetPath:rulesetPath
      });

      expect(G.players["0"].discard).toEqual(["n2"]);
      expect(G.players["0"].sideAreas?.mana_track).toEqual(["n1"]);
      expect(G.players["0"].nationDeck).toEqual(["n3"]);
      expect(G.players["1"].discard).toEqual(["n2"]);
      expect(G.players["1"].sideAreas?.mana_track).toEqual(["n1"]);
      expect(G.setupReport?.shortGameNationAdvanced).toBe(4);
    } finally {
      fs.rmSync(rulesetPath, { force:true });
    }
  });
  it("short game setup can randomly move one advanced Nation card into a side area",()=>{
    const rulesetPath = path.join(os.tmpdir(), `polity-short-game-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId:"test_nation_sun_coast",
        displayName:"Short Game Random Side Area Exception",
        rulesetTags:["short_game_exception"],
        requiredExpansions:[],
        setupOverrides:[{op:"create_side_area",areaId:"mana_track",displayName:"Mana",public:true}],
        zoneOverrides:[],
        stateOverrides:[],
        reshuffleOverrides:[],
        cleanupOverrides:[],
        solsticeOverrides:[],
        scoringOverrides:[],
        collapseOverrides:[],
        botOverrides:[],
        shortGameOverrides:[{op:"move_one_advanced_nation_card_to_side_area",areaId:"mana_track",selection:"random"}],
        hookRules:[],
        implemented:true,
        tested:true
      }]));
      const shortNation = {
        ...nation,
        startingDeckCardIds: [],
        nationDeckCardIds: ["n1", "n2", "n3"]
      };

      const G=createInitialGameStateFromPipeline({
        options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
        cardDb:{
          n1: nationProgressionCard("n1"),
          n2: nationProgressionCard("n2"),
          n3: nationProgressionCard("n3")
        },
        nationDb:{test_nation_sun_coast:shortNation},
        playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"},
        usePrivateRules:true,
        privateRulesetPath:rulesetPath,
        randomSeed:"a"
      });

      for (const playerId of ["0","1"]) {
        const p = G.players[playerId];
        const sideCards = p.sideAreas?.mana_track ?? [];
        const advancedCards = [...p.discard, ...sideCards];
        expect(sideCards).toHaveLength(1);
        expect(advancedCards).toHaveLength(2);
        expect(new Set(advancedCards).size).toBe(2);
        expect(["n1","n2","n3"]).toEqual(expect.arrayContaining(advancedCards));
        expect(p.nationDeck).toHaveLength(1);
        expect(["n1","n2","n3"]).toContain(p.nationDeck[0]);
      }
    } finally {
      fs.rmSync(rulesetPath, { force:true });
    }
  });
  it("short game setup can garrison a development card and add the next Nation card to the starting deck",()=>{
    const rulesetPath = path.join(os.tmpdir(), `polity-short-game-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId:"test_nation_sun_coast",
        displayName:"Short Game Quest Exception",
        rulesetTags:["short_game_exception"],
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
        shortGameOverrides:[{
          op:"garrison_development_and_add_nation_to_starting_deck",
          developmentCardId:"quest_card",
          hostCardId:"court_card"
        }],
        hookRules:[],
        implemented:true,
        tested:true
      }]));
      const shortNation = {
        ...nation,
        powerCardIds: ["court_card"],
        startingDeckCardIds: [],
        nationDeckCardIds: ["n1", "n2", "n3", "n4"],
        developmentCardIds: ["quest_card", "graal_card"]
      };

      const G=createInitialGameStateFromPipeline({
        options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["short_game"]},
        cardDb:{
          court_card: nationProgressionCard("court_card"),
          quest_card: nationProgressionCard("quest_card"),
          graal_card: nationProgressionCard("graal_card"),
          n1: nationProgressionCard("n1"),
          n2: nationProgressionCard("n2"),
          n3: nationProgressionCard("n3"),
          n4: nationProgressionCard("n4")
        },
        nationDb:{test_nation_sun_coast:shortNation},
        playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"},
        usePrivateRules:true,
        privateRulesetPath:rulesetPath
      });

      expect(G.players["0"].discard).toEqual(["n1", "n2"]);
      expect(G.players["0"].hand).toEqual(["n3"]);
      expect(G.players["0"].deck).toEqual([]);
      expect(G.players["0"].nationDeck).toEqual(["n4"]);
      expect(G.players["0"].developmentArea).toEqual(["graal_card"]);
      expect(G.cardStates?.court_card?.garrisonedCardIds).toEqual(["quest_card"]);
      expect(G.players["1"].discard).toEqual(["n1", "n2"]);
      expect(G.players["1"].hand).toEqual(["n3"]);
      expect(G.players["1"].deck).toEqual([]);
      expect(G.players["1"].developmentArea).toEqual(["graal_card"]);
      expect(G.setupReport?.shortGameNationAdvanced).toBe(4);
    } finally {
      fs.rmSync(rulesetPath, { force:true });
    }
  });
});
