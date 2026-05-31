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
  it("keeps player Nation deck cards in listed order while keeping accession separate",()=> {
    const n=normalizeNation({...row,nation_deck_card_ids:"c1|c2|c3",accession_card_id:"c4"});
    const p=setupPlayerFromNation({nation:n,cardDb:{c1:{} as any,c2:{} as any,c3:{} as any,c4:{} as any},playerId:"0",shuffle:(x)=>[...x].reverse()});
    expect(p.nationDeck).toEqual(["c1","c2","c3"]);
    expect(p.accessionCardId).toBe("c4");
  });
  it("missing card refs fatal by default",()=>expect(validatePrivateNationsRows([row],new Set(),false).counts.fatal).toBeGreaterThan(0));
  it("missing card refs warning when allowed",()=>expect(validatePrivateNationsRows([row],new Set(),true).counts.warnings).toBeGreaterThan(0));
  it("setup rules apply",()=>{ const n=normalizeNation({...row,special_setup_json:'[{"op":"gain_resource","resource":"materials","count":2},{"op":"create_side_area","areaId":"vault","displayName":"Vault"}]'}); const p=setupPlayerFromNation({nation:n,cardDb:{c1:{} as any,c2:{} as any,c3:{} as any},playerId:"0",shuffle:(x)=>x}); expect(p.resources.materials).toBe(5); expect(p.sideAreas?.vault).toEqual([]); });
  it("normalizes rulebook resource names in setup and passive rules",()=> {
    const n=normalizeNation({
      ...row,
      special_setup_json:'[{"op":"gain_resource","resource":"population","count":2}]',
      passive_rules_json:'[{"trigger":"after_reshuffle","effects":[{"trigger":"on_play","op":"gain_resource","resource":"progress","amount":1}]}]'
    });

    expect(n.setupRules).toEqual([{ op:"gain_resource", resource:"influence", count:2 }]);
    expect(n.passiveRules).toEqual([{
      trigger:"after_reshuffle",
      effects:[{ trigger:"on_play", op:"gain_resource", resource:"knowledge", amount:1 }]
    }]);
  });
  it("allows rulebook resource names but rejects unknown setup and passive resources",()=> {
    expect(validatePrivateNationsRows([{
      ...row,
      special_setup_json:'[{"op":"gain_resource","resource":"population","count":2}]',
      passive_rules_json:'[{"trigger":"after_reshuffle","effects":[{"trigger":"on_play","op":"gain_resource","resource":"progress","amount":1}]}]'
    }],known,false).counts.fatal).toBe(0);

    const setupReport = validatePrivateNationsRows([{
      ...row,
      special_setup_json:'[{"op":"gain_resource","resource":"stone","count":2}]'
    }],known,false);
    expect(setupReport.counts.fatal).toBeGreaterThan(0);
    expect(setupReport.errors.some((e)=>e.field==="special_setup_json" && e.message.includes("stone"))).toBe(true);

    const passiveReport = validatePrivateNationsRows([{
      ...row,
      passive_rules_json:'[{"trigger":"after_reshuffle","effects":[{"trigger":"on_play","op":"gain_resource","resource":"science","amount":1}]}]'
    }],known,false);
    expect(passiveReport.counts.fatal).toBeGreaterThan(0);
    expect(passiveReport.errors.some((e)=>e.field==="passive_rules_json" && e.message.includes("science"))).toBe(true);
  });
});
