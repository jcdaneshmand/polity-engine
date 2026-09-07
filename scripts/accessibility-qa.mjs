import { createRequire } from "node:module";

const requireFromWorkspace = createRequire(new URL("../imperium-like-digital-prototype/package.json", import.meta.url));
const { chromium } = requireFromWorkspace("playwright");
const AxeBuilder = requireFromWorkspace("@axe-core/playwright").default;
const baseURL = (process.env.POLITY_ACCESSIBILITY_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/+$/, "");

async function scan(page, state) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return {
    state,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(" "))
    }))
  };
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const reports = [await scan(page, "basic-setup")];
  await page.getByRole("button", { name: "Advanced Setup" }).click();
  reports.push(await scan(page, "advanced-setup"));
  await page.getByRole("button", { name: "Learning Game", exact: true }).click();
  await page.locator('[data-qa="guided-game-panel"]').waitFor();
  reports.push(await scan(page, "guided-board"));
  await page.getByRole("button", { name: /Foundry Lantern/ }).click();
  reports.push(await scan(page, "guided-card-selected"));
  const violations = reports.flatMap((report) => report.violations.map((violation) => ({ state: report.state, ...violation })))
    .filter((violation, index, all) => all.findIndex((candidate) => candidate.state === violation.state && candidate.id === violation.id) === index);
  console.log(JSON.stringify({ ok: violations.length === 0, baseURL, reports, violationCount: violations.length }, null, 2));
  if (violations.length) process.exitCode = 1;
} finally {
  await browser.close();
}
