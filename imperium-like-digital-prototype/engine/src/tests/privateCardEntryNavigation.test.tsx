import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NewGameSetup from "../../../app/src/ui/setup/NewGameSetup";
import PrivateCardEntry from "../../../app/src/ui/privateData/PrivateCardEntry";
import { cardTypeOptions } from "../../../app/src/ui/privateData/privateEntryOptions";
import { PlayerZonesPanel } from "../../../app/src/ui/layout/PlayerZonesPanel";

describe("private card entry navigation", () => {
  it("keeps the card entry tool beside private data upload controls", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => {}} />);

    expect(html).toContain("Upload JSON or CSV files");
    expect(html).toContain("Card and Nation Transcription Tool");
    expect(html.indexOf("Card and Nation Transcription Tool")).toBeGreaterThan(html.indexOf("Upload JSON or CSV files"));
  });

  it("does not expose card entry from the app shell or game screen", () => {
    const appSource = fs.readFileSync(path.resolve(import.meta.dirname, "../../../app/src/App.tsx"), "utf8");

    expect(appSource).not.toContain("Private Data");
    expect(appSource).not.toContain("Card and Nation Transcription Tool");
  });

  it("explains duplicate structure and duplicate full in the card entry tool", () => {
    const html = renderToStaticMarkup(<PrivateCardEntry onBack={() => {}} />);

    expect(html).toContain("Duplicate Structure");
    expect(html).toContain("copies card shape and metadata, assigns the next auto ID, then clears names, private text, implemented, and tested");
    expect(html).toContain("Duplicate Full");
    expect(html).toContain("copies the previous draft including actual card name and rules text, then assigns the next auto ID");
  });

  it("labels the private card name as the actual card name", () => {
    const html = renderToStaticMarkup(<PrivateCardEntry onBack={() => {}} />);

    expect(html).toContain("Actual Card Name");
    expect(html).not.toContain("Private Name <input");
  });

  it("reuses the import validator and protects browser drafts", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../../app/src/ui/privateData/PrivateCardEntry.tsx"), "utf8");

    expect(source).toContain("validatePrivateCardsRows");
    expect(source).toContain("polity.privateEntry.autosave.v1");
    expect(source).toContain("beforeunload");
    expect(source).toContain("Draft autosaved");
  });

  it("offers every runtime card type in the private card entry selector", () => {
    expect(cardTypeOptions).toEqual(expect.arrayContaining(["unit", "technology", "legacy"]));
  });

  it("labels the private nation name as the nation name", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../../app/src/ui/privateData/PrivateCardEntry.tsx"), "utf8");

    expect(source).toContain("Nation Name");
    expect(source).not.toContain("Private Name <input value={nationDraft.privateName}");
    expect(source).not.toContain("Placeholder Name <input value={nationDraft.publicPlaceholderName}");
  });

  it("shows one generated ruleset name field", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../../app/src/ui/privateData/PrivateCardEntry.tsx"), "utf8");

    expect(source).toContain("Ruleset Name");
    expect(source).not.toContain("Private Ruleset Name");
    expect(source).toContain("buildNationRulesetName");
  });

  it("does not render the hidden Accession card identity in player zone chrome", () => {
    const html = renderToStaticMarkup(
      <PlayerZonesPanel
        player={{ deck: [], discard: [], hand: [], playArea: [], history: [], developmentArea: [], nationDeck: ["nation_1"], accessionCardId: "secret_accession" }}
        onSelectZone={() => {}}
      />
    );

    expect(html).toContain("Nation Deck");
    expect(html).not.toContain("secret_accession");
  });

  it("renders side-area zone tiles for History replacement zones", () => {
    const html = renderToStaticMarkup(
      <PlayerZonesPanel
        player={{ deck: [], discard: [], hand: [], playArea: [], history: [], developmentArea: [], nationDeck: [], sideAreas: { sunken: ["secret_history_card"] } }}
        zoneLabels={{ sunken: "Sunken" }}
        onSelectZone={() => {}}
      />
    );

    expect(html).toContain("Sunken");
    expect(html).toContain("1");
    expect(html).not.toContain("secret_history_card");
  });
});
