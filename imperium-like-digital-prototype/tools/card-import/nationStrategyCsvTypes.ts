import type { NationStrategyProfile } from "../../engine/src/nations/nationStrategyTypes";
export interface PrivateNationStrategyCsvRow { [k: string]: string; }
export type NationStrategyImportError = { level: "fatal"|"warning"; row: number; field: string; message: string };
export type NationStrategyImportReport = { errors: NationStrategyImportError[]; counts: { rows:number; fatal:number; warnings:number } };
export type { NationStrategyProfile };
