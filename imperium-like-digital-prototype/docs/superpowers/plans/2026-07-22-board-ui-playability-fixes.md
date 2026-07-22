# Board UI Playability Fixes Plan

> **For agentic workers:** Execute this plan in order. Keep changes public-safe and selector-driven. UI may explain rule state, but rules legality must continue to come from the engine/selectors, not duplicated browser logic.

**Goal:** Make normal play easier to understand by keeping the current task, available actions, recent game events, player aid, zone ownership, card detail, and bug-report diagnostics visible and useful during real solo, practice, and multiplayer sessions.

**Why this exists:** Recent playtesting found player-facing issues that are not obvious from engine tests alone: cleanup choices can feel hidden, player aid can crowd the log, end-turn follow-through is hard to audit, and bug reports need stronger diagnostics context. These fixes should make the UI function more like a playable rulebook and make the player-expectation agent better at finding logical game errors.

**Current baseline:**

- Board UI already exposes current-task metadata, blocked-action reasons, provenance, zone hierarchy hooks, and playtest diagnostics.
- `BoardLayout.test.tsx` covers player aid visibility, diagnostics redaction, zone hierarchy hooks, and many normal rule UI states.
- A local uncommitted layout fix has moved `GameLogPanel` above `RuleAidPanel`, added a visible `Game Log` title, and constrained player-aid height so it scrolls internally.

---

## Guardrails

- [x] Every behavior-changing UI fix has a focused test first or in the same patch.
- [x] Public-safe diagnostics never include hidden deck order, opponent hand IDs, private raw card text, private generated data, credentials, or account tokens.
- [x] Visual priority follows gameplay priority: blocking prompts first, enabled actions second, recent outcomes third, reference material after that.
- [x] Responsive checks include desktop, Steam Deck-sized, and narrow/tablet layouts.
- [ ] README gap snapshot or this plan is updated when a gate meaningfully changes status.

---

## Gate 1: Protect The Game Log From Player Aid Crowding

**Purpose:** The player should always be able to see what just happened without the player aid pushing the log out of view.

**Primary files:**

- `app/src/ui/layout/BoardLayout.tsx`
- `app/src/ui/layout/GameLogPanel.tsx`
- `app/src/ui/layout/RuleAidPanel.tsx`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`

**Steps:**

- [x] Render the game log ahead of the player aid in the right rail.
- [x] Add a visible `Game Log` panel title and stable `data-qa="game-log"` hook.
- [x] Add a regression test asserting the log appears before player aid in rendered markup.
- [x] Give player aid an internal scroll limit so it cannot consume the right rail.
- [x] Verify visually at local desktop and Steam Deck-sized viewport.
- [ ] Consider a collapsible player-aid control if the rail still feels crowded after visual QA.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run build -w app
```

---

## Gate 2: Make The Current Required Action Sticky And Unmissable

**Purpose:** Cleanup choices, trigger choices, and end-turn blockers should be visually impossible to miss. A player should not have to scan every panel to learn what is required.

**Primary files:**

- `app/src/ui/layout/BoardLayout.tsx`
- `app/src/ui/layout/ActionMenu.tsx`
- `app/src/ui/layout/uiSelectors.ts`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`
- `scripts/local-browser-qa.mjs`

**Steps:**

- [x] Create a dedicated `CurrentTaskPanel` or promote the existing current-task strip into a named component.
- [x] Render the current-task panel near the top of the right rail, above normal action controls.
- [x] Make it sticky within the right rail when vertical scrolling occurs.
- [x] Give blocking choices stronger visual priority than informational current-turn status.
- [x] Include the pending resource/card/action target in public-safe copy when visible.
- [x] Add `data-qa="current-task-panel"` and task kind/status attributes for QA.
- [x] Add tests for cleanup market resource choice, pending trigger choice, no-task idle state, and blocked end-turn state.
- [x] Extend browser QA to assert the current task remains visible or reachable across supported viewports.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run qa:local-browser
```

---

## Gate 3: Separate Enabled Actions From Blocked Actions

**Purpose:** Players should see what they can do first. Blocked actions are useful explanations, but they should not visually compete with valid actions.

**Primary files:**

- `app/src/ui/layout/ActionMenu.tsx`
- `app/src/ui/controller/actionModel.ts`
- `app/src/ui/controller/selectionModel.ts`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`

**Steps:**

- [x] Split action rendering into `Available Actions`, `Required Choices`, and `Unavailable` groups.
- [x] Keep required choices expanded by default.
- [x] Keep enabled actions expanded by default.
- [x] Collapse blocked/unavailable actions by default when there is at least one enabled action.
- [x] Preserve blocked reasons and rule provenance inside the unavailable group.
- [x] Add concise empty states: `No available actions` and `Select a card or zone to see actions`.
- [x] Ensure keyboard/focus order reaches enabled actions before unavailable explanations.
- [x] Add tests proving enabled actions render before unavailable actions and blocked reasons are preserved.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run typecheck -w app
```

---

## Gate 4: Add End-Turn And Trigger Outcome Feedback

**Purpose:** After clicking `End Turn`, the player should understand the resulting sequence: cleanup prompts, resource placement, draw-up, bot/autoplay actions, trigger resolution, and next active player.

**Primary files:**

- `engine/src`
- `app/src/ui/layout/GameLogPanel.tsx`
- `app/src/ui/layout/BoardLayout.tsx`
- `app/src/ui/layout/playtestDiagnostics.ts`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`
- `engine/src/tests`

**Steps:**

- [ ] Inventory existing log messages for end-turn, cleanup, trigger, bot, and next-player transitions.
- [x] Add a selector that derives a public-safe `lastOutcome` summary from the latest log entries and pending/current task.
- [x] Render a compact `Last Event` banner near the current-task/action area.
- [x] When an end turn creates a pending cleanup choice, show `End Turn -> Cleanup choice pending`.
- [x] When cleanup completes, show draw-up and next-player text if the log contains enough data.
- [x] When bot/autoplay resolves, show a concise public-safe outcome without hidden card leakage.
- [x] Add diagnostics fields for last outcome and last N public-safe log summaries.
- [ ] Add regression tests for the cleanup-resource bug class: end turn creates choice, choice resolves, cleanup proceeds.

**Acceptance evidence:**

```powershell
npm.cmd run test -w engine
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run qa:local-browser
```

---

## Gate 5: Make Player Aid Collapsible And Contextual

**Purpose:** Player aid should be useful for learning and optional for repeated play. It should not permanently consume scarce rail space.

**Primary files:**

- `app/src/ui/layout/RuleAidPanel.tsx`
- `app/src/ui/layout/ruleAidContent.ts`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`

**Steps:**

- [x] Add collapsed/expanded state with a compact header button.
- [x] Default expanded for new sessions unless local storage remembers a preference.
- [x] Keep urgent rule aid or pending-choice aid visible even when collapsed, if the aid is task-relevant.
- [x] Persist collapse preference in local storage using a versioned key.
- [x] Add a `data-qa="player-aid"` hook and `data-expanded` state.
- [x] Test default render, collapsed render, expanded render, and trade-route contextual aid.
- [x] Verify mobile/narrow layouts do not place aid before current task or log.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run qa:local-browser
```

---

## Gate 6: Clarify Zone Ownership And Visibility

**Purpose:** Players should immediately understand which areas are theirs, public, opponent-hidden, bot-controlled, market/shared, or diagnostic-only.

**Primary files:**

- `app/src/ui/layout/BoardLayout.tsx`
- `app/src/ui/layout/PlayerZonesPanel.tsx`
- `app/src/ui/layout/ZoneDetailPanel.tsx`
- `app/src/ui/layout/CardDetailPanel.tsx`
- `app/src/ui/layout/uiSelectors.ts`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`

**Steps:**

- [x] Add compact zone badges for `Your zone`, `Public`, `Hidden`, `Opponent`, `Bot`, and `Market`.
- [x] Ensure badges derive from existing `data-zone-kind` classifications.
- [x] Make hidden-zone cards visually distinct from empty public zones.
- [x] Make selectable, selected, blocked, and pending-target states distinguishable without relying on color alone.
- [x] Update zone detail headers to include ownership/visibility status.
- [x] Add tests for own hand/history, public market, hidden opponent/bot zones, and selected pending targets.
- [x] Extend browser QA to assert zone badges are present and not overlapping card text.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run qa:local-browser
```

---

## Gate 7: Improve Card Detail, Pinning, And Zoom Ergonomics

**Purpose:** Selection state should be legible. Players should know whether they are inspecting a hover/selection, a pinned card, or a full zoom.

**Primary files:**

- `app/src/ui/layout/CardDetailPanel.tsx`
- `app/src/ui/layout/CardInspectionModal.tsx`
- `app/src/ui/layout/BoardLayout.tsx`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/CardInspectionModal.test.tsx`
- `app/src/ui/layout/BoardLayout.test.tsx`

**Steps:**

- [x] Add explicit `Selected`, `Pinned`, and `Zoom` labels/states to the detail panel.
- [x] Make `Pin`, `Unpin`, and `Zoom` actions visually consistent with other tool controls.
- [x] Keep blocked reason and provenance visible when a selected card cannot act.
- [x] Ensure the zoom modal preserves readable card hierarchy and does not hide close controls on short viewports.
- [ ] Add keyboard escape behavior for modal close if not already present.
- [ ] Add tests for selected card detail, pinned card detail, blocked selected card detail, and modal accessibility.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx CardInspectionModal.test.tsx
npm.cmd run typecheck -w app
```

---

## Gate 8: Add Bug Report Helper Beside Diagnostics

**Purpose:** Playtesters should be able to submit useful bug reports without knowing what state matters.

**Primary files:**

- `app/src/ui/layout/BoardLayout.tsx`
- `app/src/ui/layout/playtestDiagnostics.ts`
- `app/src/ui/styles/board.css`
- `app/src/ui/layout/BoardLayout.test.tsx`
- `docs/local-playtest-checklist.md`

**Steps:**

- [x] Add a `Copy Bug Report Summary` button near `Export Playtest Diagnostics`.
- [x] Summary should include app/build commit if available, mode, player count, active player, viewer player, current task, pending choice, last outcome, last public-safe log summaries, and instructions to attach exported diagnostics.
- [x] Do not include hidden card IDs, private card text, account tokens, lobby credentials, or raw private data.
- [x] Use clipboard API when available and show a fallback text area if copy fails.
- [x] Add tests for summary content and redaction boundaries.
- [x] Update local playtest checklist to ask for both diagnostics JSON and copied bug report summary.
- [ ] Consider adding `mailto:` helper later, but keep the first implementation local/browser-safe.

**Acceptance evidence:**

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run qa:local-browser
```

---

## Gate 9: Viewport And Human-Expectation QA Pass

**Purpose:** The fixes should hold during real use, not just static render tests.

**Primary files:**

- `scripts/local-browser-qa.mjs`
- `scripts/hosted-smoke.mjs`
- `docs/local-playtest-checklist.md`
- `docs/superpowers/plans/2026-07-22-board-ui-playability-fixes.md`

**Steps:**

- [x] Extend local browser QA to assert current-task visibility, game-log visibility, action group order, player-aid collapse state, zone badges, and diagnostics bug-report helper.
- [x] Add a screenshot/artifact on failures involving overlap, offscreen panels, or missing current task.
- [x] Run the automated player-expectation agent through solo, practice, and two-seat multiplayer self-play after each UI gate.
- [x] Add a manual checklist path that starts a normal local game and confirms the UI answers: `What do I do?`, `Why can't I do that?`, `What just happened?`, and `How do I report a bug?`
- [ ] After local is stable, run hosted smoke and hosted browser QA against the deployed origin.

**Acceptance evidence:**

```powershell
npm.cmd run qa:local-browser
$env:POLITY_HOSTED_BASE_URL='https://polity-engine.onrender.com'
npm.cmd run smoke:hosted
```

---

## Suggested Execution Order

1. Finish Gate 1 and visually inspect the right rail.
2. Implement Gate 2 current-task stickiness.
3. Implement Gate 3 action grouping.
4. Implement Gate 4 end-turn/trigger outcome feedback.
5. Implement Gate 5 collapsible player aid.
6. Implement Gate 8 bug-report helper once diagnostics fields are stable.
7. Implement Gate 6 and Gate 7 visual refinements.
8. Close with Gate 9 local and hosted QA.

This order prioritizes gameplay comprehension before polish: first the UI says what is required, then what is possible, then what happened, then how to learn/report.
