# New Game Setup UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app setup screen that configures and launches fresh sessions of the existing prototype game.

**Architecture:** `App.tsx` becomes a small session shell that renders setup before a session exists and renders a keyed `boardgame.io` client after start. A focused `NewGameSetup` component owns draft setup state and emits normalized session data. Because the installed local `boardgame.io` client does not accept `setupData` in `Client(...)` options, the shell creates a per-session game config whose `setup` function closes over the selected setup data.

**Tech Stack:** React 18, TypeScript, Vite, boardgame.io React client, existing CSS.

---

## File Structure

- Create: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`
  - Owns draft setup state, placeholder nation options, mode/player normalization, and the submit payload.
- Create: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`
  - Styles the setup screen and game shell action bar.
- Modify: `imperium-like-digital-prototype/app/src/styles.css`
  - Imports the new setup stylesheet.
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`
  - Replaces fixed client mount with a session shell and keyed game client factory.

## Task 1: Add The Setup Component

**Files:**
- Create: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`

- [ ] **Step 1: Create the setup component**

Create `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx` with:

```tsx
import { useMemo, useState } from "react";
import type { ExpansionId, GameMode, GameOptions, SoloDifficulty, VariantId } from "../../../../engine/src/options/gameOptions";

export type NewGameSessionConfig = {
  options: GameOptions;
  playerNationIds: Record<string, string>;
};

type NewGameSetupProps = {
  onStart: (config: NewGameSessionConfig) => void;
};

const DEFAULT_NATION_ID = "test_nation_sun_coast";

const modes: Array<{ id: GameMode; label: string }> = [
  { id: "multiplayer", label: "Multiplayer" },
  { id: "solo", label: "Solo" },
  { id: "practice", label: "Practice" }
];

const expansions: Array<{ id: ExpansionId; label: string }> = [
  { id: "trade_routes", label: "Trade Routes" }
];

const variants: Array<{ id: VariantId; label: string }> = [
  { id: "lowered_aggression", label: "Lowered Aggression" },
  { id: "quick_setup", label: "Quick Setup" },
  { id: "precious_cards", label: "Precious Cards" },
  { id: "short_game", label: "Short Game" }
];

const soloDifficulties: Array<{ id: SoloDifficulty; label: string }> = [
  { id: "chieftain", label: "Chieftain" },
  { id: "warlord", label: "Warlord" },
  { id: "imperator", label: "Imperator" },
  { id: "sovereign", label: "Sovereign" },
  { id: "overlord", label: "Overlord" },
  { id: "supreme_ruler", label: "Supreme Ruler" }
];

const nationOptions = [
  { id: DEFAULT_NATION_ID, label: "Sun Coast Accord", requiresExpansion: undefined },
  { id: "test_nation_river_court", label: "River Court Forum", requiresExpansion: "trade_routes" as ExpansionId }
];

function playerCountForMode(mode: GameMode, requested: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  if (mode === "solo" || mode === "practice") return 1;
  return requested < 2 ? 2 : requested;
}

function toggleItem<T extends string>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

export default function NewGameSetup({ onStart }: NewGameSetupProps) {
  const [mode, setMode] = useState<GameMode>("multiplayer");
  const [playerCount, setPlayerCount] = useState<1 | 2 | 3 | 4>(2);
  const [enabledExpansions, setEnabledExpansions] = useState<ExpansionId[]>([]);
  const [enabledVariants, setEnabledVariants] = useState<VariantId[]>([]);
  const [soloDifficulty, setSoloDifficulty] = useState<SoloDifficulty>("chieftain");
  const [playerNationIds, setPlayerNationIds] = useState<Record<string, string>>({
    "0": DEFAULT_NATION_ID,
    "1": DEFAULT_NATION_ID,
    "2": DEFAULT_NATION_ID,
    "3": DEFAULT_NATION_ID
  });

  const normalizedPlayerCount = playerCountForMode(mode, playerCount);
  const availableNations = useMemo(
    () => nationOptions.filter((nation) => !nation.requiresExpansion || enabledExpansions.includes(nation.requiresExpansion)),
    [enabledExpansions]
  );

  const activePlayerIds = Array.from({ length: normalizedPlayerCount }, (_, index) => String(index));

  const updateMode = (nextMode: GameMode) => {
    setMode(nextMode);
    setPlayerCount(playerCountForMode(nextMode, playerCount));
  };

  const updateExpansions = (expansionId: ExpansionId) => {
    setEnabledExpansions((current) => {
      const next = toggleItem(current, expansionId);
      if (!next.includes("trade_routes")) {
        setPlayerNationIds((nations) =>
          Object.fromEntries(Object.entries(nations).map(([playerId, nationId]) => [playerId, nationId === "test_nation_river_court" ? DEFAULT_NATION_ID : nationId]))
        );
      }
      return next;
    });
  };

  const startGame = () => {
    const options: GameOptions = {
      playerCount: normalizedPlayerCount,
      mode,
      enabledExpansions,
      enabledVariants,
      ...(mode === "solo" ? { soloDifficulty } : {})
    };

    const selectedNations = Object.fromEntries(
      activePlayerIds.map((playerId) => [playerId, playerNationIds[playerId] ?? DEFAULT_NATION_ID])
    );

    onStart({ options, playerNationIds: selectedNations });
  };

  return (
    <main className="setup-screen">
      <section className="setup-panel" aria-labelledby="setup-title">
        <div className="setup-heading">
          <div>
            <p className="setup-kicker">Prototype setup</p>
            <h1 id="setup-title">New Game</h1>
          </div>
          <button className="primary-action" type="button" onClick={startGame}>
            Start Game
          </button>
        </div>

        <div className="setup-grid">
          <fieldset className="setup-section">
            <legend>Mode</legend>
            <div className="segmented-control">
              {modes.map((item) => (
                <button key={item.id} className={mode === item.id ? "is-active" : ""} type="button" onClick={() => updateMode(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-section">
            <legend>Players</legend>
            <div className="segmented-control">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  className={normalizedPlayerCount === count ? "is-active" : ""}
                  type="button"
                  disabled={mode !== "multiplayer" && count !== 1}
                  onClick={() => setPlayerCount(count as 1 | 2 | 3 | 4)}
                >
                  {count}
                </button>
              ))}
            </div>
          </fieldset>

          {mode === "solo" ? (
            <label className="setup-section setup-field">
              <span>Solo difficulty</span>
              <select value={soloDifficulty} onChange={(event) => setSoloDifficulty(event.target.value as SoloDifficulty)}>
                {soloDifficulties.map((difficulty) => (
                  <option key={difficulty.id} value={difficulty.id}>
                    {difficulty.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <fieldset className="setup-section">
            <legend>Expansions</legend>
            <div className="toggle-list">
              {expansions.map((expansion) => (
                <label key={expansion.id}>
                  <input type="checkbox" checked={enabledExpansions.includes(expansion.id)} onChange={() => updateExpansions(expansion.id)} />
                  <span>{expansion.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-section setup-section--wide">
            <legend>Variants</legend>
            <div className="toggle-list toggle-list--grid">
              {variants.map((variant) => (
                <label key={variant.id}>
                  <input type="checkbox" checked={enabledVariants.includes(variant.id)} onChange={() => setEnabledVariants((current) => toggleItem(current, variant.id))} />
                  <span>{variant.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-section setup-section--wide">
            <legend>Nations</legend>
            <div className="nation-grid">
              {activePlayerIds.map((playerId) => (
                <label key={playerId} className="setup-field">
                  <span>Player {Number(playerId) + 1}</span>
                  <select value={playerNationIds[playerId] ?? DEFAULT_NATION_ID} onChange={(event) => setPlayerNationIds((current) => ({ ...current, [playerId]: event.target.value }))}>
                    {availableNations.map((nation) => (
                      <option key={nation.id} value={nation.id}>
                        {nation.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Run app typecheck**

Run:

```powershell
npm run typecheck -w app
```

Expected: PASS. The component is not wired into the app yet, but TypeScript should accept the standalone file.

## Task 2: Wire The Session Shell

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`

- [ ] **Step 1: Replace the fixed client with a keyed session shell**

Replace `imperium-like-digital-prototype/app/src/App.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { PrototypeGame } from "../../engine/src/game/game";
import Board from "./Board";
import NewGameSetup, { type NewGameSessionConfig } from "./ui/setup/NewGameSetup";

type GameSession = NewGameSessionConfig & {
  id: number;
};

export default function App() {
  const [session, setSession] = useState<GameSession | null>(null);

  const GameClient = useMemo(() => {
    if (!session) return null;
    const configuredGame = {
      ...PrototypeGame,
      setup: (ctx: Parameters<NonNullable<typeof PrototypeGame.setup>>[0]) =>
        PrototypeGame.setup?.(ctx, {
          options: session.options,
          playerNationIds: session.playerNationIds
        })
    };

    return Client({
      game: configuredGame,
      board: Board,
      numPlayers: session.options.playerCount,
      debug: false
    });
  }, [session]);

  if (!session || !GameClient) {
    return <NewGameSetup onStart={(config) => setSession({ ...config, id: Date.now() })} />;
  }

  return (
    <div className="game-shell">
      <div className="game-shell-bar">
        <div>
          <strong>Prototype Game</strong>
          <span>
            {session.options.mode} / {session.options.playerCount} player{session.options.playerCount === 1 ? "" : "s"}
          </span>
        </div>
        <button type="button" onClick={() => setSession(null)}>
          New Game
        </button>
      </div>
      <GameClient key={session.id} />
    </div>
  );
}
```

- [ ] **Step 2: Run app typecheck**

Run:

```powershell
npm run typecheck -w app
```

Expected: PASS. The local client initializes the game through the per-session `configuredGame.setup` closure.

## Task 3: Add Setup Styling

**Files:**
- Create: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`
- Modify: `imperium-like-digital-prototype/app/src/styles.css`

- [ ] **Step 1: Create setup styles**

Create `imperium-like-digital-prototype/app/src/ui/styles/setup.css` with:

```css
.setup-screen {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 18px;
  color: #f3ead8;
  background: linear-gradient(#2d2a28, #1f1d1b);
}

.setup-panel {
  max-width: 980px;
  margin: 0 auto;
  border: 1px solid #6e5f50;
  border-radius: 8px;
  background: #312c28;
  padding: 16px;
}

.setup-heading,
.game-shell-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setup-heading h1 {
  margin: 2px 0 0;
  font-size: 1.8rem;
}

.setup-kicker {
  margin: 0;
  color: #d9c7a7;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.setup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.setup-section {
  min-width: 0;
  margin: 0;
  border: 1px solid #6e5f50;
  border-radius: 8px;
  padding: 10px;
  background: #3b342f;
}

.setup-section--wide {
  grid-column: 1 / -1;
}

.setup-section legend,
.setup-field span {
  color: #d9c7a7;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 6px;
}

.segmented-control button,
.primary-action,
.game-shell-bar button {
  min-height: 40px;
  border: 1px solid #7a6a57;
  border-radius: 6px;
  background: #4a4038;
  color: #f3ead8;
  cursor: pointer;
}

.segmented-control button.is-active,
.primary-action {
  border-color: #e6b86a;
  background: #6a5138;
}

.segmented-control button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toggle-list--grid,
.nation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.toggle-list label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setup-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setup-field select {
  min-height: 38px;
  box-sizing: border-box;
  border: 1px solid #7a6a57;
  border-radius: 6px;
  background: #25221f;
  color: #f3ead8;
  padding: 6px 8px;
  font: inherit;
}

.game-shell {
  min-height: 100vh;
  background: #1f1d1b;
}

.game-shell-bar {
  box-sizing: border-box;
  border-bottom: 1px solid #6e5f50;
  padding: 8px 12px;
  color: #f3ead8;
  background: #312c28;
}

.game-shell-bar div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.game-shell-bar span {
  color: #d9c7a7;
  font-size: 0.86rem;
}

@media (max-width: 720px) {
  .setup-grid {
    grid-template-columns: 1fr;
  }

  .setup-heading,
  .game-shell-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .game-shell-bar div {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
```

- [ ] **Step 2: Import the setup stylesheet**

Update `imperium-like-digital-prototype/app/src/styles.css` so it starts with:

```css
@import "./ui/styles/board.css";
@import "./ui/styles/steamDeck.css";
@import "./ui/styles/setup.css";
```

- [ ] **Step 3: Run app typecheck**

Run:

```powershell
npm run typecheck -w app
```

Expected: PASS.

## Task 4: Verify Full Project And Browser Flow

**Files:**
- No source edits in this task.

- [ ] **Step 1: Run engine tests**

Run from `imperium-like-digital-prototype`:

```powershell
npm test
```

Expected: PASS. If unrelated existing engine edits fail, capture the failing test names and determine whether the setup UI caused the failure. The setup UI should not touch engine rules.

- [ ] **Step 2: Run full typecheck**

Run from `imperium-like-digital-prototype`:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Start the dev server**

Run from `imperium-like-digital-prototype`:

```powershell
npm run dev
```

Expected: Vite serves the app on a local URL, usually `http://localhost:5173/`.

- [ ] **Step 4: Browser smoke check**

Open the local Vite URL and verify:

- The first screen is the setup UI.
- Starting the default multiplayer game reaches the board.
- Clicking `New Game` returns to setup.
- Switching to solo fixes player count to 1 and shows solo difficulty.
- Enabling Trade Routes makes River Court Forum available in nation selects.

## Task 5: Final Review

**Files:**
- Inspect all touched files.

- [ ] **Step 1: Inspect the diff**

Run:

```powershell
git diff -- imperium-like-digital-prototype/app/src/App.tsx imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx imperium-like-digital-prototype/app/src/ui/styles/setup.css imperium-like-digital-prototype/app/src/styles.css imperium-like-digital-prototype/docs/superpowers/specs/2026-05-29-new-game-setup-ui-design.md imperium-like-digital-prototype/docs/superpowers/plans/2026-05-29-new-game-setup-ui.md
```

Expected: Diff only contains the new-game setup UI, setup styling, and approved docs/plan.

- [ ] **Step 2: Report verification evidence**

Summarize:

- Whether `npm test` passed.
- Whether `npm run typecheck` passed.
- Browser smoke result and local URL.
- Any unrelated dirty worktree files that were not touched.
