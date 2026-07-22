import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage from "./AboutPage";

describe("AboutPage", () => {
  it("credits Jonah Daneshmand and frames the app as a physical-game companion", () => {
    const html = renderToStaticMarkup(<AboutPage onBack={() => undefined} />);

    expect(html).not.toContain("Created by Jonah Daneshmand, Ph.D.");
    expect(html).toContain("open source");
    expect(html).toContain("jcdaneshmand@gmail.com");
    expect(html).toContain("Game system designed by Nigel Buckle and Dávid Turczi.");
    expect(html).toContain("Implemented by Jonah Daneshmand, Ph.D.");
    expect(html).toContain("love letter to the physical game");
    expect(html).toContain("encouraging players to support the official release");
    expect(html).toContain("requiring players to use physical content they own");
    expect(html).toContain("does not include official card text, artwork, logos, scans, or component data");
    expect(html).toContain('href="https://github.com/jcdaneshmand/polity-engine"');
    expect(html).toContain("This service is still in active development");
    expect(html).toContain("email");
    expect(html).toContain("exported playtest diagnostics file");
    expect(html).toContain("bug description");
    expect(html).toContain('href="https://github.com/jcdaneshmand/polity-engine/issues/new"');
    expect(html).not.toContain("Help cover hosting costs only");
  });

  it("links to PayPal support when hosting is not yet covered", () => {
    const html = renderToStaticMarkup(
      <AboutPage
        onBack={() => undefined}
        supportUrl="https://www.paypal.com/donate/?business=jcdaneshmand%40gmail.com&amp;amount=7.25&amp;currency_code=USD"
        monthlySupportStatus={{ month: "2026-07", isCovered: false }}
        onMarkMonthlySupportCovered={() => undefined}
      />
    );

    expect(html).toContain("Help cover hosting costs only: $7.25/month");
    expect(html).toContain("business=jcdaneshmand%40gmail.com");
    expect(html).toContain("amount=7.25");
    expect(html).toContain("Hosting costs $7.25/month");
    expect(html).toContain("the ask disappears for everyone else until next month");
    expect(html).toContain("Mark This Month Covered");
    expect(html).not.toContain("If you enjoy having the service live");
    expect(html).not.toContain("$7.25/month on PayPal");
    expect(html.match(/Help cover hosting costs only: \$7\.25\/month/g)).toHaveLength(1);
  });

  it("hides the support link when the month is already covered", () => {
    const html = renderToStaticMarkup(
      <AboutPage
        onBack={() => undefined}
        supportUrl="https://www.paypal.com/donate/?business=jcdaneshmand%40gmail.com&amp;amount=7.25&amp;currency_code=USD"
        monthlySupportStatus={{ month: "2026-07", isCovered: true, coveredAt: "2026-07-22T12:00:00.000Z" }}
      />
    );

    expect(html).toContain("Hosting is covered for July 2026");
    expect(html).toContain("Please support");
    expect(html).toContain("the official release instead");
    expect(html).not.toContain("Help cover hosting costs only");
    expect(html).not.toContain("Mark This Month Covered");
  });
});
