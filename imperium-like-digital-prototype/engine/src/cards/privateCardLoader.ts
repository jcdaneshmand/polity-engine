import fs from "node:fs";
import type { ExpansionId, NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import { loadCardDb } from "./cardLoader";
import type { Card } from "../game/state";

/** Local-only private data loader. generated-private JSON is gitignored and must be explicitly requested. */
export function loadCardDbWithOptionalPrivateData(opts?: { usePrivate?: boolean; privatePath?: string; enabledExpansions?: ExpansionId[] }): Record<string, Card> {
  if (!opts?.usePrivate) return loadCardDb();
  const path = opts.privatePath ?? "generated-private/cards.normalized.json";
  if (!fs.existsSync(path)) return loadCardDb();
  const enabled = opts.enabledExpansions ?? [];
  const rows = JSON.parse(fs.readFileSync(path, "utf8")) as NormalizedCardRecord[];
  const filtered = rows.filter((r) => {
    const required = r.requiredExpansions ?? [];
    const excluded = r.excludedExpansions ?? [];
    if (required.some((e) => !enabled.includes(e))) return false;
    if (excluded.some((e) => enabled.includes(e))) return false;
    return true;
  });
  const fromPrivate: Record<string, Card> = {};
  filtered.forEach((r) => { fromPrivate[r.id] = { id: r.id, displayName: r.displayName, type: "action", cost: r.cost.materials + r.cost.population + r.cost.progress + r.cost.goods, tags: r.tags, effects: r.effects as any }; });
  return fromPrivate;
}
