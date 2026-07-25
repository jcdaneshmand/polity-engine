export type PrivateImportSource = {
  input: string;
  output: string;
  template: string;
};

export const privateImportSources: PrivateImportSource[] = [
  {
    input: "private-card-data/imperium_cards_private.csv",
    output: "generated-private/cards.normalized.json",
    template: "private-card-data/card-data-template.csv"
  },
  {
    input: "private-card-data/imperium_nations_private.csv",
    output: "generated-private/nations.normalized.json",
    template: "private-card-data/nation-data-template.csv"
  },
  {
    input: "private-card-data/imperium_nation_rulesets_private.csv",
    output: "generated-private/nation-rulesets.normalized.json",
    template: "private-card-data/nation-ruleset-template.csv"
  },
  {
    input: "private-card-data/imperium_nation_strategy_private.csv",
    output: "generated-private/nation-strategy.normalized.json",
    template: "private-card-data/nation-strategy-template.csv"
  },
  {
    input: "private-card-data/imperium_bot_state_tables_private.csv",
    output: "generated-private/bot-state-tables.normalized.json",
    template: "private-card-data/bot-state-table-template.csv"
  },
  {
    input: "private-card-data/imperium_bot_trade_routes_private.csv",
    output: "generated-private/bot-trade-routes-tables.normalized.json",
    template: "private-card-data/bot-trade-routes-table-template.csv"
  }
];
