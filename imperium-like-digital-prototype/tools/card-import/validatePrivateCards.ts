import { parseCsvFile } from "./csvParser";
import type { CardImportError, CardImportReport, PrivateCardCsvRow } from "./cardCsvTypes";
import { collectInvalidResourceNames } from "./normalizeResources";

const suits = new Set(["region","uncivilized","civilized","tributary","fame","unrest","power","trade_route","none","multi"]);
const types = new Set(["action","in_play","attack","power","state","development","accession","nation","region","unrest","fame","trade_route","bot_state","other"]);
const starts = new Set(["draw_deck","nation_deck","accession","development_area","in_play","supply","market","fame_deck","unrest_pile","bot_deck","box","other"]);
const vpModes = new Set(["none","fixed","variable","negative","conditional"]);
const expansions = new Set(["trade_routes"]);
const modes = new Set(["multiplayer","solo","practice"]);
const ownerships = new Set(["commons","nation","bot","replacement"]);
const commonsSets = new Set(["classics","legends","horizons","custom"]);
const commonsGroups = new Set(["base","trade_friendly","trade_routes","replacement"]);
const playerCounts = new Set(["1+","2+","3+","4+"]);
const req = ["card_id","public_placeholder_name","suit","card_type","starting_location","vp_mode","implemented","tested"];
const effectOps = new Set([
  "draw",
  "draw_if_able",
  "gain_resource",
  "spend_resource",
  "remove_resource",
  "return_resource",
  "steal_resource",
  "discard_random",
  "discard_cards",
  "return_unrest",
  "place_card_on_deck",
  "give_card",
  "swap_card",
  "take_unrest",
  "gain_fame",
  "gain_action",
  "spend_action",
  "trigger_scoring",
  "trade",
  "commerce",
  "profit",
  "garrison_card",
  "recall_region",
  "abandon_region",
  "develop",
  "move_self_to_history",
  "exile_card",
  "acquire_card",
  "gain_card",
  "take_card",
  "break_through",
  "find_card",
  "look_cards",
  "conditional_resource_at_least",
  "conditional_state_is",
  "optional",
  "choose_one"
]);

const isBool=(v:string)=>["true","false"].includes((v||"").trim().toLowerCase());
const isNonNeg=(v:string)=>v.trim()==="" || (/^\d+$/.test(v.trim()));
const isNumber=(v:unknown): v is number=>typeof v==="number" && Number.isFinite(v);
const pipeValues=(v:string)=>v.split("|").map((x)=>x.trim()).filter(Boolean);

function validateOptionalEnum(args: { errors: CardImportError[]; row: number; field: string; value: string | undefined; allowed: Set<string>; message: string }) {
  const value = (args.value || "").trim();
  if (value && !args.allowed.has(value)) {
    args.errors.push({ level: "fatal", row: args.row, field: args.field, message: args.message });
    return true;
  }
  return false;
}

function validatePipeEnums(args: { errors: CardImportError[]; row: number; field: string; value: string | undefined; allowed: Set<string>; message: string }) {
  let fatal = false;
  for (const value of pipeValues(args.value || "")) {
    if (!args.allowed.has(value)) {
      args.errors.push({ level: "fatal", row: args.row, field: args.field, message: `${args.message}: ${value}` });
      fatal = true;
    }
  }
  return fatal;
}

function validateOptionalBool(errors: CardImportError[], row: number, field: string, value: string | undefined) {
  const trimmed = (value || "").trim();
  if (trimmed && !isBool(trimmed)) {
    errors.push({ level: "fatal", row, field, message: `${field} must be true/false or blank` });
    return true;
  }
  return false;
}

function validateEffectOps(errors: CardImportError[], row: number, effects: unknown, path = "effect_ops_json", validateResources = true): boolean {
  if (!Array.isArray(effects)) {
    errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path} must parse to array` });
    return true;
  }
  let fatal = false;
  if (validateResources) {
    collectInvalidResourceNames(effects, path).forEach((invalid) => {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid resource '${invalid.resource}' at ${invalid.path}` });
      fatal = true;
    });
  }
  effects.forEach((effect, index) => {
    if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}] must be an effect object` });
      fatal = true;
      return;
    }
    const op = (effect as { op?: unknown }).op;
    if (typeof op !== "string" || !effectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Unsupported effect op: ${String(op ?? "missing")}` });
      fatal = true;
      return;
    }
    if (op === "optional" || op === "commerce" || op === "profit") {
      fatal = validateEffectOps(errors, row, (effect as { effects?: unknown }).effects, `${path}[${index}].effects`, false) || fatal;
    }
    if (op === "choose_one") {
      const choices = (effect as { choices?: unknown }).choices;
      if (!Array.isArray(choices)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].choices must parse to array` });
        fatal = true;
      } else {
        choices.forEach((choice, choiceIndex) => {
          fatal = validateEffectOps(errors, row, choice, `${path}[${index}].choices[${choiceIndex}]`, false) || fatal;
        });
      }
    }
    if (op === "conditional_resource_at_least" || op === "conditional_state_is") {
      fatal = validateEffectOps(errors, row, (effect as { then?: unknown }).then, `${path}[${index}].then`, false) || fatal;
      const elseEffects = (effect as { else?: unknown }).else;
      if (elseEffects !== undefined) fatal = validateEffectOps(errors, row, elseEffects, `${path}[${index}].else`, false) || fatal;
    }
  });
  return fatal;
}

function parseVpDetails(errors: CardImportError[], row: number, value: string | undefined): { fatal: boolean; details?: { condition?: unknown; formula?: unknown; trueValue?: unknown; falseValue?: unknown } } {
  const trimmed = (value || "").trim();
  if (!trimmed) return { fatal: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    errors.push({ level: "fatal", row, field: "vp_details_json", message: "Invalid JSON" });
    return { fatal: true };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push({ level: "fatal", row, field: "vp_details_json", message: "vp_details_json must parse to object" });
    return { fatal: true };
  }
  return { fatal: false, details: parsed as { condition?: unknown; formula?: unknown; trueValue?: unknown; falseValue?: unknown } };
}

function validateVpDetails(errors: CardImportError[], row: number, value: string | undefined): { fatal: boolean; details?: { condition?: unknown; formula?: unknown; trueValue?: unknown; falseValue?: unknown } } {
  const parsed = parseVpDetails(errors, row, value);
  if (parsed.fatal || !parsed.details) return parsed;
  const details = parsed.details;
  if (details.condition !== undefined) {
    const condition = details.condition as { op?: unknown; zoneId?: unknown };
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP condition must be an object" });
      return { fatal: true };
    }
    if (condition.op !== "self_in_zone") {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: `Unsupported VP condition: ${String(condition.op ?? "missing")}` });
      return { fatal: true };
    }
    if (typeof condition.zoneId !== "string" || !condition.zoneId.trim()) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP self_in_zone condition requires zoneId" });
      return { fatal: true };
    }
  }
  if (details.formula !== undefined) {
    const formula = details.formula as { op?: unknown; tag?: unknown; suit?: unknown; zones?: unknown; amountEach?: unknown; cap?: unknown };
    if (!formula || typeof formula !== "object" || Array.isArray(formula)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP formula must be an object" });
      return { fatal: true };
    }
    if (formula.op !== "count_cards") {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: `Unsupported VP formula: ${String(formula.op ?? "missing")}` });
      return { fatal: true };
    }
    if (!isNumber(formula.amountEach)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_cards formula requires numeric amountEach" });
      return { fatal: true };
    }
    if (formula.tag !== undefined && typeof formula.tag !== "string") {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_cards formula tag must be a string" });
      return { fatal: true };
    }
    if (formula.suit !== undefined && (typeof formula.suit !== "string" || !suits.has(formula.suit))) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: `Invalid VP count_cards formula suit: ${String(formula.suit)}` });
      return { fatal: true };
    }
    if (formula.zones !== undefined && (!Array.isArray(formula.zones) || formula.zones.some((zone) => typeof zone !== "string" || !zone.trim()))) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_cards formula zones must be a string array" });
      return { fatal: true };
    }
    if (formula.cap !== undefined && !isNumber(formula.cap)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_cards formula cap must be numeric when present" });
      return { fatal: true };
    }
  }
  if (details.trueValue !== undefined && !isNumber(details.trueValue)) {
    errors.push({ level: "fatal", row, field: "vp_details_json", message: "trueValue must be numeric when present" });
    return { fatal: true };
  }
  if (details.falseValue !== undefined && !isNumber(details.falseValue)) {
    errors.push({ level: "fatal", row, field: "vp_details_json", message: "falseValue must be numeric when present" });
    return { fatal: true };
  }
  return { fatal: false, details };
}

export function validatePrivateCardsRows(rows: PrivateCardCsvRow[]): CardImportReport {
  const errors: CardImportError[]=[]; const seen=new Set<string>(); let implemented=0,tested=0,validRows=0;
  rows.forEach((r,i)=>{ const row=i+2; let fatal=false;
    for(const f of req){ if(!(r[f]??"").trim()){ errors.push({level:"fatal",row,field:f,message:"Required field missing"}); fatal=true; }}
    const id=(r.card_id||"").trim(); if(!id){fatal=true;} else if(seen.has(id)){errors.push({level:"fatal",row,field:"card_id",message:"Duplicate card_id"}); fatal=true;} else seen.add(id);
    if(!suits.has((r.suit||"").trim())){errors.push({level:"fatal",row,field:"suit",message:"Invalid suit"}); fatal=true;}
    fatal = validatePipeEnums({ errors, row, field: "suit_icons", value: r.suit_icons, allowed: suits, message: "Invalid suit_icons" }) || fatal;
    if(!types.has((r.card_type||"").trim())){errors.push({level:"fatal",row,field:"card_type",message:"Invalid card_type"}); fatal=true;}
    if(!starts.has((r.starting_location||"").trim())){errors.push({level:"fatal",row,field:"starting_location",message:"Invalid starting_location"}); fatal=true;}
    if(!vpModes.has((r.vp_mode||"").trim())){errors.push({level:"fatal",row,field:"vp_mode",message:"Invalid vp_mode"}); fatal=true;}
    fatal = validateOptionalEnum({ errors, row, field: "ownership", value: r.ownership, allowed: ownerships, message: "Invalid ownership" }) || fatal;
    fatal = validateOptionalEnum({ errors, row, field: "commons_set_id", value: r.commons_set_id, allowed: commonsSets, message: "Invalid commons_set_id" }) || fatal;
    fatal = validateOptionalEnum({ errors, row, field: "setup_banner_suit", value: r.setup_banner_suit, allowed: suits, message: "Invalid setup_banner_suit" }) || fatal;
    fatal = validateOptionalEnum({ errors, row, field: "commons_group", value: r.commons_group, allowed: commonsGroups, message: "Invalid commons_group" }) || fatal;
    fatal = validateOptionalEnum({ errors, row, field: "player_count_requirement", value: r.player_count_requirement, allowed: playerCounts, message: "Invalid player_count_requirement" }) || fatal;
    fatal = validatePipeEnums({ errors, row, field: "required_expansions", value: r.required_expansions, allowed: expansions, message: "Invalid required_expansions" }) || fatal;
    fatal = validatePipeEnums({ errors, row, field: "excluded_expansions", value: r.excluded_expansions, allowed: expansions, message: "Invalid excluded_expansions" }) || fatal;
    fatal = validatePipeEnums({ errors, row, field: "allowed_modes", value: r.allowed_modes, allowed: modes, message: "Invalid allowed_modes" }) || fatal;
    fatal = validatePipeEnums({ errors, row, field: "disallowed_modes", value: r.disallowed_modes, allowed: modes, message: "Invalid disallowed_modes" }) || fatal;
    for(const f of ["cost_materials","cost_population","cost_progress","cost_goods","development_cost_materials","development_cost_population","development_cost_progress","development_cost_goods","state_action_tokens","state_exhaust_tokens","state_hand_size"]) if(!isNonNeg(r[f]||"")){errors.push({level:"fatal",row,field:f,message:"Must be non-negative integer or blank"}); fatal=true;}
    for(const f of ["delayable_in_lowered_aggression","market_eligible","small_deck_eligible","main_deck_eligible","unrest_pile_eligible","fame_deck_eligible"]) fatal = validateOptionalBool(errors, row, f, r[f]) || fatal;
    const vpDetails = validateVpDetails(errors, row, r.vp_details_json);
    fatal = vpDetails.fatal || fatal;
    const hasStructuredVariableFormula = Boolean(vpDetails.details?.formula);
    if(["fixed","negative"].includes((r.vp_mode||"").trim()) && !(r.vp_value||"").trim().match(/^-?\d+(\.\d+)?$/)){errors.push({level:"fatal",row,field:"vp_value",message:"vp_value required numeric for vp_mode"}); fatal=true;}
    if((r.vp_mode||"").trim()==="variable" && !hasStructuredVariableFormula && !(r.vp_value||"").trim().match(/^-?\d+(\.\d+)?$/)){errors.push({level:"fatal",row,field:"vp_value",message:"vp_value required numeric for vp_mode unless vp_details_json supplies a formula"}); fatal=true;}
    if(!isBool(r.implemented||"")){errors.push({level:"fatal",row,field:"implemented",message:"implemented must be true/false"}); fatal=true;}
    if(!isBool(r.tested||"")){errors.push({level:"fatal",row,field:"tested",message:"tested must be true/false"}); fatal=true;}
    if((r.effect_ops_json||"").trim()){ try { const p=JSON.parse(r.effect_ops_json); fatal = validateEffectOps(errors, row, p) || fatal; } catch { errors.push({level:"fatal",row,field:"effect_ops_json",message:"Invalid JSON"}); fatal=true; } }
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
