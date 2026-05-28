export type NationStrategyProfile = {
  nationId: string;
  displayName: string;
  privateName?: string;
  complexity?: number;
  aggression?: "peaceful" | "moderate" | "aggressive" | "ruthless" | "unknown";
  publicPlaceholderSummary: string;
  privateCoreGameplan?: string;
  privateEarlyGame?: string;
  privateMidGame?: string;
  privateLateGame?: string;
  privateKeyMechanics?: string[];
  privateMarketPriorities?: string[];
  privateRiskNotes?: string[];
  privateRulesEngineNotes?: string[];
  implemented: boolean;
  tested: boolean;
};
export const SHOW_PRIVATE_DEBUG_FIELDS = false;
