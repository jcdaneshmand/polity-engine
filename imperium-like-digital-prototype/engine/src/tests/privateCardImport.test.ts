import { describe, expect, it } from "vitest";
import { validatePrivateCardsRows } from "../../../tools/card-import/validatePrivateCards";
import { normalizeCard } from "../../../tools/card-import/normalizeCard";

describe("private card import", () => {
  const base = { card_id:"a",source_box:"x",set_or_nation:"s",card_name_private:"Private A",public_placeholder_name:"Placeholder A",suit:"region",card_type:"action",state_requirement:"",cost_materials:"",cost_population:"",cost_progress:"",cost_goods:"",development_cost_materials:"",development_cost_population:"",development_cost_progress:"",development_cost_goods:"",vp_mode:"none",vp_value:"",starting_location:"draw_deck",player_count_requirement:"",is_trade_route_expansion:"false",raw_effect_text_private:"",effect_ops_json:"[]",tags:"knowledge|region",notes:"",implemented:"true",tested:"false" };
  it("valid row parses",()=>expect(validatePrivateCardsRows([base]).counts.fatal).toBe(0));
  it("duplicate id fatal",()=>expect(validatePrivateCardsRows([base,{...base}]).counts.fatal).toBeGreaterThan(0));
  it("invalid enum fatal",()=>expect(validatePrivateCardsRows([{...base,suit:"bad"}]).counts.fatal).toBeGreaterThan(0));
  it("invalid Commons metadata enum fatal",()=>expect(validatePrivateCardsRows([{...base,ownership:"common",commons_set_id:"classic"}]).counts.fatal).toBeGreaterThan(0));
  it("invalid optional Commons boolean fatal",()=>expect(validatePrivateCardsRows([{...base,market_eligible:"yes"}]).counts.fatal).toBeGreaterThan(0));
  it("invalid effect json fatal",()=>expect(validatePrivateCardsRows([{...base,effect_ops_json:"{"}]).counts.fatal).toBeGreaterThan(0));
  it("raw text without ops warning",()=>expect(validatePrivateCardsRows([{...base,raw_effect_text_private:"x",effect_ops_json:""}]).counts.warnings).toBeGreaterThan(0));
  it("implemented true tested false warning",()=>expect(validatePrivateCardsRows([base]).counts.warnings).toBeGreaterThan(0));
  it("identical names warning",()=>expect(validatePrivateCardsRows([{...base,public_placeholder_name:"Private A"}]).counts.warnings).toBeGreaterThan(0));
  it("normalization defaults cost",()=>expect(normalizeCard(base).cost.materials).toBe(0));
  it("tags parse",()=>expect(normalizeCard(base).tags).toEqual(["knowledge","region"]));
  it("defaults imported Commons cards without commons_set_id to classics",()=>expect(normalizeCard(base).commonsSetId).toBe("classics"));
  it("does not default non-Commons cards to a commons set",()=>expect(normalizeCard({...base,ownership:"nation"}).commonsSetId).toBeUndefined());
});
