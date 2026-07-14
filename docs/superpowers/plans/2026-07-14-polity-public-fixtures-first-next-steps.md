# Polity Public Fixtures First Next Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Polity Engine from a locally verified multiplayer baseline to a deployment-ready, playtestable product slice using robust public-safe fictional test data before any real private data is introduced.

**Architecture:** Keep the existing single Node service and public-safe data boundary. Build a richer fictional fixture pack and scenario harness first, then use it to harden rules, save/resume, undo/legal-move behavior, import/export, browser QA, and hosted deployment checks. Real private card and nation data remains the final gated phase and must not be required for any earlier test or release gate.

**Tech Stack:** TypeScript, React, Vite, Vitest, boardgame.io, node-persist, Node scripts, Render Blueprint, PowerShell on Windows with `npm.cmd`.

---

## Design Summary

Recommended approach: make public-safe fictional data the next enabling layer, then drive product hardening through deterministic scenarios. This avoids waiting for real private data while still exercising the engine with data-shaped inputs close to the eventual import path.

Rejected approach: continue adding isolated unit tests only. The current parity matrix already has broad row-level coverage; the risk now is end-to-end interaction between setup, imported data shapes, turn sequencing, persistence, multiplayer, and UI affordances.

Rejected approach: start from private transcription. The user has explicitly said private data is the absolute last step, and the project legal boundary requires private data to remain local and uncommitted.

## Guardrails

- Do not commit official names, official text, scans, decklists, or generated private JSON.
- Do not require `private-card-data/imperium_cards_private.csv` or `private-card-data/imperium_nations_private.csv` until Task 9.
- Every new data fixture must use fictional names, fictional text, and `test_` or `fixture_` identifiers.
- Every behavior discovered by browser or manual QA must become a repeatable test or smoke check before the task is complete.
- Keep `npm.cmd run smoke:multiplayer` as the highest-value user-level multiplayer gate.

## File Structure

- Create: `imperium-like-digital-prototype/data/fictional-regression/README.md`
  - Documents the fictional fixture pack, legal boundary, and scenario coverage.
- Create: `imperium-like-digital-prototype/data/fictional-regression/cards.json`
  - Public-safe normalized-style card records with enough breadth to exercise common runtime contracts.
- Create: `imperium-like-digital-prototype/data/fictional-regression/nations.json`
  - Public-safe fictional nation records that use the cards fixture.
- Create: `imperium-like-digital-prototype/data/fictional-regression/rulesets.json`
  - Public-safe fictional nation rulesets that exercise import-like setup overrides without private CSV files.
- Create: `imperium-like-digital-prototype/data/fictional-regression/scenarios.json`
  - Declarative scenario list for deterministic setup/play/smoke checks.
- Create: `imperium-like-digital-prototype/engine/src/tests/fictionalRegressionData.test.ts`
  - Validates fixture schema, IDs, legal boundary, setup viability, and scenario references.
- Create: `imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts`
  - Runs deterministic public-safe game flows against the fictional fixtures.
- Create: `scripts/fictional-game-smoke.mjs`
  - Node-level end-to-end smoke for setup, persistence-safe serialization, and selected move flows using the fictional fixtures.
- Modify: `imperium-like-digital-prototype/package.json`
  - Add `smoke:fictional-game` and include it in release-gate documentation.
- Modify: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`
  - Add the fictional regression fixture pack as supporting evidence where it covers integration risk.
- Modify: `imperium-like-digital-prototype/docs/deployment.md`
  - Add the expanded local release gate once the new smoke and browser checks pass.
- Modify: `README.md`
  - Update the planned checklist only after the matching implementation task actually closes.

---

### Task 1: Reconfirm Baseline and Protect the Public Boundary

**Files:**
- Verify only: `E:\Repositories\Jonah\polity-engine`
- Verify only: `E:\Repositories\Jonah\polity-engine\imperium-like-digital-prototype`

- [x] **Step 1: Confirm branch and working tree**

Run from repo root:

```powershell
git status --short --branch
git log --oneline --decorate -5
```

Expected on `main`; implementation is isolated on `agent/public-fixtures-next`:

```text
## main...origin/main
f4f43fd (HEAD -> main, origin/main, origin/HEAD) chore: record product readiness gate
```

- [x] **Step 2: Run the current public release gate**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run smoke:multiplayer
```

Expected: all commands exit 0. `smoke:multiplayer` reports `"ok": true`.

- [x] **Step 3: Run the current engine suite**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w engine
```

Expected: engine suite exits 0.

- [x] **Step 4: Confirm no private artifacts are staged**

Run from repo root:

```powershell
git status --short
git diff --cached --name-only
```

Expected: no staged `private-card-data/imperium_*_private.csv` files and no staged `generated-private/` files.

- [x] **Step 5: Commit only if documentation evidence changes**

If no files changed, skip this step. If a dated release-gate note is updated, commit only that doc edit:

```powershell
git add imperium-like-digital-prototype/docs/deployment.md
git commit -m "docs: refresh local release gate evidence"
```

Execution note: the isolated worktree initially exposed existing engine tests that read ignored private CSV files directly. Before proceeding to Task 2, replace those direct private-file reads with inline public-safe fixture rows in `nationRulesetValidation.test.ts`, `nationStrategyImport.test.ts`, and `soloBotReview.test.ts`, then rerun `npm.cmd run test -w engine`. This preserves the plan constraint that private data remains the final phase.

---

### Task 2: Add a Public-Safe Fictional Regression Fixture Pack

**Files:**
- Create: `imperium-like-digital-prototype/data/fictional-regression/README.md`
- Create: `imperium-like-digital-prototype/data/fictional-regression/cards.json`
- Create: `imperium-like-digital-prototype/data/fictional-regression/nations.json`
- Create: `imperium-like-digital-prototype/data/fictional-regression/rulesets.json`
- Create: `imperium-like-digital-prototype/data/fictional-regression/scenarios.json`
- Test: `imperium-like-digital-prototype/engine/src/tests/fictionalRegressionData.test.ts`

- [x] **Step 1: Write the fixture README**

Create `imperium-like-digital-prototype/data/fictional-regression/README.md`:

```markdown
# Fictional Regression Fixtures

This directory contains fictional public-safe data for Polity Engine regression testing.

The fixtures must not contain official card names, official rules text, official nation names, decklists, scans, images, or generated private data. They are designed to exercise engine contracts through invented cards and nations that use the same normalized data shape as local imports.

Coverage goals:
- setup with two fictional nations
- Market, Small deck, Main deck, Fame, Unrest, History, Exile, and Development zones
- costs, resources, Action tokens, Exhaust tokens, pending choices, cleanup, Solstice, scoring, and Collapse
- Trade Routes, Practice, solo Bot, campaign, and short-game option surfaces
- import-like data shape without requiring private transcription files
```

- [x] **Step 2: Create the initial card fixture**

Create `imperium-like-digital-prototype/data/fictional-regression/cards.json` with at least these records, then expand only when tests identify an uncovered scenario:

```json
[
  {
    "id": "fixture_state_surveyor",
    "displayName": "Surveyor State",
    "suit": "state",
    "cardType": "state",
    "cost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "developmentCost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "vp": { "mode": "none", "value": null },
    "startingLocation": "state",
    "ownership": "nation",
    "stateActionTokens": 3,
    "stateExhaustTokens": 1,
    "stateHandSize": 5,
    "effects": [],
    "tags": ["fixture_state"],
    "implemented": true,
    "tested": true
  },
  {
    "id": "fixture_power_surveyor",
    "displayName": "Surveyor Power",
    "suit": "power",
    "cardType": "power",
    "cost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "developmentCost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "vp": { "mode": "none", "value": null },
    "startingLocation": "power",
    "ownership": "nation",
    "effects": [
      { "trigger": "on_play", "op": "gain_resource", "resource": "materials", "amount": 1 }
    ],
    "tags": ["fixture_power"],
    "implemented": true,
    "tested": true
  },
  {
    "id": "fixture_action_draw_one",
    "displayName": "Archive Lantern",
    "suit": "civilized",
    "cardType": "action",
    "cost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "developmentCost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "vp": { "mode": "none", "value": null },
    "startingLocation": "draw_deck",
    "ownership": "nation",
    "effects": [
      { "trigger": "on_play", "op": "draw", "count": 1 }
    ],
    "tags": ["fixture_simple_action"],
    "implemented": true,
    "tested": true
  },
  {
    "id": "fixture_market_acquire",
    "displayName": "Open Charter",
    "suit": "civilized",
    "cardType": "action",
    "cost": { "materials": 1, "population": 0, "progress": 0, "goods": 0 },
    "developmentCost": { "materials": 0, "population": 0, "progress": 1, "goods": 0 },
    "vp": { "mode": "fixed", "value": 1 },
    "startingLocation": "market",
    "ownership": "commons",
    "commonsSetId": "fictional_regression",
    "commonsGroup": "base",
    "marketEligible": true,
    "smallDeckEligible": true,
    "mainDeckEligible": true,
    "effects": [
      { "trigger": "on_play", "op": "acquire_card", "count": 1 }
    ],
    "tags": ["fixture_market", "fixture_acquire"],
    "implemented": true,
    "tested": true
  },
  {
    "id": "fixture_unrest",
    "displayName": "Fictional Unrest",
    "suit": "unrest",
    "cardType": "unrest",
    "cost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "developmentCost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "vp": { "mode": "fixed", "value": -1 },
    "startingLocation": "unrest_pile",
    "ownership": "commons",
    "commonsSetId": "fictional_regression",
    "unrestPileEligible": true,
    "effects": [],
    "tags": ["fixture_unrest"],
    "implemented": true,
    "tested": true
  }
]
```

- [x] **Step 3: Create the nation fixture**

Create `imperium-like-digital-prototype/data/fictional-regression/nations.json`:

```json
[
  {
    "id": "fixture_nation_surveyors",
    "displayName": "Surveyor Compact",
    "powerCardIds": ["fixture_power_surveyor"],
    "stateCardIds": ["fixture_state_surveyor"],
    "startingDeckCardIds": ["fixture_action_draw_one"],
    "nationDeckCardIds": [],
    "developmentCardIds": [],
    "setupRules": [],
    "passiveRules": [],
    "actionTokensBase": 3,
    "exhaustTokensBase": 1,
    "requiredExpansions": [],
    "implemented": true,
    "tested": true
  },
  {
    "id": "fixture_nation_archivists",
    "displayName": "Archivist League",
    "powerCardIds": ["fixture_power_surveyor"],
    "stateCardIds": ["fixture_state_surveyor"],
    "startingDeckCardIds": ["fixture_action_draw_one"],
    "nationDeckCardIds": [],
    "developmentCardIds": [],
    "setupRules": [],
    "passiveRules": [],
    "actionTokensBase": 3,
    "exhaustTokensBase": 1,
    "requiredExpansions": [],
    "implemented": true,
    "tested": true
  }
]
```

- [x] **Step 4: Create scenario metadata**

Create `imperium-like-digital-prototype/data/fictional-regression/scenarios.json`:

```json
[
  {
    "id": "fixture_2p_setup_and_turn",
    "description": "Two-player setup creates playable hands, market, unrest pile, and turn order from fictional fixtures.",
    "mode": "multiplayer",
    "playerCount": 2,
    "commonsSetId": "fictional_regression",
    "playerNationIds": {
      "1": "fixture_nation_surveyors",
      "2": "fixture_nation_archivists"
    },
    "assertions": [
      "players_exist",
      "hands_non_empty",
      "market_non_empty",
      "unrest_available",
      "no_private_fields"
    ]
  }
]
```

- [x] **Step 5: Write the failing fixture validation test**

Create `imperium-like-digital-prototype/engine/src/tests/fictionalRegressionData.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";

const fixtureRoot = path.resolve(__dirname, "../../../data/fictional-regression");

function readJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, fileName), "utf8")) as T;
}

describe("fictional regression data", () => {
  it("uses only public-safe fixture identifiers and names", () => {
    const cards = readJson<Array<{ id: string; displayName: string; rawEffectTextPrivate?: string }>>("cards.json");
    const nations = readJson<Array<{ id: string; displayName: string }>>("nations.json");
    const allRecords = [...cards, ...nations];

    expect(allRecords.length).toBeGreaterThan(0);
    for (const record of allRecords) {
      expect(record.id).toMatch(/^fixture_/);
      expect(record.displayName).not.toMatch(/imperium|classics|legends|horizons/i);
    }
    expect(cards.every((card) => card.rawEffectTextPrivate === undefined)).toBe(true);
  });

  it("can create a two-player game from fictional fixture cards and nations", () => {
    const cards = readJson<any[]>("cards.json");
    const nations = readJson<any[]>("nations.json");
    const G = createInitialGameState({
      options: {
        playerCount: 2,
        mode: "multiplayer",
        enabledExpansions: [],
        enabledVariants: [],
        commonsSetId: "fictional_regression"
      },
      playerNationIds: {
        "1": "fixture_nation_surveyors",
        "2": "fixture_nation_archivists"
      },
      privateData: { cards, nations }
    });

    expect(Object.keys(G.players)).toEqual(["1", "2"]);
    expect(G.players["1"].hand.length).toBeGreaterThan(0);
    expect(G.players["2"].hand.length).toBeGreaterThan(0);
    expect(G.market.length).toBeGreaterThan(0);
    expect(G.unrestPile.length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 6: Run the focused test**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w engine -- fictionalRegressionData.test.ts
```

Expected: pass.

Execution note: the setup pipeline already supports `privateData.nationRulesets`, so the fixture pack includes `rulesets.json` with a public-safe `move_cards_to_unrest_supply` override. The scenario metadata and test use `commonsSetId: "custom"` because uploaded/import-like card bundles are routed through the existing custom commons setup path. `npm.cmd run test -w engine -- fictionalRegressionData.test.ts` passed after this adjustment.

- [x] **Step 7: Commit the fixture pack**

Run from repo root:

```powershell
git add imperium-like-digital-prototype/data/fictional-regression imperium-like-digital-prototype/engine/src/tests/fictionalRegressionData.test.ts
git commit -m "test: add fictional regression fixture pack"
```

---

### Task 3: Add Deterministic Fictional Scenario Smoke Coverage

**Files:**
- Create: `imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts`
- Create: `scripts/fictional-game-smoke.mjs`
- Modify: `imperium-like-digital-prototype/package.json`
- Modify: `README.md`

- [x] **Step 1: Add an engine-level scenario smoke test**

Create `imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import { playCard, resolveDrawChoice } from "../game/moves";

const fixtureRoot = path.resolve(__dirname, "../../../data/fictional-regression");
const ctx = { currentPlayer: "1", playOrder: ["1", "2"] } as any;

function readJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, fileName), "utf8")) as T;
}

function createFixtureGame() {
  return createInitialGameState({
    options: {
      playerCount: 2,
      mode: "multiplayer",
      enabledExpansions: [],
      enabledVariants: [],
      commonsSetId: "fictional_regression"
    },
    playerNationIds: {
      "1": "fixture_nation_surveyors",
      "2": "fixture_nation_archivists"
    },
    privateData: {
      cards: readJson<any[]>("cards.json"),
      nations: readJson<any[]>("nations.json")
    }
  });
}

describe("fictional scenario smoke", () => {
  it("plays a simple draw action without losing card identity", () => {
    const G = createFixtureGame();
    const player = G.players["1"];
    const actionCard = player.hand.find((cardId) => cardId === "fixture_action_draw_one");
    expect(actionCard).toBe("fixture_action_draw_one");

    const handBefore = player.hand.length;
    playCard({ G, ctx }, "fixture_action_draw_one");

    if (G.pendingChoice?.kind === "draw") {
      resolveDrawChoice({ G, ctx }, { cardIds: G.pendingChoice.options.slice(0, 1).map((option: any) => option.cardId) } as any);
    }

    expect(G.cardDb["fixture_action_draw_one"]).toBeDefined();
    expect(player.discard).toContain("fixture_action_draw_one");
    expect(player.hand.length).toBeGreaterThanOrEqual(handBefore - 1);
  });
});
```

- [x] **Step 2: Run the focused scenario test**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w engine -- fictionalScenarioSmoke.test.ts
```

Expected: pass. If the exact `resolveDrawChoice` argument shape differs, inspect existing `turnLoop.test.ts` draw-choice tests and adjust this test to match the existing move API before implementation changes.

- [x] **Step 3: Add a Node smoke script**

Create `scripts/fictional-game-smoke.mjs`:

```js
import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["run", "test", "-w", "engine", "--", "fictionalRegressionData.test.ts", "fictionalScenarioSmoke.test.ts"],
  {
    cwd: new URL("../imperium-like-digital-prototype", import.meta.url),
    stdio: "inherit",
    shell: false
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(JSON.stringify({ ok: true, smoke: "fictional-game" }));
```

- [x] **Step 4: Add the package script**

Modify `imperium-like-digital-prototype/package.json` scripts:

```json
"smoke:fictional-game": "node ../scripts/fictional-game-smoke.mjs"
```

Keep the existing `smoke:multiplayer` script unchanged.

- [x] **Step 5: Run the new smoke script**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run smoke:fictional-game
```

Expected:

```text
{"ok":true,"smoke":"fictional-game"}
```

Execution note: the initial scenario smoke uses `fixture_action_gain_materials` because it is deterministic and avoids hidden draw randomness in the first gate. The Node smoke wrapper uses `cmd.exe /d /s /c npm.cmd ...` on Windows, matching the project smoke-script pattern. `npm.cmd run test -w engine -- fictionalScenarioSmoke.test.ts` and `npm.cmd run smoke:fictional-game` both passed.

- [x] **Step 6: Document the new smoke gate**

Update `README.md` under Running and Testing with:

```markdown
Run the public-safe fictional game smoke test:

```powershell
npm run smoke:fictional-game
```
```

- [x] **Step 7: Commit the scenario smoke**

Run from repo root:

```powershell
git add scripts/fictional-game-smoke.mjs imperium-like-digital-prototype/package.json imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts README.md
git commit -m "test: add fictional game smoke gate"
```

---

### Task 4: Expand Rules Confidence Using the Fictional Fixture Pack

**Files:**
- Modify: `imperium-like-digital-prototype/data/fictional-regression/cards.json`
- Modify: `imperium-like-digital-prototype/data/fictional-regression/scenarios.json`
- Modify: `imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts`
- Modify: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`

- [x] **Step 1: Add fixture cards for choice-heavy contracts**

Extend `cards.json` with fictional records covering:

```json
[
  {
    "id": "fixture_action_choose_market",
    "displayName": "Market Lens",
    "suit": "civilized",
    "cardType": "action",
    "cost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "developmentCost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "vp": { "mode": "none", "value": null },
    "startingLocation": "draw_deck",
    "ownership": "nation",
    "effects": [{ "trigger": "on_play", "op": "acquire_card", "count": 1 }],
    "tags": ["fixture_pending_choice"],
    "implemented": true,
    "tested": true
  },
  {
    "id": "fixture_action_take_unrest",
    "displayName": "Strain Engine",
    "suit": "uncivilized",
    "cardType": "action",
    "cost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "developmentCost": { "materials": 0, "population": 0, "progress": 0, "goods": 0 },
    "vp": { "mode": "none", "value": null },
    "startingLocation": "draw_deck",
    "ownership": "nation",
    "effects": [{ "trigger": "on_play", "op": "take_unrest", "count": 1 }],
    "tags": ["fixture_unrest_flow"],
    "implemented": true,
    "tested": true
  }
]
```

- [x] **Step 2: Add scenarios for pending choices and Unrest**

Extend `scenarios.json` with scenario entries whose `assertions` include:

```json
[
  "pending_choice_opens",
  "pending_choice_resolves",
  "unrest_moves_from_pile",
  "cleanup_resumes"
]
```

- [x] **Step 3: Add tests for pending choice and Unrest scenarios**

Extend `fictionalScenarioSmoke.test.ts` with one test per scenario. Use existing move helpers from `turnLoop.test.ts` and `effectRunner.test.ts`; do not add new engine behavior unless the test reveals a real runtime gap.

- [x] **Step 4: Run the fictional and full engine tests**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run smoke:fictional-game
npm.cmd run test -w engine
```

Expected: both commands exit 0.

Execution note: expanded `fictionalScenarioSmoke.test.ts` now covers deterministic resource gain, a pending Market acquire choice that resolves into hand, and Unrest moving from the public-safe fixture supply into hand. `npm.cmd run smoke:fictional-game` and `npm.cmd run test -w engine` both passed with 45 engine test files and 1,487 tests.

- [x] **Step 5: Update parity evidence**

Modify `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md` by appending one sentence to the covered rows touched by the fictional smoke tests:

```markdown
`fictionalScenarioSmoke.test.ts` adds public-safe integration evidence using the `data/fictional-regression` fixture pack.
```

Only add that sentence to rows actually exercised by the new tests.

- [x] **Step 6: Commit expanded fictional rules coverage**

Run from repo root:

```powershell
git add imperium-like-digital-prototype/data/fictional-regression imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md
git commit -m "test: expand fictional rules scenario coverage"
```

---

### Task 5: Harden Local Save and Resume Before Hosted Product Work

**Files:**
- Inspect: `imperium-like-digital-prototype/engine/src/game/state.ts`
- Inspect: `imperium-like-digital-prototype/app/src/App.tsx`
- Create or modify: app persistence module matching current app patterns
- Test: app tests for local save/resume behavior
- Update: `README.md`

- [x] **Step 1: Locate current local-game ownership**

Run from `imperium-like-digital-prototype`:

```powershell
rg -n "createInitialGameState|localStorage|save|resume|reset|GameState|NewGameSessionConfig" app/src engine/src
```

Expected: identify the app component or helper that owns local game initialization.

Execution note: `App.tsx` owns local session setup and passes setup data into the boardgame.io React client. The React client surface in this version does not expose a simple full `ctx` restore prop, so Task 5 is being split: first commit a tested versioned save-envelope boundary; then wire honest UI resume only once the restore surface is designed.

- [x] **Step 2: Write failing app tests for local save and resume**

Add tests that prove:

```text
1. A local game created from fictional fixtures can be serialized.
2. Reload/resume restores player zones, turn state, options, and privateDataFingerprint.
3. Corrupt saved JSON is rejected with a visible recovery path.
4. Save data does not include private official fields.
```

Use `imperium-like-digital-prototype/app/src/App.test.tsx` if the current app tests already cover top-level state; otherwise create a focused helper test beside the new persistence helper.

Execution note: added failing tests in `localGameSave.test.ts` and `App.test.tsx` for storage load states, corrupt-save recovery messaging, a Redux restore enhancer, and saved-game setup-screen controls; verified they failed before implementation.

- [x] **Step 3: Implement a focused persistence helper**

Create a helper only if no equivalent helper exists. Keep the interface small:

```ts
export type SavedLocalGameEnvelope = {
  version: 1;
  savedAtIso: string;
  privateDataFingerprint: string;
  state: unknown;
};

export function serializeLocalGame(input: {
  privateDataFingerprint: string;
  state: unknown;
  now?: Date;
}): string;

export function parseSavedLocalGame(raw: string): SavedLocalGameEnvelope | null;
```

Execution note: added `app/src/localGameSave.ts` and `app/src/localGameSave.test.ts`. The helper serializes/parses a versioned envelope, preserves arbitrary saved game/turn state, rejects corrupt JSON and unsupported versions, and rejects known private-content fields (`rawEffectTextPrivate`, `officialName`, `officialText`, `officialRulesText`).

- [x] **Step 4: Wire resume into the app**

Add UI entry only where current local game setup controls already live. The user-facing behavior should be:

```text
If a valid saved local game exists, show a resume action near local game setup.
If the saved game is corrupt, show a clear discard/restart action.
If no saved game exists, keep the current setup flow unchanged.
```

Execution note: wired local board state persistence through the boardgame.io React `Client` enhancer path. Local sessions save a versioned envelope to browser storage, valid saves show `Resume Saved Game`, corrupt saves show `Discard Saved Game`, and resume initializes the local client store from the saved state while preserving the public/private-data fingerprint boundary.

- [x] **Step 5: Run app and type checks**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w app
npm.cmd run typecheck
```

Expected: both commands exit 0.

Execution note: `npm.cmd run test -w app` passed with 15 files and 125 tests; `npm.cmd run typecheck` passed for engine, app, and server.

- [x] **Step 6: Commit local save/resume**

Run from repo root:

```powershell
git add imperium-like-digital-prototype/app/src README.md
git commit -m "feat: add local game save and resume"
```

---

### Task 6: Add Undo and Stronger Legal-Move Guardrails for Risky Local Actions

**Files:**
- Inspect: `imperium-like-digital-prototype/engine/src/game/moves.ts`
- Inspect: `imperium-like-digital-prototype/engine/src/game/state.ts`
- Inspect: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Test: `imperium-like-digital-prototype/engine/src/tests/undoAndLegalMoves.test.ts`
- Test: app UI tests for disabled risky actions

- [x] **Step 1: Define the first undo scope**

Limit undo to local, non-multiplayer sessions and to the most recent player-initiated move before an irreversible random draw, hidden reveal, or opponent-visible multiplayer mutation.

Execution note: the first scope uses boardgame.io's existing local undo stack and exposes it only for non-multiplayer sessions. Undo is disabled with visible reasons when there is no local undo history or when unresolved hidden-information windows are open.

- [x] **Step 2: Write failing engine tests**

Create `imperium-like-digital-prototype/engine/src/tests/undoAndLegalMoves.test.ts` with tests for:

```text
1. Playing a deterministic action can be undone to the previous state.
2. Resolving a pending choice records a new undo boundary.
3. Undo is unavailable after hidden random information changes.
4. A disabled or illegal move leaves state unchanged and logs the blocked reason.
```

Execution note: this implementation did not add a custom engine undo stack because boardgame.io already owns the local undo snapshots. The failing coverage was added in `BoardLayout.test.tsx` for the app-local undo availability contract, disabled online scope, hidden-information blocking, and visible disabled reasons.

- [x] **Step 3: Implement undo history in game state or app state**

Prefer app-local undo history if boardgame.io multiplayer state should remain untouched. Use engine helpers only for pure validation:

```ts
export type UndoSnapshot = {
  label: string;
  state: unknown;
};
```

Do not store more than one snapshot in the first implementation unless the tests require multi-step undo.

Execution note: `BoardLayout` now reads boardgame.io's `_undo` stack, calls the client `undo` command only when the local guard permits it, and keeps multiplayer sessions out of the local undo UI.

- [x] **Step 4: Surface blocked reasons in the UI**

Use existing action availability helpers where possible. The UI should show one concise reason for the selected disabled action and should not expose internal debug jargon.

Execution note: the local undo command shows concise disabled reasons such as `No move to undo` and `Resolve hidden information before undo`, while existing action availability helpers continue to surface disabled move reasons for selected cards.

- [x] **Step 5: Run focused and full checks**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w engine -- undoAndLegalMoves.test.ts
npm.cmd run test -w app
npm.cmd run typecheck
```

Expected: all commands exit 0.

Execution note: because the implemented undo guardrail is app-local over boardgame.io's built-in undo stack, the focused check was `npm.cmd run test -w app -- BoardLayout.test.tsx`. It passed with 41 BoardLayout tests. `npm.cmd run test -w app` passed with 15 files and 129 tests. `npm.cmd run typecheck` passed for engine, app, and server.

- [x] **Step 6: Commit undo/legal guardrails**

Run from repo root:

```powershell
git add imperium-like-digital-prototype/engine/src imperium-like-digital-prototype/app/src
git commit -m "feat: add local undo and legal move guardrails"
```

Execution note: committed as `f829c1e feat: add local undo guardrails`.

---

### Task 7: Add Portable Local Game Import and Export

**Files:**
- Inspect: `imperium-like-digital-prototype/app/src/ui`
- Create or modify: focused import/export helpers under `app/src`
- Test: app tests for import/export envelope
- Update: `README.md`

- [x] **Step 1: Reuse the save envelope**

Build import/export around the `SavedLocalGameEnvelope` from Task 5. Do not create a separate format unless Task 5 found an existing project format.

Execution note: Task 7 reuses the versioned `SavedLocalGameEnvelope` and adds transfer helpers around `serializeLocalGame` and `parseSavedLocalGame`.

- [x] **Step 2: Write failing tests**

Add tests for:

```text
1. Export emits versioned JSON with no private official fields.
2. Import accepts a valid exported game.
3. Import rejects unsupported version.
4. Import rejects malformed state without replacing the active game.
```

Execution note: added failing tests in `localGameSave.test.ts` and `App.test.tsx` for JSON export filename/content, valid import, unsupported-version rejection, malformed-state rejection, and visible setup controls.

- [x] **Step 3: Implement export**

Add a clear user command in the local-game UI that downloads the JSON envelope. Use a filename shape like:

```text
polity-local-game-YYYYMMDD-HHMMSS.json
```

Execution note: `createLocalGameExport` emits a versioned public-safe JSON envelope with a `polity-local-game-YYYYMMDD-HHMMSS.json` filename, and the setup shell exposes `Export Saved Game` for valid saved local games.

- [x] **Step 4: Implement import**

Add import through a file input near the local resume/export controls. On successful import, show the loaded game state. On failure, preserve the current state and show the rejection reason.

Execution note: `Import Saved Game` reads a JSON file, validates it with `importLocalGameExport`, stores it only on success, and starts the restored local session. Invalid imports leave the current state untouched and surface a rejection message.

- [x] **Step 5: Run checks**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w app
npm.cmd run typecheck
```

Expected: both commands exit 0.

Execution note: `npm.cmd run test -w app` passed with 15 files and 134 tests. `npm.cmd run typecheck` passed for engine, app, and server.

- [x] **Step 6: Commit import/export**

Run from repo root:

```powershell
git add imperium-like-digital-prototype/app/src README.md
git commit -m "feat: add local game import and export"
```

Execution note: committed as `f6da5af feat: add local game import and export`.

---

### Task 8: Prove Hosted Deployment With Public-Safe Fixtures

**Files:**
- Modify: `imperium-like-digital-prototype/docs/deployment.md`
- Modify: `scripts/multiplayer-smoke.mjs` only if hosted smoke needs a non-local URL option
- Create: `scripts/hosted-smoke.mjs` if `multiplayer-smoke.mjs` should stay local-only

- [x] **Step 1: Decide hosted smoke shape**

If `scripts/multiplayer-smoke.mjs` can safely accept `POLITY_SMOKE_BASE_URL`, modify it. If the local server lifecycle makes that messy, create `scripts/hosted-smoke.mjs`.

Execution note: kept `scripts/multiplayer-smoke.mjs` local-only because it owns server lifecycle, restart checks, and storage layout assertions. Added a separate `scripts/hosted-smoke.mjs` for already deployed origins.

- [x] **Step 2: Add hosted health checks**

Hosted smoke must verify:

```text
1. GET /polity/accounts/health returns 200.
2. GET / returns HTML containing the React root.
3. GET /polity/lobby/rooms returns JSON.
4. Account or guest entry can create a lobby using placeholder/fictional fingerprint.
5. No private debug UI is enabled.
```

Execution note: `scripts/hosted-smoke.mjs` checks `/polity/accounts/health`, the React root at `/`, `/polity/lobby/rooms`, placeholder lobby creation, absence of private-debug/private-field markers in the served app shell, and best-effort cleanup of the smoke lobby. Added `npm.cmd run smoke:hosted`.

- [ ] **Step 3: Run local release gate plus hosted proof**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
```

Then run the hosted smoke against the deployed URL:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
node ..\scripts\hosted-smoke.mjs
```

Expected: all commands exit 0. If Render assigns a different URL, use that real deployed URL for `POLITY_HOSTED_BASE_URL` and record the exact URL policy in the runbook.

Execution note: local public release gates passed on 2026-07-14: `npm.cmd run typecheck`; `npm.cmd run test -w app` with 15 files and 134 tests; `npm.cmd run test -w server` with 11 files and 63 tests; `npm.cmd run test -w engine` with 45 files and 1,487 tests; `npm.cmd run smoke:fictional-game`; and `npm.cmd run smoke:multiplayer`. `npm.cmd run smoke:hosted` also passed against a local production-style server at `http://127.0.0.1:8794`, proving the hosted-smoke script against the expected service shape. Hosted smoke against `https://polity-engine.onrender.com` reached the host but `/polity/accounts/health` returned 404 on repeated attempts, so hosted proof remains blocked until the actual deployed Polity Engine origin is available or Render is redeployed to this service shape.

- [ ] **Step 4: Browser QA**

Run a two-context browser QA pass:

```text
1. Open deployed app.
2. Continue as guest in one context.
3. Sign in or create account in second context.
4. Create lobby with fictional/placeholder setup.
5. Join, ready both seats, start game.
6. Refresh both contexts and verify rejoin.
7. Restart service and verify lobby or match metadata persists.
```

- [ ] **Step 5: Document hosted evidence**

Append a dated section to `imperium-like-digital-prototype/docs/deployment.md`:

```markdown
## Hosted Release Gate

- 2026-07-14 or execution date: Hosted Render deployment at the recorded Render URL passed health, app shell, lobby, fictional game, multiplayer smoke, and two-context browser QA. `POLITY_SERVER_ORIGIN` was set to the deployed origin, `POLITY_STORAGE_PATH` used the persistent disk, and private debug UI was disabled.
```

Use the actual date and URL policy chosen by the repository owner.

- [ ] **Step 6: Commit deployment proof**

Run from repo root:

```powershell
git add imperium-like-digital-prototype/docs/deployment.md scripts
git commit -m "chore: record hosted deployment proof"
```

---

### Task 9: Final Phase Only - Private Data Readiness and Import

**Files:**
- Local-only inputs: `imperium-like-digital-prototype/private-card-data/imperium_cards_private.csv`
- Local-only inputs: `imperium-like-digital-prototype/private-card-data/imperium_nations_private.csv`
- Local-only generated outputs: `imperium-like-digital-prototype/generated-private/`
- Modify public docs only if status changes can be described without private content.

- [ ] **Step 1: Confirm all public-safe gates are complete first**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
```

Expected: all commands exit 0 before any private data import begins.

- [ ] **Step 2: Confirm required private CSVs exist locally**

Run from `imperium-like-digital-prototype`:

```powershell
Test-Path private-card-data\imperium_cards_private.csv
Test-Path private-card-data\imperium_nations_private.csv
```

Expected:

```text
True
True
```

If either value is `False`, stop this phase and continue transcription outside the public repo.

- [ ] **Step 3: Run private preflight**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run private:preflight
```

Expected: private schemas validate without printing official content into committed logs.

- [ ] **Step 4: Run private import and completeness**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run private:import-all
npm.cmd run private:completeness
```

Expected: generated outputs remain under `generated-private/` and are not staged.

- [ ] **Step 5: Run public-safe regression after private import**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run typecheck
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
```

Expected: public-safe tests still pass. If private data reveals a runtime gap, reproduce it with fictional data first, then fix the public engine test.

- [ ] **Step 6: Confirm no private content is staged**

Run from repo root:

```powershell
git status --short
git diff --cached --name-only
```

Expected: no `private-card-data/imperium_*_private.csv` files and no `generated-private/` files appear in staged changes.

- [ ] **Step 7: Commit public-safe docs only if needed**

If private import changes only local ignored files, do not commit. If public-safe documentation needs a status update, commit only that documentation:

```powershell
git add README.md imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md
git commit -m "docs: update private data readiness status"
```

---

## Final Verification Gate

Run from `imperium-like-digital-prototype` before calling the full sequence complete:

```powershell
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
```

Run from repo root:

```powershell
git status --short --branch
git diff --cached --name-only
```

Expected:

```text
## main...origin/main
```

No private CSV or generated private JSON files should be staged.

## Self-Review

- Spec coverage: The plan covers public-safe robust test data, deterministic scenario coverage, local save/resume, undo/legal guardrails, import/export, hosted deployment proof, and private data as the final gated phase.
- Placeholder scan: No unfinished marker words or vague implementation-only placeholders are present.
- Type consistency: New fixture paths, smoke script names, and npm script names are consistent across tasks.
- Scope check: The plan is large but sequential; each task is independently commit-sized and keeps private data last.
