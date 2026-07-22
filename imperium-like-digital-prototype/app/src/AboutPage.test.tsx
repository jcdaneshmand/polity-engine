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
    expect(html).not.toContain("Support hosting");
  });

  it("links to PayPal support when a support URL is configured", () => {
    const html = renderToStaticMarkup(
      <AboutPage
        onBack={() => undefined}
        supportUrl="https://www.paypal.com/donate/?business=jcdaneshmand%40gmail.com&amp;amount=7.25&amp;currency_code=USD"
      />
    );

    expect(html).toContain("If you enjoy having the service live");
    expect(html).toContain("$7.25/month on PayPal");
    expect(html).toContain("Support hosting: $7.25/month");
    expect(html).toContain("business=jcdaneshmand%40gmail.com");
    expect(html).toContain("amount=7.25");
  });
});
