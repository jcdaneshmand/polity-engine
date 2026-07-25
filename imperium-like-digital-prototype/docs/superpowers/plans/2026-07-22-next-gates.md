# Next Gates Closure Plan

> **For agentic workers:** Execute this plan gate-by-gate. Update checkboxes and evidence notes as each step lands. Keep public-safe data boundaries intact: no official card text, official card names, official art, scans, private CSV rows, generated private JSON, or private screenshots should be committed.

**Goal:** Track the release gates between the current public-safe, hosted build and a private-data-verified playtest build. The original public-safe gates are now closed; the remaining work is local private-data verification, release cadence discipline, and production hardening.

**Current baseline:**

- README gap snapshot now marks local QA/playtest, playable-rulebook UI, rules parity, playability, hosted release plumbing, longer stress, and the transcription workstation baseline as closed for the public-safe build.
- `qa:local-browser` covers setup, save/resume, invalid save, deterministic worked-turn play, automated practice, automated solo, two-seat online multiplayer self-play, viewport checks, diagnostics, and private-debug marker checks.
- The UI exposes current-task metadata, action provenance, blocked-action reasons, public-safe player aid copy, copied bug-report summaries, and diagnostics for player-expectation automation.
- Local save/export guards reject private transcription field names so accidental private names/text cannot be persisted in portable save envelopes.
- The setup shell exposes portable save import even when browser storage has no saved local game, so recovery does not depend on an existing autosave.
- Corrupt saved-local-game records preserve a public-safe parse reason in setup so the recovery path explains whether JSON, version, timestamp, fingerprint, state, or privacy checks failed.
- Saved-local-game recovery panels expose `data-qa="saved-local-game-status"` with public-safe state/source/mode/round attributes for expectation-agent checks.
- Browser QA now asserts the empty, valid autosave, and corrupt autosave recovery states so import/resume/discard affordances do not silently regress.
- Browser QA now asserts game-log/player-aid right-rail geometry across responsive viewports; it caught and verified the narrow-tablet overlap fix.
- Online lobby/game private-data mismatch recovery now gives public-safe guidance to import the same local private CSV bundle as the host and tells players when the server will verify exact private data.
- `docs/production-playtest-runbook.md` now documents pre-invite hosted proof, Render runtime settings, persistent storage/backup expectations, admin cleanup, bug intake, stuck-room recovery, and release closeout.
- Render deploys are live and verified with commit-pinned hosted smoke. The latest documented release proof after the transcription workstation pass is commit `1aeb87e`.
- The transcription tool now reuses real card/nation/ruleset validators and includes browser draft protection, card batch progress, a search/edit queue, field-level Save / Next recovery for current-card validator errors, and expanded keyboard flow for raw text, implementation/test markers, duplication, and required blanks.
- Setup private-data uploads now produce a browser-side dry-run preview with fatal/warning counts, record counts, readiness checks, cross-file card-reference status, implemented/tested coverage, a sanitized copyable issue summary, and a downloadable validation report before private data can be applied.
- Setup playtest status now gives a compact next-gate cue: demo-data sessions point to private CSV entry, and private-data sessions point to `private:gate`. The Private Data setup section exposes QA-readable state metadata for empty, preview-pending, preview-fatal, and confirmed local private data.
- `npm run private:scaffold` can create missing ignored private CSV work files from committed template headers without overwriting existing local data; `private:preflight` now rejects missing private files, missing templates, header-only scaffold files, and headers that drift from the committed templates; `private:completeness` also lists header-only sources with a row-entry next step before private rows exist; `private:preflight:report` and `private:artifacts:verify` write public-safe readiness evidence; `private:gate` runs the full local private proof chain.
- `npm run verify:pre-private` now chains local QA script tests, workspace typecheck, app tests, server tests, fictional-game smoke, multiplayer smoke, and local browser QA as the public-safe gate to run before entering private data.

**Original public-safe gate order:**

1. Board hierarchy and zone clarity.
2. Guided worked-turn scenario.
3. Parity evidence map.
4. Hosted smoke and hosted browser QA.
5. Longer gameplay stress runs.
6. Private-data final gate.

**Current remaining gate order:**

1. Private-data final gate with ignored local private CSV files.
2. Hosted release proof cadence for each deploy.
3. Production operations hardening and playtest invite runbook.

---

## Global Guardrails

- [x] Every rule behavior change starts with a public-safe failing test or scripted expectation.
- [x] UI helpers explain rule state but do not become a second legality engine.
- [x] Browser QA artifacts include enough public-safe state to reproduce failures without leaking hidden or private data.
- [x] Each gate has a clear command, artifact, or documented manual checklist as acceptance evidence.
- [x] README `Current Gap Snapshot` is updated whenever a gate meaningfully changes status.
- [x] Private-data scripts are final-gate checks only; do not use private files to justify public-safe implementation changes.

Evidence note: 2026-07-22 public-safe gates were closed through local browser QA, hosted smoke/browser QA plumbing, longer gameplay stress tests, admin close/end controls, support/About messaging, and the transcription workstation pass. Private-data import scripts remain final-gate checks only because the ignored local private CSV work files need real rows.

---

## Gate 1: Board Hierarchy And Zone Clarity

**Purpose:** A player should know what is public, private, hidden, selectable, blocked, pending, exhausted, and turn-relevant without reading logs or guessing.

**Primary files:**

- `app/src/ui/layout/BoardLayout.tsx`
- `app/src/ui/layout/CardDetailPanel.tsx`
- `app/src/ui/layout/ActionMenu.tsx`
- `app/src/ui/layout/RuleAidPanel.tsx`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`
- `scripts/local-browser-qa.mjs`

**Steps:**

- [x] Inventory all rendered zones and classify them as public, own-private, opponent-hidden, market/shared, pending-choice, or diagnostic-only.
- [x] Add stable `data-zone-kind` or equivalent public-safe test hooks where they help QA inspect hierarchy without exposing hidden card content.
- [x] Make selected-card treatment consistent across zones: selected, selectable, blocked, and hidden states should have distinct visual language and accessible labels.
- [x] Ensure pending choices visually outrank ordinary turn actions while still leaving enough context to understand what was interrupted.
- [x] Expand viewport QA to assert that the current-task strip, player aid, action menu, selected-card detail, and primary board zones are visible or reachable at desktop, Steam Deck, and narrow tablet sizes.
- [x] Add focused app tests for zone classification and selected-card blocked feedback.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx CardInspectionModal.test.tsx
npm.cmd run qa:local-browser
```

Evidence note: Added public-safe `data-zone-kind`, `data-zone-role`, `data-zone-state`, and `data-card-state` metadata across shared piles, market cards, own zones, hand cards, detail panels, and diagnostics. `BoardLayout.test.tsx` and `qa:local-browser` now assert zone hierarchy metadata.

---

## Gate 2: Guided Worked-Turn Scenario

**Purpose:** Give the automated player-expectation agent a deterministic public-safe game path that behaves like a real player learning the flow.

**Scenario shape:**

- Start a local fictional game.
- Confirm setup state and current-task metadata.
- Select a public/shared card.
- Verify at least one legal action and one blocked action explanation.
- Resolve a pending choice that requires a target, such as market-resource cleanup when configured.
- End the turn with one click when no blocking choice remains.
- Save, reload, resume, and verify the same public-safe current task is still coherent.
- Repeat the scenario in practice, solo, and two-seat online multiplayer where feasible.

**Primary files:**

- `scripts/local-browser-qa.mjs`
- `scripts/local-browser-qa.test.mjs`
- `engine/src/tests/gameplayStress.test.ts`
- `engine/src/tests/uiSelectionModel.test.ts`
- `data/fictional-regression/coverage-map.json`

**Steps:**

- [x] Define a named `workedTurn` trace format with actions, expectations, snapshots, and failure reasons.
- [x] Add fake scenario cards or setup options if the current placeholder decks do not reliably expose the needed decisions.
- [x] Teach local browser QA to run the worked-turn script after setup and before longer randomized play.
- [x] Assert one-click end-turn behavior after pending cleanup resolves.
- [x] Assert solo and practice auto-advance behavior when the active player is controlled by the app.
- [x] Preserve a public-safe JSON trace and screenshot on the first failed expectation.
- [x] Add unit tests for trace redaction and expectation failures.

**Acceptance evidence:**

```powershell
node --test scripts/local-browser-qa.test.mjs
npm.cmd run test -w engine -- uiSelectionModel.test.ts gameplayStress.test.ts
npm.cmd run qa:local-browser
```

Evidence note: `qa:local-browser` now reports `"workedTurnChecked": true` and `"workedTurn": { "steps": 8 }` on the passing local run. `local-browser-qa.test.mjs` covers structured trace entries and redacted failure summaries.

---

## Gate 3: Parity Evidence Map

**Purpose:** Make it auditable that UI explanations correspond to engine rules and tested fictional scenarios.

**Primary files:**

- `docs/rules-engine-parity-matrix.md`
- `docs/rules-engine-compliance-checklist.md`
- `data/fictional-regression/coverage-map.json`
- `app/src/ui/controller/selectionModel.ts`
- `engine/src/tests/rulesParityCoverage.test.ts`
- `engine/src/tests/uiSelectionModel.test.ts`

**Steps:**

- [x] List every current-task title and blocked-action reason emitted by selectors.
- [x] List every action provenance label shown in the UI.
- [x] Add coverage-map entries that connect each explanation category to at least one public-safe unit test or fictional scenario.
- [x] Add a rules parity coverage test that fails when a selector explanation has no evidence entry.
- [x] Update parity docs with a short table: UI explanation, rules source category, test evidence, scenario evidence, and known gaps.
- [x] Keep provenance labels public-safe and original; do not quote official rules.

**Acceptance evidence:**

```powershell
npm.cmd run test -w engine -- rulesParityCoverage.test.ts uiSelectionModel.test.ts
npm.cmd run smoke:fictional-game
```

Evidence note: Added `ui-playable-rulebook-explanations` to `data/fictional-regression/coverage-map.json`, added enforcement in `rulesParityCoverage.test.ts`, and documented the row in `docs/rules-engine-parity-matrix.md`.

---

## Gate 4: Hosted Smoke And Hosted Browser QA

**Status:** Closed for the current public-safe hosted release proof. Continue to rerun the hosted checks after every deploy.

**Purpose:** Prove the same workflows that pass locally also work through the deployed origin, same-origin server routing, storage, and browser security boundaries.

**Primary files:**

- `scripts/hosted-smoke.mjs`
- `scripts/hosted-browser-qa.mjs`
- `scripts/hosted-browser-qa.test.mjs`
- `scripts/local-hosted-smoke.mjs`
- `server/src/index.ts`
- `server/src/jsonFileStore.ts`

**Steps:**

- [x] Confirm hosted QA configuration uses an explicit public origin and never defaults silently to a stale deployment.
- [x] Align hosted browser QA expectations with local player-expectation checks: setup, diagnostics, current task, enabled/blocked action metadata, save/resume where supported, and no private-debug markers.
- [x] Add or update tests for hosted QA configuration errors and artifact redaction.
- [x] Run local hosted smoke first, then deployed hosted smoke, then hosted browser QA.
- [x] Record the tested origin, commit SHA, and command outputs in the plan evidence.

**Acceptance evidence:**

```powershell
npm.cmd run smoke:hosted:local
npm.cmd run smoke:hosted
npm.cmd run qa:hosted-browser
```

Evidence note: `npm.cmd run smoke:hosted:local` passed against `http://127.0.0.1:8794`. `npm.cmd run test:local-qa-scripts` passed and confirms hosted browser QA requires `POLITY_HOSTED_BASE_URL`. The root `render.yaml` is present; `npm.cmd run render:verify` passed locally after adding the package script, covering typecheck, server tests, and production app build. The next-gates work was committed and pushed to `origin/main` at `16bfa7c`. On 2026-07-22, `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` initially failed at `/polity/accounts/health` with `404 Not Found`; after Render went live, `npm.cmd run smoke:hosted` passed and `npm.cmd run qa:hosted-browser` passed against the same origin. After commit `9088980`, hosted smoke was upgraded to verify `/polity/accounts/version` and `POLITY_EXPECTED_COMMIT`. The local hosted smoke passed with a synthetic expected commit. Render's deploy list showed the live service was still on `69566d6` from a `blueprint_sync` trigger; API deploys for `9088980f439eabbdd5cecf9acfc11f4bfdc00a8f`, `4549d1d4e093cc1030ee34b5f27c7a8833ddd74f`, and `57158b87ac5f3ab5f528519234fe2a9408e2faba` reached `live`, and `POLITY_EXPECTED_COMMIT=57158b8 npm.cmd run smoke:hosted` passed with the full live commit reported. Later Render API deploys for `3b1e800`, `676eb2a`, and `1aeb87e` reached `live`; each was followed by commit-pinned hosted smoke against `https://polity-engine.onrender.com`.

---

## Gate 5: Longer Gameplay Stress Runs

**Status:** Closed for current public-safe fictional coverage. Keep extending seeds and fake-card scenarios when real playtest bugs reveal new patterns.

**Purpose:** Find logical game errors that only appear after normal play sequences, multiple turns, empty decks, pending choices, solo bot actions, multiplayer seat mapping, or save/resume transitions.

**Primary files:**

- `engine/src/tests/gameplayStress.test.ts`
- `engine/src/tests/soloPracticeModes.test.ts`
- `engine/src/tests/multiplayerAuthorization.test.ts`
- `scripts/fictional-game-smoke.mjs`
- `scripts/local-browser-qa.mjs`
- `data/fictional-regression/`

**Steps:**

- [x] Define deterministic seeds for short, medium, and long simulated games.
- [x] Add fake cards and fake decks that intentionally exercise markets, cleanup choices, action tokens, exhaust tokens, acquire/break-through paths, solo bot flow, and multiplayer turn transitions.
- [x] Add invariants for normal play: no stuck active player, no unresolved pending choice after resolution, no impossible current task, no hidden-info leak, no negative resource count unless explicitly modeled, no illegal end-turn availability during blocking choices.
- [x] Run the stress agent in engine-only mode first for speed.
- [x] Promote high-value stress paths into browser QA when the UI is part of the bug surface.
- [x] Save failed seeds, action traces, and compact public-safe state snapshots.
- [x] Add regression tests for every discovered logical issue before fixing it.

**Acceptance evidence:**

```powershell
npm.cmd run test -w engine -- gameplayStress.test.ts soloPracticeModes.test.ts multiplayerAuthorization.test.ts
npm.cmd run smoke:fictional-game
npm.cmd run qa:local-browser
```

Evidence note: `gameplayStress.test.ts` covers seeded practice/solo/trade-route/complete fake-card flows with invariants and trace-on-failure messages. Browser QA now promotes worked-turn, practice, solo, viewport, and online self-play paths. Server transport tests were updated after discovering the correct multiplayer privacy expectation: host-owned cleanup choices remain hidden from the guest and spectator.

---

## Gate 6: Private-Data Final Gate

**Status:** Open. This is now the primary remaining release gate.

**Purpose:** After public-safe local and hosted gates pass, verify the user's local private transcription data imports cleanly and is complete enough for real play without committing or exposing it.

**Primary files:**

- `tools/card-import/preflightPrivateImportAll.ts`
- `tools/card-import/importPrivateCards.ts`
- `tools/card-import/importPrivateNations.ts`
- `tools/card-import/reportPrivateDataCompleteness.ts`
- `private-card-data/`
- `generated-private/`

**Steps:**

- [x] Confirm all public-safe gates are green before running private-data checks.
- [x] Run private preflight and inspect errors locally.
- [x] Add a setup-screen dry-run preview that reuses the import validators before applying uploaded private data.
- [x] Add copy/download recovery actions for the dry-run validation report without including private card text or parsed private payloads.
- [x] Add readiness checks for validator state, card/nation presence, cross-file card references, rulesets, solo bot tables, and implemented/tested coverage.
- [x] Add field-level card transcription recovery so blocked Save / Next attempts show current-card errors and focus the matching field when possible.
- [x] Add deeper card transcription shortcuts and visible card implemented/tested controls for faster physical-card entry.
- [ ] Run private import-all only against ignored local files.
- [ ] Run completeness report and summarize counts without copying private text into committed docs.
- [ ] If private data exposes a rules mismatch, reproduce it with a public-safe fake card/scenario before changing engine behavior.
- [ ] Update README gap snapshot with final-gate status, using counts and categories only.

**Acceptance evidence:**

```powershell
npm.cmd run private:gate
```

Evidence note: After hosted proof passed on 2026-07-22, `npm.cmd run private:preflight` was run locally. It failed before import because the expected ignored local sources were missing: `imperium_cards_private.csv`, `imperium_nations_private.csv`, `imperium_nation_rulesets_private.csv`, `imperium_nation_strategy_private.csv`, `imperium_bot_state_tables_private.csv`, and `imperium_bot_trade_routes_private.csv`. The preflight output names the matching template for each missing private source, suggests `private:scaffold`, rejects missing templates, rejects header-only scaffold files, rejects headers that drift from templates, reports row counts on success, can write a public-safe JSON report with filenames/output paths/row counts/check statuses only, and can verify generated private outputs are present and fresh after import; `privateImportPreflight.test.ts` covers those hints and checks. `npm run private:scaffold` creates missing ignored private CSV work files from committed template headers and leaves existing local files unchanged; `private:gate` runs the public-safe preflight report, import-all, and generated-artifact freshness verification in order, with completeness included by `private:import-all`. On 2026-07-23, `npm.cmd run private:scaffold` created the six ignored local private CSV work files, `npm.cmd run private:status` moved to the expected header-only blocked state, and `npm.cmd run private:gate` correctly failed fast during `private:preflight:report` because each ignored CSV now needs at least one data row. `privateGateScripts.test.ts` locks both gate scripts: `verify:pre-private` must remain a public-safe chain of local QA script tests, typecheck, app tests, server tests, `private:status`, fictional-game smoke, multiplayer smoke, and browser QA, while `private:gate` must start with the public-safe preflight report, run import-all before artifact freshness verification, and avoid duplicating completeness outside `private:import-all`. The setup UI and local browser expectation agent point private-data sessions at `private:gate`; the Private Data setup panel also exposes `data-qa="private-data-setup"` plus public-safe loaded/confirmed/preview-state metadata so browser QA can distinguish absent private data, uploaded-but-unapplied previews, fatal previews, and confirmed private data. Browser QA uploads a public-safe intentionally invalid private card CSV, verifies the fatal import preview, confirms `Use This Private Data` remains disabled, and checks that unconfirmed fatal private data does not switch setup out of placeholder mode. It also uploads a public-safe minimal card+nation CSV bundle, verifies the non-fatal preview enables `Use This Private Data`, applies it, and confirms setup switches to private mode with `private:gate` as the next gate before reloading back to placeholder data for normal gameplay. The redacted QA result carries `privateUploadPreviewChecked: true` and `privateUploadPreview: { fatal: "blocked", applyable: "confirmed" }`, making the upload proof visible in logs without exposing private contents. `npm.cmd run verify:pre-private` passed end to end, chaining local QA script tests, workspace typecheck, app tests, server tests, `private:status`, fictional-game smoke, multiplayer smoke, and browser QA; the final browser QA result included setup status, fatal/applyable private upload previews, local board, automated practice/solo, two-seat multiplayer self-play, worked-turn, viewport, save/resume, invalid-save, and private-debug-marker checks. `npm.cmd run test -w engine -- privateGateScripts.test.ts`, `npm.cmd run typecheck`, and temp-root smokes prove scaffold creates header-only files, preflight rejects them, verifies output freshness, and preflight passes once each file has a row. Commit `1aeb87e` improved the transcription workstation for this gate by reusing real card/nation/ruleset validators in the UI, adding browser draft protection, showing card batch progress, and adding a card search/edit queue. On 2026-07-23, setup private-data upload gained a browser-side dry-run report that reuses card, nation, ruleset, strategy, and bot-table validators, blocks applying private data with fatal preview issues, and reports counts plus implemented/tested coverage. The nation-strategy validator CLI was split into `validatePrivateNationStrategyCli.ts` so the browser bundle can reuse the validator without importing Node-only file parsing. The dry-run report now includes a copyable issue summary and downloadable JSON envelope that carry only filenames, roles, row numbers, fields, messages, and aggregate counts, with tests asserting private names and raw private text stay out. It also includes readiness checks for validator gate, cards, nations, rulesets, solo bot tables, and implemented/tested coverage, rendered in setup as a compact checklist. The transcription form maps current-card validator failures back to visible fields, shows an inline Save / Next recovery summary, clears fixed field messages as the user types, and focuses the matching field when possible. Card entry also exposes implemented/tested controls and adds shortcuts for raw text focus, implementation/test toggles, duplicate structure/full, and next required blank. Verification passed: `npm.cmd run test -w app`, `npm.cmd run typecheck`, `npm.cmd run build -w app`, `npm.cmd run strategy:validate`, `npm.cmd run test:local-qa-scripts`, and escalated `npm.cmd run qa:local-browser`; the latest readiness/recovery slice also passed `npm.cmd run test -w app -- privateDataImport.test.ts NewGameSetupSummary.test.tsx`, `npm.cmd run test -w app`, `npm.cmd run test -w engine -- cardEntryService.test.ts`, `npm.cmd run test -w engine -- privateGateScripts.test.ts privateImportPreflight.test.ts privateCsvScaffold.test.ts`, `npm.cmd run typecheck`, and `npm.cmd run build -w app`. The expected remaining blocker is now row entry in the six ignored local private CSV work files.

Latest evidence note: On 2026-07-23, the expanded `npm.cmd run verify:pre-private` gate passed end to end after app and server suites were added to the aggregate command. The run covered 29 QA helper tests, workspace typecheck, 177 app tests, 76 server tests, 49 engine files / 1518 engine tests through the fictional-game smoke pretest sweep, multiplayer smoke, and local browser QA. The browser result confirmed fatal and applyable private upload previews, setup status, local board, automated practice/solo, two-seat multiplayer self-play, worked-turn, responsive viewport QA, save/resume, invalid-save recovery, and no private debug markers.

Latest hardening note: The setup dry-run report now has a distinct Card References readiness check, so missing nation card references are visible as a player-facing setup gate. Preview messages are sanitized before UI/copy/download report use when validators echo private-looking referenced IDs or private row identifiers. Each readiness item now exposes stable `data-readiness-id` and `data-readiness-status` metadata, and local browser QA rejects dry-run previews that lack the card-reference readiness item or expose an invalid readiness status. Verification passed: `npm.cmd run test -w app -- privateDataImport.test.ts NewGameSetupSummary.test.tsx`, `node --test scripts\local-browser-qa.test.mjs`, `npm.cmd run typecheck -w app`, and escalated `npm.cmd run qa:local-browser`.

Latest diagnostics note: Playtest diagnostics now sanitize known private card ids, private names, and private effect/notes fields across current-task text, pending-action text, enabled and blocked action labels/reasons, selected-card metadata, recent public log entries, exported diagnostics, and copied bug-report summaries. Exported diagnostics now carry an explicit public-safe privacy block with the `[private]` redaction marker, copied bug-report summaries include the same privacy line, and the rendered diagnostics panel exposes `data-privacy-classification="public-safe"` plus `data-redaction-marker="[private]"` for the browser expectation agent. Browser QA now fails local and observer board snapshots that lack those privacy hooks. Verification passed: `npm.cmd run test -w app -- BoardLayout.test.tsx`, `node --test scripts\local-browser-qa.test.mjs`, and `npm.cmd run typecheck -w app`; the latest metadata slice also passed `npm.cmd run test -w app -- BoardLayout.test.tsx`, `node --test scripts\local-browser-qa.test.mjs`, `npm.cmd run typecheck -w app`, and escalated `npm.cmd run qa:local-browser`.

Latest artifact note: Player-expectation failure reports no longer store raw visible page text in their JSON snapshots. They now preserve structured counts, flags, diagnostics privacy metadata, trace, screenshot path, a `visibleTextPolicy: "omitted-public-safe"` marker, and body text length only, so local private playtest failures can be investigated without copying private card names into the JSON report. QA helper tests also cover the bug-report email helper in both local player and multiplayer observer snapshots. Verification passed: `node --test scripts\local-browser-qa.test.mjs`.

Latest workflow note: `npm run private:status` now gives a non-failing public-safe snapshot of the local private CSV workspace using the same preflight checks as `private:gate`. It writes `generated-private/private-status-report.json`, reports ready/blocked source counts, and prints the next action for missing inputs, header-only scaffold files, header drift, missing templates, or stale/missing generated outputs without copying private row contents. Setup playtest status and the Private Data setup panel now expose QA-readable next-command metadata so demo-data sessions point at `private:status` and confirmed private-data sessions point at `private:status private:gate`; the browser expectation agent enforces those cues. Verification passed: `npm.cmd run test -w engine -- privateImportPreflight.test.ts`, `npm.cmd run test -w app -- NewGameSetupSummary.test.tsx`, `node --test scripts\local-browser-qa.test.mjs`, `npm.cmd run typecheck -w app`, and escalated `npm.cmd run qa:local-browser`.

Latest transcription note: The Card and Nation Transcription Tool now includes a compact public-safe export guidance panel with row-count metadata and `data-next-command="private:status private:gate"`. The panel tells the transcriber to save/download changed CSVs, run `npm run private:status` after exporting, and reserve `npm run private:gate` for the strict final local proof once all required ignored files have rows. Verification passed: `npm.cmd run test -w app -- PrivateCardEntry.test.ts NewGameSetupSummary.test.tsx` and `npm.cmd run typecheck -w app`.

Latest report note: Downloaded private-data import preview reports now carry public-safe `recommendedCommands` and `nextStep` fields so a saved validation artifact preserves the `private:status` before `private:gate` workflow without including private names, raw text, or parsed private payloads. The copied preview summary includes the same next-step command cue. The local playtest checklist now asks for the validation preview report only when setup/import issues are involved. Verification passed: `npm.cmd run test -w app -- privateDataImport.test.ts NewGameSetupSummary.test.tsx PrivateCardEntry.test.ts` and `npm.cmd run typecheck -w app`.

Latest gate note: `npm.cmd run verify:pre-private` now includes `npm run private:status` between public-safe app/server tests and gameplay smokes. That keeps the friendly private workspace readiness report under the aggregate pre-private proof while still avoiding strict preflight, import-all, completeness, or generated private artifact verification until local private CSV rows exist. Verification passed: `npm.cmd run test -w engine -- privateGateScripts.test.ts privateImportPreflight.test.ts`, `npm.cmd run private:status`, and escalated `npm.cmd run verify:pre-private`. The full aggregate run passed 32 QA helper tests, workspace typecheck, 183 app tests, 76 server tests, `private:status` in the expected blocked/missing-CSV state, 49 engine files / 1520 tests in the fictional-game pretest sweep, fictional smoke, multiplayer smoke, and local browser QA.

Latest privacy-boundary note: `privateDataIgnoreRules.test.ts` now locks the git boundary for local private data. It asserts the six expected ignored private CSV sources plus `generated-private/private-status-report.json`, `private-preflight-report.json`, and `private-artifacts-report.json` remain ignored, while committed private-data templates and docs remain trackable. Verification passed: `npm.cmd run test -w engine -- privateDataIgnoreRules.test.ts privateGateScripts.test.ts privateImportPreflight.test.ts` and direct `git check-ignore -v` spot checks.

Latest status-report note: `private:status`, `private:preflight:report`, and artifact verification reports now include public-safe `recommendedCommands` and `nextStep` fields, so saved JSON reports carry the same recovery guidance as the console output without copying private rows. Next-step priority now handles structural blockers first: restore missing templates, repair drifted headers, scaffold missing files, then enter rows or regenerate outputs. Verification passed: `npm.cmd run private:status`, inspection of `generated-private/private-status-report.json`, and `npm.cmd run test -w engine -- privateImportPreflight.test.ts privateGateScripts.test.ts privateDataIgnoreRules.test.ts`.

Latest source-guidance note: Each source entry inside the private status/preflight/artifact JSON reports now has its own public-safe `nextStep`, such as restoring a template, scaffolding a missing file, repairing a header, entering a row, creating an output, refreshing a stale output, or `Ready.`. `privateDataCompleteness.test.ts` no longer depends on whether ignored local scaffold files exist in the developer workspace; it uses an explicit temp missing path for missing-source coverage. Verification passed: `npm.cmd run test -w engine -- privateDataCompleteness.test.ts privateImportPreflight.test.ts privateDataIgnoreRules.test.ts privateGateScripts.test.ts`.

Latest completeness-guidance note: `private:completeness` now detects existing header-only private CSV work files and prints a public-safe source list plus the next step to enter rows and rerun `private:status`, instead of leaving the local scaffolded state as an unexplained `Private Data Completeness: 0/0 complete`. Verification passed: `npm.cmd run private:completeness` against the local scaffolded workspace and `npm.cmd run test -w engine -- privateDataCompleteness.test.ts privateImportPreflight.test.ts privateDataIgnoreRules.test.ts privateGateScripts.test.ts` with 50 engine files / 1523 tests passing.

---

## Final Release Checklist

- [x] README reflects the actual status of every gate.
- [x] `2026-07-21-ui-as-playable-rulebook.md` and this plan contain current evidence notes.
- [x] Public-safe tests pass:

```powershell
npm.cmd run verify:pre-private
```

- [x] Hosted tests pass against the intended deployment:

```powershell
npm.cmd run smoke:hosted
npm.cmd run qa:hosted-browser
```

- [ ] Private-data final gate passes locally, with no private data committed.
- [x] QA artifacts are kept only where useful and ignored when they contain machine-local or private context.
- [x] Every known failing seed or scenario is either fixed or listed as an explicit open gap.

Evidence note: Public-safe local checks passed: `npm.cmd run test -w engine -- rulesParityCoverage.test.ts uiSelectionModel.test.ts gameplayStress.test.ts` (engine pretest ran 47 files / 1505 tests), `npm.cmd run test -w app` (15 files / 153 tests), `npm.cmd run test -w server` (11 files / 64 tests), `npm.cmd run typecheck`, `npm.cmd run smoke:fictional-game`, `npm.cmd run smoke:multiplayer`, `npm.cmd run smoke:hosted:local`, `npm.cmd run test:local-qa-scripts`, `npm.cmd run qa:local-browser`, and `npm.cmd run render:verify`. Earlier hosted checks passed against `https://polity-engine.onrender.com`: `npm.cmd run smoke:hosted` and `npm.cmd run qa:hosted-browser`. Latest-commit hosted proof now requires `POLITY_EXPECTED_COMMIT`; after an API deploy for commit `57158b8`, `POLITY_EXPECTED_COMMIT=57158b8 npm.cmd run smoke:hosted` passed and reported the full live commit. On 2026-07-23, local save/export privacy guards were expanded to reject normalized private card names, CSV-style private card names/text, bot private effect text, and ruleset private notes; `npm.cmd run test -w app -- localGameSave.test.ts` covers the guard. The setup shell now exposes Import Saved Game when no saved local game exists or when the stored save is corrupt, corrupt saved-local-game records show the parser's public-safe failure reason, and recovery panels expose stable `data-qa` saved-game state/source/mode/round attributes for expectation-agent checks; `npm.cmd run test -w app -- App.test.tsx localGameSave.test.ts` covers that recovery path, and `npm.cmd run test:local-qa-scripts` plus escalated `npm.cmd run qa:local-browser` now assert empty, valid autosave, and corrupt autosave recovery states in the player-expectation agent. Support tracker updates are now server-side admin-gated and the client sends the bearer token; `npm.cmd run test -w server -- support.test.ts`, `npm.cmd run test -w app -- onlineSession.test.ts`, full `npm.cmd run test -w server`, and `npm.cmd run typecheck` cover the change. Online lobby/game private-data mismatch recovery now has clearer public-safe copy and lobby parity with running-game exact-data verification copy; `npm.cmd run test -w app -- onlineSession.test.ts OnlineGames.test.tsx` and `npm.cmd run typecheck -w app` cover the change. Setup playtest status now exposes a player-facing next-gate cue and QA-readable `data-next-gate`; `npm.cmd run test -w app -- NewGameSetupSummary.test.tsx` and direct `node --test ..\scripts\local-playtest-server.test.mjs ..\scripts\local-browser-qa.test.mjs ..\scripts\hosted-browser-qa.test.mjs ..\scripts\local-hosted-smoke.test.mjs` cover the change. Private-data final gate remains open because the six ignored local private CSV work files are scaffolded but header-only; `npm.cmd run private:status` now reports that each file needs at least one data row.

Latest evidence note: On 2026-07-23, `npm.cmd run verify:pre-private` passed with the expanded aggregate chain: QA script tests, workspace typecheck, app tests, server tests, fictional-game smoke, multiplayer smoke, and local browser QA. This is now the single public-safe local verification command before private data entry.

---

## Current Remaining Gates

1. **Private-data import proof:** Run `npm.cmd run private:scaffold` if local ignored `*_private.csv` files are absent, enter at least one private row in each required file while preserving template headers, confirm the setup upload dry-run has no fatal issues or blocked core readiness checks, run `npm.cmd run private:gate`, then summarize only counts/categories.
2. **Release proof cadence:** For every commit deployed to Render, run `POLITY_EXPECTED_COMMIT=<short-sha> npm.cmd run smoke:hosted`; run `npm.cmd run qa:hosted-browser` after gameplay, board UI, lobby, admin, or diagnostics changes.
3. **Operations hardening:** Rehearse the documented live playtest runbook for admin close/end controls, support tracking, Render persistent storage, stuck-game cleanup, and playtest bug-report intake.
4. **Playtest-driven regressions:** When a real play session finds a bug, reproduce it with a fictional test/QA scenario before changing rules-engine or UI behavior.
