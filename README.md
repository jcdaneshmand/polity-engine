# Polity Engine

Polity Engine is an unofficial companion tool for players who own physical copies of Imperium. It is intended to help with bookkeeping, rules resolution, card and nation cataloging, and solo or table play support.

This project is intended as a personal-use companion for owners of the physical game. It is designed to reduce bookkeeping and improve the play experience, not to replace the physical product.

The repository does not include official card text, artwork, nation files, decklists, scans, rulebook text, or other proprietary Osprey Games content. Users create and import their own private local CSV data from physical copies they legally own.

## Important Disclaimer

- This is an unofficial fan-made project.
- This project is not affiliated with, endorsed by, sponsored by, or approved by Osprey Games or the Imperium designers.
- Imperium and related names, terminology, artwork, and game content remain the property of their respective rights holders.
- This repository does not include official card data, card text, images, decklists, nation files, scans, photos, rulebook text, or reproductions of game components.
- Users are responsible for creating and using private local data only from copies of the game they legally own.

## Project Intent

The long-term goal is to support and enhance the experience of people who already own the physical game. The app is a rules automation, bookkeeping, cataloging, and solo-play companion.

Any official dataset, demo mode using real Imperium content, hosted public database, or public distribution of Imperium data would require explicit permission from the rights holder.

## What This Project Includes

- Rules-engine scaffolding and automation.
- A Vite, React, and TypeScript companion app.
- CSV import/export tools.
- Card and nation CSV maker.
- Local private data import.
- Example schema files and fake/demo data only.
- Solo and table bookkeeping support.

## What This Project Does Not Include

- Official card text.
- Official card artwork.
- Official nation data.
- Official decklists.
- Rulebook text copied from the published game.
- Scans, photos, or reproductions of game components.
- A hosted public card database.

## Repository Structure

- `imperium-like-digital-prototype/app/`: Vite, React, and TypeScript UI using `boardgame.io/react`.
- `imperium-like-digital-prototype/engine/`: Reusable game model, move logic, turn loop, setup pipeline, and effect runner.
- `imperium-like-digital-prototype/tools/`: CSV entry, import, validation, and reporting tools.
- `imperium-like-digital-prototype/private-card-data/`: Local-only private transcription workspace with committed template files.
- `imperium-like-digital-prototype/generated-private/`: Local generated normalized data and import reports.
- `imperium-like-digital-prototype/data/placeholder-cards/`: fictional placeholder/demo data.
- `imperium-like-digital-prototype/docs/`: design notes, legal/content boundary notes, and workflow documentation.

## Setup

Run project npm commands from the workspace package root:

```bash
cd imperium-like-digital-prototype
npm install
```

Start the development server:

```bash
npm run dev
```

Run the engine test suite:

```bash
npm test
```

Run TypeScript checks for the engine and app:

```bash
npm run typecheck
```

Build the app:

```bash
npm run build -w app
```

If `npm test` reports that `vitest` is missing, run `npm install` from `imperium-like-digital-prototype`, not from the repository root.

## Quick Health Check

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
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-check.ps1
```

## Using Your Own Physical Copy

The intended workflow is local and private:

1. Open the card/nation CSV maker from the app.
2. Enter catalog and rules-support data from your own physical copy.
3. Export CSV files.
4. Store those CSV files in a private ignored folder such as `imperium-like-digital-prototype/private-card-data/`.
5. Import those CSV files into the app.
6. Use the app for personal play assistance, bookkeeping, setup support, and solo/table rules automation.

Private CSVs are for your own local use. Do not commit official card text, official nation data, copied rulebook text, scans, artwork, photos, or decklists to this repository.

## CSV Import and Export Workflow

Template CSV files live in `imperium-like-digital-prototype/private-card-data/` and are safe examples of the expected schema. User-created CSVs in that folder are ignored by git.

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

These commands expect private local inputs unless you pass explicit `--input` and `--output` arguments.

## Data Policy

Private card, nation, strategy, ruleset, bot table, and generated JSON files should not be committed to the repository.

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

Any included demo data should be fictional placeholder data created only to demonstrate the schema, rules-engine behavior, and app functionality. Demo data should not reproduce official Imperium card text, artwork, nation files, decklists, scans, rulebook text, or other proprietary game content.

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

Contributions should respect the project boundary and use fake/demo data only.

Do not submit pull requests containing:

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
