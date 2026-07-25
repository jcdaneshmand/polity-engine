import { describe, expect, it } from "vitest";
import { buildPrivateDataDryRunDownload, buildPrivateDataDryRunIssueSummary, buildPrivateDataDryRunReport, importPrivateDataFiles } from "./privateDataImport";

describe("private data import dry-run", () => {
  it("surfaces real CSV validator fatal errors before private data can be used", async () => {
    const result = await importPrivateDataFiles([
      {
        name: "imperium_cards_private.csv",
        text: [
          "card_id,public_placeholder_name,suit,card_type,starting_location,vp_mode,implemented,tested",
          "bad-card,Bad Card,not_a_suit,action,draw_deck,none,true,false"
        ].join("\n")
      }
    ]);

    expect(result.files).toEqual([
      expect.objectContaining({ role: "cards", status: "loaded" })
    ]);
    expect(result.dryRunReport.status).toBe("fatal");
    expect(result.dryRunReport.schemaVersion).toBe(1);
    expect(result.dryRunReport.fatal).toBeGreaterThan(0);
    expect(result.dryRunReport.warnings).toBeGreaterThan(0);
    expect(result.dryRunReport.coverage).toEqual({ implemented: 1, tested: 0 });
    expect(result.dryRunReport.readinessChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "fatal-free", status: "blocked" }),
        expect.objectContaining({ id: "cards", status: "ready" }),
        expect.objectContaining({ id: "nations", status: "blocked" }),
        expect.objectContaining({ id: "references", status: "warning" })
      ])
    );
    expect(result.dryRunReport.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "fatal",
          scope: "cards",
          field: "suit",
          message: expect.stringContaining("Invalid suit")
        }),
        expect.objectContaining({
          level: "warning",
          scope: "cards",
          field: "tested",
          message: expect.stringContaining("implemented=true but tested=false")
        })
      ])
    );
  });

  it("sanitizes private reference ids in dry-run messages and reports", async () => {
    const result = await importPrivateDataFiles([
      {
        name: "imperium_cards_private.csv",
        text: [
          "card_id,public_placeholder_name,suit,card_type,starting_location,vp_mode,implemented,tested",
          "safe-card,Safe Card,civilized,action,draw_deck,none,true,true"
        ].join("\n")
      },
      {
        name: "imperium_nations_private.csv",
        text: [
          "nation_id,public_placeholder_name,complexity,power_card_ids,state_card_ids,starting_deck_card_ids,nation_deck_card_ids,development_card_ids,special_setup_json,passive_rules_json,action_tokens_base,exhaust_tokens_base,implemented,tested",
          "private-nation,Placeholder Nation,1,real-private-card-name,safe-card,safe-card,safe-card,safe-card,[],[],3,5,true,true"
        ].join("\n")
      }
    ]);

    const summary = buildPrivateDataDryRunIssueSummary(result.dryRunReport);
    const download = JSON.stringify(buildPrivateDataDryRunDownload(result.dryRunReport));
    const serializedReport = JSON.stringify(result.dryRunReport);

    expect(result.dryRunReport.status).toBe("fatal");
    expect(result.dryRunReport.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "fatal",
          scope: "nations",
          field: "card_ref",
          message: expect.stringContaining("Missing referenced card id")
        })
      ])
    );
    expect(result.dryRunReport.readinessChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "references",
          status: "blocked",
          detail: expect.stringContaining("missing card reference")
        })
      ])
    );
    expect(serializedReport).not.toContain("real-private-card-name");
    expect(summary).not.toContain("real-private-card-name");
    expect(download).not.toContain("real-private-card-name");
  });

  it("does not treat skipped or empty uploads as ready private data", async () => {
    const result = await importPrivateDataFiles([
      { name: "notes.txt", text: "not private data" }
    ]);

    expect(result.files).toEqual([
      expect.objectContaining({ status: "skipped" })
    ]);
    expect(result.dryRunReport.status).toBe("empty");
    expect(result.dryRunReport.counts).toEqual([]);
    expect(result.dryRunReport.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "warning", scope: "file" }),
        expect.objectContaining({ level: "warning", scope: "bundle" })
      ])
    );
  });

  it("warns when a partial bundle lacks cards or nations", () => {
    const report = buildPrivateDataDryRunReport({
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
    });

    expect(report.status).toBe("warning");
    expect(report.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          scope: "bundle",
          message: "No private nations were loaded; setup will fall back to demo nations."
        })
      ])
    );
  });

  it("builds public-safe copy and download reports for preview issues", async () => {
    const result = await importPrivateDataFiles([
      {
        name: "imperium_cards_private.csv",
        text: [
          "card_id,public_placeholder_name,card_name_private,suit,card_type,starting_location,vp_mode,implemented,tested,raw_effect_text_private",
          "bad-card,Placeholder,Real Private Name,not_a_suit,action,draw_deck,none,true,false,Private rules text"
        ].join("\n")
      }
    ]);

    const summary = buildPrivateDataDryRunIssueSummary(result.dryRunReport);
    const download = buildPrivateDataDryRunDownload(result.dryRunReport);
    const serializedDownload = JSON.stringify(download);

    expect(summary).toContain("Polity Engine private-data import preview");
    expect(summary).toContain("Status: fatal");
    expect(summary).toContain("Issues:");
    expect(summary).toContain("Next step:");
    expect(summary).toContain("npm run private:status");
    expect(summary).toContain("Readiness checks:");
    expect(summary).toContain("BLOCKED Validator Gate");
    expect(summary).toContain("cards / row 2 / suit");
    expect(summary).toContain("No private card text");
    expect(download.kind).toBe("polity-private-data-import-preview");
    expect(download.privacy).toContain("public-safe");
    expect(download.recommendedCommands).toEqual(["npm run private:status", "npm run private:gate"]);
    expect(download.nextStep).toContain("Fix fatal preview issues");
    expect(serializedDownload).not.toContain("Real Private Name");
    expect(serializedDownload).not.toContain("Private rules text");
    expect(summary).not.toContain("Real Private Name");
    expect(summary).not.toContain("Private rules text");
  });

  it("includes private status and gate commands for ready preview artifacts", () => {
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
          power_card_ids: "",
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

    const summary = buildPrivateDataDryRunIssueSummary(report);
    const download = buildPrivateDataDryRunDownload(report);

    expect(download.recommendedCommands).toEqual(["npm run private:status", "npm run private:gate"]);
    expect(download.nextStep).toContain("npm run private:status");
    expect(download.nextStep).toContain("npm run private:gate");
    expect(summary).toContain("Next step: Run npm run private:status");
    expect(summary).toContain("npm run private:gate");
  });

  it("marks complete core data with matching coverage as ready", () => {
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
        } as any],
        nationRulesets: [{} as any],
        botStateTables: { "bot-1": {} as any },
        botTradeRoutesTables: { "bot-1": {} as any }
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
          implemented: "true",
          tested: "true"
        }]
      }
    );

    expect(report.status).toBe("warning");
    expect(report.readinessChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "cards", status: "ready" }),
        expect.objectContaining({ id: "nations", status: "ready" }),
        expect.objectContaining({ id: "rulesets", status: "ready" }),
        expect.objectContaining({ id: "solo-bot", status: "ready" }),
        expect.objectContaining({ id: "coverage", status: "ready" })
      ])
    );
  });
});
