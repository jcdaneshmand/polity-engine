import type { NationRuleset } from "../../engine/src/nations/nationRulesetTypes";
export interface PrivateNationRulesetCsvRow { [k: string]: string; }
export type NationRulesetImportError = { level: "fatal"|"warning"; row: number; field: string; message: string };
export type NationRulesetImportReport = { errors: NationRulesetImportError[]; counts: { rows:number; fatal:number; warnings:number } };
export type { NationRuleset };
