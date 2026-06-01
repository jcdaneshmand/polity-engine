import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NewGameSetup from "./NewGameSetup";

describe("NewGameSetup summary", () => {
  it("shows a scan-friendly launch summary before starting a game", () => {
    const html = renderToStaticMarkup(<NewGameSetup onStart={() => undefined} />);

    expect(html).toContain("Launch Summary");
    expect(html).toContain("Mode");
    expect(html).toContain("Players");
    expect(html).toContain("Commons");
    expect(html).toContain("Private Data");
    expect(html).toContain("Placeholder data");
  });
});
