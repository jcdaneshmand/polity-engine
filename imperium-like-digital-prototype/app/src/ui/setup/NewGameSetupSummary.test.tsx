import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NewGameSetup, { buildCampaignGameOptions, parseCampaignSheetText } from "./NewGameSetup";

describe("NewGameSetup summary", () => {
  it("shows a scan-friendly launch summary before starting a game", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} />);

    expect(html).toContain("Launch Summary");
    expect(html).toContain("Mode");
    expect(html).toContain("Players");
    expect(html).toContain("Commons");
    expect(html).toContain("Private Data");
    expect(html).toContain("Placeholder data");
    expect(html).toContain("Session");
    expect(html).toContain("Host Online Game");
    expect(html).toContain("Join Online Game");
    expect(html).toContain("Content");
  });

  it("hides campaign controls until solo setup is active", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} />);

    expect(html).toContain("<strong>Off</strong>");
    expect(html).not.toContain("Campaign Sheet");
    expect(html).not.toContain("Import Campaign Sheet JSON");
  });

  it("shows campaign controls when continuing a solo campaign", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        initialCampaignProgress={{
          mode: "standard",
          playerNationId: "test_nation_sun_coast",
          wins: 1,
          losses: 0,
          currentDifficulty: "warlord",
          defeatedBotNationIds: ["bot_persians"],
          startingDeckAdditions: [],
          startingDeckRemovals: [],
          setAsideCommonsCardIds: []
        }}
      />
    );

    expect(html).toContain("Campaign");
    expect(html).toContain("Standard");
    expect(html).toContain("Supreme Ruler");
    expect(html).toContain("Standard campaign advances through the solo difficulty ladder");
    expect(html).toContain("Supreme Ruler campaign locks the Bot to Supreme Ruler");
    expect(html).toContain("Import Campaign Sheet JSON");
  });

  it("creates standard campaign options from the selected player nation", () => {
    const options = buildCampaignGameOptions({
      mode: "solo",
      campaignMode: "standard",
      selectedPlayerNationId: "test_nation_sun_coast",
      soloDifficulty: "chieftain"
    });

    expect(options.campaignMode).toBe("standard");
    expect(options.campaignProgress).toMatchObject({
      mode: "standard",
      playerNationId: "test_nation_sun_coast",
      wins: 0,
      losses: 0,
      currentDifficulty: "chieftain"
    });
    expect(options.soloDifficulty).toBe("chieftain");
  });

  it("normalizes Supreme Ruler campaign setup to Supreme Ruler difficulty", () => {
    const options = buildCampaignGameOptions({
      mode: "solo",
      campaignMode: "supreme_ruler",
      selectedPlayerNationId: "test_nation_sun_coast",
      soloDifficulty: "chieftain"
    });

    expect(options.campaignMode).toBe("supreme_ruler");
    expect(options.campaignProgress?.currentDifficulty).toBe("supreme_ruler");
    expect(options.soloDifficulty).toBe("supreme_ruler");
  });

  it("keeps a fresh standard campaign next difficulty aligned to the selected solo difficulty", () => {
    const options = buildCampaignGameOptions({
      mode: "solo",
      campaignMode: "standard",
      selectedPlayerNationId: "test_nation_sun_coast",
      soloDifficulty: "imperator",
      campaignProgress: {
        mode: "standard",
        playerNationId: "test_nation_sun_coast",
        wins: 0,
        losses: 0,
        currentDifficulty: "chieftain",
        defeatedBotNationIds: [],
        startingDeckAdditions: [],
        startingDeckRemovals: [],
        setAsideCommonsCardIds: [],
        records: []
      }
    });

    expect(options.campaignProgress?.currentDifficulty).toBe("imperator");
  });

  it("imports a campaign sheet export payload for continued setup", () => {
    const progress = parseCampaignSheetText(JSON.stringify({
      campaignSheetVersion: 1,
      progress: {
        mode: "standard",
        playerNationId: "test_nation_sun_coast",
        wins: 2,
        losses: 1,
        currentDifficulty: "imperator",
        defeatedBotNationIds: ["bot_persians"],
        startingDeckAdditions: ["commons_gain"],
        startingDeckRemovals: [],
        setAsideCommonsCardIds: [],
        doubleStartingResourcesForNextGame: true,
        records: []
      }
    }));

    expect(progress?.wins).toBe(2);
    expect(progress?.currentDifficulty).toBe("imperator");
    expect(progress?.doubleStartingResourcesForNextGame).toBe(true);
  });

  it("opens direct campaign continuance in solo setup with progress ready", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        initialCampaignProgress={{
          mode: "standard",
          playerNationId: "test_nation_sun_coast",
          wins: 2,
          losses: 1,
          currentDifficulty: "imperator",
          defeatedBotNationIds: ["bot_persians"],
          startingDeckAdditions: [],
          startingDeckRemovals: [],
          setAsideCommonsCardIds: []
        }}
      />
    );

    expect(html).toContain("<strong>Solo</strong>");
    expect(html).toContain("<strong>Standard 2-1</strong>");
    expect(html).toContain("2 wins / 1 losses");
    expect(html).toContain("Next difficulty: Imperator");
  });
});
