import type { BotStateTable } from "./botStateTableTypes";
import { getNodeFs, resolveFromCwd } from "../local/nodeBuiltins";

const placeholder: Record<string, BotStateTable> = {
  placeholder_S: {
    id: "placeholder",
    botNationId: "placeholder_nation",
    displayName: "Placeholder Bot Table",
    side: "S",
    rows: [
      { id: "row_unrest", priority: 1, trigger: { kind: "unrest" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: false, publicPlaceholderLabel: "Unrest placeholder" },
      { id: "row_other", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: false, publicPlaceholderLabel: "Fallback placeholder" }
    ]
  }
};

export function loadBotStateTables(opts: { usePrivate?: boolean; privatePath?: string } = {}): Record<string, BotStateTable> {
  const privatePath = opts.privatePath ?? resolveFromCwd("generated-private/bot-state-tables.normalized.json");
  const fs = getNodeFs();
  if ((opts.usePrivate || opts.privatePath) && fs?.existsSync(privatePath)) {
    return JSON.parse(fs.readFileSync(privatePath, "utf8")) as Record<string, BotStateTable>;
  }
  if (opts.usePrivate || opts.privatePath) {
    throw new Error(`Private bot state tables requested but not found: ${privatePath}`);
  }
  return JSON.parse(JSON.stringify(placeholder)) as Record<string, BotStateTable>;
}
