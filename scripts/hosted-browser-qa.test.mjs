import test from "node:test";
import assert from "node:assert/strict";
import { buildHostedBrowserQAConfig } from "./hosted-browser-qa.mjs";

test("buildHostedBrowserQAConfig requires a hosted origin", () => {
  assert.throws(() => buildHostedBrowserQAConfig({}), /POLITY_HOSTED_BASE_URL/);
});

test("buildHostedBrowserQAConfig routes hosted origin into browser QA", () => {
  const config = buildHostedBrowserQAConfig({
    POLITY_HOSTED_BASE_URL: "https://polity-engine.example.com/",
    POLITY_BROWSER_QA_HEADLESS: "false"
  });

  assert.equal(config.baseURL, "https://polity-engine.example.com");
  assert.equal(config.headless, false);
});
