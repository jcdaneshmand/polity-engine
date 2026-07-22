# Next Gates Closure Plan

> **For agentic workers:** Execute this plan gate-by-gate. Update checkboxes and evidence notes as each step lands. Keep public-safe data boundaries intact: no official card text, official card names, official art, scans, private CSV rows, generated private JSON, or private screenshots should be committed.

**Goal:** Track the release gates between the current public-safe, hosted build and a private-data-verified playtest build. The original public-safe gates are now closed; the remaining work is local private-data verification, release cadence discipline, and production hardening.

**Current baseline:**

- README gap snapshot now marks local QA/playtest, playable-rulebook UI, rules parity, playability, hosted release plumbing, longer stress, and the transcription workstation baseline as closed for the public-safe build.
- `qa:local-browser` covers setup, save/resume, invalid save, deterministic worked-turn play, automated practice, automated solo, two-seat online multiplayer self-play, viewport checks, diagnostics, and private-debug marker checks.
- The UI exposes current-task metadata, action provenance, blocked-action reasons, public-safe player aid copy, copied bug-report summaries, and diagnostics for player-expectation automation.
- Render deploys are live and verified with commit-pinned hosted smoke. The latest documented release proof after the transcription workstation pass is commit `1aeb87e`.
- The transcription tool now reuses real card/nation/ruleset validators and includes browser draft protection, card batch progress, and a search/edit queue.

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

Evidence note: 2026-07-22 public-safe gates were closed through local browser QA, hosted smoke/browser QA plumbing, longer gameplay stress tests, admin close/end controls, support/About messaging, and the transcription workstation pass. Private-data scripts are still final-gate checks only because the ignored local private CSV sources are missing.

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
- [ ] Run private import-all only against ignored local files.
- [ ] Run completeness report and summarize counts without copying private text into committed docs.
- [ ] If private data exposes a rules mismatch, reproduce it with a public-safe fake card/scenario before changing engine behavior.
- [ ] Update README gap snapshot with final-gate status, using counts and categories only.

**Acceptance evidence:**

```powershell
npm.cmd run private:preflight
npm.cmd run private:import-all
npm.cmd run private:completeness
```

Evidence note: After hosted proof passed on 2026-07-22, `npm.cmd run private:preflight` was run locally. It failed before import because the expected ignored local sources are missing: `imperium_cards_private.csv`, `imperium_nations_private.csv`, `imperium_nation_rulesets_private.csv`, `imperium_nation_strategy_private.csv`, `imperium_bot_state_tables_private.csv`, and `imperium_bot_trade_routes_private.csv`. The folder currently contains templates and `.gitkeep`, so `private:import-all` and `private:completeness` remain open until those local private CSV files exist. The preflight output now names the matching template for each missing private source, and `privateImportPreflight.test.ts` covers those hints. Commit `1aeb87e` improved the transcription workstation for this gate by reusing real card/nation/ruleset validators in the UI, adding browser draft protection, showing card batch progress, and adding a card search/edit queue.

---

## Final Release Checklist

- [x] README reflects the actual status of every gate.
- [x] `2026-07-21-ui-as-playable-rulebook.md` and this plan contain current evidence notes.
- [x] Public-safe tests pass:

```powershell
npm.cmd run test
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run typecheck
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
npm.cmd run qa:local-browser
```

- [x] Hosted tests pass against the intended deployment:

```powershell
npm.cmd run smoke:hosted
npm.cmd run qa:hosted-browser
```

- [ ] Private-data final gate passes locally, with no private data committed.
- [x] QA artifacts are kept only where useful and ignored when they contain machine-local or private context.
- [x] Every known failing seed or scenario is either fixed or listed as an explicit open gap.

Evidence note: Public-safe local checks passed: `npm.cmd run test -w engine -- rulesParityCoverage.test.ts uiSelectionModel.test.ts gameplayStress.test.ts` (engine pretest ran 47 files / 1505 tests), `npm.cmd run test -w app` (15 files / 153 tests), `npm.cmd run test -w server` (11 files / 64 tests), `npm.cmd run typecheck`, `npm.cmd run smoke:fictional-game`, `npm.cmd run smoke:multiplayer`, `npm.cmd run smoke:hosted:local`, `npm.cmd run test:local-qa-scripts`, `npm.cmd run qa:local-browser`, and `npm.cmd run render:verify`. Earlier hosted checks passed against `https://polity-engine.onrender.com`: `npm.cmd run smoke:hosted` and `npm.cmd run qa:hosted-browser`. Latest-commit hosted proof now requires `POLITY_EXPECTED_COMMIT`; after an API deploy for commit `57158b8`, `POLITY_EXPECTED_COMMIT=57158b8 npm.cmd run smoke:hosted` passed and reported the full live commit. Private-data final gate remains open because the local ignored private CSV source files are missing; `npm.cmd run private:preflight` was rerun and reported the same six missing ignored CSV sources.

---

## Current Remaining Gates

1. **Private-data import proof:** Add local ignored `*_private.csv` files, run `npm.cmd run private:preflight`, `npm.cmd run private:import-all`, and `npm.cmd run private:completeness`, then summarize only counts/categories.
2. **Release proof cadence:** For every commit deployed to Render, run `POLITY_EXPECTED_COMMIT=<short-sha> npm.cmd run smoke:hosted`; run `npm.cmd run qa:hosted-browser` after gameplay, board UI, lobby, admin, or diagnostics changes.
3. **Operations hardening:** Keep README and deployment docs current for admin close/end controls, support tracking, Render persistent storage, stuck-game cleanup, and playtest bug-report intake.
4. **Playtest-driven regressions:** When a real play session finds a bug, reproduce it with a fictional test/QA scenario before changing rules-engine or UI behavior.
