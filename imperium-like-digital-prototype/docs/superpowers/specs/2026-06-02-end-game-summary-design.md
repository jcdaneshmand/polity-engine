# End Game Summary Design

## Goal

When the engine sets `G.gameover`, the board should clearly communicate that the game is complete without hiding the final board state from review.

## User Experience

Show a centered end-game modal over a dimmed board. The modal includes:

- Outcome headline with the winner or tied winners.
- End condition derived from the existing `G.gameover.reason` code.
- Score table from `G.gameover.scores`.
- Tie-break scores when `G.gameover.tieBreakScores` is present.
- Game statistics derived from current state: rounds played, log event count, per-player zone totals, resource totals, and solo bot totals when present.
- A `Review Board` button that dismisses the modal while leaving the final board inspectable. Starting another game remains available through the existing app-level `New Game` control.

## Architecture

Add a presentational `EndGameSummary` component under the board layout. It accepts `G`, `ctx`, and `onReviewBoard`, derives display rows from existing state, and does not mutate game state.

`BoardLayout` owns a local `summaryDismissed` boolean. When `G.gameover` appears and the summary has not been dismissed, it renders the modal. If a new game begins, the board component remounts with fresh local state.

## Testing

Add a server-rendered React test that proves the summary renders winner, reason, scores, tie-break information, and statistics from representative game state.
