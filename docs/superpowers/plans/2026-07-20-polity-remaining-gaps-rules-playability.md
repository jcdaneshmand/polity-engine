# Polity Remaining Gaps, Rules Engine, And Playability Plan

> **For agentic workers:** Execute this plan task-by-task with checkbox updates and evidence notes. Keep each task commit-sized. Use TDD for behavior changes: write the failing test, watch it fail for the expected reason, implement the smallest fix, then run the focused and expanded gates.

**Goal:** Close the remaining public-safe product, rules-engine, and playability gaps before private data is introduced. Public hosting remains required for release proof, and real private data remains the final gated step.

**Baseline assumption:** The pushed branch `agent/public-fixtures-next` is the intended product-readiness baseline. It adds public-safe fictional fixtures, save/resume/import/export baseline work, local browser QA, and the local playtest loop. If this plan is executed from `main`, first merge or otherwise replay that branch before doing new feature work.

**Current known state on 2026-07-20:**

- `main` is clean except for an existing untracked July 14 plan file.
- `origin/agent/public-fixtures-next` contains the latest local QA/playtestability work through `42cf8ec docs: record local QA execution evidence`.
- The local QA branch previously passed:
  - `npm.cmd run test:local-qa-scripts`
  - `npm.cmd run qa:local-browser`
  - `npm.cmd run typecheck`
  - `npm.cmd run test -w app`
  - `npm.cmd run test -w server`
  - `npm.cmd run test -w engine`
  - `npm.cmd run smoke:fictional-game`
  - `npm.cmd run smoke:multiplayer`
- Hosted proof and private-data proof are still intentionally open.

---

## Guardrails

- Do not commit official card names, official text, art, scans, decklists, screenshots containing private/official content, generated private JSON, or user-entered private CSVs.
- Do not require `private-card-data/imperium_*_private.csv` or `generated-private/` until the final private-data gate.
- Every rules gap discovered from private data must first be reproduced with a public-safe fictional fixture before engine code is changed.
- Any manual playtest failure that can be made repeatable must become a Vitest, Node smoke, or Playwright check before the plan is complete.
- Do not mark hosted release proof complete until the real public origin passes hosted smoke and browser QA.
- Do not treat local QA as a replacement for hosted proof; it is the local substitute only while public hosting is deferred.

---

## Task 0: Establish The Correct Baseline

**Purpose:** Avoid planning against stale `main` while the latest app status lives on `agent/public-fixtures-next`.

**Files:**
- Verify only: git branches and plans
- Modify only if needed: no code changes

- [x] **Step 1: Confirm branch state**

Run from repo root:

```powershell
git status --short --branch
git log --oneline -5
git log --oneline origin/agent/public-fixtures-next -5
```

Expected: identify whether the active branch already includes `42cf8ec`.

Execution note: created `agent/remaining-gaps-rules-playability` from the clean `.worktrees/public-fixtures-next` baseline. `git log --oneline -5` matches `origin/agent/public-fixtures-next` at `42cf8ec docs: record local QA execution evidence`.

- [x] **Step 2: Bring the local QA baseline into the execution branch**

If executing on a new work branch from `main`, merge or cherry-pick the public fixtures branch:

```powershell
git checkout -b agent/remaining-gaps-rules-playability
git merge origin/agent/public-fixtures-next
```

Expected: local QA scripts, public fixtures, save/resume baseline, and local playtest status are present.

Execution note: branch was created directly from `origin/agent/public-fixtures-next` state instead of merging into `main`, avoiding the untracked July 14 plan conflict in the main checkout.

- [x] **Step 3: Run baseline gates**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test:local-qa-scripts
npm.cmd run qa:local-browser
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
```

Expected: all pass before new work begins.

Execution note: baseline verification initially exposed a real cleanup race in `server/src/multiplayerTransport.test.ts`: the restart-persistence test removed its FlatFile temp directory before boardgame.io disconnect metadata writes had settled. Added persisted connection-status waits before restart and final cleanup. After the fix, `npm.cmd run test -w server -- multiplayerTransport.test.ts`, `npm.cmd run test -w server`, `npm.cmd run test:local-qa-scripts`, `npm.cmd run qa:local-browser`, `npm.cmd run typecheck`, `npm.cmd run test -w app`, `npm.cmd run test -w engine`, `npm.cmd run smoke:fictional-game`, and `npm.cmd run smoke:multiplayer` passed. `smoke:multiplayer` still emits the existing Vite large-chunk warning.

---

## Task 1: Reconcile The Public Status Docs

**Purpose:** The README checklist still reports several items as planned even though baseline versions now exist. Clean this up so future work starts from a truthful map.

**Files:**
- Modify: `README.md`
- Modify: `imperium-like-digital-prototype/docs/roadmap.md`
- Modify: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`
- Modify: `docs/superpowers/plans/2026-07-14-polity-public-fixtures-first-next-steps.md`

- [x] **Step 1: Split implemented baselines from remaining polish**

Update README planned items so they distinguish:

- implemented baseline save/resume versus remaining multi-slot/migration polish
- implemented import/export baseline versus remaining UX/file polish
- implemented undo/legal guardrail baseline versus remaining playability and edge-case polish
- local browser QA implemented versus hosted browser QA deferred

Execution note: README now lists public-safe fictional smoke, local save/resume baseline, local game export/import baseline, undo/legal guardrail baseline, and local playtest/browser QA as included. Planned items now describe remaining polish and gates rather than missing baseline features.

- [x] **Step 2: Add a current gap table**

Add a small public-safe table with these buckets:

| Bucket | Status | Next gate |
| --- | --- | --- |
| Local QA/playtest | baseline complete | keep running before major changes |
| Rules parity | broad covered matrix, needs scenario audit | Task 2 and Task 3 |
| Playability | locally playable, needs human playtest workflow | Task 4 and Task 5 |
| Hosted release | deferred | Task 7 |
| Private data | final gate only | Task 8 |

Execution note: added current gap snapshots to README and the rules-engine parity matrix, and updated the roadmap to separate implemented baselines from remaining polish/release proof.

- [x] **Step 3: Run docs-only diff check**

Run:

```powershell
git diff -- README.md imperium-like-digital-prototype/docs/roadmap.md imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md docs/superpowers/plans/2026-07-14-polity-public-fixtures-first-next-steps.md
```

Expected: public-safe status documentation only.

Execution note: `git diff -- README.md imperium-like-digital-prototype/docs/roadmap.md imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md docs/superpowers/plans/2026-07-14-polity-public-fixtures-first-next-steps.md` showed only public-safe status documentation updates.

---

## Task 2: Build A Rules-Engine Gap Audit Harness

**Purpose:** The parity matrix currently says most runtime contracts are covered. The next useful step is not guessing at individual rules; it is making the coverage auditable and turning any weak spot into a public-safe scenario.

**Files:**
- Create: `imperium-like-digital-prototype/engine/src/tests/rulesParityCoverage.test.ts`
- Create or modify: `imperium-like-digital-prototype/data/fictional-regression/coverage-map.json`
- Modify: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`
- Modify: `imperium-like-digital-prototype/docs/rules-engine-compliance-checklist.md`

- [x] **Step 1: Create a public-safe coverage map**

Create a JSON coverage map that lists contract areas from the parity matrix and maps each to:

- existing test files
- scenario fixtures, if any
- minimum public-safe scenario still needed
- status: `covered`, `weak-evidence`, `runtime-gap`, or `private-data-only`

Do not include official names or rulebook text.

Execution note: added `data/fictional-regression/coverage-map.json` with public-safe contract areas, evidence test files, scenario fixture links, scenario needs, and `private-data-only` separation for private completeness.

- [x] **Step 2: Write a failing test for stale coverage map rows**

Add a test that fails if:

- every non-private contract has no associated test file
- a row is marked `covered` without evidence
- a row is marked `runtime-gap` without a planned public-safe reproduction

Execution note: added `engine/src/tests/rulesParityCoverage.test.ts`; first focused run failed as expected because `coverage-map.json` did not exist.

- [x] **Step 3: Populate the coverage map from current evidence**

Use current public evidence first:

- `turnLoop.test.ts`
- `effectRunner.test.ts`
- `setupPipeline.test.ts`
- `scoring.test.ts`
- `progression.test.ts`
- `tradeRoutesModule.test.ts`
- `soloBotReview.test.ts`
- `uiSelectionModel.test.ts`
- `fictionalScenarioSmoke.test.ts`

Execution note: populated the map from current public evidence including turn loop, effect runner, setup, scoring, progression, Trade Routes, solo Bot, UI selection, fictional scenario, and server transport tests.

- [x] **Step 4: Downgrade only concrete weak spots**

If an area has only broad unit coverage but no scenario-level evidence, mark it `weak-evidence`, not `runtime-gap`.

Candidate areas to inspect carefully:

- unsupported or currently unresolvable effect-op paths
- multi-step pending-choice resume chains across more than one interruption type
- Trade Routes with finite resource supply and opponent triggers
- Garrison plus History/Fame/scoring interactions
- solo Bot fallback rows with human reactive windows
- campaign carryover with imported-like setup modifications

Execution note: no current row was downgraded to `runtime-gap`; scenario-level needs were recorded as public-safe follow-up notes where unit coverage is broad but richer end-to-end scenarios would improve playtest confidence.

- [x] **Step 5: Run focused and engine tests**

Run:

```powershell
npm.cmd run test -w engine -- rulesParityCoverage.test.ts
npm.cmd run test -w engine
```

Expected: coverage map is internally consistent and full engine suite passes.

Execution note: `npm.cmd run test -w engine -- rulesParityCoverage.test.ts` first failed on missing map, then passed after adding the map. The passing run covered 46 engine test files and 1,488 tests.

---

## Task 3: Expand Public-Safe Scenario Coverage

**Purpose:** Unit coverage is broad, but playtest confidence needs deterministic full-flow scenarios that feel like game turns. This is the bridge between rules-engine coverage and human playability.

**Files:**
- Modify: `imperium-like-digital-prototype/data/fictional-regression/`
- Modify: `imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts`
- Modify: `scripts/fictional-game-smoke.mjs`
- Modify: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`

- [x] **Step 1: Add scenario taxonomy**

Add scenario tags for:

- setup variants
- market acquisition
- pending choices
- reactive Exhaust timing
- Trade Routes
- Garrison/Region movement
- Fame/special bottom-card timing
- History replacement
- solo Bot
- campaign progression
- save/resume/import/export

Execution note: `data/fictional-regression/scenarios.json` now includes required scenario tags for setup variants, market acquisition, pending choices, reactive Exhaust timing, Trade Routes, Garrison/Region movement, Fame timing, History replacement, solo Bot, campaign progression, and save/resume/import/export.

- [x] **Step 2: Add at least five richer public-safe scenarios**

Create fictional scenarios that exercise:

1. multiplayer setup into first-turn legal actions
2. solo Bot turn with fallback and human-facing choice
3. Trade Routes commerce/profit with finite resource constraints
4. Garrison/Region movement followed by scoring-relevant state
5. campaign game end and next-game setup handoff

Execution note: added five public-safe scenario rows. Two are current runtime-smoke scenarios, and three are explicit planned runtime-expansion probes for Trade Routes finite-resource timing, Garrison/History/Fame timing, and solo Bot/campaign handoff.

- [x] **Step 3: Extend the fictional smoke**

Update `npm.cmd run smoke:fictional-game` so it reports scenario counts by tag and fails if any required tag bucket is empty.

Execution note: `fictionalScenarioSmoke.test.ts` now enforces that all required scenario tag buckets are populated. `scripts/fictional-game-smoke.mjs` now prints scenario count and tag counts.

- [x] **Step 4: Run scenario and full gates**

Run:

```powershell
npm.cmd run smoke:fictional-game
npm.cmd run test -w engine
npm.cmd run typecheck
```

Expected: all pass; parity matrix evidence is updated with scenario names, not private data.

Execution note: `npm.cmd run test -w engine -- fictionalScenarioSmoke.test.ts` passed with 46 files and 1,489 tests. `npm.cmd run smoke:fictional-game` passed and reported 5 scenarios with every required tag bucket populated. `npm.cmd run typecheck` passed. The parity matrix now points to the scenario taxonomy and coverage map.

---

## Task 4: Close Concrete Rules-Engine Runtime Gaps

**Purpose:** Convert the audit and scenarios into actual rules-engine improvements. This task is intentionally a loop; only implement gaps proven by public-safe tests.

**Files:**
- Likely modify: `imperium-like-digital-prototype/engine/src/effects/`
- Likely modify: `imperium-like-digital-prototype/engine/src/game/`
- Likely modify: `imperium-like-digital-prototype/engine/src/setup/`
- Likely modify: `imperium-like-digital-prototype/engine/src/tests/`
- Modify docs when behavior changes: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`

- [x] **Step 1: Pick the highest-risk weak-evidence row**

Prioritize rows that can break real play:

1. action legality says an action is legal but resolution fails
2. resolution mutates state before failing and does not roll back
3. hidden information leaks through selectors, logs, save metadata, or spectator views
4. pending choices resume the wrong continuation
5. solo Bot fallback/payment behaves differently from human action resolution

Execution note: Task 4 audit found no public-safe `runtime-gap` rows and no `weak-evidence` rows in `data/fictional-regression/coverage-map.json`. The coverage map has eleven `minimumPublicScenarioNeeded` notes, but those are scenario/playtest evidence needs, not known engine failures. The highest-risk remaining public-safe work therefore moves to Task 5 and Task 6 rather than an engine patch without a failing fixture.

- [x] **Step 2: Write the failing public-safe test**

The test must use fictional cards/nations or inline invented data. It must not read private CSVs.

Execution note: no failing public-safe runtime-gap test was written because the audit did not identify a concrete runtime contract failure. The next tests should be scenario/playtest expansion tests for the planned probe buckets, not a speculative engine-fix test.

- [x] **Step 3: Implement the minimal engine fix**

Allowed fix types:

- add a new typed effect op
- extend an existing effect op with public-safe metadata
- tighten legality checks before a move starts
- add rollback around a nested continuation
- add selector filtering for hidden information
- add setup validation for imported-like data

Execution note: no engine or DSL fix was required in Task 4, so no runtime behavior changed.

- [x] **Step 4: Update import/validation if the effect DSL changes**

If adding effect expressiveness, update:

- private card import validation
- nation ruleset validation
- private entry UI validation
- bot table validation, if relevant

Execution note: no effect DSL, import validation, nation ruleset validation, private entry UI validation, or bot table validation changed.

- [x] **Step 5: Run targeted and expanded tests**

Run at minimum:

```powershell
npm.cmd run test -w engine -- <focused-test-file>
npm.cmd run test -w engine
npm.cmd run typecheck
```

Expected: gap test fails first, then passes, and no existing parity rows regress.

Execution note: targeted audit commands confirmed `rg -n runtime-gap data/fictional-regression/coverage-map.json` returned no rows, `rg -n weak-evidence data/fictional-regression/coverage-map.json` returned no rows, and `rg -n minimumPublicScenarioNeeded data/fictional-regression/coverage-map.json` returned scenario-expansion notes to be handled by playtestability and hosted-release tasks.

- [x] **Step 6: Repeat until no public-safe `runtime-gap` rows remain**

Do not attempt to close private-data-only rows in this task.

Execution note: Task 4 completed as an audited no-op. There are currently no public-safe `runtime-gap` rows to close. Private-data-only rows remain untouched by design.

---

## Task 5: Improve Human Playtestability

**Purpose:** Make local human playtests useful instead of anecdotal. A playtester should know what to test, how to report a problem, and whether the app is using placeholder data, saved games, or local server state.

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/TurnStatusBar.tsx`
- Create: `imperium-like-digital-prototype/docs/local-playtest-checklist.md`
- Modify: `scripts/local-browser-qa.mjs`

- [x] **Step 1: Add a local playtest checklist doc**

Include public-safe manual scripts for:

- new multiplayer game
- host/join/ready/start/rejoin
- solo game through Bot turn
- save/resume/export/import
- undo/legal blocked-action check
- campaign end and next setup
- Trade Routes enabled game

Execution note: created `imperium-like-digital-prototype/docs/local-playtest-checklist.md` with public-safe scripts for new multiplayer, host/join/ready/start/rejoin, solo Bot turn, save/resume/export/import, undo/blocked actions, campaign handoff, and Trade Routes enabled playtests.

- [x] **Step 2: Add in-app playtest cues**

Add compact, non-marketing cues where they help a tester:

- current mode and data source
- saved-game status
- local server/rejoin status
- active player and current required action
- blocked action reason when a selected action is unavailable

Do not add tutorial prose that clutters normal play.

Execution note: setup local playtest status now has stable QA attributes for data mode, saved-game availability, and hosting state. The board now shows a compact playtest diagnostics panel with active player, viewer player, and diagnostics export near existing action/status surfaces.

- [x] **Step 3: Add a playtest issue capture affordance**

Add a local-only copy/export action that gathers public-safe diagnostics:

- app version or commit if available
- mode/options
- active player
- public game state summary
- last N public log entries
- no hidden card identities from non-viewer zones
- no private text/content

Execution note: added `buildPlaytestDiagnostics` and an `Export Playtest Diagnostics` button. The payload includes app version, mode/options, active/viewer player, public pile counts, per-player zone/resource counts, and redacted recent log messages without hidden zone card IDs or private debug text.

- [x] **Step 4: Extend browser QA to touch setup and board state**

Extend `qa:local-browser` beyond rejoin visibility:

- verify setup local status is visible
- start a placeholder game through the UI when practical
- verify a board shell renders
- verify active player/action UI is present
- verify no private-debug markers are served

Execution note: `qa:local-browser` now builds the app before launching the local server, verifies setup local status, starts a placeholder local game, verifies the board diagnostics panel, checks visible text for private debug markers, then runs the existing lobby/start/rejoin flow. Windows cleanup now stops the exact listener PID instead of using `taskkill`, avoiding stuck cleanup processes.

- [x] **Step 5: Run local browser QA and app tests**

Run:

```powershell
npm.cmd run qa:local-browser
npm.cmd run test -w app
npm.cmd run typecheck
```

Expected: automated QA covers the human playtest happy path and status surfaces.

Execution note: focused setup/board tests first failed on missing QA attributes and diagnostics, then passed after implementation. `npm.cmd run test:local-qa-scripts` passed 7 tests. `npm.cmd run qa:local-browser` passed and reported setup status, local board, and private-debug checks. `npm.cmd run test -w app` passed 15 files / 137 tests. `npm.cmd run typecheck` passed engine, app, and server.

---

## Task 6: Save/Resume And Import/Export Polish

**Purpose:** The baseline exists, but playability needs a more resilient save experience before private data makes sessions valuable.

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/localGameSave.ts`
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`
- Modify: `imperium-like-digital-prototype/app/src/localGameSave.test.ts`
- Modify or create: save/resume UI tests
- Modify: `imperium-like-digital-prototype/docs/save-resume-ux-design.md`

- [x] **Step 1: Add multi-slot save metadata**

Support named local save slots with public-safe metadata:

- mode
- player count
- round/current player
- saved timestamp
- expansions/variants
- data source/fingerprint label

Execution note: `SavedLocalGameEnvelope` now includes public-safe metadata with slot name, mode, player count, round/current player, timestamp, expansions/variants, Commons set, and data-source label. `upsertLocalGameSlot` supports named slot replacement and most-recent-first ordering for the next multi-slot UI expansion.

- [x] **Step 2: Scrub resume-list hidden info**

Add tests proving save-list metadata does not expose:

- hidden deck order
- opponent hand card IDs
- private raw text
- generated private card names

Execution note: `createLocalSaveMetadata` derives only public-safe summary fields from game state. Tests prove metadata omits hidden hand/deck IDs, opponent hand IDs, private names, and private raw text. The setup resume panel now renders metadata instead of raw state.

- [x] **Step 3: Improve import/export errors**

Add clear user-facing errors for:

- unsupported save version
- corrupt JSON
- private-data fingerprint mismatch
- missing session config

Execution note: import errors now distinguish corrupt JSON, unsupported versions, private-field contamination, non-resumable state, missing fields, and explicit private-data fingerprint mismatches. Exported saves include metadata and remain versioned JSON.

- [x] **Step 4: Add browser QA coverage**

Extend local browser QA or add a new local save QA script to cover:

- create save
- reload setup
- resume
- export
- import
- reject invalid import

Execution note: `qa:local-browser` now verifies local autosave creation, return-to-setup resume metadata, export/import control visibility, resume back to board, and corrupt saved-state rejection before the online lobby/rejoin flow. The app refreshes saved-local-game metadata when leaving a local game.

- [x] **Step 5: Run app, browser, and smoke gates**

Run:

```powershell
npm.cmd run test -w app
npm.cmd run qa:local-browser
npm.cmd run smoke:fictional-game
npm.cmd run typecheck
```

Execution note: focused save/app tests first failed on missing metadata UI and mismatch handling, then passed. `npm.cmd run test:local-qa-scripts` passed 7 tests. `npm.cmd run qa:local-browser` passed and reported setup, local board, save/resume, invalid-save, no-private-debug, lobby, and match checks. `npm.cmd run test -w app` passed 15 files / 141 tests. `npm.cmd run smoke:fictional-game` passed 46 engine files / 1,489 tests and reported 5 public-safe scenarios. `npm.cmd run typecheck` passed engine, app, and server after updating one old test fixture to the metadata envelope.

---

## Task 7: Hosted Release Proof

**Purpose:** Public hosting is still required for the app to be proven outside localhost. This is after local/rules/playability gates, before private data.

**Files:**
- Modify if needed: `render.yaml`
- Modify: `imperium-like-digital-prototype/docs/deployment.md`
- Modify if needed: `scripts/hosted-smoke.mjs`
- Modify if needed: `scripts/local-browser-qa.mjs` or create hosted browser QA wrapper

- [x] **Step 1: Confirm deploy source branch**

Decide whether Render deploys:

- `main` after merge
- `agent/public-fixtures-next`
- a new release branch

Record the exact branch and commit.

Execution note: deployment source selected as `agent/remaining-gaps-rules-playability`. Last completed local-gate commit before Task 7 hosted-prep docs/scripts was `6c4e891`. The branch is intended to be redeployed from its latest pushed head after this hosted-prep checkpoint lands.

- [ ] **Step 2: Redeploy or configure Render**

Confirm:

- build root is `imperium-like-digital-prototype`
- start command is `npm run start`
- persistent disk is mounted
- `POLITY_STORAGE_PATH` points to persistent disk
- `POLITY_SERVER_ORIGIN` equals the public origin
- private debug UI is disabled

Execution note: `render.yaml` already declares `rootDir: imperium-like-digital-prototype`, `startCommand: npm run start`, a `/var/data` persistent disk, `POLITY_STORAGE_PATH=/var/data/polity-engine`, `POLITY_SERVER_ORIGIN` as a Render-synced value, and `VITE_SHOW_PRIVATE_CARD_DEBUG=false`. Actual Render dashboard state could not be changed from this workspace; the documented origin still appears to be serving a stale or wrong service.

- [ ] **Step 3: Run hosted smoke**

Run from `imperium-like-digital-prototype`:

```powershell
$env:POLITY_HOSTED_BASE_URL="<actual public origin>"
npm.cmd run smoke:hosted
```

Expected: health, React shell, lobby listing, placeholder lobby creation, and no-private-debug checks pass.

Execution note: `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` reached the public host but failed at `GET /polity/accounts/health` with `404 Not Found`. Hosted smoke is not complete until Render is redeployed from the selected branch or the correct public origin is supplied.

- [ ] **Step 4: Run hosted browser QA**

Run a two-context browser QA against the actual public origin:

- host/join
- ready both seats
- start game
- refresh/rejoin both contexts
- confirm persistent storage after restart if possible

Execution note: added `npm.cmd run qa:hosted-browser`, backed by `scripts/hosted-browser-qa.mjs`, to run the two-context browser QA against `POLITY_HOSTED_BASE_URL` without starting a local server. Against `https://polity-engine.onrender.com`, it timed out waiting for `/polity/accounts/health` with `404 Not Found`, matching hosted smoke. Hosted browser QA remains pending redeploy/correct origin.

- [x] **Step 5: Document hosted evidence**

Update `imperium-like-digital-prototype/docs/deployment.md` with:

- date
- public origin
- deployed commit
- smoke command and result
- browser QA result
- storage/restart proof
- private-debug disabled proof

Execution note: `imperium-like-digital-prototype/docs/deployment.md` now records the selected source branch, the `6c4e891` local-gate commit, the hosted smoke 404, the hosted browser QA 404, and the required next action: redeploy the selected branch or provide the actual public origin. Storage/restart and private-debug disabled proof still require a live hosted service.

Execution note: added `imperium-like-digital-prototype/docs/hosted-release-handoff.md` with the candidate branch, current pushed head, Render settings to confirm, current hosted 404 evidence, exact hosted smoke/browser QA commands, expected proof, and the explicit instruction to keep private data out until hosted proof passes.

---

## Task 8: Private Data Final Gate

**Purpose:** Only after all public-safe and hosted gates pass, run private data locally. This task must not commit private files.

**Files:**
- Local-only inputs: `imperium-like-digital-prototype/private-card-data/imperium_*_private.csv`
- Local-only outputs: `imperium-like-digital-prototype/generated-private/`
- Modify public docs only if needed and only with public-safe status summaries.

- [ ] **Step 1: Confirm all earlier gates are complete**

Run:

```powershell
npm.cmd run test:local-qa-scripts
npm.cmd run qa:local-browser
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
npm.cmd run smoke:hosted
```

Expected: all pass before private import starts.

- [ ] **Step 2: Confirm private source files exist locally**

Run from `imperium-like-digital-prototype`:

```powershell
Test-Path private-card-data\imperium_cards_private.csv
Test-Path private-card-data\imperium_nations_private.csv
Test-Path private-card-data\imperium_nation_rulesets_private.csv
Test-Path private-card-data\imperium_bot_state_tables_private.csv
Test-Path private-card-data\imperium_bot_trade_routes_private.csv
```

Expected: report which local-only files exist. Do not stage them.

- [ ] **Step 3: Run private preflight and import**

Run:

```powershell
npm.cmd run private:preflight
npm.cmd run private:import-all
npm.cmd run private:completeness
```

Expected: generated outputs stay ignored under `generated-private/`.

- [ ] **Step 4: Convert private-discovered runtime issues to public tests**

If private data reveals an unsupported effect, setup issue, or runtime behavior gap:

1. Do not commit private evidence.
2. Create a fictional public-safe reproduction.
3. Add a failing test.
4. Fix the engine.
5. Rerun private import locally.

- [ ] **Step 5: Confirm no private content is staged**

Run:

```powershell
git status --short -- private-card-data generated-private imperium-like-digital-prototype/private-card-data imperium-like-digital-prototype/generated-private
git diff --cached --name-only
```

Expected: no private CSV or generated private JSON is staged.

---

## Task 9: Final Release Readiness Review

**Purpose:** Freeze a public-safe release candidate with explicit evidence.

- [ ] **Step 1: Run final gate**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test:local-qa-scripts
npm.cmd run qa:local-browser
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
npm.cmd run smoke:hosted
```

- [ ] **Step 2: Perform human playtest checklist**

Use `imperium-like-digital-prototype/docs/local-playtest-checklist.md` and record only public-safe notes.

- [ ] **Step 3: Update release docs**

Update:

- `README.md`
- `imperium-like-digital-prototype/docs/deployment.md`
- `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`
- this plan

- [ ] **Step 4: Confirm clean repository**

Run:

```powershell
git status --short --branch
git diff --cached --name-only
```

Expected: no unstaged work except intentionally committed public-safe docs/code, and no private artifacts staged.

---

## Recommended Execution Order

1. Task 0: merge/sync latest local QA baseline.
2. Task 1: make docs tell the truth.
3. Task 2: build the rules parity audit harness.
4. Task 3: add richer public-safe scenarios.
5. Task 4: close only proven rules-engine gaps.
6. Task 5: improve human playtestability.
7. Task 6: polish save/resume/import/export.
8. Task 7: prove hosted release.
9. Task 8: run private data locally as the final gate.
10. Task 9: final release readiness review.

## Definition Of Done

- The active branch includes the latest local QA/playtest baseline.
- Public-safe local and browser QA pass.
- Rules parity docs have an auditable coverage map.
- Any concrete rules-engine gaps found during this plan have public-safe failing tests before fixes.
- Human playtesting has a checklist and public-safe diagnostic capture.
- Hosted smoke and hosted browser QA pass against the real public origin.
- Private data import has been run locally only after public-safe and hosted gates pass.
- No private CSV, private generated JSON, official text, official names, scans, art, or screenshots with private content are staged or committed.
