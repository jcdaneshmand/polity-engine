import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBrowserQAConfig,
  localQASetupData,
  redactBrowserQAResult
} from "./local-browser-qa.mjs";

test("buildBrowserQAConfig uses local defaults", () => {
  const config = buildBrowserQAConfig({});
  assert.equal(config.baseURL, "http://127.0.0.1:8786");
  assert.match(config.storagePath, /local-browser-qa/);
  assert.equal(config.headless, true);
});

test("localQASetupData uses public-safe placeholder setup", () => {
  const setup = localQASetupData();
  assert.equal(setup.options.mode, "multiplayer");
  assert.equal(setup.options.playerCount, 2);
  assert.equal(setup.options.commonsSetId, "classics");
  assert.equal(setup.playerNationIds["0"], "test_nation_sun_coast");
});

test("redactBrowserQAResult does not include credentials", () => {
  const redacted = redactBrowserQAResult({
    ok: true,
    lobbyID: "lobby-1",
    matchID: "match-1",
    setupStatusChecked: true,
    localBoardChecked: true,
    noPrivateDebugMarkers: true,
    hostCredentials: "secret-host",
    guestCredentials: "secret-guest"
  });
  assert.deepEqual(redacted, {
    ok: true,
    lobbyID: "lobby-1",
    matchID: "match-1",
    setupStatusChecked: true,
    localBoardChecked: true,
    noPrivateDebugMarkers: true
  });
});
