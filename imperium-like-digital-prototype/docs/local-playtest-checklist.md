# Local Playtest Checklist

Use this checklist before private data is introduced. Keep every finding public-safe: use placeholder/fictional data, exported playtest diagnostics, screenshots, and exact steps instead of private card text or private file contents.

## Setup

- Start from a clean local server with `npm.cmd run playtest:local`.
- Confirm the setup screen shows compact `Playtest Status` chips for demo/private data, saved-game status, and hosted playtest state.
- Keep public hosting proof separate; this checklist is only for local playability.

## Manual Scripts

### New Multiplayer Game

1. Choose Multiplayer, 2 players, Classics Commons, no private data.
2. Start the game.
3. Confirm the board shell renders, the current-task panel is visible, the active player is visible, the viewer player is visible, the game log is visible, and the diagnostics export and bug-report summary buttons are present.
4. Select a hand card and a market card; confirm enabled actions are grouped ahead of unavailable actions and blocked reasons are understandable.

### Host, Join, Ready, Start, Rejoin

1. From setup, continue as guest to Online Games.
2. Host a placeholder-data lobby.
3. Join from a second browser context.
4. Select nations for both seats, mark both ready, and start.
5. Refresh both browsers and use the saved rejoin action.
6. Confirm each seat sees only its own hand and can still export public-safe diagnostics.

### Solo Through Bot Turn

1. Choose Solo with placeholder data and a specific Bot nation if available.
2. Start the game and take a simple legal action.
3. End the human turn and let the Bot resolve.
4. Confirm Bot state, current task, log, and blocked-action messages remain readable.

### Save, Resume, Export, Import

1. Start a local placeholder game and make one move.
2. Return to setup and confirm a saved local game is available.
3. Resume the saved game.
4. Export the saved game JSON.
5. Import the same JSON and confirm the board resumes without exposing hidden deck order or opponent hand card IDs in setup metadata.

### Undo And Blocked Actions

1. Start a local placeholder game.
2. Confirm Undo is disabled before any move and explains why.
3. Make one legal move, then confirm Undo is available when no hidden information is unresolved.
4. Select an unavailable action and record the blocked reason shown by the UI.
5. Confirm the copied bug-report summary includes the current task, last event, and recent public log without hidden card IDs.

### Campaign End And Next Setup

1. Start a solo standard campaign with placeholder data.
2. Play or force a public-safe end-state fixture when available.
3. Confirm the end-game summary exports or carries campaign progress.
4. Continue to the next setup and confirm campaign wins, losses, and next difficulty are visible.

### Trade Routes Enabled Game

1. Start a placeholder multiplayer game with Trade Routes enabled.
2. Confirm Trade Routes setup does not block launch.
3. Exercise market acquisition and any visible Trade Routes choices available in the fixture.
4. Export diagnostics after the first Trade Routes-relevant decision.

## Issue Capture

For every playtest bug, record:

- commit or branch name
- command used to launch the app
- browser and viewport
- mode, player count, Commons set, expansions, variants, and data source
- active player and viewer player
- exact action attempted
- visible blocked reason or error message
- copied bug-report summary from the diagnostics panel
- exported `polity-playtest-diagnostics-*.json`
- screenshot when layout or readability is involved

Do not attach private CSVs, generated-private JSON, private card names, or private raw text.
