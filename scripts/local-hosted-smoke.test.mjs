import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalHostedSmokeConfig } from "./local-hosted-smoke.mjs";

test("buildLocalHostedSmokeConfig uses stable localhost defaults", () => {
  const config = buildLocalHostedSmokeConfig({});
  assert.equal(config.port, 8794);
  assert.equal(config.baseURL, "http://127.0.0.1:8794");
  assert.match(config.storagePath, /local-hosted-smoke/);
});

test("buildLocalHostedSmokeConfig accepts explicit port and storage", () => {
  const config = buildLocalHostedSmokeConfig({
    POLITY_LOCAL_HOSTED_SMOKE_PORT: "9012",
    POLITY_LOCAL_HOSTED_SMOKE_STORAGE_PATH: "tmp/custom-local-hosted-smoke"
  });
  assert.equal(config.port, 9012);
  assert.equal(config.baseURL, "http://127.0.0.1:9012");
  assert.equal(config.storagePath, "tmp/custom-local-hosted-smoke");
});

test("buildLocalHostedSmokeConfig rejects invalid ports", () => {
  assert.throws(
    () => buildLocalHostedSmokeConfig({ POLITY_LOCAL_HOSTED_SMOKE_PORT: "nope" }),
    /POLITY_LOCAL_HOSTED_SMOKE_PORT/
  );
});
