import type { RulesModule } from "./rulesModuleTypes";

export const loweredAggressionModule: RulesModule = {
  id: "lowered_aggression",
  kind: "variant",
  modifyDeckConstruction: (ctx) => {
    const delayed = ctx.cards.filter((c: any) => (c.cardType === "attack" || c.tags?.includes("aggressive")) && c.delayableInLoweredAggression);
    ctx.setupReport.delayedAggressiveCount = delayed.length;
  }
};

export const quickSetupModule: RulesModule = {
  id: "quick_setup",
  kind: "variant",
  modifyMarketSetup: (ctx) => { ctx.setupReport.usedQuickSetup = true; }
};

export const preciousCardsModule: RulesModule = {
  id: "precious_cards",
  kind: "variant",
  modifyLegalMoves: (_G, _playerId, options) => ({ canVoluntaryDiscardCleanup: !options.enabledVariants.includes("precious_cards") })
};

export const shortGameModule: RulesModule = {
  id: "short_game",
  kind: "variant",
  modifyDeckConstruction: (ctx) => { ctx.setupReport.shortGameExiled = 10; ctx.setupReport.shortGameNationAdvanced = 1; }
};
