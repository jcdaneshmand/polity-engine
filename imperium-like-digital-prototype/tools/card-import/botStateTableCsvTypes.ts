export type PrivateBotStateTableCsvRow = {
  table_id: string;
  bot_nation_id: string;
  table_side: string;
  row_id: string;
  priority: string;
  trigger_kind: string;
  trigger_value: string;
  public_placeholder_label: string;
  private_trigger_label: string;
  private_effect_text: string;
  effects_json: string;
  implemented: string;
  tested: string;
  notes: string;
};

export type BotStateTableImportError = {
  level: "fatal" | "warning";
  row: number;
  field: string;
  message: string;
};

export type BotStateTableImportReport = {
  errors: BotStateTableImportError[];
  counts: { rows: number; validRows: number; fatal: number; warnings: number };
  coverage: { implemented: number; tested: number };
};
