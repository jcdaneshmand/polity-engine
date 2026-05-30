import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NewGameSetup from "../../../app/src/ui/setup/NewGameSetup";

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
});
