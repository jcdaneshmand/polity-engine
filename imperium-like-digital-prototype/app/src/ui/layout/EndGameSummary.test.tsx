import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EndGameSummary, { accountGameResultFromSummary, campaignSheetExportText, completeCampaignProgressFromSummary } from "./EndGameSummary";

describe("EndGameSummary", () => {
  it("renders outcome, scores, tie-breaks, and game statistics", () => {
    const html = renderToStaticMarkup(
      <EndGameSummary
        G={{
          round: 7,
          log: [
            { round: 1, playerId: "0", message: "Started" },
            { round: 7, playerId: "scoring", message: "ScoringFinalized(winner=0)" }
          ],
          gameover: {
            winner: "0",
            reason: "normal_scoring:deck_empty",
            scores: { "0": 42, "1": 38 },
            tieBreakScores: { "0": 12, "1": 8 }
          },
          players: {
            "0": {
              hand: ["card-a"],
              deck: ["card-b", "card-c"],
              discard: [],
              playArea: ["card-d"],
              history: ["card-e", "card-f"],
              exile: [],
              powerArea: [],
              stateArea: [],
              developmentArea: [],
              nationDeck: [],
              resources: { materials: 2, knowledge: 5, influence: 1, unrest: 0, goods: 3 }
            },
            "1": {
              hand: [],
              deck: [],
              discard: ["card-g"],
              playArea: [],
              history: [],
              exile: ["card-h"],
              powerArea: [],
              stateArea: [],
              developmentArea: [],
              nationDeck: [],
              resources: { materials: 0, knowledge: 1, influence: 0, unrest: 2, goods: 0 }
            }
          },
          solo: {
            bot: {
              botId: "bot_0",
              botDeck: ["bot-a"],
              botDiscard: ["bot-b", "bot-c"],
              botPlayArea: [],
              botHistory: ["bot-d"],
              resources: { materials: 1, knowledge: 2, influence: 0, unrest: 0, goods: 0 },
              slots: { military: { cardId: "bot-slot" } }
            }
          }
        }}
        ctx={{ currentPlayer: "0" }}
        onReviewBoard={() => undefined}
      />
    );

    expect(html).toContain("Game Complete");
    expect(html).toContain("Winner: Player 0");
    expect(html).toContain("Deck Empty");
    expect(html).toContain("Player 0");
    expect(html).toContain("42");
    expect(html).toContain("Tie-break");
    expect(html).toContain("Rounds Played");
    expect(html).toContain("7");
    expect(html).toContain("Log Events");
    expect(html).toContain("2");
    expect(html).toContain("Player 0 Cards");
    expect(html).toContain("6");
    expect(html).toContain("Player 0 Resources");
    expect(html).toContain("11");
    expect(html).toContain("Bot Cards");
    expect(html).toContain("5");
    expect(html).toContain("Review Board");
  });

  it("extracts an account game result payload from the summary state", () => {
    expect(accountGameResultFromSummary({
      G: {
        round: 7,
        gameover: {
          winner: "0",
          reason: "normal_scoring:deck_empty",
          scores: { "0": 42, "1": 38 },
          tieBreakScores: { "0": 12, "1": 8 }
        },
        players: {
          "0": {
            hand: ["card-a"],
            deck: ["card-b", "card-c"],
            discard: [],
            playArea: ["card-d"],
            history: ["card-e", "card-f"],
            exile: [],
            powerArea: [],
            stateArea: [],
            developmentArea: [],
            nationDeck: [],
            resources: { materials: 2, knowledge: 5, influence: 1, unrest: 0, goods: 3 }
          }
        },
        rulesetReports: [
          { playerId: "0", nationId: "test_nation_sun_coast" },
          { playerId: "1", nationId: "test_nation_river" }
        ]
      },
      historyEntryID: "game-1",
      playerID: "0",
      scope: "solo",
      variant: "standard"
    })).toEqual({
      id: "game-1",
      outcome: "win",
      winnerID: "0",
      winnerNationID: "test_nation_sun_coast",
      reason: "normal_scoring:deck_empty",
      scores: { "0": 42, "1": 38 },
      tieBreakScores: { "0": 12, "1": 8 },
      roundsPlayed: 7,
      finalResources: { materials: 2, knowledge: 5, influence: 1, unrest: 0, goods: 3 },
      finalDeckSize: 2,
      finalCardsInPlay: 1,
      finalUnrest: 0,
      finalFame: 0,
      rawSummaryStats: {
        scope: "solo",
        variant: "standard",
        nationID: "test_nation_sun_coast",
        opponentNationIDs: ["test_nation_river"]
      }
    });
  });

  it("renders campaign outcome and reward choices", () => {
    const html = renderToStaticMarkup(
      <EndGameSummary
        G={{
          round: 5,
          log: [],
          options: {
            campaignProgress: {
              mode: "standard",
              playerNationId: "human_nation",
              wins: 0,
              losses: 0,
              currentDifficulty: "chieftain",
              defeatedBotNationIds: [],
              startingDeckAdditions: [],
              startingDeckRemovals: [],
              setAsideCommonsCardIds: []
            }
          },
          gameover: {
            winner: "0",
            reason: "normal_scoring:deck_empty",
            scores: { "0": 41, bot_0: 29 },
            campaignOutcome: {
              mode: "standard",
              won: true,
              humanPlayerId: "0",
              botId: "bot_0",
              botNationId: "bot_persians",
              difficulty: "chieftain",
              score: 41,
              botScore: 29,
              scoreKind: "victory_points",
              requiresCampaignChoice: true,
              result: { won: true, botNationId: "bot_persians", difficulty: "chieftain", score: 41 }
            }
          },
          players: {
            "0": {
              hand: ["commons_gain"],
              deck: ["starter_card"],
              discard: [],
              playArea: [],
              history: [],
              exile: [],
              powerArea: [],
              stateArea: [],
              developmentArea: [],
              nationDeck: [],
              resources: {}
            }
          },
          cardDb: {
            commons_gain: {
              id: "commons_gain",
              displayName: "Commons Gain",
              ownership: "commons",
              type: "action",
              cardType: "action",
              suit: "civilized",
              cost: 0,
              tags: [],
              effects: []
            },
            starter_card: {
              id: "starter_card",
              displayName: "Starter Card",
              ownership: "nation",
              type: "action",
              cardType: "action",
              suit: "uncivilized",
              cost: 0,
              tags: [],
              effects: []
            }
          }
        }}
      />
    );

    expect(html).toContain("Campaign");
    expect(html).toContain("Victory Points");
    expect(html).toContain("Bot Persians");
    expect(html).toContain("Add Commons Gain");
    expect(html).toContain("Remove Starter Card");
    expect(html).toContain("Update Campaign");
  });

  it("applies a selected campaign reward to the next progress record", () => {
    const progress = completeCampaignProgressFromSummary(
      {
        mode: "standard",
        playerNationId: "human_nation",
        wins: 0,
        losses: 0,
        currentDifficulty: "chieftain",
        defeatedBotNationIds: [],
        startingDeckAdditions: [],
        startingDeckRemovals: [],
        setAsideCommonsCardIds: []
      },
      {
        mode: "standard",
        won: true,
        humanPlayerId: "0",
        botId: "bot_0",
        botNationId: "bot_persians",
        difficulty: "chieftain",
        score: 41,
        scoreKind: "victory_points",
        requiresCampaignChoice: true,
        result: { won: true, botNationId: "bot_persians", difficulty: "chieftain", score: 41 }
      },
      { kind: "add_gained_commons_to_starting_deck", cardId: "commons_gain" }
    );

    expect(progress.wins).toBe(1);
    expect(progress.currentDifficulty).toBe("warlord");
    expect(progress.defeatedBotNationIds).toEqual(["bot_persians"]);
    expect(progress.startingDeckAdditions).toEqual(["commons_gain"]);
    expect(progress.records?.[0]?.choice).toEqual({ kind: "add_gained_commons_to_starting_deck", cardId: "commons_gain" });
  });

  it("exports a public-safe campaign sheet payload from the next progress record", () => {
    const progress = {
      mode: "standard" as const,
      playerNationId: "human_nation",
      wins: 2,
      losses: 1,
      currentDifficulty: "imperator" as const,
      defeatedBotNationIds: ["bot_persians", "bot_rome"],
      startingDeckAdditions: ["commons_gain"],
      startingDeckRemovals: ["starter_card"],
      setAsideCommonsCardIds: [],
      doubleStartingResourcesForNextGame: true,
      records: [
        { won: true, botNationId: "bot_persians", difficulty: "chieftain" as const, score: 41, choice: { kind: "add_gained_commons_to_starting_deck" as const, cardId: "commons_gain" } },
        { won: false, botNationId: "bot_rome", difficulty: "warlord" as const }
      ]
    };

    const exportText = campaignSheetExportText(progress);
    const parsed = JSON.parse(exportText);

    expect(parsed.campaignSheetVersion).toBe(1);
    expect(parsed.progress).toEqual(progress);
    expect(exportText).toContain("commons_gain");
    expect(exportText).not.toContain("Commons Gain");
  });

  it("renders campaign sheet export after a campaign outcome can update progress", () => {
    const html = renderToStaticMarkup(
      <EndGameSummary
        G={{
          round: 5,
          log: [],
          options: {
            campaignProgress: {
              mode: "standard",
              playerNationId: "human_nation",
              wins: 0,
              losses: 1,
              currentDifficulty: "chieftain",
              defeatedBotNationIds: [],
              startingDeckAdditions: [],
              startingDeckRemovals: [],
              setAsideCommonsCardIds: [],
              doubleStartingResourcesForNextGame: true
            }
          },
          gameover: {
            winner: "0",
            reason: "normal_scoring:deck_empty",
            scores: { "0": 41, bot_0: 29 },
            campaignOutcome: {
              mode: "standard",
              won: false,
              humanPlayerId: "0",
              botId: "bot_0",
              botNationId: "bot_persians",
              difficulty: "chieftain",
              score: 29,
              botScore: 41,
              scoreKind: "victory_points",
              requiresCampaignChoice: false,
              result: { won: false, botNationId: "bot_persians", difficulty: "chieftain", score: 29 }
            }
          },
          players: {}
        }}
      />
    );

    expect(html).toContain("Campaign Sheet Export");
    expect(html).toContain("&quot;campaignSheetVersion&quot;: 1");
    expect(html).toContain("&quot;losses&quot;: 2");
  });

  it("renders a campaign complete ceremony with final statistics", () => {
    const html = renderToStaticMarkup(
      <EndGameSummary
        G={{
          round: 6,
          log: [],
          options: {
            campaignProgress: {
              mode: "standard",
              playerNationId: "human_nation",
              wins: 4,
              losses: 1,
              currentDifficulty: "overlord",
              defeatedBotNationIds: ["bot_persians", "bot_rome", "bot_carthage", "bot_greeks"],
              startingDeckAdditions: ["commons_gain"],
              startingDeckRemovals: ["starter_card"],
              setAsideCommonsCardIds: [],
              records: [
                { won: true, botNationId: "bot_persians", difficulty: "chieftain", score: 41 },
                { won: false, botNationId: "bot_rome", difficulty: "warlord", score: 29 }
              ]
            }
          },
          gameover: {
            winner: "0",
            reason: "normal_scoring:deck_empty",
            scores: { "0": 70, bot_0: 52 },
            campaignOutcome: {
              mode: "standard",
              won: true,
              humanPlayerId: "0",
              botId: "bot_0",
              botNationId: "bot_macedonians",
              difficulty: "overlord",
              score: 70,
              botScore: 52,
              scoreKind: "victory_points",
              requiresCampaignChoice: false,
              result: {
                won: true,
                botNationId: "bot_macedonians",
                difficulty: "overlord",
                score: 70,
                choice: { kind: "add_gained_commons_to_starting_deck", cardId: "final_commons" }
              }
            }
          },
          players: {},
          cardDb: {}
        }}
      />
    );

    expect(html).toContain("Campaign Complete");
    expect(html).toContain("Campaign Won");
    expect(html).toContain("Games Played");
    expect(html).toContain("5");
    expect(html).toContain("Final Record");
    expect(html).toContain("5-1");
    expect(html).toContain("Bots Defeated");
    expect(html).toContain("Starting Deck Changes");
    expect(html).toContain("Final Campaign Sheet");
    expect(html).toContain("&quot;complete&quot;: &quot;won&quot;");
    expect(html).not.toContain("Update Campaign");
  });
});
