import type { BotStateTable } from "./botStateTableTypes";

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

export function loadBotStateTables(): Record<string, BotStateTable> {
  return JSON.parse(JSON.stringify(placeholder)) as Record<string, BotStateTable>;
}
