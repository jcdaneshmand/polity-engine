# Polity Engine

Polity Engine is a rules engine and companion app based on Imperium. It focuses on rules automation, bookkeeping, card and nation cataloging, and solo bot support.

The app is data-driven: users can upload their own local card data, nation data, ruleset data, and AI bot configuration CSVs. It is intended as a personal-use tool for people working from physical copies they own.

Polity Engine does not include official Osprey Games assets or datasets. It provides the scaffolding for a rules engine and import workflow, while user-created data stays local and private.

## Live App

Try the live app at [polity-engine.onrender.com](https://polity-engine.onrender.com).

## Important Disclaimer

- This is an unofficial fan-made project.
- This project is not affiliated with, endorsed by, sponsored by, or approved by Osprey Games or the Imperium designers.
- Imperium and related names, terminology, artwork, and game content remain the property of their respective rights holders.
- This repository does not distribute official card data, card text, images, decklists, nation files, scans, photos, rulebook text, or reproductions of game components.
- Users are responsible for any private local data they create or import.

## Project Intent

The long-term goal is to build a flexible rules engine for Imperium-style play: resolving rules, tracking game state, managing card and nation metadata, and running solo bot logic from uploaded configuration data.

The project is designed to reduce bookkeeping and improve personal table play. It is not meant to replace the physical game or provide an official digital edition.

Any official dataset, demo mode using real Imperium content, hosted public database, or public distribution of Imperium data would require permission from the rights holder.

## About and Attribution

The original game system was designed by Nigel Buckle and Dávid Turczi.

Polity Engine is implemented by Jonah Daneshmand, Ph.D. It is open source at [github.com/jcdaneshmand/polity-engine](https://github.com/jcdaneshmand/polity-engine).

Contact: [jcdaneshmand@gmail.com](mailto:jcdaneshmand@gmail.com).

## What This Project Includes

- Rules-engine scaffolding and automation.
- A Vite, React, and TypeScript companion app.
- CSV import/export tools.
- Card and Nation Transcription Tool for entering local cards, nations, rulesets, and bot tables.
- Local private data import for cards, nations, rulesets, strategy profiles, and AI bot tables.
- Example schema files and fake/demo data only.
- Solo and table bookkeeping support.
- AI bot configuration import and validation.

## What This Project Does Not Include

- Official card text.
- Official card artwork.
- Official nation data.
- Official decklists.
- Rulebook text copied from the published game.
- Scans, photos, or reproductions of game components.
- A hosted public card database.

## Feature Checklist

### Included

- [x] Vite, React, and TypeScript companion app.
- [x] Rules-engine scaffolding for game state, turn flow, choices, effects, scoring, and setup.
- [x] Multiplayer, solo, and practice game setup modes.
- [x] Online multiplayer lobby server with account or guest entry, rejoin support, restart-safe local persistence, and smoke coverage.
- [x] Metadata-driven Commons setup for placeholder and local private card data.
- [x] Expansion and variant option plumbing, including the `trade_routes` expansion module.
- [x] Local private data import for cards, nations, nation rulesets, nation strategy profiles, bot state tables, and bot Trade Routes tables.
- [x] Browser upload support for local private JSON/CSV data.
- [x] Card and Nation Transcription Tool for browser-based entry of cards, nation definitions, nation rulesets, bot state tables, and bot Trade Routes tables, with shared import validation, browser draft protection, batch progress, and card search/edit queue.
- [x] Card, nation, ruleset, strategy, and bot-table validation/reporting tools.
- [x] Solo bot support driven by imported bot tables.
- [x] Solo campaign setup, continuation, end-game update flow, and campaign sheet export.
- [x] Board UI for core bookkeeping, public/shared zones, player zones, card inspection, protected game log, sticky current-task guidance, grouped actions, diagnostics, and keyboard-oriented controls.
- [x] Fictional placeholder/demo data and schema examples only.
- [x] Public-safe fictional scenario smoke coverage.
- [x] Local save/resume baseline for in-progress local games.
- [x] Local game export/import baseline for portable save files.
- [x] Undo and legal-move guardrail baseline for risky actions.
- [x] Local playtest server and browser QA loop for setup, save/resume, automated practice, solo, and two-seat online multiplayer self-play.
- [x] Player-expectation QA artifacts with public-safe failure reports, action traces, compact UI snapshots, and screenshots.

### Planned

- [ ] Custom Commons setup workflow for choosing or composing the Commons pool from local data.
- [ ] Save/resume polish: multi-slot metadata, migration handling, and stronger hidden-info scrubbing in resume lists.
- [ ] Extensive local testing with privately entered real card data to improve rules-engine coverage, without committing or distributing that data.
- [ ] Broader scenario-level rules parity coverage for remaining edge cases and card-specific effect patterns.
- [ ] Undo/legal-move polish for additional edge cases found through playtesting.
- [ ] More complete Steam Deck/controller-oriented UI polish and final visual QA for the latest board right-rail changes.
- [ ] Import/export polish for clearer errors, private-data fingerprint mismatch recovery, and cross-version migration.
- [ ] Production-ready multiplayer hosting proof, hardening, and operational runbook.

### Current Gap Snapshot

| Bucket | Status | Next gate |
| --- | --- | --- |
| Local QA/playtest | Closed for the public-safe baseline: practice, solo, two-seat online self-play, worked-turn, save/resume, invalid save, privacy marker, hierarchy, viewport, and diagnostics gates are covered | Keep `npm.cmd run qa:local-browser`, `npm test`, `npm.cmd run smoke:fictional-game`, and `npm.cmd run typecheck` green before major changes; promote any real playtest failure into a scripted regression. |
| UI as playable rulebook | Closed for the current board pass: current-task panel, action provenance, enabled/unavailable action grouping, why-can't-I feedback, collapsible player aid, protected game log, last-event feedback, public-safe diagnostics, bug-report summary helper, zone hierarchy metadata, and viewport checks are in place | Maintain the expectation checks around current task, actions, log, aid, diagnostics, and zone/card state metadata while future UI work lands. |
| Rules parity | Closed for current public-safe explanations: selector explanations and provenance labels are mapped to coverage evidence | Keep `data/fictional-regression/coverage-map.json`, `rulesParityCoverage.test.ts`, and parity docs aligned whenever new UI explanations or rule-facing action labels are added. |
| Playability | Public-safe playability gate is closed locally and hosted: save/resume, rejoin flows, deterministic worked-turn coverage, automated player-expectation checks, seeded stress coverage, admin close/end controls, and copied bug-report summaries are in place | Keep admin cleanup, lobby/game close, support messaging, and bug-report diagnostics covered as online playtest usage expands. |
| Hosted release | Render deployment is live; latest deploys use commit-pinned hosted smoke as release proof, with hosted browser QA available for deeper checks | After each pushed release, run `npm.cmd run smoke:hosted` with `POLITY_EXPECTED_COMMIT`; run `npm.cmd run qa:hosted-browser` after UI/gameplay changes and before broader playtest invites. |
| Private data | Remaining final gate: transcription UI now reuses real card/nation/ruleset validators and includes browser draft protection, batch progress, and card search/edit, but local ignored private CSV source files are still missing | Add the ignored `*_private.csv` files under `imperium-like-digital-prototype/private-card-data/`, then rerun private preflight/import/completeness locally without committing private data. |

### Next Gate Roadmap

The release-gate plan is tracked in `imperium-like-digital-prototype/docs/superpowers/plans/2026-07-22-next-gates.md`. The current board UI playability pass is tracked in `imperium-like-digital-prototype/docs/superpowers/plans/2026-07-22-board-ui-playability-fixes.md`.

Closed public-safe gates:

1. Board hierarchy and playable-rulebook UI clarity.
2. Guided worked-turn scenario and player-expectation browser QA.
3. Parity evidence map for UI explanations and provenance labels.
4. Hosted smoke and hosted browser QA plumbing.
5. Longer public-safe gameplay stress runs.
6. Transcription workstation baseline with shared validators, draft protection, batch progress, and search/edit.

Remaining gates should close in this order:

1. Run the private-data final gate locally only: add ignored private CSV inputs, run preflight/import/completeness, and convert any rules mismatch into a public-safe fake-card regression before changing engine behavior.
2. Keep hosted release proof current after every deploy: commit-pinned hosted smoke every time, hosted browser QA after gameplay/UI changes, and admin close/end checks after online-session changes.
3. Harden production operations: document support/admin/runbook flows, backup expectations for persistent Render storage, recovery steps for stuck lobbies/games, and the release checklist for playtest invites.

## Repository Structure

- `imperium-like-digital-prototype/app/`: Vite, React, and TypeScript UI using `boardgame.io/react`.
- `imperium-like-digital-prototype/engine/`: Reusable game model, move logic, turn loop, setup pipeline, and effect runner.
- `imperium-like-digital-prototype/tools/`: CSV entry, import, validation, and reporting tools.
- `imperium-like-digital-prototype/private-card-data/`: Local-only private transcription workspace with committed template files.
- `imperium-like-digital-prototype/generated-private/`: Local generated normalized data and import reports.
- `imperium-like-digital-prototype/data/placeholder-cards/`: fictional placeholder/demo data.
- `imperium-like-digital-prototype/docs/`: design notes, legal/content boundary notes, and workflow documentation.

## Running and Testing the App

The app workspace is `imperium-like-digital-prototype`. Run npm commands from that directory unless a command explicitly says it runs from the repository root.

Install dependencies:

```powershell
cd imperium-like-digital-prototype
npm install
```

Start the Vite development server:

```powershell
npm run dev
```

Then open the local URL printed by Vite, usually `http://localhost:5173`.

Start the app with the multiplayer lobby server:

```powershell
npm run dev:full
```

This starts the lobby server on `http://127.0.0.1:8000` and the app on `http://127.0.0.1:5173`. To run only the server:

```powershell
npm run server:dev
```

For a production-style local server that serves the built app from the same origin:

```powershell
npm run build -w app
npm run start
```

The server reads `POLITY_SERVER_PORT` first, then hosted-platform `PORT`, and defaults to `8000`. Set `POLITY_SERVER_ORIGIN` to restrict browser origins and `POLITY_STORAGE_PATH` to a persistent directory. When storage is configured, boardgame.io match state lives under `boardgame/`, while account, match, and pregame lobby JSON files live at the storage root.

Run the engine test suite:

```powershell
npm test
```

Run TypeScript checks for the engine, app, and server:

```powershell
npm run typecheck
```

Run the local Render/deployment preflight:

```powershell
npm.cmd run render:verify
```

This runs typecheck, server tests, and a production app build from the deployment workspace.

Run the app workspace tests directly:

```powershell
npm run test -w app
```

Run the multiplayer restart/rejoin smoke test:

```powershell
npm run smoke:multiplayer
```

Run the public-safe fictional game smoke test:

```powershell
npm run smoke:fictional-game
```

Run a local playtest server with temporary storage:

```powershell
npm.cmd run playtest:local
```

Run the local browser QA gate:

```powershell
npm.cmd run qa:local-browser
```

This builds the app, starts a temporary same-origin local server, checks setup/save/resume behavior, drives automated practice and solo games, and runs a proper two-seat online multiplayer self-play loop against the local lobby server. Player-expectation failures preserve a public-safe JSON report and screenshot under the temporary QA storage folder.

These commands use public-safe placeholder data and do not require private CSV files or public hosting.

Local games are saved in browser storage while you play. When a valid saved local game exists, the setup screen offers `Resume Saved Game`, `Export Saved Game`, and `Import Saved Game`; if the saved JSON is corrupt, it offers `Discard Saved Game` without replacing the current setup flow. Exported local games use a versioned JSON envelope named like `polity-local-game-YYYYMMDD-HHMMSS.json`.

Build the app:

```powershell
npm run build -w app
```

If `npm test` reports that `vitest` is missing, run `npm install` from `imperium-like-digital-prototype`, not from the repository root.

### Quick Health Check

From the repository root, the PowerShell helper runs tests, runs typecheck, and starts the Vite dev server only after both checks pass:

```powershell
.\scripts\dev-check.ps1
```

For a checks-only run:

```powershell
.\scripts\dev-check.ps1 -NoLaunch
```

If your PowerShell profile or execution policy interferes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-check.ps1 -NoLaunch
```

## Using Your Own Physical Copy

The intended workflow is local and private:

1. Open the Card and Nation Transcription Tool from the app setup screen.
2. Enter the card rows, nation definitions, nation ruleset traits, bot state table rows, and bot Trade Routes table rows you want to use locally.
3. Export CSV files from the transcription tool.
4. Store those CSV files in a private ignored folder such as `imperium-like-digital-prototype/private-card-data/`.
5. Import those CSV files into the app.
6. Use the app for rules automation, bookkeeping, setup support, and solo/table assistance.

Private CSVs are for local use. The repository should only contain schemas, tools, engine code, documentation, and fictional demo data.

The transcription tool is designed for longer local entry sessions: card, nation, and ruleset rows validate through the same import validators used by the CLI/import pipeline; unsaved browser work is autosaved with unload protection; and card batches include progress counts, duplicate/missing-required visibility, recent saved rows, and a search/edit queue.

## CSV Import and Export Workflow

Template CSV files live in `imperium-like-digital-prototype/private-card-data/` and demonstrate the expected schema. User-created CSVs in that folder are ignored by git.

Common commands from `imperium-like-digital-prototype`:

```bash
npm run cards:validate -- --input private-card-data/imperium_cards_private.csv
npm run cards:import -- --input private-card-data/imperium_cards_private.csv --output generated-private/cards.normalized.json --report generated-private/card-import-report.json
```

```bash
npm run nations:validate -- --cards generated-private/cards.normalized.json --input private-card-data/imperium_nations_private.csv
npm run nations:import -- --cards generated-private/cards.normalized.json --input private-card-data/imperium_nations_private.csv --output generated-private/nations.normalized.json --report generated-private/nation-import-report.json
```

Run the full private import pipeline:

```bash
npm run private:import-all
```

Additional import and validation scripts are available for nation rulesets, nation strategy data, bot state tables, and bot trade routes tables:

```bash
npm run rulesets:validate
npm run rulesets:import
npm run strategy:validate
npm run strategy:import
npm run bot-tables:validate
npm run bot-tables:import
npm run bot-trade:validate
npm run bot-trade:import
```

These commands expect local inputs unless you pass explicit `--input` and `--output` arguments.

## Data Policy

Private card, nation, strategy, ruleset, bot table, and generated JSON files should stay out of the repository.

Ignored local data locations include:

- `imperium-like-digital-prototype/private-card-data/*.csv`
- `imperium-like-digital-prototype/private-card-data/*.json`
- `imperium-like-digital-prototype/generated-private/*.json`
- `data/private/*.csv`
- `data/private/*.json`
- `private-data/`
- `user-data/`

Committed files in `imperium-like-digital-prototype/private-card-data/` should be limited to templates, documentation, and placeholders such as `.gitkeep`.

## Demo Data

Any included demo data should be fictional placeholder data created to demonstrate the schema, rules-engine behavior, and app functionality. Demo data should not reproduce official Imperium card text, artwork, nation files, decklists, scans, rulebook text, or other game content.

## Usage Notes

- Game setup supports multiplayer, solo, and practice modes.
- Expansion and variant options are represented as structured game options.
- The current expansion module id is `trade_routes`.
- Solo bot support uses bot state tables and bot trade route tables imported from private local CSV data.
- Keyboard-oriented board controls include confirm, back, panel cycling, end turn, and placeholder action shortcuts.

Example game options:

```json
{
  "playerCount": 2,
  "mode": "multiplayer",
  "enabledExpansions": [],
  "enabledVariants": []
}
```

```json
{
  "playerCount": 1,
  "mode": "solo",
  "enabledExpansions": [],
  "enabledVariants": ["short_game"],
  "soloDifficulty": "chieftain"
}
```

## Contribution Guidelines

Contributions should keep the repository focused on engine code, UI, import tools, schemas, documentation, and fictional demo data.

Please do not submit pull requests containing:

- Official card text.
- Official artwork, scans, photos, or reproduced component images.
- Official nation data.
- Official decklists.
- Copied rulebook text.
- Public databases of Imperium content.
- Private CSV or JSON files transcribed from physical copies.

Rules-engine, UI, importer, schema, validation, documentation, and placeholder-data improvements are welcome when they preserve this boundary.

## Additional Notes

- Before merging engine or rules changes, review `imperium-like-digital-prototype/docs/rules-engine-notes.md`.
- Use `imperium-like-digital-prototype/docs/rules-engine-compliance-checklist.md` when summarizing rules-engine changes.
- For more detail on content boundaries, see `imperium-like-digital-prototype/docs/legal-boundary.md`.
- For hosted multiplayer deployment notes, see `imperium-like-digital-prototype/docs/deployment.md`.
