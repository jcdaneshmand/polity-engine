import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NewGameSetup from "../../../app/src/ui/setup/NewGameSetup";
import PrivateCardEntry from "../../../app/src/ui/privateData/PrivateCardEntry";

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
    expect(html).toContain("copies card shape and metadata, then clears ID, names, private text, implemented, and tested");
    expect(html).toContain("Duplicate Full");
    expect(html).toContain("copies the previous draft including private name and rules text, then clears only the card ID");
  });
});
