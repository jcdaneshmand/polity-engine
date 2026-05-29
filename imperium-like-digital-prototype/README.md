# imperium-like-digital-prototype

## Purpose
A private, original-content prototype for a digital asymmetric civilization/deck-building style game. This repository provides a generic, data-driven rules engine scaffold and a minimal React UI built for fast iteration.

## Legal/content boundary
This project intentionally avoids copyrighted or trademarked content from published games. It uses only original placeholder data and neutral mechanics abstractions. See `docs/legal-boundary.md`.

## Canonical command root
Run all project npm commands from:

```bash
/workspace/polity-engine/imperium-like-digital-prototype
```

Using `/workspace/polity-engine` as the command root can cause workspace path ambiguity.

## Setup
```bash
npm install
npm run dev
npm test
npm run typecheck
```

If `npm test` reports that `vitest` is missing, run `npm install` from `/workspace/polity-engine/imperium-like-digital-prototype` (the workspace root), not `/workspace/polity-engine`.

## Quick health-check launcher
From the repository root, run:

```powershell
.\scripts\dev-check.ps1
```

This prepends the repo-local `.codex-tools` directory to PATH when available, runs `npm test`, runs `npm run typecheck`, and starts the Vite dev server only after both checks pass. For a checks-only run, use:

```powershell
.\scripts\dev-check.ps1 -NoLaunch
```

If your PowerShell profile or execution policy interferes, run the same script through a clean PowerShell process:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-check.ps1
```

## Architecture overview
- `app/`: Vite + React + TypeScript UI using `boardgame.io/react` client.
- `engine/`: Reusable game model, move logic, turn loop, and effect runner.
- `data/`: Placeholder JSON cards/civilizations.
- `docs/`: Legal boundary and planning notes.

## Next milestones
1. Improve effect DSL and add player choices.
2. Add legality checks/undo support.
3. Add solo bot shell and save/load support.

## Rules-engine governance
- Before merging engine/rules changes, review `docs/rules-engine-notes.md`.
- Run through `docs/rules-engine-compliance-checklist.md` and summarize alignment in PR notes.
- Keep implementation data-driven and legal-boundary compliant at all times.

> This project is a private/prototype rules-engine experiment using original placeholder content. It does not include official card text, art, logos, scans, card databases, or branding from any published game. Official content should only be integrated with permission from the rights holders.


## Private card data workflow
- Validate cards:
  - `npm run cards:validate -- --input private-card-data/imperium_cards_private.csv`
- Import cards:
  - `npm run cards:import -- --input private-card-data/imperium_cards_private.csv --output generated-private/cards.normalized.json --report generated-private/card-import-report.json`
- Validate nations:
  - `npm run nations:validate -- --cards generated-private/cards.normalized.json --input private-card-data/imperium_nations_private.csv`
- Import nations:
  - `npm run nations:import -- --cards generated-private/cards.normalized.json --input private-card-data/imperium_nations_private.csv --output generated-private/nations.normalized.json --report generated-private/nation-import-report.json`
- Import all:
  - `npm run private:import-all`

Architecture note:
- Cards are behavior units.
- Nations are starting-state and rule-modifier bundles.
- Asymmetry should be data-driven via `NationDefinition` + typed hooks, not hard-coded nation-specific branches.


## Expansion toggles
- Game setup accepts `enabledExpansions: ExpansionId[]`.
- Current module: `trade_routes`.
- Cards/nations can declare `requiredExpansions` and `excludedExpansions` and are filtered accordingly.
- Trade/Commerce/Profit options are marked unavailable (ignored with log entry) when `trade_routes` is disabled.


## Default demo options
```json
{
  "playerCount": 2,
  "mode": "multiplayer",
  "enabledExpansions": [],
  "enabledVariants": []
}
```

## Example GameOptions
```json
{
  "playerCount": 2,
  "mode": "multiplayer",
  "enabledExpansions": ["trade_routes"],
  "enabledVariants": ["lowered_aggression", "precious_cards"]
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

```json
{
  "playerCount": 1,
  "mode": "practice",
  "enabledExpansions": [],
  "enabledVariants": []
}
```

How to enable Trade Routes in code:
- pass `options.enabledExpansions: ["trade_routes"]` to setup data.

Reminder: this repository contains placeholder data only.


## Steam Deck-friendly UI
Run:
```bash
npm install
npm run dev
```

The board layout shows:
- top shared deck/pile row
- central 5-slot market
- player status/zones/hand area
- right-side card detail + action menu + log

Keyboard controls:
- Enter/A: select/confirm
- Esc/B: back
- Tab: cycle panel focus placeholder
- E: end turn shortcut
- I: innovate placeholder
- R: revolt placeholder

All visuals and styling are placeholder/original only.

## Solo Bot
Rules-driven solo bot uses bot state tables and does not use NationStrategyProfile for decision logic.
