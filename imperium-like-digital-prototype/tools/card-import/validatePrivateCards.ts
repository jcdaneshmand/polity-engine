import { parseCsvFile } from "./csvParser";
import type { CardImportError, CardImportReport, PrivateCardCsvRow } from "./cardCsvTypes";
import { collectInvalidResourceNames } from "./normalizeResources";

const suits = new Set(["region","uncivilized","civilized","tributary","fame","unrest","power","trade_route","none","multi"]);
const suitIcons = new Set(["region","uncivilized","civilized","tributary","fame","unrest","power","trade_route"]);
const setupBannerSuits = new Set(["region","uncivilized","civilized","tributary","none"]);
const breakThroughSuits = new Set(["region","uncivilized","civilized","tributary"]);
const types = new Set(["action","unit","technology","legacy","in_play","attack","power","state","development","accession","nation","region","unrest","fame","trade_route","bot_state","other"]);
const starts = new Set(["draw_deck","nation_deck","accession","development_area","in_play","supply","market","fame_deck","unrest_pile","bot_deck","box","other"]);
const vpModes = new Set(["none","fixed","variable","negative","conditional"]);
const expansions = new Set(["trade_routes"]);
const modes = new Set(["multiplayer","solo","practice"]);
const ownerships = new Set(["commons","nation","bot","replacement"]);
const commonsSets = new Set(["classics","legends","horizons","custom"]);
const commonsGroups = new Set(["base","trade_friendly","trade_routes","replacement"]);
const playerCounts = new Set(["1+","2+","3+","4+"]);
const req = ["card_id","public_placeholder_name","suit","card_type","starting_location","vp_mode","implemented","tested"];
const effectTriggers = new Set(["on_play","on_exhaust","on_acquire","on_solstice","end_of_solstice"]);
const reactiveTriggers = new Set(["after_gain_resource","after_take_unrest","after_acquire_card","after_play_card","after_break_through_card"]);
const reactiveTargets = new Set(["self","opponent","any"]);
const targetPlayerScopes = new Set(["self","all","others"]);
const reactiveFields = new Set(["trigger","target","sourceSuit","resource"]);
const vpDetailFields = new Set(["condition","formula","trueValue","falseValue"]);
const vpConditionFields = new Set(["op","zoneId"]);
const vpCountCardsFormulaFields = new Set(["op","tag","suit","zones","amountEach","cap"]);
const vpCountResourcesFormulaFields = new Set(["op","resource","resources","resourceZones","amountEach","denominator","cap"]);
const effectOps = new Set([
  "draw",
  "draw_if_able",
  "gain_resource",
  "move_resource_to_market",
  "spend_resource",
  "remove_resource",
  "return_resource",
  "steal_resource",
  "discard_random",
  "discard_cards",
  "return_unrest",
  "return_fame",
  "place_card_on_deck",
  "give_card",
  "swap_card",
  "take_unrest",
  "gain_fame",
  "gain_action",
  "spend_action",
  "return_exhaust_token",
  "free_play_card",
  "trigger_scoring",
  "trade",
  "treat_suit_as",
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
  "look_take_card",
  "conditional_resource_at_least",
  "conditional_state_is",
  "optional",
  "choose_one"
]);
const drawSources = new Set(["deck","discard","exile","fameDeck"]);
const exileSources = new Set(["market","hand","discard","deck","playArea","history","garrison"]);
const acquireSources = new Set(["market","exile"]);
const marketMoveSources = new Set(["market"]);
const breakThroughSources = new Set(["market","deck","exile"]);
const findSources = new Set(["hand","discard","deck","nationDeck","playArea","history","garrison"]);
const lookSources = new Set(["deck","nationDeck","fameDeck"]);
const lookTakeSources = new Set(["deck","nationDeck"]);
const returnUnrestSources = new Set(["hand","playArea","discard","deck","history","exile"]);
const returnFameSources = new Set(["hand","playArea","discard","deck","history","exile"]);
const placeOnDeckSources = new Set(["hand","discard"]);
const swapSources = new Set(["hand","discard","deck"]);
const findDestinations = new Set(["deck","hand","discard","playArea","history","exile"]);
const gainDestinations = new Set(["hand","discard"]);
const lookTakeDestinations = new Set(["hand","discard","history"]);
const profitDestinations = new Set(["discard","history"]);
const cardIdEffectOps = new Set(["return_unrest","return_fame","place_card_on_deck","give_card","swap_card","return_exhaust_token","free_play_card","garrison_card","recall_region","abandon_region","exile_card","acquire_card","gain_card","take_card","break_through","find_card"]);
const hostCardIdEffectOps = new Set(["garrison_card"]);
const marketCardIdEffectOps = new Set(["swap_card"]);
const targetPlayerIdEffectOps = new Set(["give_card"]);
const targetPlayerIdsEffectOps = new Set(["draw","give_card","recall_region","abandon_region","take_unrest"]);
const targetPlayerScopeEffectOps = new Set(["draw","gain_resource","steal_resource","recall_region","abandon_region","take_unrest"]);
const fromPlayerIdEffectOps = new Set(["steal_resource"]);
const fromPlayerIdsEffectOps = new Set(["steal_resource"]);
const reasonEffectOps = new Set(["trigger_scoring"]);
const stateEffectOps = new Set(["conditional_state_is"]);
const fromEffectOps = new Set(["treat_suit_as"]);
const toEffectOps = new Set(["treat_suit_as"]);
const effectsEffectOps = new Set(["optional","commerce","profit"]);
const ifUnableEffectOps = new Set(["steal_resource"]);
const attackTargetedEffectOps = new Set(["take_unrest","steal_resource"]);
const choicesEffectOps = new Set(["choose_one"]);
const thenEffectOps = new Set(["conditional_resource_at_least","conditional_state_is"]);
const elseEffectOps = new Set(["conditional_resource_at_least","conditional_state_is"]);
const sourceEffectOps = new Set(["draw","draw_if_able","exile_card","acquire_card","gain_card","take_card","break_through","look_cards","look_take_card"]);
const sourceZonesEffectOps = new Set(["return_unrest","return_fame","find_card"]);
const sourceZoneEffectOps = new Set(["place_card_on_deck","swap_card"]);
const destinationEffectOps = new Set(["find_card","acquire_card","gain_card","take_card","look_take_card","profit"]);
const suitEffectOps = new Set(["discard_cards","free_play_card","acquire_card","gain_card","take_card","find_card","exile_card","break_through"]);
const cardTypeEffectOps = new Set(["discard_cards","free_play_card","acquire_card","gain_card","take_card","find_card","exile_card","break_through"]);
const resourceEffectOps = new Set(["gain_resource","move_resource_to_market","spend_resource","remove_resource","return_resource","steal_resource","conditional_resource_at_least"]);
const countEffectOps = new Set(["draw","draw_if_able","discard_random","discard_cards","take_unrest","gain_fame","recall_region","abandon_region","exile_card","acquire_card","gain_card","take_card","break_through","look_cards","look_take_card"]);
const amountEffectOps = new Set(["gain_resource","move_resource_to_market","spend_resource","remove_resource","return_resource","steal_resource","gain_action","spend_action"]);
const atLeastEffectOps = new Set(["conditional_resource_at_least"]);
const effectFields = new Set([
  "trigger",
  "op",
  "count",
  "source",
  "resource",
  "amount",
  "fromPlayerId",
  "fromPlayerIds",
  "cardId",
  "sourceZones",
  "sourceZone",
  "targetPlayerId",
  "targetPlayerIds",
  "targetPlayerScope",
  "marketCardId",
  "reason",
  "from",
  "to",
  "effects",
  "ifUnable",
  "destination",
  "hostCardId",
  "suit",
  "cardType",
  "atLeast",
  "then",
  "else",
  "state",
  "choices",
  "free",
  "optionalForTargets",
  "upTo",
  "attackTargeted",
  "ignoreStateRequirement",
  "reactive"
]);

const isBool=(v:string)=>["true","false"].includes((v||"").trim().toLowerCase());
const isNonNeg=(v:string)=>v.trim()==="" || (/^\d+$/.test(v.trim()));
const isNumber=(v:unknown): v is number=>typeof v==="number" && Number.isFinite(v);
const isPositiveInteger=(v:unknown): v is number=>typeof v==="number" && Number.isInteger(v) && v > 0;
const isNonNegativeIntegerValue=(v:unknown): v is number=>typeof v==="number" && Number.isInteger(v) && v >= 0;
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

function validateStateRequirement(errors: CardImportError[], row: number, value: string | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s*(?:\||,|;|\/|\bor\b)\s*/i);
  if (tokens.length === 0 || tokens.some((token) => token.trim().length === 0)) {
    errors.push({ level: "fatal", row, field: "state_requirement", message: "Invalid state_requirement" });
    return true;
  }
  return false;
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
    const record = effect as Record<string, unknown>;
    Object.keys(record).forEach((fieldName) => {
      if (!effectFields.has(fieldName)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Unsupported effect field at ${path}[${index}]: ${fieldName}` });
        fatal = true;
      }
    });
    const trigger = record.trigger;
    if (typeof trigger !== "string" || !effectTriggers.has(trigger)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Unsupported effect trigger at ${path}[${index}]: ${String(trigger ?? "missing")}` });
      fatal = true;
    }
    const validateSource = (allowed: Set<string>, defaultValue?: string, required = false) => {
      const source = record.source ?? defaultValue;
      if (source === undefined && required) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Missing source for ${op} at ${path}[${index}]` });
        fatal = true;
        return;
      }
      if (source !== undefined && (typeof source !== "string" || !allowed.has(source))) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid source for ${op} at ${path}[${index}]: ${String(source)}` });
        fatal = true;
      }
    };
    const validateSourceZones = (allowed: Set<string>, property: "sourceZones" | "sourceZone") => {
      const value = record[property];
      if (value === undefined) return;
      const values = property === "sourceZones" ? value : [value];
      if (!Array.isArray(values) || values.length === 0 || values.some((source) => typeof source !== "string" || !allowed.has(source))) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${property} for ${op} at ${path}[${index}]` });
        fatal = true;
      }
    };
    const validateSuitField = (field: "suit" | "from") => {
      const value = record[field];
      if (value !== undefined && (typeof value !== "string" || !suits.has(value))) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${field} for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateRequiredIconSuitField = (field: "from") => {
      const value = record[field];
      if (value === undefined) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Missing ${field} for ${op} at ${path}[${index}]` });
        fatal = true;
        return;
      }
      if (typeof value !== "string" || !suitIcons.has(value)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${field} for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateRequiredBreakThroughSuitField = () => {
      const value = record.suit;
      if (value === undefined) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Missing suit for ${op} at ${path}[${index}]` });
        fatal = true;
        return;
      }
      if (typeof value !== "string" || !breakThroughSuits.has(value)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid suit for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateIconSuitArray = (field: "to") => {
      const value = record[field];
      if (value !== undefined && (!Array.isArray(value) || value.length === 0 || value.some((suit) => typeof suit !== "string" || !suitIcons.has(suit)))) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${field} for ${op} at ${path}[${index}]` });
        fatal = true;
      }
    };
    const validateCardTypeField = () => {
      const value = record.cardType;
      if (value !== undefined && (typeof value !== "string" || !types.has(value))) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid cardType for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validatePositiveIntegerField = (fieldName: "count" | "amount") => {
      const value = record[fieldName];
      if (!isPositiveInteger(value)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${fieldName} for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateOptionalPositiveIntegerField = (fieldName: "count" | "amount") => {
      if (record[fieldName] !== undefined) validatePositiveIntegerField(fieldName);
    };
    const validateNonNegativeIntegerField = (fieldName: "atLeast") => {
      const value = record[fieldName];
      if (!isNonNegativeIntegerValue(value)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${fieldName} for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateDestination = (allowed: Set<string>, required = false) => {
      const value = record.destination;
      if (value === undefined && !required) return;
      if (typeof value !== "string" || !allowed.has(value)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid destination for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateRequiredString = (fieldName: "fromPlayerId" | "reason" | "state") => {
      const value = record[fieldName];
      if (typeof value !== "string" || value.trim().length === 0) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Missing ${fieldName} for ${op} at ${path}[${index}]` });
        fatal = true;
      }
    };
    const validateRequiredResource = () => {
      const value = record.resource;
      if (typeof value !== "string" || value.trim().length === 0) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Missing resource for ${op} at ${path}[${index}]` });
        fatal = true;
      }
    };
    const validateOptionalString = (fieldName: "cardId" | "hostCardId" | "marketCardId" | "targetPlayerId") => {
      const value = record[fieldName];
      if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${fieldName} for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateOptionalStringArray = (fieldName: "targetPlayerIds" | "fromPlayerIds") => {
      const value = record[fieldName];
      if (value !== undefined && (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0))) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${fieldName} for ${op} at ${path}[${index}]` });
        fatal = true;
      }
    };
    const validateOptionalBoolean = (fieldName: "free" | "optionalForTargets" | "upTo" | "attackTargeted" | "ignoreStateRequirement") => {
      const value = record[fieldName];
      if (value !== undefined && typeof value !== "boolean") {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ${fieldName} for ${op} at ${path}[${index}]: ${String(value)}` });
        fatal = true;
      }
    };
    const validateReactiveMetadata = () => {
      const reactive = record.reactive;
      if (reactive === undefined) return;
      if (trigger !== "on_exhaust") {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Reactive metadata is only valid on on_exhaust effects at ${path}[${index}]` });
        fatal = true;
      }
      if (!reactive || typeof reactive !== "object" || Array.isArray(reactive)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid reactive metadata at ${path}[${index}]` });
        fatal = true;
        return;
      }
      const condition = reactive as Record<string, unknown>;
      Object.keys(condition).forEach((fieldName) => {
        if (!reactiveFields.has(fieldName)) {
          errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Unsupported reactive field at ${path}[${index}]: ${fieldName}` });
          fatal = true;
        }
      });
      if (typeof condition.trigger !== "string" || !reactiveTriggers.has(condition.trigger)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid reactive trigger at ${path}[${index}]: ${String(condition.trigger ?? "missing")}` });
        fatal = true;
      }
      const triggerName = typeof condition.trigger === "string" && reactiveTriggers.has(condition.trigger) ? condition.trigger : undefined;
      if (condition.target !== undefined && ((typeof condition.target !== "string" || !reactiveTargets.has(condition.target)) || triggerName === "after_gain_resource")) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid reactive target at ${path}[${index}]: ${String(condition.target)}` });
        fatal = true;
      }
      if (condition.sourceSuit !== undefined && ((typeof condition.sourceSuit !== "string" || !suitIcons.has(condition.sourceSuit)) || (triggerName !== undefined && triggerName !== "after_gain_resource"))) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid reactive sourceSuit at ${path}[${index}]: ${String(condition.sourceSuit)}` });
        fatal = true;
      }
      if (condition.resource !== undefined && triggerName !== undefined && triggerName !== "after_gain_resource") {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid reactive resource at ${path}[${index}]: ${String(condition.resource)}` });
        fatal = true;
      }
    };
    if (["draw","draw_if_able","discard_random","discard_cards","take_unrest","gain_fame","acquire_card","gain_card","take_card","break_through","look_cards","look_take_card"].includes(op)) validatePositiveIntegerField("count");
    if (op === "recall_region" || op === "abandon_region") validateOptionalPositiveIntegerField("count");
    if (op === "exile_card") validateOptionalPositiveIntegerField("count");
    if (["gain_resource","move_resource_to_market","spend_resource","remove_resource","return_resource","steal_resource","gain_action","spend_action"].includes(op)) validatePositiveIntegerField("amount");
    if (op === "conditional_resource_at_least") validateNonNegativeIntegerField("atLeast");
    if (op === "draw") validateSource(drawSources, "deck");
    if (op === "draw_if_able" && record.source !== undefined) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid source for ${op} at ${path}[${index}]: ${String(record.source)}` });
      fatal = true;
    }
    if (op === "exile_card") validateSource(exileSources, undefined, true);
    if (op === "acquire_card") validateSource(acquireSources, "market");
    if (op === "gain_card" || op === "take_card") validateSource(marketMoveSources, undefined, true);
    if (op === "break_through") validateSource(breakThroughSources, undefined, true);
    if (op === "look_cards") validateSource(lookSources, undefined, true);
    if (op === "look_take_card") validateSource(lookTakeSources, undefined, true);
    if (op === "return_unrest") validateSourceZones(returnUnrestSources, "sourceZones");
    if (op === "return_fame") validateSourceZones(returnFameSources, "sourceZones");
    if (op === "place_card_on_deck") validateSourceZones(placeOnDeckSources, "sourceZone");
    if (op === "swap_card") validateSourceZones(swapSources, "sourceZone");
    if (op === "find_card") validateDestination(findDestinations, true);
    if (op === "acquire_card" || op === "gain_card" || op === "take_card") validateDestination(gainDestinations);
    if (op === "look_take_card") validateDestination(lookTakeDestinations);
    if (op === "profit") validateDestination(profitDestinations);
    if (op === "break_through") validateRequiredBreakThroughSuitField();
    if (["free_play_card","acquire_card","gain_card","take_card","find_card","exile_card"].includes(op)) validateSuitField("suit");
    if (op === "break_through" && record.cardType !== undefined) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid cardType for ${op} at ${path}[${index}]: ${String(record.cardType)}` });
      fatal = true;
    }
    if (record.cardId !== undefined && !cardIdEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid cardId for ${op} at ${path}[${index}]: ${String(record.cardId)}` });
      fatal = true;
    }
    if (record.hostCardId !== undefined && !hostCardIdEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid hostCardId for ${op} at ${path}[${index}]: ${String(record.hostCardId)}` });
      fatal = true;
    }
    if (record.marketCardId !== undefined && !marketCardIdEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid marketCardId for ${op} at ${path}[${index}]: ${String(record.marketCardId)}` });
      fatal = true;
    }
    if (record.targetPlayerId !== undefined && !targetPlayerIdEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid targetPlayerId for ${op} at ${path}[${index}]: ${String(record.targetPlayerId)}` });
      fatal = true;
    }
    if (record.targetPlayerIds !== undefined && !targetPlayerIdsEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid targetPlayerIds for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.fromPlayerIds !== undefined && !fromPlayerIdsEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid fromPlayerIds for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.targetPlayerScope !== undefined && !targetPlayerScopeEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid targetPlayerScope for ${op} at ${path}[${index}]: ${String(record.targetPlayerScope)}` });
      fatal = true;
    }
    if (record.targetPlayerScope !== undefined && (typeof record.targetPlayerScope !== "string" || !targetPlayerScopes.has(record.targetPlayerScope))) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid targetPlayerScope for ${op} at ${path}[${index}]: ${String(record.targetPlayerScope)}` });
      fatal = true;
    }
    if (record.fromPlayerId !== undefined && !fromPlayerIdEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid fromPlayerId for ${op} at ${path}[${index}]: ${String(record.fromPlayerId)}` });
      fatal = true;
    }
    if (record.reason !== undefined && !reasonEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid reason for ${op} at ${path}[${index}]: ${String(record.reason)}` });
      fatal = true;
    }
    if (record.state !== undefined && !stateEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid state for ${op} at ${path}[${index}]: ${String(record.state)}` });
      fatal = true;
    }
    if (record.from !== undefined && !fromEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid from for ${op} at ${path}[${index}]: ${String(record.from)}` });
      fatal = true;
    }
    if (record.to !== undefined && !toEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid to for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.effects !== undefined && !effectsEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid effects for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.ifUnable !== undefined && !ifUnableEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ifUnable for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.choices !== undefined && !choicesEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid choices for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.then !== undefined && !thenEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid then for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.else !== undefined && !elseEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid else for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.source !== undefined && !sourceEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid source for ${op} at ${path}[${index}]: ${String(record.source)}` });
      fatal = true;
    }
    if (record.sourceZones !== undefined && !sourceZonesEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid sourceZones for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.sourceZone !== undefined && !sourceZoneEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid sourceZone for ${op} at ${path}[${index}]` });
      fatal = true;
    }
    if (record.destination !== undefined && !destinationEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid destination for ${op} at ${path}[${index}]: ${String(record.destination)}` });
      fatal = true;
    }
    if (record.suit !== undefined && !suitEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid suit for ${op} at ${path}[${index}]: ${String(record.suit)}` });
      fatal = true;
    }
    if (record.cardType !== undefined && !cardTypeEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid cardType for ${op} at ${path}[${index}]: ${String(record.cardType)}` });
      fatal = true;
    }
    if (record.resource !== undefined && !resourceEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid resource for ${op} at ${path}[${index}]: ${String(record.resource)}` });
      fatal = true;
    }
    if (record.count !== undefined && !countEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid count for ${op} at ${path}[${index}]: ${String(record.count)}` });
      fatal = true;
    }
    if (record.amount !== undefined && !amountEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid amount for ${op} at ${path}[${index}]: ${String(record.amount)}` });
      fatal = true;
    }
    if (record.atLeast !== undefined && !atLeastEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid atLeast for ${op} at ${path}[${index}]: ${String(record.atLeast)}` });
      fatal = true;
    }
    if (record.free !== undefined && op !== "develop") {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid free for ${op} at ${path}[${index}]: ${String(record.free)}` });
      fatal = true;
    }
    if (record.optionalForTargets !== undefined && op !== "draw") {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid optionalForTargets for ${op} at ${path}[${index}]: ${String(record.optionalForTargets)}` });
      fatal = true;
    }
    if (record.upTo !== undefined && op !== "draw" && op !== "draw_if_able") {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid upTo for ${op} at ${path}[${index}]: ${String(record.upTo)}` });
      fatal = true;
    }
    if (record.ignoreStateRequirement !== undefined && op !== "free_play_card") {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid ignoreStateRequirement for ${op} at ${path}[${index}]: ${String(record.ignoreStateRequirement)}` });
      fatal = true;
    }
    if (record.attackTargeted !== undefined && !attackTargetedEffectOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effect_ops_json", message: `Invalid attackTargeted for ${op} at ${path}[${index}]: ${String(record.attackTargeted)}` });
      fatal = true;
    }
    if (op === "develop") validateOptionalBoolean("free");
    if (op === "draw") validateOptionalBoolean("optionalForTargets");
    if (op === "draw" || op === "draw_if_able") validateOptionalBoolean("upTo");
    if (op === "free_play_card") validateOptionalBoolean("ignoreStateRequirement");
    if (op === "take_unrest" || op === "steal_resource") validateOptionalBoolean("attackTargeted");
    if (["free_play_card","acquire_card","gain_card","take_card","find_card","exile_card"].includes(op)) validateCardTypeField();
    if (op === "find_card") validateSourceZones(findSources, "sourceZones");
    if (op === "treat_suit_as") {
      validateRequiredIconSuitField("from");
      validateIconSuitArray("to");
    }
    if (fromPlayerIdEffectOps.has(op) && record.fromPlayerIds === undefined && record.targetPlayerScope === undefined) validateRequiredString("fromPlayerId");
    if (op === "trigger_scoring") validateRequiredString("reason");
    if (op === "conditional_state_is") validateRequiredString("state");
    if (["gain_resource","move_resource_to_market","spend_resource","remove_resource","return_resource","steal_resource","conditional_resource_at_least"].includes(op)) validateRequiredResource();
    if (cardIdEffectOps.has(op)) validateOptionalString("cardId");
    if (hostCardIdEffectOps.has(op)) validateOptionalString("hostCardId");
    if (marketCardIdEffectOps.has(op)) validateOptionalString("marketCardId");
    if (targetPlayerIdEffectOps.has(op)) {
      validateOptionalString("targetPlayerId");
      validateOptionalStringArray("targetPlayerIds");
    }
    if (op === "draw") validateOptionalStringArray("targetPlayerIds");
    if (op === "recall_region" || op === "abandon_region") validateOptionalStringArray("targetPlayerIds");
    if (op === "take_unrest") validateOptionalStringArray("targetPlayerIds");
    if (op === "steal_resource") validateOptionalStringArray("fromPlayerIds");
    validateReactiveMetadata();
    if (op === "optional" || op === "commerce" || op === "profit") {
      const nestedEffects = (effect as { effects?: unknown }).effects;
      if (Array.isArray(nestedEffects) && nestedEffects.length === 0) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].effects must contain at least one effect` });
        fatal = true;
      }
      fatal = validateEffectOps(errors, row, nestedEffects, `${path}[${index}].effects`, false) || fatal;
    }
    if (op === "choose_one") {
      const choices = (effect as { choices?: unknown }).choices;
      if (!Array.isArray(choices)) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].choices must parse to array` });
        fatal = true;
      } else if (choices.length === 0) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].choices must contain at least one choice` });
        fatal = true;
      } else {
        choices.forEach((choice, choiceIndex) => {
          if (Array.isArray(choice) && choice.length === 0) {
            errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].choices[${choiceIndex}] must contain at least one effect` });
            fatal = true;
          }
          fatal = validateEffectOps(errors, row, choice, `${path}[${index}].choices[${choiceIndex}]`, false) || fatal;
        });
      }
    }
    if (op === "conditional_resource_at_least" || op === "conditional_state_is") {
      const thenEffects = (effect as { then?: unknown }).then;
      if (Array.isArray(thenEffects) && thenEffects.length === 0) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].then must contain at least one effect` });
        fatal = true;
      }
      fatal = validateEffectOps(errors, row, thenEffects, `${path}[${index}].then`, false) || fatal;
      const elseEffects = (effect as { else?: unknown }).else;
      if (Array.isArray(elseEffects) && elseEffects.length === 0) {
        errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].else must contain at least one effect` });
        fatal = true;
      }
      if (elseEffects !== undefined) fatal = validateEffectOps(errors, row, elseEffects, `${path}[${index}].else`, false) || fatal;
    }
    if (op === "steal_resource") {
      const fallbackEffects = (effect as { ifUnable?: unknown }).ifUnable;
      if (fallbackEffects !== undefined) {
        if (Array.isArray(fallbackEffects) && fallbackEffects.length === 0) {
          errors.push({ level: "fatal", row, field: "effect_ops_json", message: `${path}[${index}].ifUnable must contain at least one effect` });
          fatal = true;
        }
        fatal = validateEffectOps(errors, row, fallbackEffects, `${path}[${index}].ifUnable`, false) || fatal;
      }
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
  let fatal = false;
  Object.keys(details as Record<string, unknown>).forEach((fieldName) => {
    if (!vpDetailFields.has(fieldName)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: `Unsupported VP detail field: ${fieldName}` });
      fatal = true;
    }
  });
  if (details.condition !== undefined) {
    const condition = details.condition as { op?: unknown; zoneId?: unknown };
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP condition must be an object" });
      return { fatal: true };
    }
    Object.keys(condition as Record<string, unknown>).forEach((fieldName) => {
      if (!vpConditionFields.has(fieldName)) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: `Unsupported VP condition field: ${fieldName}` });
        fatal = true;
      }
    });
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
    const formula = details.formula as { op?: unknown; tag?: unknown; suit?: unknown; zones?: unknown; resource?: unknown; resources?: unknown; resourceZones?: unknown; amountEach?: unknown; denominator?: unknown; cap?: unknown };
    if (!formula || typeof formula !== "object" || Array.isArray(formula)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP formula must be an object" });
      return { fatal: true };
    }
    if (formula.op !== "count_cards" && formula.op !== "count_resources") {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: `Unsupported VP formula: ${String(formula.op ?? "missing")}` });
      return { fatal: true };
    }
    const formulaFields = formula.op === "count_cards" ? vpCountCardsFormulaFields : vpCountResourcesFormulaFields;
    Object.keys(formula as Record<string, unknown>).forEach((fieldName) => {
      if (!formulaFields.has(fieldName)) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: `Unsupported VP formula field: ${fieldName}` });
        fatal = true;
      }
    });
    if (!isNumber(formula.amountEach)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: `VP ${formula.op} formula requires numeric amountEach` });
      return { fatal: true };
    }
    if (formula.op === "count_cards") {
      if (formula.tag !== undefined && typeof formula.tag !== "string") {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_cards formula tag must be a string" });
        return { fatal: true };
      }
      if (formula.suit !== undefined && (typeof formula.suit !== "string" || !suitIcons.has(formula.suit))) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: `Invalid VP count_cards formula suit: ${String(formula.suit)}` });
        return { fatal: true };
      }
      if (formula.zones !== undefined && (!Array.isArray(formula.zones) || formula.zones.some((zone) => typeof zone !== "string" || !zone.trim()))) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_cards formula zones must be a string array" });
        return { fatal: true };
      }
    }
    if (formula.op === "count_resources") {
      const hasSingleResource = typeof formula.resource === "string" && formula.resource.trim().length > 0;
      const hasResourceList = Array.isArray(formula.resources) && formula.resources.length > 0 && formula.resources.every((resource) => typeof resource === "string" && resource.trim().length > 0);
      if (!hasSingleResource && !hasResourceList) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_resources formula requires resource or resources" });
        return { fatal: true };
      }
      const invalidResources = collectInvalidResourceNames({ formula }, "$.vp_details_json");
      if (invalidResources.length > 0) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: `Invalid VP count_resources formula resource: ${invalidResources[0].resource}` });
        return { fatal: true };
      }
      if (formula.denominator !== undefined && (!isNumber(formula.denominator) || formula.denominator <= 0)) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_resources formula denominator must be positive numeric when present" });
        return { fatal: true };
      }
      if (formula.resourceZones !== undefined && (!Array.isArray(formula.resourceZones) || formula.resourceZones.some((zone) => typeof zone !== "string" || !zone.trim()))) {
        errors.push({ level: "fatal", row, field: "vp_details_json", message: "VP count_resources formula resourceZones must be a string array" });
        return { fatal: true };
      }
    }
    if (formula.cap !== undefined && !isNumber(formula.cap)) {
      errors.push({ level: "fatal", row, field: "vp_details_json", message: `VP ${formula.op} formula cap must be numeric when present` });
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
  return { fatal, details };
}

export function validatePrivateCardsRows(rows: PrivateCardCsvRow[]): CardImportReport {
  const errors: CardImportError[]=[]; const seen=new Set<string>(); let implemented=0,tested=0,validRows=0;
  rows.forEach((r,i)=>{ const row=i+2; let fatal=false;
    for(const f of req){ if(!(r[f]??"").trim()){ errors.push({level:"fatal",row,field:f,message:"Required field missing"}); fatal=true; }}
    const id=(r.card_id||"").trim(); if(!id){fatal=true;} else if(seen.has(id)){errors.push({level:"fatal",row,field:"card_id",message:"Duplicate card_id"}); fatal=true;} else seen.add(id);
    if(!suits.has((r.suit||"").trim())){errors.push({level:"fatal",row,field:"suit",message:"Invalid suit"}); fatal=true;}
    fatal = validatePipeEnums({ errors, row, field: "suit_icons", value: r.suit_icons, allowed: suitIcons, message: "Invalid suit_icons" }) || fatal;
    if ((r.suit || "").trim() === "multi" && new Set(pipeValues(r.suit_icons || "")).size < 2) {
      errors.push({ level: "fatal", row, field: "suit_icons", message: "Multi-suit cards require at least two suit_icons" });
      fatal = true;
    }
    if(!types.has((r.card_type||"").trim())){errors.push({level:"fatal",row,field:"card_type",message:"Invalid card_type"}); fatal=true;}
    fatal = validateStateRequirement(errors, row, r.state_requirement) || fatal;
    if(!starts.has((r.starting_location||"").trim())){errors.push({level:"fatal",row,field:"starting_location",message:"Invalid starting_location"}); fatal=true;}
    if(!vpModes.has((r.vp_mode||"").trim())){errors.push({level:"fatal",row,field:"vp_mode",message:"Invalid vp_mode"}); fatal=true;}
    fatal = validateOptionalEnum({ errors, row, field: "ownership", value: r.ownership, allowed: ownerships, message: "Invalid ownership" }) || fatal;
    fatal = validateOptionalEnum({ errors, row, field: "commons_set_id", value: r.commons_set_id, allowed: commonsSets, message: "Invalid commons_set_id" }) || fatal;
    fatal = validateOptionalEnum({ errors, row, field: "setup_banner_suit", value: r.setup_banner_suit, allowed: setupBannerSuits, message: "Invalid setup_banner_suit" }) || fatal;
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
