# imperium-like-digital-prototype

## Purpose
A private, original-content prototype for a digital asymmetric civilization/deck-building style game. This repository provides a generic, data-driven rules engine scaffold and a minimal React UI built for fast iteration.

## Legal/content boundary
This project intentionally avoids copyrighted or trademarked content from published games. It uses only original placeholder data and neutral mechanics abstractions. See `docs/legal-boundary.md`.

## Setup
```bash
npm install
npm run dev
npm test
npm run typecheck
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
