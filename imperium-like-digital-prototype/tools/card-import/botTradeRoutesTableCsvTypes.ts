export type PrivateBotTradeRoutesTableCsvRow = {
  table_id: string;
  row_type: string;
  merchant_state: string;
  priority: string;
  trade_route_card_id: string;
  public_placeholder_name: string;
  private_name: string;
  commerce_effects_json: string;
  profit_effects_json: string;
  end_of_turn_effects_json: string;
  implemented: string;
  tested: string;
  notes: string;
};

export type BotTradeRoutesTableImportError = {
  level: "fatal" | "warning";
  row: number;
  field: string;
  message: string;
};

export type BotTradeRoutesTableImportReport = {
  errors: BotTradeRoutesTableImportError[];
  counts: { rows: number; validRows: number; fatal: number; warnings: number };
  coverage: { implemented: number; tested: number };
};
