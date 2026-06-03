import fs from "node:fs";
import { parseCsvFile } from "./csvParser";
import { collectInvalidResourceNames, normalizeResourceNames } from "./normalizeResources";
import { validateNationRuleset } from "../../engine/src/nations/nationRulesetValidation";

type Msg={level:"fatal"|"warning";row:number;field:string;message:string};
const bool=(v:string)=>["true","false"].includes((v||"").trim().toLowerCase());
const isInt=(v:string)=>v.trim()===""||/^\d+$/.test(v.trim());
const arr=(v:string)=>v.split("|").map(x=>x.trim()).filter(Boolean);
const expansions = new Set(["trade_routes"]);
const setupAreas = new Set(["power_area","state_area","draw_deck","discard","hand","play_area","history","development_area","nation_deck","accession","side_area"]);
const setupRuleFields: Record<string, Set<string>> = {
  gain_resource: new Set(["op","resource","count"]),
  place_card_in_area: new Set(["op","cardId","area"]),
  set_token_count: new Set(["op","actionTokens","exhaustTokens"]),
  create_side_area: new Set(["op","areaId","displayName"])
};

function isNonNegativeIntegerValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function mapPassiveTrigger(trigger: unknown): string | undefined {
  if (trigger === "before_reshuffle") return "before_reshuffle";
  if (trigger === "after_reshuffle") return "after_reshuffle";
  if (trigger === "on_develop") return "after_develop";
  if (trigger === "on_acquire") return "after_acquire";
  if (trigger === "on_gain_unrest") return "after_gain_unrest";
  if (trigger === "on_solstice") return "before_solstice";
  if (trigger === "on_scoring") return "before_scoring";
  return undefined;
}

function validateSetupRules(errors: Msg[], row: number, parsed: unknown): void {
  if (!Array.isArray(parsed)) return;
  parsed.forEach((entry, index) => {
    const path = `special_setup_json[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push({level:"fatal",row,field:"special_setup_json",message:`${path} must be an object`});
      return;
    }
    const record = entry as Record<string, unknown>;
    const op = typeof record.op === "string" ? record.op : "";
    const allowedFields = setupRuleFields[op];
    if (!allowedFields) {
      errors.push({level:"fatal",row,field:"special_setup_json",message:`Unsupported setup rule op: ${String(record.op ?? "missing")}`});
      return;
    }
    Object.keys(record).forEach((fieldName) => {
      if (!allowedFields.has(fieldName)) errors.push({level:"fatal",row,field:"special_setup_json",message:`Unsupported setup rule field: ${fieldName}`});
    });
    if (op === "gain_resource") {
      if (typeof record.resource !== "string" || !record.resource.trim()) errors.push({level:"fatal",row,field:"special_setup_json",message:"Setup gain_resource requires resource"});
      if (!isNonNegativeIntegerValue(record.count)) errors.push({level:"fatal",row,field:"special_setup_json",message:"Setup gain_resource requires non-negative integer count"});
    }
    if (op === "place_card_in_area") {
      if (typeof record.cardId !== "string" || !record.cardId.trim()) errors.push({level:"fatal",row,field:"special_setup_json",message:"Setup place_card_in_area requires cardId"});
      if (typeof record.area !== "string" || !setupAreas.has(record.area)) errors.push({level:"fatal",row,field:"special_setup_json",message:`Invalid setup area: ${String(record.area)}`});
    }
    if (op === "set_token_count") {
      if (record.actionTokens !== undefined && !isNonNegativeIntegerValue(record.actionTokens)) errors.push({level:"fatal",row,field:"special_setup_json",message:"Setup set_token_count actionTokens must be a non-negative integer"});
      if (record.exhaustTokens !== undefined && !isNonNegativeIntegerValue(record.exhaustTokens)) errors.push({level:"fatal",row,field:"special_setup_json",message:"Setup set_token_count exhaustTokens must be a non-negative integer"});
    }
    if (op === "create_side_area") {
      if (typeof record.areaId !== "string" || !record.areaId.trim()) errors.push({level:"fatal",row,field:"special_setup_json",message:"Setup create_side_area requires areaId"});
      if (typeof record.displayName !== "string" || !record.displayName.trim()) errors.push({level:"fatal",row,field:"special_setup_json",message:"Setup create_side_area requires displayName"});
    }
  });
}

function validatePassiveRules(errors: Msg[], row: number, nationId: string, parsed: unknown): void {
  if (!Array.isArray(parsed)) return;
  const hookRules = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const record = entry as Record<string, unknown>;
    const trigger = mapPassiveTrigger(record.trigger);
    if (!trigger) {
      errors.push({level:"fatal",row,field:"passive_rules_json",message:`Unsupported passive trigger: ${String(record.trigger ?? "missing")}`});
    }
    return { ...record, trigger: trigger ?? record.trigger };
  });
  const issues = validateNationRuleset({
    nationId,
    displayName: nationId,
    rulesetTags: [],
    requiredExpansions: [],
    setupOverrides: [],
    zoneOverrides: [],
    stateOverrides: [],
    reshuffleOverrides: [],
    cleanupOverrides: [],
    solsticeOverrides: [],
    scoringOverrides: [],
    collapseOverrides: [],
    botOverrides: [],
    shortGameOverrides: [],
    hookRules,
    implemented: false,
    tested: false
  } as any);
  issues
    .filter((issue) => issue.field.startsWith("hookRules"))
    .forEach((issue) => errors.push({level:"fatal",row,field:"passive_rules_json",message:`[${issue.nationId}] ${issue.reason}`}));
}

export function validatePrivateNationsRows(rows: Record<string,string>[], knownCardIds:Set<string>, allowMissing=false){
  const errors:Msg[]=[]; const seen=new Set<string>(); let implemented=0,tested=0;
  rows.forEach((r,i)=>{const row=i+2; const id=(r.nation_id||"").trim();
    if(!id){errors.push({level:"fatal",row,field:"nation_id",message:"Required"});}
    else if(seen.has(id)) errors.push({level:"fatal",row,field:"nation_id",message:"Duplicate nation_id"}); else seen.add(id);
    if(!(r.public_placeholder_name||"").trim()) errors.push({level:"fatal",row,field:"public_placeholder_name",message:"Required"});
    for(const f of ["complexity","action_tokens_base","exhaust_tokens_base"]) if(!isInt(r[f]||"")) errors.push({level:"fatal",row,field:f,message:"Must be non-negative integer or blank"});
    if(!bool(r.implemented||"")) errors.push({level:"fatal",row,field:"implemented",message:"Must be bool"});
    if(!bool(r.tested||"")) errors.push({level:"fatal",row,field:"tested",message:"Must be bool"});
    for (const f of ["required_expansions","excluded_expansions"]) {
      arr(r[f]||"").forEach((expansionId) => {
        if (!expansions.has(expansionId)) errors.push({level:"fatal",row,field:f,message:`Invalid ${f}: ${expansionId}`});
      });
    }
    let parsedSetup: any[] = [];
    for(const f of ["special_setup_json","passive_rules_json"]) if((r[f]||"").trim()){ try{const p=JSON.parse(r[f]); if(!Array.isArray(p)) errors.push({level:"fatal",row,field:f,message:"Must parse to array"}); else { collectInvalidResourceNames(p, f).forEach((invalid)=>errors.push({level:"fatal",row,field:f,message:`Invalid resource '${invalid.resource}' at ${invalid.path}`})); const normalized = normalizeResourceNames(p); if (f === "special_setup_json") validateSetupRules(errors, row, normalized); if (f === "passive_rules_json") validatePassiveRules(errors, row, id || "<unknown-nation>", normalized); } if (f === "special_setup_json" && Array.isArray(p)) parsedSetup = p;} catch{errors.push({level:"fatal",row,field:f,message:"Invalid JSON"});}}
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
