import { describe, expect, it } from "vitest";
import { validatePrivateNationsRows } from "../../../tools/card-import/validatePrivateNations";
import { setupPlayerFromNation } from "../nations/setupPlayerFromNation";
import { normalizeNation } from "../../../tools/card-import/normalizeNation";

const known = new Set(["c1","c2","c3"]);
const row = { nation_id:"n1",source_box:"x",nation_name_private:"Priv Nation",public_placeholder_name:"Place Nation",complexity:"1",power_card_ids:"c1",state_card_ids:"c2",starting_deck_card_ids:"c1|c2",nation_deck_card_ids:"c3",accession_card_id:"",development_card_ids:"c2",special_setup_json:"[]",passive_rules_json:"[]",action_tokens_base:"1",exhaust_tokens_base:"1",required_expansions:"",notes:"",implemented:"true",tested:"false" };

describe("private nation import",()=>{
  it("valid row parses",()=>expect(validatePrivateNationsRows([row],known,false).counts.fatal).toBe(0));
  it("duplicate nation fatal",()=>expect(validatePrivateNationsRows([row,{...row}],known,false).counts.fatal).toBeGreaterThan(0));
  it("bad setup json fatal",()=>expect(validatePrivateNationsRows([{...row,special_setup_json:"{"}],known,false).counts.fatal).toBeGreaterThan(0));
  it("bad passive json fatal",()=>expect(validatePrivateNationsRows([{...row,passive_rules_json:"{"}],known,false).counts.fatal).toBeGreaterThan(0));
  it("implemented true tested false warning",()=>expect(validatePrivateNationsRows([row],known,false).counts.warnings).toBeGreaterThan(0));
  it("identical names warning",()=>expect(validatePrivateNationsRows([{...row,public_placeholder_name:"Priv Nation"}],known,false).counts.warnings).toBeGreaterThan(0));
  it("pipe lists parse and setup player",()=>{ const n=normalizeNation(row); const p=setupPlayerFromNation({nation:n,cardDb:{c1:{} as any,c2:{} as any,c3:{} as any},playerId:"0",shuffle:(x)=>x}); expect(p.deck.length).toBe(2); expect(p.nationDeck.length).toBe(1); expect(p.powerArea.length).toBe(1); expect(p.stateArea.length).toBe(1); });
  it("missing card refs fatal by default",()=>expect(validatePrivateNationsRows([row],new Set(),false).counts.fatal).toBeGreaterThan(0));
  it("missing card refs warning when allowed",()=>expect(validatePrivateNationsRows([row],new Set(),true).counts.warnings).toBeGreaterThan(0));
  it("setup rules apply",()=>{ const n=normalizeNation({...row,special_setup_json:'[{"op":"gain_resource","resource":"materials","count":2},{"op":"create_side_area","areaId":"vault","displayName":"Vault"}]'}); const p=setupPlayerFromNation({nation:n,cardDb:{c1:{} as any,c2:{} as any,c3:{} as any},playerId:"0",shuffle:(x)=>x}); expect(p.resources.materials).toBe(2); expect(p.sideAreas?.vault).toEqual([]); });
});
