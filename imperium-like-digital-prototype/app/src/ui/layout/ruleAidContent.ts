export type RuleAidItem = {
  id: string;
  title: string;
  body: string;
  when?: (args: { G: any; pending?: any; selectedCard?: any }) => boolean;
};

export const ruleAidItems: RuleAidItem[] = [
  {
    id: "turn-flow",
    title: "Turn Flow",
    body: "Use available actions during Activate turns, then end the turn to run cleanup and handoff."
  },
  {
    id: "tokens",
    title: "Action And Exhaust Tokens",
    body: "Most played-card actions spend Action capacity. Exhaust abilities need an available Exhaust token and a ready card."
  },
  {
    id: "pending",
    title: "Pending Choices",
    body: "When a pending choice is shown, resolve that obligation before normal turn actions continue.",
    when: ({ pending }) => Boolean(pending)
  },
  {
    id: "market",
    title: "Market Targets",
    body: "Highlighted market cards are legal one-click targets for the current choice or effect."
  },
  {
    id: "acquire-break-through",
    title: "Acquire And Break Through",
    body: "Acquire moves a chosen card to the instructed destination. Break Through selects a market card through an effect or eligible action."
  },
  {
    id: "visibility",
    title: "Hidden And Public Zones",
    body: "Private zones show only information the viewer is allowed to know. Public zones show card identities."
  },
  {
    id: "trade-routes",
    title: "Trade Routes",
    body: "Trade Route aid appears only when the module is enabled; completed routes can unlock Profit actions.",
    when: ({ G }) => (G?.options?.enabledExpansions ?? []).includes("trade_routes")
  },
  {
    id: "solo",
    title: "Solo Bot Flow",
    body: "Solo mode alternates your choices with automated bot upkeep, market pressure, and scoring checks.",
    when: ({ G }) => G?.options?.mode === "solo"
  },
  {
    id: "scoring",
    title: "Scoring Reminders",
    body: "Endgame summaries are produced by the rules engine from public state, scoring cards, collapse checks, and mode conditions."
  }
];

export function visibleRuleAidItems(args: { G: any; pending?: any; selectedCard?: any }): RuleAidItem[] {
  return ruleAidItems.filter((item) => !item.when || item.when(args));
}
