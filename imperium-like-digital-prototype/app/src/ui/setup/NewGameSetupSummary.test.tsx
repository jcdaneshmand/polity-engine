import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NewGameSetup, { buildCampaignGameOptions, getCommonsCardOptions, getLaunchPlayerIds, getPlayerCountSelectionUpdate, getPrivateDataSetupState, parseCampaignSheetText, PrivateDataReadinessList } from "./NewGameSetup";
import { buildPrivateDataDryRunReport } from "./privateDataImport";

describe("NewGameSetup summary", () => {
  it("defaults to the five-field basic setup surface", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} />);
    expect(html).toContain('data-setup-mode="basic"');
    expect(html).toContain('aria-expanded="false">Advanced Setup</button>');
    expect(html).toContain('<legend>Mode</legend>');
    expect(html).toContain('<legend>Players</legend>');
    expect(html).toContain('<legend>Commons</legend>');
    expect(html).toContain('<legend>Nations</legend>');
    expect(html).toContain('hidden=""><legend>Expansions</legend>');
    expect(html).toContain('hidden=""><legend>Variants</legend>');
    expect(html).toContain('aria-labelledby="setup-stage-fictional-data" hidden=""');
    expect(html).toContain('aria-labelledby="setup-stage-data" hidden=""');
  });

  it("summarizes active optional settings while Advanced Setup is collapsed", () => {
    const html = renderToStaticMarkup(<NewGameSetup
      onStart={() => undefined}
      initialConfig={{
        options: {
          playerCount: 2,
          mode: "multiplayer",
          commonsSetId: "classics",
          enabledExpansions: ["trade_routes"],
          enabledVariants: ["quick_setup"]
        },
        playerNationIds: { "1": "test_nation_sun_coast", "2": "test_nation_sun_coast" }
      }}
    />);
    expect(html).toContain('data-setup-mode="basic"');
    expect(html).toContain("Trade Module, Quick Setup");
    expect(html).toContain('type="checkbox" checked=""');
  });

  it("shows the built-in compact demo as launch-ready", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} />);
    expect(html).toContain('data-qa="commons-composition-summary"');
    expect(html).toContain('data-status="ready"');
    expect(html).toContain("Commons setup ready");
    expect(html).toContain("This repository-owned demo uses a compact teaching composition.");
  });

  it("keeps custom missing-card blockers visible outside Saved pools", () => {
    const html = renderToStaticMarkup(<NewGameSetup
      onStart={() => undefined}
      initialConfig={{
        options: { playerCount: 2, mode: "multiplayer", commonsSetId: "custom", customCommonsCardIds: ["missing-card"], enabledExpansions: [], enabledVariants: [] },
        playerNationIds: { "1": "test_nation_sun_coast", "2": "test_nation_sun_coast" },
        privateData: { cards: [{ id: "available-card", displayName: "Available", ownership: "commons", commonsSetId: "custom", commonsGroup: "base" } as any] }
      }}
    />);
    expect(html).toContain('data-status="blocked"');
    expect(html).toContain('data-issue-code="custom_cards_missing"');
    expect(html).toContain("1 selected Commons card is not loaded.");
    expect(html).toContain("Remove unavailable cards");
    expect(html).toMatch(/<button class="primary-action" type="button" disabled="">Start Game<\/button>/);
  });

  it("shows a scan-friendly launch summary before starting a game", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} />);

    expect(html).toContain("Launch Summary");
    expect(html).toContain("Mode");
    expect(html).toContain("Players");
    expect(html).toContain("Commons");
    expect(html).toContain("Private Data");
    expect(html).toContain("Placeholder data");
    expect(html).toContain("Session");
    expect(html).toContain("Online Games");
    expect(html).toContain("Content");
    expect(html).toContain("Load Fictional Playtest Set");
    expect(html).toContain('data-qa="fictional-playtest-setup"');
    expect(html).toContain('aria-label="Commons set"');
    expect(html).toContain("<span>Classics</span><small>Demo Data / 10</small>");
    expect(html).toContain("<span>Legends</span><small>No Cards Loaded / 0</small>");
    expect(html).toContain("<span>Horizons</span><small>No Cards Loaded / 0</small>");
    expect(html).toMatch(/<button type="button" class="" aria-pressed="false" disabled=""><span>Legends<\/span>/);
    expect(html).toContain("No Legends Commons cards are loaded.");
    expect(html).toContain("No Horizons Commons cards are loaded.");
    expect(html).toContain(">Advanced</button>");
    expect(html).toContain('data-commons-mode="standard"');
    expect(html).not.toContain("Advanced Commons");
  });

  it("renders local playtest readiness status", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        localPlaytestStatus={{
          dataMode: "placeholder",
          savedGameAvailable: true,
          hostedDeferred: false
        }}
      />
    );

    expect(html).toContain("Playtest Status");
    expect(html).toContain("data-qa=\"local-playtest-status\"");
    expect(html).toContain("data-data-mode=\"placeholder\"");
    expect(html).toContain("data-saved-game=\"available\"");
    expect(html).toContain("data-hosting=\"active\"");
    expect(html).toContain("data-next-gate=\"private-data-entry\"");
    expect(html).toContain("data-next-command=\"private:status\"");
    expect(html).toContain("Hosted playtest live");
    expect(html).toContain("Run npm run private:status while entering CSVs; import private data when ready.");
    expect(html).toContain("data-qa=\"local-playtest-next-gate\"");
    expect(html).toContain("Demo data");
    expect(html).toContain("Local save ready");
  });

  it("renders custom Commons composition metadata for confirmed local data", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        initialConfig={{
          options: {
            playerCount: 2,
            mode: "multiplayer",
            commonsSetId: "custom",
            customCommonsCardIds: ["custom_card_2"],
            enabledExpansions: [],
            enabledVariants: []
          },
          playerNationIds: {
            "1": "nation-1",
            "2": "nation-1"
          },
          privateData: {
            cards: [
              {
                id: "custom_card_1",
                displayName: "Custom Card One",
                ownership: "commons",
                commonsSetId: "custom",
                commonsGroup: "base"
              } as any,
              {
                id: "custom_card_2",
                displayName: "Custom Card Two",
                ownership: "commons",
                commonsSetId: "custom",
                commonsGroup: "trade_friendly"
              } as any
            ],
            nations: [{
              id: "nation-1",
              displayName: "Nation 1",
              requiredExpansions: [],
              excludedExpansions: [],
              powerCardIds: [],
              stateCardIds: [],
              startingDeckCardIds: [],
              nationDeckCardIds: [],
              developmentCardIds: [],
              setupRules: [],
              passiveRules: [],
              actionTokensBase: 3,
              exhaustTokensBase: 5,
              implemented: true,
              tested: true
            } as any]
          }
        }}
      />
    );

    expect(html).toContain("data-qa=\"custom-commons-setup\"");
    expect(html).toContain("data-custom-commons-count=\"1\"");
    expect(html).toContain("data-custom-commons-available=\"2\"");
    expect(html).toContain('data-commons-mode="advanced"');
    expect(html).toContain("Advanced Commons");
    expect(html).toContain("Source set");
    expect(html).toContain("Saved pools");
    expect(html).toContain("data-card-id=\"custom_card_2\"");
    expect(html).toContain("data-selected=\"true\"");
    expect(html).toContain("1 selected");
  });

  it("derives public-safe custom Commons picker options from a private data bundle", () => {
    const options = getCommonsCardOptions({
      cards: [
        { id: "custom_b", displayName: "Custom B", ownership: "commons", commonsSetId: "custom", commonsGroup: "base" } as any,
        { id: "nation_a", displayName: "Nation A", ownership: "nation", commonsSetId: "custom", commonsGroup: "base" } as any,
        { id: "custom_a", displayName: "Custom A", ownership: "commons", commonsSetId: "custom", commonsGroup: "trade_friendly" } as any
      ]
    });

    expect(options).toEqual([
      { id: "custom_a", label: "Custom A", setId: "custom", group: "trade_friendly" },
      { id: "custom_b", label: "Custom B", setId: "custom", group: "base" }
    ]);
  });

  it("offers eligible Commons from all source sets to the advanced picker", () => {
    const cards = [
      { id: "classics_a", displayName: "Classics A", ownership: "commons", commonsSetId: "classics", commonsGroup: "base" },
      { id: "legends_a", displayName: "Legends A", ownership: "commons", commonsSetId: "legends", commonsGroup: "base" },
      { id: "horizons_a", displayName: "Horizons A", ownership: "commons", commonsSetId: "horizons", commonsGroup: "base" }
    ] as any[];
    const options = getCommonsCardOptions({ cards }, {
      commonsSetId: "custom", mode: "multiplayer", playerCount: 2, effectiveCommonsPlayerCount: 2,
      enabledExpansions: [], enabledVariants: [], selectedNationIds: [], replacementPolicy: "none"
    });
    expect(options.map((card) => card.id)).toEqual(["classics_a", "horizons_a", "legends_a"]);
  });

  it("excludes nation conflicts and applies effective campaign eligibility", () => {
    const cards = [
      { id: "valid", displayName: "Valid", ownership: "commons", commonsSetId: "custom", commonsGroup: "base" },
      { id: "conflict", displayName: "Conflict", ownership: "commons", commonsSetId: "custom", commonsGroup: "base", conflictsWithNationIds: ["nation-1"] },
      { id: "campaign", displayName: "Campaign", ownership: "commons", commonsSetId: "custom", commonsGroup: "base", tags: ["supreme_ruler_campaign_extra"] }
    ] as any[];
    const options = getCommonsCardOptions({ cards }, {
      commonsSetId: "custom", mode: "practice", playerCount: 1, effectiveCommonsPlayerCount: 2,
      enabledExpansions: [], enabledVariants: [], selectedNationIds: ["nation-1"], replacementPolicy: "none"
    });
    expect(options.map((card) => card.id)).toEqual(["valid"]);
  });

  it("exposes private-data setup diagnostics for an empty setup", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} />);

    expect(html).toContain("data-qa=\"private-data-setup\"");
    expect(html).toContain("data-private-data-state=\"empty\"");
    expect(html).toContain("data-private-data-loaded=\"false\"");
    expect(html).toContain("data-private-data-confirmed=\"false\"");
    expect(html).toContain("data-private-data-preview-status=\"none\"");
    expect(html).toContain("data-private-data-next-command=\"private:status\"");
    expect(html).toContain("Run npm run private:status during transcription for a public-safe local workspace check");
  });

  it("exposes private-data setup diagnostics for confirmed initial private data", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        initialConfig={{
          options: {
            playerCount: 1,
            mode: "solo",
            commonsSetId: "classics",
            enabledExpansions: [],
            enabledVariants: []
          },
          playerNationIds: { "1": "nation-1" },
          privateData: {
            cards: [{
              id: "card-1",
              displayName: "Card 1",
              suit: "civilized",
              type: "action",
              cardType: "action",
              cost: 0,
              vp: { mode: "none", value: null },
              effects: []
            } as any]
          }
        }}
      />
    );

    expect(html).toContain("data-private-data-state=\"confirmed\"");
    expect(html).toContain("data-private-data-loaded=\"true\"");
    expect(html).toContain("data-private-data-confirmed=\"true\"");
    expect(html).toContain("data-private-data-next-command=\"private:status private:gate\"");
  });

  it("classifies private-data upload setup states", () => {
    expect(getPrivateDataSetupState({
      hasLoadedPrivateData: false,
      hasFatalPreview: false,
      privateDataConfirmed: false
    })).toBe("empty");
    expect(getPrivateDataSetupState({
      hasLoadedPrivateData: true,
      hasFatalPreview: false,
      privateDataConfirmed: false
    })).toBe("preview-pending");
    expect(getPrivateDataSetupState({
      hasLoadedPrivateData: true,
      hasFatalPreview: true,
      privateDataConfirmed: false
    })).toBe("preview-fatal");
    expect(getPrivateDataSetupState({
      hasLoadedPrivateData: true,
      hasFatalPreview: true,
      privateDataConfirmed: true
    })).toBe("confirmed");
  });

  it("renders stable private-data readiness item metadata", () => {
    const report = buildPrivateDataDryRunReport(
      {
        cards: [{
          id: "card-1",
          displayName: "Card 1",
          suit: "civilized",
          type: "action",
          cardType: "action",
          cost: 0,
          vp: { mode: "none", value: null },
          effects: []
        } as any],
        nations: [{
          id: "nation-1",
          displayName: "Nation 1",
          requiredExpansions: [],
          excludedExpansions: [],
          powerCardIds: ["missing-card"],
          stateCardIds: [],
          startingDeckCardIds: [],
          nationDeckCardIds: [],
          developmentCardIds: [],
          setupRules: [],
          passiveRules: [],
          actionTokensBase: 3,
          exhaustTokensBase: 5,
          implemented: true,
          tested: true
        } as any]
      },
      {
        cards: [{
          card_id: "card-1",
          public_placeholder_name: "Card 1",
          suit: "civilized",
          card_type: "action",
          starting_location: "draw_deck",
          vp_mode: "none",
          implemented: "true",
          tested: "true"
        }],
        nations: [{
          nation_id: "nation-1",
          public_placeholder_name: "Nation 1",
          complexity: "1",
          power_card_ids: "missing-card",
          state_card_ids: "",
          starting_deck_card_ids: "",
          nation_deck_card_ids: "",
          development_card_ids: "",
          special_setup_json: "[]",
          passive_rules_json: "[]",
          action_tokens_base: "3",
          exhaust_tokens_base: "5",
          implemented: "true",
          tested: "true"
        }]
      }
    );
    const html = renderToStaticMarkup(<PrivateDataReadinessList checks={report.readinessChecks} />);

    expect(report.readinessChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "references", status: "blocked" })
      ])
    );
    expect(html).toContain("data-qa=\"private-data-readiness-item\"");
    expect(html).toContain("data-readiness-id=\"references\"");
    expect(html).toContain("data-readiness-status=\"blocked\"");
    expect(html).toContain("Card References");
  });

  it("points private-data setups at the local private gate", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        localPlaytestStatus={{
          dataMode: "private",
          savedGameAvailable: false,
          hostedDeferred: true
        }}
      />
    );

    expect(html).toContain("data-data-mode=\"private\"");
    expect(html).toContain("data-saved-game=\"none\"");
    expect(html).toContain("data-hosting=\"deferred\"");
    expect(html).toContain("data-next-gate=\"private-gate\"");
    expect(html).toContain("data-next-command=\"private:status private:gate\"");
    expect(html).toContain("Local testing ready");
    expect(html).toContain("Run npm run private:status, then npm run private:gate locally.");
  });

  it("can render as a lobby setup editor with an existing config", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        initialConfig={{
          options: {
            playerCount: 3,
            mode: "multiplayer",
            commonsSetId: "legends",
            enabledExpansions: ["trade_routes"],
            enabledVariants: ["quick_setup"]
          },
          playerNationIds: {
            "1": "test_nation_sun_coast",
            "2": "test_nation_sun_coast",
            "3": "test_nation_sun_coast"
          }
        }}
        title="Lobby Setup"
        kicker="Pregame lobby"
        submitLabel="Update Lobby"
        onCancel={() => undefined}
        onlineGamesEnabled={false}
        allowedModes={["multiplayer"]}
      />
    );

    expect(html).toContain("Lobby Setup");
    expect(html).toContain("Pregame lobby");
    expect(html).toContain("Update Lobby");
    expect(html).toContain("Back");
    expect(html).toContain("<strong>3</strong>");
    expect(html).toContain("<strong>Legends</strong>");
    expect(html).toContain("Trade Module");
    expect(html).toContain("Quick Setup");
    expect(html).not.toContain(">Solo</button>");
    expect(html).not.toContain(">Practice</button>");
    expect(html).not.toContain("Online Games");
  });

  it("switches setup mode when player count crosses the solo boundary", () => {
    expect(getPlayerCountSelectionUpdate("multiplayer", 1)).toEqual({
      mode: "solo",
      playerCount: 1
    });
    expect(getPlayerCountSelectionUpdate("multiplayer", 3)).toEqual({
      mode: "multiplayer",
      playerCount: 3
    });
    expect(getPlayerCountSelectionUpdate("solo", 2)).toEqual({
      mode: "multiplayer",
      playerCount: 2
    });
  });

  it("uses one-based game player ids for launched games", () => {
    expect(getLaunchPlayerIds(1)).toEqual(["1"]);
    expect(getLaunchPlayerIds(3)).toEqual(["1", "2", "3"]);
  });

  it("requires an online player name before entering online games", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} onOpenOnlineGames={() => undefined} />);

    expect(html).toContain("Sign in before entering online games");
    expect(html).toContain("Username or Email");
    expect(html).toContain("Forgot Password");
    expect(html).not.toContain("Reset Token or Link");
    expect(html).not.toContain("Confirm New Password");
    expect(html).not.toContain("Reset Password");
    expect(html).toContain("Continue as Guest");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Online Games");
  });

  it("shows reset password controls when opened from a reset link", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        onOpenOnlineGames={() => undefined}
        passwordResetToken="reset-1"
      />
    );

    expect(html).toContain("New Password");
    expect(html).toContain("Confirm New Password");
    expect(html).toContain("Reset Password");
  });

  it("lets signed-in accounts enter online games without an online name", () => {
    const html = renderToStaticMarkup(
      <NewGameSetup
        onStart={() => undefined}
        onOpenOnlineGames={() => undefined}
        account={{
          id: "account-1",
          email: "xenokinesis@example.com",
          username: "Xenokinesis",
          role: "admin",
          createdAt: "2026-06-05T12:00:00.000Z",
          updatedAt: "2026-06-05T12:00:00.000Z",
          stats: {
            solo: {
              standard: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
              campaign: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0, campaignsStarted: 0, campaignsCompleted: 0 },
              practice: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 }
            },
            online: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
            byNation: {}
          }
        }}
      />
    );

    expect(html).toContain("Continue as Xenokinesis");
    expect(html).not.toContain("Online name");
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
