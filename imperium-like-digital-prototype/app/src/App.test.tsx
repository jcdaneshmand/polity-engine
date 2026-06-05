import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App shell", () => {
  it("renders a stable default theme hook on the home shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-theme="default"');
    expect(html).toContain("Online Games");
  });
});
