import fs from "node:fs";
import { parseCsvFile } from "./csvParser";

type Msg={level:"fatal"|"warning";row:number;field:string;message:string};
const bool=(v:string)=>["true","false"].includes((v||"").trim().toLowerCase());
const isInt=(v:string)=>v.trim()===""||/^\d+$/.test(v.trim());
const arr=(v:string)=>v.split("|").map(x=>x.trim()).filter(Boolean);

export function validatePrivateNationsRows(rows: Record<string,string>[], knownCardIds:Set<string>, allowMissing=false){
  const errors:Msg[]=[]; const seen=new Set<string>(); let implemented=0,tested=0;
  rows.forEach((r,i)=>{const row=i+2; const id=(r.nation_id||"").trim();
    if(!id){errors.push({level:"fatal",row,field:"nation_id",message:"Required"});}
    else if(seen.has(id)) errors.push({level:"fatal",row,field:"nation_id",message:"Duplicate nation_id"}); else seen.add(id);
    if(!(r.public_placeholder_name||"").trim()) errors.push({level:"fatal",row,field:"public_placeholder_name",message:"Required"});
    for(const f of ["complexity","action_tokens_base","exhaust_tokens_base"]) if(!isInt(r[f]||"")) errors.push({level:"fatal",row,field:f,message:"Must be non-negative integer or blank"});
    if(!bool(r.implemented||"")) errors.push({level:"fatal",row,field:"implemented",message:"Must be bool"});
    if(!bool(r.tested||"")) errors.push({level:"fatal",row,field:"tested",message:"Must be bool"});
    let parsedSetup: any[] = [];
    for(const f of ["special_setup_json","passive_rules_json"]) if((r[f]||"").trim()){ try{const p=JSON.parse(r[f]); if(!Array.isArray(p)) errors.push({level:"fatal",row,field:f,message:"Must parse to array"}); if (f === "special_setup_json" && Array.isArray(p)) parsedSetup = p;} catch{errors.push({level:"fatal",row,field:f,message:"Invalid JSON"});}}
    if((r.nation_name_private||"").trim() && (r.nation_name_private||"").trim()===(r.public_placeholder_name||"").trim()) errors.push({level:"warning",row,field:"public_placeholder_name",message:"Matches private name"});
    if((r.implemented||"").trim().toLowerCase()==="true" && (r.tested||"").trim().toLowerCase()==="false") errors.push({level:"warning",row,field:"tested",message:"implemented=true but tested=false"});
    if(arr(r.starting_deck_card_ids||"").length===0 && !(r.special_setup_json||"").trim()) errors.push({level:"warning",row,field:"starting_deck_card_ids",message:"No starting deck and no special setup"});
    if(arr(r.power_card_ids||"").length===0) errors.push({level:"warning",row,field:"power_card_ids",message:"No power cards"});
    const setupRefs = parsedSetup
      .filter((op:any)=>op && op.op === "place_card_in_area" && typeof op.cardId === "string")
      .map((op:any)=>op.cardId.trim())
      .filter(Boolean);
    const refs=[...arr(r.power_card_ids||""),...arr(r.state_card_ids||""),...arr(r.starting_deck_card_ids||""),...arr(r.nation_deck_card_ids||""),...arr(r.development_card_ids||""),...(r.accession_card_id?.trim()?[r.accession_card_id.trim()]:[]),...setupRefs];
    refs.forEach(cid=>{ if(!knownCardIds.has(cid)) errors.push({level:allowMissing?"warning":"fatal",row,field:"card_ref",message:`Missing card id: ${cid}`}); });
    if((r.implemented||"").trim().toLowerCase()==="true") implemented++; if((r.tested||"").trim().toLowerCase()==="true") tested++;
  });
  return {errors, counts:{rows:rows.length, fatal:errors.filter(e=>e.level==="fatal").length, warnings:errors.filter(e=>e.level==="warning").length}, coverage:{implemented,tested}};
}

if (process.argv[1]?.endsWith("validatePrivateNations.ts")) {
  const input=process.argv[process.argv.indexOf("--input")+1]; const cards=process.argv[process.argv.indexOf("--cards")+1];
  const allow=(process.argv[process.argv.indexOf("--allow-missing-card-refs")+1]||"false")==="true";
  if(!input||!cards) throw new Error("Usage: --input <csv> --cards <json>");
  const known = new Set<string>((JSON.parse(fs.readFileSync(cards,"utf8")) as Array<{ id: string }>).map((c)=>c.id));
  const report=validatePrivateNationsRows(parseCsvFile(input), known, allow);
  console.log(`rows=${report.counts.rows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
  if(report.counts.fatal>0) process.exitCode=1;
}
