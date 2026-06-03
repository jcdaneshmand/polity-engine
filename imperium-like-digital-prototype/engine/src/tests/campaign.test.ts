import { describe, expect, it } from "vitest";
import { applyCampaignResult, campaignStartingResourceOverride, canCampaignPlayAgainstBot, createCampaignProgress } from "../game/campaign";

describe("campaign progression", () => {
  it("advances standard campaign wins through the difficulty ladder and records deck choices", () => {
    const started = createCampaignProgress({ mode: "standard", playerNationId: "human_nation" });
    const afterFirstWin = applyCampaignResult(started, {
      won: true,
      botNationId: "bot_rome",
      difficulty: "chieftain",
      score: 71,
      choice: { kind: "add_gained_commons_to_starting_deck", cardId: "market_card" }
    });
    const afterSecondWin = applyCampaignResult(afterFirstWin, {
      won: true,
      botNationId: "bot_carthage",
      difficulty: "warlord",
      choice: { kind: "remove_starting_deck_card", cardId: "starter_card" }
    });

    expect(afterFirstWin.currentDifficulty).toBe("warlord");
    expect(afterSecondWin.currentDifficulty).toBe("imperator");
    expect(afterSecondWin.wins).toBe(2);
    expect(afterSecondWin.defeatedBotNationIds).toEqual(["bot_rome", "bot_carthage"]);
    expect(afterSecondWin.startingDeckAdditions).toEqual(["market_card"]);
    expect(afterSecondWin.startingDeckRemovals).toEqual(["starter_card"]);
    expect(afterSecondWin.doubleStartingResourcesForNextGame).toBe(false);
    expect(canCampaignPlayAgainstBot(afterSecondWin, "bot_rome")).toBe(false);
    expect(canCampaignPlayAgainstBot(afterSecondWin, "bot_persia")).toBe(true);
  });

  it("marks loss carryover resources, clears them after a win, and loses the campaign at four losses", () => {
    const started = createCampaignProgress({ mode: "standard", playerNationId: "human_nation", startingDifficulty: "imperator" });
    const afterLoss = applyCampaignResult(started, { won: false, botNationId: "bot_rome", difficulty: "imperator" });
    const afterRecovery = applyCampaignResult(afterLoss, { won: true, botNationId: "bot_rome", difficulty: "imperator" });
    const lost = [0, 1, 2, 3].reduce(
      (progress) => applyCampaignResult(progress, { won: false, botNationId: "bot_rome", difficulty: progress.currentDifficulty }),
      started
    );

    expect(afterLoss.losses).toBe(1);
    expect(afterLoss.currentDifficulty).toBe("imperator");
    expect(afterLoss.doubleStartingResourcesForNextGame).toBe(true);
    expect(campaignStartingResourceOverride(afterLoss, [])).toEqual({ materials: 6, influence: 4, knowledge: 2, goods: 0 });
    expect(campaignStartingResourceOverride(afterLoss, ["trade_routes"])).toEqual({ materials: 6, influence: 4, knowledge: 0, goods: 2 });
    expect(afterRecovery.doubleStartingResourcesForNextGame).toBe(false);
    expect(lost.complete).toBe("lost");
  });

  it("tracks Supreme Ruler set-aside Commons cards and returns one after a loss", () => {
    const started = createCampaignProgress({ mode: "supreme_ruler", playerNationId: "human_nation" });
    const afterWin = applyCampaignResult(started, {
      won: true,
      botNationId: "bot_rome",
      difficulty: "supreme_ruler",
      choice: { kind: "set_aside_commons_card", cardId: "commons_card" }
    });
    const afterLoss = applyCampaignResult(afterWin, {
      won: false,
      botNationId: "bot_carthage",
      difficulty: "supreme_ruler",
      choice: { kind: "return_set_aside_commons_card", cardId: "commons_card" }
    });

    expect(afterWin.currentDifficulty).toBe("supreme_ruler");
    expect(afterWin.setAsideCommonsCardIds).toEqual(["commons_card"]);
    expect(afterLoss.setAsideCommonsCardIds).toEqual([]);
    expect(afterLoss.doubleStartingResourcesForNextGame).toBe(true);
  });
});
