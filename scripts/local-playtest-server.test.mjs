import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalPlaytestEnv,
  formatPlaytestBanner,
  resolveLocalPlaytestOptions
} from "./local-playtest-server.mjs";

test("resolveLocalPlaytestOptions uses stable defaults", () => {
  assert.equal(resolveLocalPlaytestOptions({}).port, 8785);
  assert.equal(resolveLocalPlaytestOptions({}).host, "127.0.0.1");
  assert.match(resolveLocalPlaytestOptions({}).storagePath, /local-playtest/);
});

test("resolveLocalPlaytestOptions accepts explicit env overrides", () => {
  const options = resolveLocalPlaytestOptions({
    POLITY_PLAYTEST_PORT: "8799",
    POLITY_PLAYTEST_STORAGE_PATH: "E:\\tmp\\polity-playtest"
  });
  assert.equal(options.port, 8799);
  assert.equal(options.storagePath, "E:\\tmp\\polity-playtest");
});

test("buildLocalPlaytestEnv wires public-safe local server settings", () => {
  const env = buildLocalPlaytestEnv({ port: 8799, storagePath: "E:\\tmp\\polity-playtest" }, { Path: "x" });
  assert.equal(env.POLITY_SERVER_PORT, "8799");
  assert.equal(env.POLITY_STORAGE_PATH, "E:\\tmp\\polity-playtest");
  assert.equal(env.VITE_SHOW_PRIVATE_CARD_DEBUG, "false");
});

test("formatPlaytestBanner prints the URLs a human tester needs", () => {
  const banner = formatPlaytestBanner({ host: "127.0.0.1", port: 8799, storagePath: "E:\\tmp\\polity-playtest" });
  assert.match(banner, /http:\/\/127\.0\.0\.1:8799/);
  assert.match(banner, /\/polity\/accounts\/health/);
  assert.match(banner, /E:\\tmp\\polity-playtest/);
});
