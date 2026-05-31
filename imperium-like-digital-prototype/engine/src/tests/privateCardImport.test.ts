import { describe, expect, it } from "vitest";
import { validatePrivateCardsRows } from "../../../tools/card-import/validatePrivateCards";
import { normalizeCard } from "../../../tools/card-import/normalizeCard";

describe("private card import", () => {
  const base = { card_id:"a",source_box:"x",set_or_nation:"s",card_name_private:"Private A",public_placeholder_name:"Placeholder A",suit:"region",card_type:"action",state_requirement:"",cost_materials:"",cost_population:"",cost_progress:"",cost_goods:"",development_cost_materials:"",development_cost_population:"",development_cost_progress:"",development_cost_goods:"",vp_mode:"none",vp_value:"",starting_location:"draw_deck",player_count_requirement:"",is_trade_route_expansion:"false",raw_effect_text_private:"",effect_ops_json:"[]",tags:"knowledge|region",notes:"",implemented:"true",tested:"false" };
  it("valid row parses",()=>expect(validatePrivateCardsRows([base]).counts.fatal).toBe(0));
  it("duplicate id fatal",()=>expect(validatePrivateCardsRows([base,{...base}]).counts.fatal).toBeGreaterThan(0));
  it("invalid enum fatal",()=>expect(validatePrivateCardsRows([{...base,suit:"bad"}]).counts.fatal).toBeGreaterThan(0));
  it("invalid explicit suit icon fatal",()=> {
    const report = validatePrivateCardsRows([{...base,suit_icons:"civilized|bad_icon"}]);
    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.some((e)=>e.field==="suit_icons" && e.message.includes("bad_icon"))).toBe(true);
  });
  it("invalid effect json fatal",()=>expect(validatePrivateCardsRows([{...base,effect_ops_json:"{"}]).counts.fatal).toBeGreaterThan(0));
  it("unsupported effect op fatal",()=> {
    const report=validatePrivateCardsRows([{...base,effect_ops_json:JSON.stringify([{trigger:"on_play",op:"not_a_real_op"}])}]);
    expect(report.counts.fatal).toBeGreaterThan(0);
    expect(report.errors.some((e)=>e.field==="effect_ops_json" && e.message==="Unsupported effect op: not_a_real_op")).toBe(true);
  });
  it("current engine effect ops validate, including nested choices and Exile/Unrest effects",()=> {
    const effect_ops_json=JSON.stringify([
      {trigger:"on_play",op:"acquire_card",source:"exile",suit:"civilized",count:1},
      {trigger:"on_play",op:"acquire_card",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"gain_card",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"take_card",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"break_through",source:"exile",suit:"civilized",count:1},
      {trigger:"on_play",op:"break_through",source:"market",suit:"civilized",count:1},
      {trigger:"on_play",op:"take_unrest",targetPlayerIds:["1","0"],count:1},
      {trigger:"on_play",op:"gain_fame",count:1},
      {trigger:"on_play",op:"trigger_scoring",reason:"card_effect"},
      {trigger:"on_play",op:"garrison_card",hostCardId:"region_a",cardId:"hand_a"},
      {trigger:"on_play",op:"garrison_card"},
      {trigger:"on_play",op:"recall_region",cardId:"region_a"},
      {trigger:"on_play",op:"abandon_region",cardId:"region_b"},
      {trigger:"on_play",op:"recall_region"},
      {trigger:"on_play",op:"abandon_region"},
      {trigger:"on_play",op:"develop"},
      {trigger:"on_play",op:"exile_card",source:"market",cardId:"market_card"},
      {trigger:"on_play",op:"choose_one",choices:[
        [{trigger:"on_play",op:"gain_resource",resource:"materials",amount:1}],
        [{trigger:"on_play",op:"optional",effects:[{trigger:"on_play",op:"draw_if_able",count:1}]}]
      ]}
    ]);
    expect(validatePrivateCardsRows([{...base,effect_ops_json}]).counts.fatal).toBe(0);
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
