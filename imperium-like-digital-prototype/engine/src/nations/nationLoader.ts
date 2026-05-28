import fs from "node:fs";
import placeholder from "../../../data/placeholder-cards/test-civilizations.json";
import type { ExpansionId } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "./nationSchema";

/** Private nation data is local-only and gitignored. Never static import generated-private JSON. */
export function loadNationDb(opts?: { usePrivate?: boolean; privatePath?: string; enabledExpansions?: ExpansionId[] }): Record<string, NationDefinition> {
  const list: NationDefinition[] = opts?.usePrivate && fs.existsSync(opts.privatePath ?? "generated-private/nations.normalized.json")
    ? JSON.parse(fs.readFileSync(opts.privatePath ?? "generated-private/nations.normalized.json", "utf8"))
    : [
      { id: "test_nation_sun_coast", displayName: "Sun Coast Accord", powerCardIds: ["test_action_civic_assembly"], stateCardIds: ["test_action_archive_survey"], startingDeckCardIds: placeholder[0].startingDeck, nationDeckCardIds:["test_action_lineage_record"], developmentCardIds:["test_action_scholars_circle"], setupRules:[], passiveRules:[], actionTokensBase:1, exhaustTokensBase:1, requiredExpansions:[], excludedExpansions:[], implemented:false, tested:false },
      { id: "test_nation_river_court", displayName: "River Court Forum", powerCardIds: ["test_action_market_pull"], stateCardIds: ["test_action_foundry_shift"], startingDeckCardIds: placeholder[1].startingDeck, nationDeckCardIds:["test_action_lineage_record"], developmentCardIds:["test_action_scholars_circle"], setupRules:[{op:"require_expansion", expansionId:"trade_routes"}], passiveRules:[], actionTokensBase:1, exhaustTokensBase:1, requiredExpansions:["trade_routes"], excludedExpansions:[], implemented:false, tested:false }
    ];
  const enabled = opts?.enabledExpansions ?? [];
  const filtered = list.filter((n) => !n.requiredExpansions.some((e) => !enabled.includes(e)) && !(n.excludedExpansions ?? []).some((e) => enabled.includes(e)));
  return Object.fromEntries(filtered.map((n) => [n.id, n]));
}
