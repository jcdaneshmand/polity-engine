import { parseCsvFile } from "./csvParser";
import type { CardImportError, CardImportReport, PrivateCardCsvRow } from "./cardCsvTypes";

const suits = new Set(["region","uncivilized","civilized","tributary","fame","unrest","power","trade_route","none","multi"]);
const types = new Set(["action","in_play","attack","power","state","development","accession","nation","region","unrest","fame","trade_route","bot_state","other"]);
const starts = new Set(["draw_deck","nation_deck","accession","development_area","in_play","supply","market","fame_deck","unrest_pile","bot_deck","box","other"]);
const vpModes = new Set(["none","fixed","variable","negative","conditional"]);
const req = ["card_id","public_placeholder_name","suit","card_type","starting_location","vp_mode","implemented","tested"];

const isBool=(v:string)=>["true","false"].includes((v||"").trim().toLowerCase());
const isNonNeg=(v:string)=>v.trim()==="" || (/^\d+$/.test(v.trim()));

export function validatePrivateCardsRows(rows: PrivateCardCsvRow[]): CardImportReport {
  const errors: CardImportError[]=[]; const seen=new Set<string>(); let implemented=0,tested=0,validRows=0;
  rows.forEach((r,i)=>{ const row=i+2; let fatal=false;
    for(const f of req){ if(!(r[f]??"").trim()){ errors.push({level:"fatal",row,field:f,message:"Required field missing"}); fatal=true; }}
    const id=(r.card_id||"").trim(); if(!id){fatal=true;} else if(seen.has(id)){errors.push({level:"fatal",row,field:"card_id",message:"Duplicate card_id"}); fatal=true;} else seen.add(id);
    if(!suits.has((r.suit||"").trim())){errors.push({level:"fatal",row,field:"suit",message:"Invalid suit"}); fatal=true;}
    if(!types.has((r.card_type||"").trim())){errors.push({level:"fatal",row,field:"card_type",message:"Invalid card_type"}); fatal=true;}
    if(!starts.has((r.starting_location||"").trim())){errors.push({level:"fatal",row,field:"starting_location",message:"Invalid starting_location"}); fatal=true;}
    if(!vpModes.has((r.vp_mode||"").trim())){errors.push({level:"fatal",row,field:"vp_mode",message:"Invalid vp_mode"}); fatal=true;}
    for(const f of ["cost_materials","cost_population","cost_progress","cost_goods","development_cost_materials","development_cost_population","development_cost_progress","development_cost_goods"]) if(!isNonNeg(r[f]||"")){errors.push({level:"fatal",row,field:f,message:"Must be non-negative integer or blank"}); fatal=true;}
    if(["fixed","variable","negative"].includes((r.vp_mode||"").trim()) && !(r.vp_value||"").trim().match(/^-?\d+(\.\d+)?$/)){errors.push({level:"fatal",row,field:"vp_value",message:"vp_value required numeric for vp_mode"}); fatal=true;}
    if(!isBool(r.implemented||"")){errors.push({level:"fatal",row,field:"implemented",message:"implemented must be true/false"}); fatal=true;}
    if(!isBool(r.tested||"")){errors.push({level:"fatal",row,field:"tested",message:"tested must be true/false"}); fatal=true;}
    if((r.effect_ops_json||"").trim()){ try { const p=JSON.parse(r.effect_ops_json); if(!Array.isArray(p)){errors.push({level:"fatal",row,field:"effect_ops_json",message:"effect_ops_json must parse to array"}); fatal=true;} } catch { errors.push({level:"fatal",row,field:"effect_ops_json",message:"Invalid JSON"}); fatal=true; } }
    if((r.raw_effect_text_private||"").trim() && !(r.effect_ops_json||"").trim()) errors.push({level:"warning",row,field:"effect_ops_json",message:"raw_effect_text_private present but effect_ops_json empty"});
    if((r.implemented||"").trim().toLowerCase()==="true" && (r.tested||"").trim().toLowerCase()==="false") errors.push({level:"warning",row,field:"tested",message:"implemented=true but tested=false"});
    if((r.card_name_private||"").trim() && (r.card_name_private||"").trim()===(r.public_placeholder_name||"").trim()) errors.push({level:"warning",row,field:"public_placeholder_name",message:"public_placeholder_name identical to card_name_private"});
    if((r.implemented||"").trim().toLowerCase()==="true") implemented++;
    if((r.tested||"").trim().toLowerCase()==="true") tested++;
    if(!fatal) validRows++;
  });
  const fatal=errors.filter(e=>e.level==="fatal").length; const warnings=errors.filter(e=>e.level==="warning").length;
  return { errors, counts:{rows:rows.length,validRows,fatal,warnings}, coverage:{implemented,tested} };
}

if (process.argv[1]?.endsWith("validatePrivateCards.ts")) {
  const input = process.argv[process.argv.indexOf("--input") + 1];
  if (!input) throw new Error("Usage: --input <csv>");
  const report = validatePrivateCardsRows(parseCsvFile(input));
  console.log(`rows=${report.counts.rows} valid=${report.counts.validRows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
  if (report.counts.fatal > 0) process.exitCode = 1;
}
