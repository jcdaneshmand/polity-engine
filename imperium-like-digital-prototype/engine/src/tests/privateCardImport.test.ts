import { describe, expect, it } from "vitest";
import { validatePrivateCardsRows } from "../../../tools/card-import/validatePrivateCards";
import { normalizeCard } from "../../../tools/card-import/normalizeCard";

describe("private card import", () => {
  const base = { card_id:"a",source_box:"x",set_or_nation:"s",card_name_private:"Private A",public_placeholder_name:"Placeholder A",suit:"region",card_type:"action",state_requirement:"",cost_materials:"",cost_population:"",cost_progress:"",cost_goods:"",development_cost_materials:"",development_cost_population:"",development_cost_progress:"",development_cost_goods:"",vp_mode:"none",vp_value:"",starting_location:"draw_deck",player_count_requirement:"",is_trade_route_expansion:"false",raw_effect_text_private:"",effect_ops_json:"[]",tags:"knowledge|region",notes:"",implemented:"true",tested:"false" };
  it("valid row parses",()=>expect(validatePrivateCardsRows([base]).counts.fatal).toBe(0));
  it("duplicate id fatal",()=>expect(validatePrivateCardsRows([base,{...base}]).counts.fatal).toBeGreaterThan(0));
  it("invalid enum fatal",()=>expect(validatePrivateCardsRows([{...base,suit:"bad"}]).counts.fatal).toBeGreaterThan(0));
  it("accepts every runtime card type in private card rows and effect filters",()=> {
    const runtimeTypes = ["action","unit","technology","legacy","in_play","attack","power","state","development","accession","nation","region","unrest","fame","trade_route","bot_state","other"];

    const rows = runtimeTypes.map((cardType, index) => ({
      ...base,
      card_id: `card_type_${index}`,
      card_type: cardType,
      effect_ops_json: JSON.stringify([{trigger:"on_play",op:"find_card",sourceZones:["hand"],cardType,destination:"discard"}])
    }));

    expect(validatePrivateCardsRows(rows).counts.fatal).toBe(0);
  });
  it("invalid explicit suit icon fatal",()=> {
    const report = validatePrivateCardsRows([{...base,suit_icons:"civilized|bad_icon"}]);
    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.some((e)=>e.field==="suit_icons" && e.message.includes("bad_icon"))).toBe(true);
  });
  it("requires explicit multi-suit icons for multi-suit cards",()=> {
    const report = validatePrivateCardsRows([
      {...base,card_id:"multi_blank",suit:"multi",suit_icons:""},
      {...base,card_id:"multi_single",suit:"multi",suit_icons:"civilized"}
    ]);

    expect(report.counts.fatal).toBe(2);
    expect(report.errors).toEqual(expect.arrayContaining([
      { level: "fatal", row: 2, field: "suit_icons", message: "Multi-suit cards require at least two suit_icons" },
      { level: "fatal", row: 3, field: "suit_icons", message: "Multi-suit cards require at least two suit_icons" }
    ]));
  });
  it("rejects non-icon values in explicit suit icons",()=> {
    const report = validatePrivateCardsRows([
      {...base,card_id:"bad_icon_multi",suit:"civilized",suit_icons:"civilized|multi"},
      {...base,card_id:"bad_icon_none",suit:"uncivilized",suit_icons:"none"},
      {...base,card_id:"bad_icon_military",suit:"civilized",suit_icons:"military"}
    ]);

    expect(report.counts.fatal).toBe(3);
    expect(report.errors).toEqual(expect.arrayContaining([
      { level: "fatal", row: 2, field: "suit_icons", message: "Invalid suit_icons: multi" },
      { level: "fatal", row: 3, field: "suit_icons", message: "Invalid suit_icons: none" },
      { level: "fatal", row: 4, field: "suit_icons", message: "Invalid suit_icons: military" }
    ]));
  });
  it("rejects non-setup values in setup banner suit",()=> {
    const report = validatePrivateCardsRows([
      {...base,card_id:"banner_multi",setup_banner_suit:"multi"},
      {...base,card_id:"banner_power",setup_banner_suit:"power"},
      {...base,card_id:"banner_trade_route",setup_banner_suit:"trade_route"}
    ]);

    expect(report.counts.fatal).toBe(3);
    expect(report.errors).toEqual(expect.arrayContaining([
      { level: "fatal", row: 2, field: "setup_banner_suit", message: "Invalid setup_banner_suit" },
      { level: "fatal", row: 3, field: "setup_banner_suit", message: "Invalid setup_banner_suit" },
      { level: "fatal", row: 4, field: "setup_banner_suit", message: "Invalid setup_banner_suit" }
    ]));
  });
  it("rejects malformed state requirement delimiters before runtime",()=> {
    const report = validatePrivateCardsRows([
      {...base,card_id:"state_only_delimiter",state_requirement:"|"},
      {...base,card_id:"state_trailing_delimiter",state_requirement:"barbarian|"},
      {...base,card_id:"state_repeated_delimiter",state_requirement:"barbarian||empire"}
    ]);

    expect(report.counts.fatal).toBe(3);
    expect(report.errors).toEqual(expect.arrayContaining([
      { level: "fatal", row: 2, field: "state_requirement", message: "Invalid state_requirement" },
      { level: "fatal", row: 3, field: "state_requirement", message: "Invalid state_requirement" },
      { level: "fatal", row: 4, field: "state_requirement", message: "Invalid state_requirement" }
    ]));
  });
  it("invalid effect json fatal",()=>expect(validatePrivateCardsRows([{...base,effect_ops_json:"{"}]).counts.fatal).toBeGreaterThan(0));
  it("unsupported effect op fatal",()=> {
    const report=validatePrivateCardsRows([{...base,effect_ops_json:JSON.stringify([{trigger:"on_play",op:"not_a_real_op"}])}]);
    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.some((e)=>e.field==="effect_ops_json" && e.message==="Unsupported effect op: not_a_real_op")).toBe(true);
  });
  it("invalid or missing effect trigger fatal",()=> {
    const effect_ops_json=JSON.stringify([
      {trigger:"after_reshuffle",op:"gain_resource",resource:"materials",amount:1},
      {op:"draw",count:1}
    ]);

    const report=validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(2);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported effect trigger at effect_ops_json[0]: after_reshuffle",
      "Unsupported effect trigger at effect_ops_json[1]: missing"
    ]));
  });
  it("current engine effect ops validate, including nested choices and Exile/Unrest effects",()=> {
    const effect_ops_json=JSON.stringify([
      {trigger:"on_play",op:"draw",count:1},
      {trigger:"on_play",op:"draw",count:2,upTo:true},
      {trigger:"on_play",op:"draw",source:"discard",count:1},
      {trigger:"on_play",op:"draw_if_able",count:1},
      {trigger:"on_play",op:"draw_if_able",count:2,upTo:true},
      {trigger:"on_play",op:"draw",count:1,targetPlayerScope:"others",optionalForTargets:true},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1,targetPlayerScope:"all"},
      {trigger:"on_play",op:"spend_resource",resource:"materials",amount:1},
      {trigger:"on_play",op:"remove_resource",resource:"materials",amount:1},
      {trigger:"on_play",op:"return_resource",resource:"materials",amount:1},
      {trigger:"on_play",op:"steal_resource",fromPlayerId:"1",resource:"materials",amount:1},
      {trigger:"on_play",op:"steal_resource",fromPlayerIds:["1","2"],resource:"materials",amount:1,ifUnable:[
        {trigger:"on_play",op:"gain_resource",resource:"knowledge",amount:1}
      ],attackTargeted:true},
      {trigger:"on_play",op:"steal_resource",targetPlayerScope:"others",resource:"materials",amount:1,ifUnable:[
        {trigger:"on_play",op:"gain_resource",resource:"knowledge",amount:1}
      ]},
      {trigger:"on_play",op:"discard_random",count:1},
      {trigger:"on_play",op:"discard_cards",count:1},
      {trigger:"on_play",op:"acquire_card",source:"exile",suit:"civilized",count:1},
      {trigger:"on_play",op:"acquire_card",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"acquire_card",source:"market",cardType:"action",count:1},
      {trigger:"on_play",op:"gain_card",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"take_card",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"break_through",source:"exile",suit:"civilized",count:1},
      {trigger:"on_play",op:"break_through",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"take_unrest",targetPlayerIds:["1","0"],count:1},
      {trigger:"on_play",op:"take_unrest",targetPlayerIds:["1"],count:1,attackTargeted:true},
      {trigger:"on_play",op:"take_unrest",targetPlayerScope:"others",count:1},
      {trigger:"on_play",op:"return_unrest"},
      {trigger:"on_play",op:"return_fame",sourceZones:["discard"],cardId:"fame_card"},
      {trigger:"on_play",op:"place_card_on_deck"},
      {trigger:"on_play",op:"give_card"},
      {trigger:"on_play",op:"swap_card"},
      {trigger:"on_play",op:"gain_fame",count:1},
      {trigger:"on_play",op:"gain_action",amount:1},
      {trigger:"on_play",op:"spend_action",amount:1},
      {trigger:"on_play",op:"return_exhaust_token"},
      {trigger:"on_play",op:"free_play_card",cardId:"hand_action",suit:"civilized",cardType:"action",ignoreStateRequirement:true},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_gain_resource",resource:"knowledge",sourceSuit:"civilized"}},
      {trigger:"on_play",op:"trigger_scoring",reason:"card_effect"},
      {trigger:"on_play",op:"treat_suit_as",from:"uncivilized",to:["civilized"]},
      {trigger:"on_play",op:"garrison_card",hostCardId:"region_a",cardId:"hand_a"},
      {trigger:"on_play",op:"garrison_card"},
      {trigger:"on_play",op:"recall_region",cardId:"region_a"},
      {trigger:"on_play",op:"abandon_region",cardId:"region_b"},
      {trigger:"on_play",op:"recall_region",count:2},
      {trigger:"on_play",op:"abandon_region",count:2},
      {trigger:"on_play",op:"recall_region",targetPlayerScope:"others"},
      {trigger:"on_play",op:"abandon_region",targetPlayerIds:["1","2"]},
      {trigger:"on_play",op:"develop"},
      {trigger:"on_play",op:"develop",free:true},
      {trigger:"on_play",op:"exile_card",source:"market",cardId:"market_card"},
      {trigger:"on_play",op:"look_cards",source:"deck",count:2},
      {trigger:"on_play",op:"conditional_resource_at_least",resource:"materials",atLeast:1,then:[
        {trigger:"on_play",op:"draw_if_able",count:1}
      ],else:[
        {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1}
      ]},
      {trigger:"on_play",op:"conditional_state_is",state:"barbarian",then:[
        {trigger:"on_play",op:"draw_if_able",count:1}
      ],else:[
        {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1}
      ]},
      {trigger:"on_play",op:"choose_one",choices:[
        [{trigger:"on_play",op:"gain_resource",resource:"materials",amount:1}],
        [{trigger:"on_play",op:"optional",effects:[{trigger:"on_play",op:"draw_if_able",count:1}]}]
      ]}
    ]);
    expect(validatePrivateCardsRows([{...base,effect_ops_json}]).counts.fatal).toBe(0);
  });
  it("preserves free Develop metadata from private card imports",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"develop",free:true}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(0);
    expect(normalizeCard({...base,effect_ops_json} as any).effects).toEqual([
      {trigger:"on_play",op:"develop",free:true}
    ]);
  });
  it("preserves free-play card metadata from private card imports",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"free_play_card",cardId:"hand_action",suit:"civilized",cardType:"action",ignoreStateRequirement:true}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(0);
    expect(normalizeCard({...base,effect_ops_json} as any).effects).toEqual([
      {trigger:"on_play",op:"free_play_card",cardId:"hand_action",suit:"civilized",cardType:"action",ignoreStateRequirement:true}
    ]);
  });
  it("rejects empty nested effect branches before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"optional",effects:[]},
      {trigger:"on_play",op:"commerce",effects:[]},
      {trigger:"on_play",op:"profit",effects:[]},
      {trigger:"on_play",op:"choose_one",choices:[]},
      {trigger:"on_play",op:"choose_one",choices:[[]]},
      {trigger:"on_play",op:"conditional_resource_at_least",resource:"materials",atLeast:1,then:[]},
      {trigger:"on_play",op:"conditional_state_is",state:"barbarian",then:[],else:[]}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(8);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "effect_ops_json[0].effects must contain at least one effect",
      "effect_ops_json[1].effects must contain at least one effect",
      "effect_ops_json[2].effects must contain at least one effect",
      "effect_ops_json[3].choices must contain at least one choice",
      "effect_ops_json[4].choices[0] must contain at least one effect",
      "effect_ops_json[5].then must contain at least one effect",
      "effect_ops_json[6].then must contain at least one effect",
      "effect_ops_json[6].else must contain at least one effect"
    ]));
  });
  it("rejects effect parameters outside the current engine source and suit model",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_card",source:"exile",suit:"civilized",count:1},
      {trigger:"on_play",op:"take_card",source:"discard",suit:"civilized",count:1},
      {trigger:"on_play",op:"break_through",source:"fameDeck",suit:"civilized",count:1},
      {trigger:"on_play",op:"look_cards",source:"discard",count:1},
      {trigger:"on_play",op:"exile_card",source:"nationDeck",suit:"civilized"},
      {trigger:"on_play",op:"acquire_card",source:"market",suit:"bad_suit",count:1},
      {trigger:"on_play",op:"find_card",sourceZones:["hand"],cardType:"bad_type",destination:"discard"}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(7);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid source for gain_card at effect_ops_json[0]: exile",
      "Invalid source for take_card at effect_ops_json[1]: discard",
      "Invalid source for break_through at effect_ops_json[2]: fameDeck",
      "Invalid source for look_cards at effect_ops_json[3]: discard",
      "Invalid source for exile_card at effect_ops_json[4]: nationDeck",
      "Invalid suit for acquire_card at effect_ops_json[5]: bad_suit",
      "Invalid cardType for find_card at effect_ops_json[6]: bad_type"
    ]));
  });
  it("rejects Break through suit filters outside the Common setup suits",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"break_through",source:"deck",suit:"fame",count:1},
      {trigger:"on_play",op:"break_through",source:"market",suit:"power",count:1},
      {trigger:"on_play",op:"break_through",source:"exile",suit:"multi",count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(3);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit for break_through at effect_ops_json[0]: fame",
      "Invalid suit for break_through at effect_ops_json[1]: power",
      "Invalid suit for break_through at effect_ops_json[2]: multi"
    ]));
  });
  it("rejects unsupported Break through card-type filters before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"break_through",source:"market",suit:"civilized",cardType:"action",count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Invalid cardType for break_through at effect_ops_json[0]: action");
  });
  it("rejects unsupported Draw-if-able source filters before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"draw_if_able",source:"discard",count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Invalid source for draw_if_able at effect_ops_json[0]: discard");
  });
  it("rejects unsupported targeted Develop effects before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"develop",cardId:"specific_development"}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Invalid cardId for develop at effect_ops_json[0]: specific_development");
  });
  it("rejects unsupported targeted Move-self-to-history effects before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"move_self_to_history",cardId:"other_card"}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Invalid cardId for move_self_to_history at effect_ops_json[0]: other_card");
  });
  it("rejects cardId on effect ops that do not support card targets before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",cardId:"specific_fame",count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Invalid cardId for gain_fame at effect_ops_json[0]: specific_fame");
  });
  it("rejects unsupported target fields on unrelated effect ops before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",hostCardId:"region_a",count:1},
      {trigger:"on_play",op:"gain_fame",marketCardId:"market_a",count:1},
      {trigger:"on_play",op:"take_unrest",targetPlayerId:"1",count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(3);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid hostCardId for gain_fame at effect_ops_json[0]: region_a",
      "Invalid marketCardId for gain_fame at effect_ops_json[1]: market_a",
      "Invalid targetPlayerId for take_unrest at effect_ops_json[2]: 1"
    ]));
  });
  it("rejects unsupported player target fields on unrelated effect ops before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",targetPlayerIds:["1"],count:1},
      {trigger:"on_play",op:"gain_fame",fromPlayerId:"1",count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(2);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid targetPlayerIds for gain_fame at effect_ops_json[0]",
      "Invalid fromPlayerId for gain_fame at effect_ops_json[1]: 1"
    ]));
  });
  it("rejects unsupported scalar control fields on unrelated effect ops before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",reason:"manual_score",count:1},
      {trigger:"on_play",op:"gain_fame",state:"barbarian",count:1},
      {trigger:"on_play",op:"gain_fame",from:"uncivilized",count:1},
      {trigger:"on_play",op:"gain_fame",to:["civilized"],count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(4);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid reason for gain_fame at effect_ops_json[0]: manual_score",
      "Invalid state for gain_fame at effect_ops_json[1]: barbarian",
      "Invalid from for gain_fame at effect_ops_json[2]: uncivilized",
      "Invalid to for gain_fame at effect_ops_json[3]"
    ]));
  });
  it("rejects unsupported nested control fields on unrelated effect ops before runtime",()=> {
    const nested = [{trigger:"on_play",op:"draw_if_able",count:1}];
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",effects:nested,count:1},
      {trigger:"on_play",op:"gain_fame",choices:[nested],count:1},
      {trigger:"on_play",op:"gain_fame",then:nested,count:1},
      {trigger:"on_play",op:"gain_fame",else:nested,count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(4);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid effects for gain_fame at effect_ops_json[0]",
      "Invalid choices for gain_fame at effect_ops_json[1]",
      "Invalid then for gain_fame at effect_ops_json[2]",
      "Invalid else for gain_fame at effect_ops_json[3]"
    ]));
  });
  it("rejects unsupported source and destination fields on unrelated effect ops before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",source:"deck",count:1},
      {trigger:"on_play",op:"gain_fame",sourceZones:["discard"],count:1},
      {trigger:"on_play",op:"gain_fame",sourceZone:"discard",count:1},
      {trigger:"on_play",op:"gain_fame",destination:"discard",count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(4);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid source for gain_fame at effect_ops_json[0]: deck",
      "Invalid sourceZones for gain_fame at effect_ops_json[1]",
      "Invalid sourceZone for gain_fame at effect_ops_json[2]",
      "Invalid destination for gain_fame at effect_ops_json[3]: discard"
    ]));
  });
  it("rejects unsupported scalar payload fields on unrelated effect ops before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",suit:"civilized",count:1},
      {trigger:"on_play",op:"gain_fame",cardType:"action",count:1},
      {trigger:"on_play",op:"gain_fame",resource:"materials",count:1},
      {trigger:"on_play",op:"gain_action",amount:1,count:1},
      {trigger:"on_play",op:"gain_fame",amount:1,count:1},
      {trigger:"on_play",op:"gain_fame",atLeast:1,count:1}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(6);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit for gain_fame at effect_ops_json[0]: civilized",
      "Invalid cardType for gain_fame at effect_ops_json[1]: action",
      "Invalid resource for gain_fame at effect_ops_json[2]: materials",
      "Invalid count for gain_action at effect_ops_json[3]: 1",
      "Invalid amount for gain_fame at effect_ops_json[4]: 1",
      "Invalid atLeast for gain_fame at effect_ops_json[5]: 1"
    ]));
  });
  it("rejects unknown effect fields before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_fame",count:1,bonus:"ignored"}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Unsupported effect field at effect_ops_json[0]: bonus");
  });
  it("rejects invalid numeric effect payloads before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"draw",count:0},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:"1"},
      {trigger:"on_play",op:"take_unrest",count:"one"},
      {trigger:"on_play",op:"acquire_card",source:"market",suit:"civilized",count:-1},
      {trigger:"on_play",op:"conditional_resource_at_least",resource:"materials",atLeast:"2",then:[
        {trigger:"on_play",op:"gain_action",amount:0}
      ]},
      {trigger:"on_play",op:"optional",effects:[
        {trigger:"on_play",op:"look_cards",source:"deck",count:1.5}
      ]}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(7);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid count for draw at effect_ops_json[0]: 0",
      "Invalid amount for gain_resource at effect_ops_json[1]: 1",
      "Invalid count for take_unrest at effect_ops_json[2]: one",
      "Invalid count for acquire_card at effect_ops_json[3]: -1",
      "Invalid atLeast for conditional_resource_at_least at effect_ops_json[4]: 2",
      "Invalid amount for gain_action at effect_ops_json[4].then[0]: 0",
      "Invalid count for look_cards at effect_ops_json[5].effects[0]: 1.5"
    ]));
  });
  it("rejects invalid effect destinations before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"find_card",sourceZones:["hand"],destination:"market",suit:"region"},
      {trigger:"on_play",op:"acquire_card",source:"market",destination:"history",suit:"civilized",count:1},
      {trigger:"on_play",op:"gain_card",source:"market",destination:"deck",suit:"civilized",count:1},
      {trigger:"on_play",op:"take_card",source:"market",destination:"exile",suit:"civilized",count:1},
      {trigger:"on_play",op:"profit",destination:"deck",effects:[
        {trigger:"on_play",op:"draw_if_able",count:1}
      ]}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(5);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid destination for find_card at effect_ops_json[0]: market",
      "Invalid destination for acquire_card at effect_ops_json[1]: history",
      "Invalid destination for gain_card at effect_ops_json[2]: deck",
      "Invalid destination for take_card at effect_ops_json[3]: exile",
      "Invalid destination for profit at effect_ops_json[4]: deck"
    ]));
  });
  it("rejects missing required effect fields before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"gain_card",suit:"civilized",count:1},
      {trigger:"on_play",op:"take_card",suit:"civilized",count:1},
      {trigger:"on_play",op:"break_through",source:"market",count:1},
      {trigger:"on_play",op:"look_cards",count:1},
      {trigger:"on_play",op:"exile_card",suit:"civilized"},
      {trigger:"on_play",op:"find_card",sourceZones:["hand"],suit:"region"},
      {trigger:"on_play",op:"steal_resource",resource:"materials",amount:1},
      {trigger:"on_play",op:"conditional_state_is",then:[
        {trigger:"on_play",op:"draw_if_able",count:1}
      ]},
      {trigger:"on_play",op:"trigger_scoring"},
      {trigger:"on_play",op:"gain_resource",amount:1},
      {trigger:"on_play",op:"spend_resource",amount:1},
      {trigger:"on_play",op:"remove_resource",amount:1},
      {trigger:"on_play",op:"return_resource",amount:1},
      {trigger:"on_play",op:"steal_resource",fromPlayerId:"1",amount:1},
      {trigger:"on_play",op:"conditional_resource_at_least",atLeast:1,then:[
        {trigger:"on_play",op:"draw_if_able",count:1}
      ]}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(15);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Missing source for gain_card at effect_ops_json[0]",
      "Missing source for take_card at effect_ops_json[1]",
      "Missing suit for break_through at effect_ops_json[2]",
      "Missing source for look_cards at effect_ops_json[3]",
      "Missing source for exile_card at effect_ops_json[4]",
      "Invalid destination for find_card at effect_ops_json[5]: undefined",
      "Missing fromPlayerId for steal_resource at effect_ops_json[6]",
      "Missing state for conditional_state_is at effect_ops_json[7]",
      "Missing reason for trigger_scoring at effect_ops_json[8]",
      "Missing resource for gain_resource at effect_ops_json[9]",
      "Missing resource for spend_resource at effect_ops_json[10]",
      "Missing resource for remove_resource at effect_ops_json[11]",
      "Missing resource for return_resource at effect_ops_json[12]",
      "Missing resource for steal_resource at effect_ops_json[13]",
      "Missing resource for conditional_resource_at_least at effect_ops_json[14]"
    ]));
  });
  it("rejects empty Treat As replacement lists before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"treat_suit_as",from:"uncivilized",to:[]}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Invalid to for treat_suit_as at effect_ops_json[0]");
  });
  it("rejects non-icon Treat As suit values before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"treat_suit_as",from:"none",to:["civilized"]},
      {trigger:"on_play",op:"treat_suit_as",from:"uncivilized",to:["multi"]}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(2);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid from for treat_suit_as at effect_ops_json[0]: none",
      "Invalid to for treat_suit_as at effect_ops_json[1]"
    ]));
  });
  it("rejects malformed effect identifier fields before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_play",op:"give_card",cardId:1,targetPlayerId:["1"]},
      {trigger:"on_play",op:"take_unrest",count:1,targetPlayerIds:"1"},
      {trigger:"on_play",op:"gain_fame",count:1,targetPlayerScope:"all"},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1,targetPlayerScope:"neighbor"},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1,optionalForTargets:true},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1,fromPlayerIds:["1"]},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1,ifUnable:[
        {trigger:"on_play",op:"draw_if_able",count:1}
      ]},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1,attackTargeted:true},
      {trigger:"on_play",op:"take_unrest",targetPlayerIds:["1"],count:1,attackTargeted:"yes"},
      {trigger:"on_play",op:"steal_resource",resource:"materials",amount:1,targetPlayerScope:"others",fromPlayerIds:"1"},
      {trigger:"on_play",op:"steal_resource",resource:"materials",amount:1,targetPlayerScope:"others",ifUnable:[]},
      {trigger:"on_play",op:"recall_region",targetPlayerIds:"1"},
      {trigger:"on_play",op:"garrison_card",hostCardId:1,cardId:false},
      {trigger:"on_play",op:"swap_card",sourceZone:"hand",marketCardId:false},
      {trigger:"on_play",op:"find_card",sourceZones:[],destination:"discard",suit:"region"},
      {trigger:"on_play",op:"place_card_on_deck",sourceZone:"deck"}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(18);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardId for give_card at effect_ops_json[0]: 1",
      "Invalid targetPlayerId for give_card at effect_ops_json[0]: 1",
      "Invalid targetPlayerIds for take_unrest at effect_ops_json[1]",
      "Invalid targetPlayerScope for gain_fame at effect_ops_json[2]: all",
      "Invalid targetPlayerScope for gain_resource at effect_ops_json[3]: neighbor",
      "Invalid optionalForTargets for gain_resource at effect_ops_json[4]: true",
      "Invalid fromPlayerIds for gain_resource at effect_ops_json[5]",
      "Invalid ifUnable for gain_resource at effect_ops_json[6]",
      "Invalid attackTargeted for gain_resource at effect_ops_json[7]: true",
      "Invalid attackTargeted for take_unrest at effect_ops_json[8]: yes",
      "Invalid fromPlayerIds for steal_resource at effect_ops_json[9]",
      "effect_ops_json[10].ifUnable must contain at least one effect",
      "Invalid targetPlayerIds for recall_region at effect_ops_json[11]",
      "Invalid hostCardId for garrison_card at effect_ops_json[12]: 1",
      "Invalid cardId for garrison_card at effect_ops_json[12]: false",
      "Invalid marketCardId for swap_card at effect_ops_json[13]: false",
      "Invalid sourceZones for find_card at effect_ops_json[14]",
      "Invalid sourceZone for place_card_on_deck at effect_ops_json[15]"
    ]));
  });
  it("rejects malformed reactive Exhaust metadata before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_draw"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_play_card",target:"neighbor"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_gain_resource",sourceSuit:"bad_suit"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:"after_gain_resource"},
      {trigger:"on_play",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_gain_resource"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_gain_resource",target:"self"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_play_card",sourceSuit:"civilized"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_play_card",resource:"materials"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_gain_resource",sourceSuit:"none"}},
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_gain_resource",sourceSuit:"multi"}}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(10);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid reactive trigger at effect_ops_json[0]: after_draw",
      "Invalid reactive target at effect_ops_json[1]: neighbor",
      "Invalid reactive sourceSuit at effect_ops_json[2]: bad_suit",
      "Invalid reactive metadata at effect_ops_json[3]",
      "Reactive metadata is only valid on on_exhaust effects at effect_ops_json[4]",
      "Invalid reactive target at effect_ops_json[5]: self",
      "Invalid reactive sourceSuit at effect_ops_json[6]: civilized",
      "Invalid reactive resource at effect_ops_json[7]: materials",
      "Invalid reactive sourceSuit at effect_ops_json[8]: none",
      "Invalid reactive sourceSuit at effect_ops_json[9]: multi"
    ]));
  });
  it("rejects unknown reactive Exhaust metadata fields before runtime",()=> {
    const effect_ops_json = JSON.stringify([
      {trigger:"on_exhaust",op:"gain_resource",resource:"materials",amount:1,reactive:{trigger:"after_gain_resource",bonus:"ignored"}}
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors.map((e)=>e.message)).toContain("Unsupported reactive field at effect_ops_json[0]: bonus");
  });
  it("Trade Routes effect ops validate, including Commerce and Profit nested effects",()=> {
    const effect_ops_json=JSON.stringify([
      {trigger:"on_play",op:"trade"},
      {trigger:"on_play",op:"commerce",effects:[{trigger:"on_play",op:"gain_resource",resource:"materials",amount:1}]},
      {trigger:"on_play",op:"profit",effects:[{trigger:"on_play",op:"draw_if_able",count:1}]}
    ]);
    expect(validatePrivateCardsRows([{...base,effect_ops_json,required_expansions:"trade_routes"}]).counts.fatal).toBe(0);
  });
  it("raw text without ops warning",()=>expect(validatePrivateCardsRows([{...base,raw_effect_text_private:"x",effect_ops_json:""}]).counts.warnings).toBeGreaterThan(0));
  it("implemented true tested false warning",()=>expect(validatePrivateCardsRows([base]).counts.warnings).toBeGreaterThan(0));
  it("identical names warning",()=>expect(validatePrivateCardsRows([{...base,public_placeholder_name:"Private A"}]).counts.warnings).toBeGreaterThan(0));
  it("normalization defaults cost",()=>expect(normalizeCard(base).cost.materials).toBe(0));
  it("tags parse",()=>expect(normalizeCard(base).tags).toEqual(["knowledge","region"]));
  it("normalizes rulebook resource names inside nested effect ops to engine resource keys",()=> {
    const effect_ops_json = JSON.stringify([
      { trigger:"on_play", op:"gain_resource", resource:"population", amount:1 },
      { trigger:"on_play", op:"optional", effects:[
        { trigger:"on_play", op:"spend_resource", resource:"progress", amount:1 }
      ] },
      { trigger:"on_play", op:"choose_one", choices:[
        [{ trigger:"on_play", op:"remove_resource", resource:"goods", amount:1 }],
        [{ trigger:"on_play", op:"conditional_resource_at_least", resource:"population", atLeast:2, then:[
          { trigger:"on_play", op:"return_resource", resource:"progress", amount:1 }
        ], else:[
          { trigger:"on_play", op:"gain_resource", resource:"materials", amount:1 }
        ] }]
      ] }
    ]);

    expect(normalizeCard({...base,effect_ops_json} as any).effects).toEqual([
      { trigger:"on_play", op:"gain_resource", resource:"influence", amount:1 },
      { trigger:"on_play", op:"optional", effects:[
        { trigger:"on_play", op:"spend_resource", resource:"knowledge", amount:1 }
      ] },
      { trigger:"on_play", op:"choose_one", choices:[
        [{ trigger:"on_play", op:"remove_resource", resource:"goods", amount:1 }],
        [{ trigger:"on_play", op:"conditional_resource_at_least", resource:"influence", atLeast:2, then:[
          { trigger:"on_play", op:"return_resource", resource:"knowledge", amount:1 }
        ], else:[
          { trigger:"on_play", op:"gain_resource", resource:"materials", amount:1 }
        ] }]
      ] }
    ]);
  });
  it("allows rulebook resource names but rejects unknown effect resources",()=> {
    const validAliases = JSON.stringify([
      { trigger:"on_play", op:"gain_resource", resource:"population", amount:1 },
      { trigger:"on_play", op:"conditional_resource_at_least", resource:"progress", atLeast:1, then:[
        { trigger:"on_play", op:"spend_resource", resource:"goods", amount:1 }
      ] }
    ]);
    const invalidResource = JSON.stringify([
      { trigger:"on_play", op:"gain_resource", resource:"stone", amount:1 }
    ]);

    expect(validatePrivateCardsRows([{...base,effect_ops_json:validAliases}]).counts.fatal).toBe(0);
    const report = validatePrivateCardsRows([{...base,effect_ops_json:invalidResource}]);
    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.some((e)=>e.field==="effect_ops_json" && e.message.includes("stone"))).toBe(true);
  });
  it("rejects unknown resource names inside nested effect branches",()=> {
    const effect_ops_json = JSON.stringify([
      { trigger:"on_play", op:"optional", effects:[
        { trigger:"on_play", op:"gain_resource", resource:"stone", amount:1 }
      ] },
      { trigger:"on_play", op:"choose_one", choices:[
        [{ trigger:"on_play", op:"spend_resource", resource:"ore", amount:1 }],
        [{ trigger:"on_play", op:"conditional_resource_at_least", resource:"population", atLeast:2, then:[
          { trigger:"on_play", op:"return_resource", resource:"science", amount:1 }
        ] }]
      ] },
      { trigger:"on_play", op:"commerce", effects:[
        { trigger:"on_play", op:"remove_resource", resource:"coins", amount:1 }
      ] }
    ]);

    const report = validatePrivateCardsRows([{...base,effect_ops_json}]);

    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      expect.stringContaining("stone"),
      expect.stringContaining("ore"),
      expect.stringContaining("science"),
      expect.stringContaining("coins")
    ]));
  });
  it("explicit suit icons normalize from pipe-separated values",()=> {
    expect(normalizeCard({...base,suit:"multi",suit_icons:"civilized|uncivilized"} as any).suitIcons).toEqual(["civilized","uncivilized"]);
  });
  it("normalizes optional State card token and hand-size metadata",()=> {
    expect(validatePrivateCardsRows([{
      ...base,
      card_type:"state",
      state_action_tokens:"2",
      state_exhaust_tokens:"6",
      state_hand_size:"7"
    } as any]).counts.fatal).toBe(0);
    expect(normalizeCard({
      ...base,
      card_type:"state",
      state_action_tokens:"2",
      state_exhaust_tokens:"6",
      state_hand_size:"7"
    } as any)).toMatchObject({
      stateActionTokens: 2,
      stateExhaustTokens: 6,
      stateHandSize: 7
    });
  });
  it("normalizes structured conditional VP details from JSON",()=> {
    const vp_details_json = JSON.stringify({
      condition: { op: "self_in_zone", zoneId: "history" },
      trueValue: 8,
      falseValue: 3
    });

    expect(validatePrivateCardsRows([{...base,vp_mode:"conditional",vp_details_json}]).counts.fatal).toBe(0);
    expect(normalizeCard({...base,vp_mode:"conditional",vp_details_json} as any).vp).toEqual({
      mode: "conditional",
      value: null,
      condition: { op: "self_in_zone", zoneId: "history" },
      trueValue: 8,
      falseValue: 3
    });
  });
  it("rejects invalid structured VP details",()=> {
    const report = validatePrivateCardsRows([{
      ...base,
      vp_mode:"conditional",
      vp_details_json: JSON.stringify({ condition: { op: "bad_condition", zoneId: "history" }, trueValue: 8, falseValue: 3 })
    }]);

    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.some((e)=>e.field==="vp_details_json" && e.message.includes("Unsupported VP condition"))).toBe(true);
  });
  it("rejects unknown structured VP detail fields before runtime",()=> {
    const report = validatePrivateCardsRows([
      {
        ...base,
        card_id:"vp_root_extra",
        vp_mode:"conditional",
        vp_details_json: JSON.stringify({ condition: { op: "self_in_zone", zoneId: "history" }, trueValue: 1, falseValue: 0, bonus: "ignored" })
      },
      {
        ...base,
        card_id:"vp_condition_extra",
        vp_mode:"conditional",
        vp_details_json: JSON.stringify({ condition: { op: "self_in_zone", zoneId: "history", bonus: "ignored" }, trueValue: 1, falseValue: 0 })
      },
      {
        ...base,
        card_id:"vp_formula_extra",
        vp_mode:"variable",
        vp_details_json: JSON.stringify({ formula: { op: "count_cards", tag: "region", amountEach: 1, bonus: "ignored" } })
      }
    ]);

    expect(report.counts.fatal).toBe(3);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported VP detail field: bonus",
      "Unsupported VP condition field: bonus",
      "Unsupported VP formula field: bonus"
    ]));
  });
  it("normalizes structured variable VP formulas from JSON",()=> {
    const vp_details_json = JSON.stringify({
      formula: { op: "count_cards", tag: "region", zones: ["playArea","history"], amountEach: 2, cap: 6 }
    });

    expect(validatePrivateCardsRows([{...base,vp_mode:"variable",vp_details_json}]).counts.fatal).toBe(0);
    expect(normalizeCard({...base,vp_mode:"variable",vp_details_json} as any).vp).toEqual({
      mode: "variable",
      value: null,
      formula: { op: "count_cards", tag: "region", zones: ["playArea","history"], amountEach: 2, cap: 6 }
    });
  });
  it("rejects non-icon suits in structured variable VP card-count formulas",()=> {
    const report = validatePrivateCardsRows([
      {
        ...base,
        card_id:"vp_formula_none",
        vp_mode:"variable",
        vp_value:"0",
        vp_details_json: JSON.stringify({ formula: { op: "count_cards", suit: "none", amountEach: 1 } })
      },
      {
        ...base,
        card_id:"vp_formula_multi",
        vp_mode:"variable",
        vp_value:"0",
        vp_details_json: JSON.stringify({ formula: { op: "count_cards", suit: "multi", amountEach: 1 } })
      }
    ]);

    expect(report.counts.fatal).toBe(2);
    expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid VP count_cards formula suit: none",
      "Invalid VP count_cards formula suit: multi"
    ]));
  });
  it("normalizes structured variable resource-count VP formulas from JSON",()=> {
    const vp_details_json = JSON.stringify({
      formula: { op: "count_resources", resources: ["materials","population"], amountEach: 1, denominator: 5, cap: 10 }
    });

    expect(validatePrivateCardsRows([{...base,vp_mode:"variable",vp_details_json}]).counts.fatal).toBe(0);
    expect(normalizeCard({...base,vp_mode:"variable",vp_details_json} as any).vp).toEqual({
      mode: "variable",
      value: null,
      formula: { op: "count_resources", resources: ["materials","influence"], amountEach: 1, denominator: 5, cap: 10 }
    });
  });
  it("normalizes structured variable card-resource VP formulas from JSON",()=> {
    const vp_details_json = JSON.stringify({
      formula: { op: "count_resources", resource: "materials", resourceZones: ["playArea","history"], amountEach: 1, denominator: 2, cap: 10 }
    });

    expect(validatePrivateCardsRows([{...base,vp_mode:"variable",vp_details_json}]).counts.fatal).toBe(0);
    expect(normalizeCard({...base,vp_mode:"variable",vp_details_json} as any).vp).toEqual({
      mode: "variable",
      value: null,
      formula: { op: "count_resources", resource: "materials", resourceZones: ["playArea","history"], amountEach: 1, denominator: 2, cap: 10 }
    });
  });
  it("rejects invalid structured variable VP formulas",()=> {
    const report = validatePrivateCardsRows([{
      ...base,
      vp_mode:"variable",
      vp_details_json: JSON.stringify({ formula: { op: "count_cards", tag: "region", amountEach: "2" } })
    }]);

    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.some((e)=>e.field==="vp_details_json" && e.message.includes("amountEach"))).toBe(true);
  });
});
