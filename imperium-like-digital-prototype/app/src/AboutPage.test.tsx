import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage from "./AboutPage";

describe("AboutPage", () => {
  it("credits Jonah Daneshmand and links to the open source GitHub repository", () => {
    const html = renderToStaticMarkup(<AboutPage onBack={() => undefined} />);

    expect(html).not.toContain("Created by Jonah Daneshmand, Ph.D.");
    expect(html).toContain("open source");
    expect(html).toContain("jcdaneshmand@gmail.com");
    expect(html).toContain("Game system designed by Nigel Buckle and Dávid Turczi.");
    expect(html).toContain("Implemented by Jonah Daneshmand, Ph.D.");
    expect(html).toContain('href="https://github.com/jcdaneshmand/polity-engine"');
  });
});
