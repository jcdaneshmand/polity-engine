# Board UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the board and setup UI scan hierarchy, action discoverability, semantic state styling, and Steam Deck usability without changing engine rules behavior.

**Architecture:** Keep the existing React board layout and controller model. Add small presentation helpers in `app/src/ui/layout` and `app/src/ui/components`, keep action derivation in `selectionModel.ts`, and centralize visual tokens in CSS so future themes can reuse them.

**Tech Stack:** React 18, TypeScript, Vite, boardgame.io React client, Vitest, existing CSS modules imported through `app/src/styles.css`.

---

## File Structure

- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
  - Add semantic color custom properties, current-task styling, target highlighting, and stronger card/action hierarchy.
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`
  - Add progressive setup section styling and sticky launch summary behavior.
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/steamDeck.css`
  - Add 1280x800 and small-height overrides for the new hierarchy.
- Modify: `imperium-like-digital-prototype/app/src/ui/controller/selectionModel.ts`
  - Add small pure helpers for primary blocked reason and action emphasis metadata.
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/TurnStatusBar.tsx`
  - Render a stronger current-task strip when pending choices exist.
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
  - Pass current-task and blocked-reason data to panels/components.
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/ActionMenu.tsx`
  - Add action emphasis classes and compact symbols for common verbs.
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/CardDetailPanel.tsx`
  - Show the main "why can't I?" message near selected card detail.
- Modify: `imperium-like-digital-prototype/app/src/ui/components/CardTile.tsx`
  - Add suit/type strip and stronger cost/VP/effect hierarchy.
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`
  - Group setup into clearer staged sections while preserving the current one-screen workflow.
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`
  - Add pure tests for action emphasis and blocked-reason helpers.
- Test: `imperium-like-digital-prototype/app/src/ui/layout/CardInspectionModal.test.tsx`
  - Add static-render tests for card detail blocked reason and upgraded card structure.
- Create: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetupSummary.test.tsx` if the existing setup summary tests do not cover staged setup sections.

## Task 1: Add Semantic UI Tokens

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/steamDeck.css`

- [ ] **Step 1: Add semantic custom properties**

In `.board-layout`, add custom properties for intent instead of repeating brown/gold values:

```css
.board-layout {
  --ui-selection: #f0c36d;
  --ui-selection-bg: #4b3b2b;
  --ui-ready: #9fca7b;
  --ui-ready-bg: #2f4635;
  --ui-blocked: #dc8a74;
  --ui-blocked-bg: #4b302c;
  --ui-info: #83bdd6;
  --ui-info-bg: #263f49;
  --ui-surface: #3b342f;
  --ui-surface-raised: #4a4038;
}
```

Replace only nearby board-state colors in this task: selected outlines, action-target glow, disabled reason text, choice banner border, and resource-token border/background. Keep broader palette changes for later tasks.

- [ ] **Step 2: Mirror essentials in setup styles**

In `.setup-screen`, add the same intent variables for setup controls:

```css
.setup-screen {
  --ui-selection: #f0c36d;
  --ui-ready: #9fca7b;
  --ui-info: #83bdd6;
  --ui-blocked: #dc8a74;
}
```

Use these variables for active segmented controls, confirmed private data, file errors, and help links.

- [ ] **Step 3: Preserve Steam Deck sizing**

In `steamDeck.css`, do not add new colors. Add only sizing fallbacks if the new current-task/action elements need them:

```css
@media (max-width: 1280px) and (max-height: 800px) {
  .current-task-strip {
    min-height: 46px;
  }
}
```

- [ ] **Step 4: Verify CSS imports still compile**

Run from `imperium-like-digital-prototype`:

```powershell
npm run typecheck -w app
```

Expected: PASS.

## Task 2: Make Pending Choices Visually Dominant

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/TurnStatusBar.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`

- [ ] **Step 1: Add a render test expectation for pending copy**

Extend the existing `getPendingUiState` tests in `uiSelectionModel.test.ts` with one assertion that pending state has stable `title`, `detail`, and `playerId` for a current-player choice. Use an existing pending fixture, for example `pendingAcquireChoice`.

Expected assertion shape:

```ts
expect(getPendingUiState(withPending, ctx)).toEqual({
  title: "Pending Acquire",
  detail: "Choose 1 card",
  playerId: "0"
});
```

- [ ] **Step 2: Render a current-task strip inside `TurnStatusBar`**

Change `TurnStatusBar` so pending state renders as a dedicated `.current-task-strip` row under the compact turn metrics. The strip should include:

- pending title
- pending detail
- waiting/current-player state via existing `pending.detail`

Keep "No pending choice" compact when no pending choice exists.

- [ ] **Step 3: Keep the right-side banner but reduce duplication**

In `BoardLayout.tsx`, keep the right-side `.choice-banner`, but make it a secondary reminder by changing its class to `choice-banner is-secondary` when the top current-task strip exists.

- [ ] **Step 4: Style the strip**

Add CSS:

```css
.current-task-strip {
  grid-column: 1 / -1;
  border: 1px solid var(--ui-info);
  border-radius: 6px;
  background: var(--ui-info-bg);
  padding: 7px 9px;
}

.current-task-strip strong {
  display: block;
  color: #f3ead8;
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test -w engine -- uiSelectionModel.test.ts
npm run typecheck -w app
```

Expected: PASS.

## Task 3: Add Action Emphasis And "Why Can't I?" Helpers

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/controller/selectionModel.ts`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/CardDetailPanel.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/ActionMenu.tsx`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`
- Test: `imperium-like-digital-prototype/app/src/ui/layout/CardInspectionModal.test.tsx`

- [ ] **Step 1: Add pure helper tests**

Add tests for two new helpers:

```ts
expect(getPrimaryBlockedReason([{ enabled: false, reason: "No Action tokens available" }])).toBe("No Action tokens available");
expect(getActionIntent({ action: "play", enabled: true })).toBe("ready");
expect(getActionIntent({ action: "endTurn", enabled: true })).toBe("neutral");
expect(getActionIntent({ action: "play", enabled: false })).toBe("blocked");
```

- [ ] **Step 2: Implement helpers in `selectionModel.ts`**

Export:

```ts
export type ActionIntent = "ready" | "blocked" | "choice" | "neutral";

export function getActionIntent(action: any): ActionIntent {
  if (!action.enabled) return "blocked";
  if (String(action.action).startsWith("resolve") || String(action.action).startsWith("skip")) return "choice";
  if (["play", "profit", "exhaust", "innovate", "revolt"].includes(action.action)) return "ready";
  return "neutral";
}

export function getPrimaryBlockedReason(actions: any[]): string | undefined {
  return actions.find((action) => !action.enabled && action.reason)?.reason;
}
```

- [ ] **Step 3: Pass the blocked reason to `CardDetailPanel`**

In `BoardLayout.tsx`, compute:

```ts
const primaryBlockedReason = getPrimaryBlockedReason(actions);
```

Pass it only when a selected card exists:

```tsx
blockedReason={selectedCard ? primaryBlockedReason : undefined}
```

- [ ] **Step 4: Render blocked reason in `CardDetailPanel`**

Add an optional prop:

```ts
blockedReason?: string;
```

Render:

```tsx
{blockedReason ? <div className="detail-blocked-reason">{blockedReason}</div> : null}
```

- [ ] **Step 5: Apply intent classes in `ActionMenu`**

Import `getActionIntent` and add `className={`action-button action-button--${getActionIntent(a)}`}` to action buttons.

- [ ] **Step 6: Verify**

Run:

```powershell
npm run test -w engine -- uiSelectionModel.test.ts
npm run test -w app -- CardInspectionModal.test.tsx
npm run typecheck
```

Expected: PASS.

## Task 4: Upgrade Action Discoverability With Compact Symbols

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/ActionMenu.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`

- [ ] **Step 1: Add stable action-symbol mapping**

Inside `ActionMenu.tsx`, add:

```ts
function actionSymbol(action: any): string {
  if (String(action.action).startsWith("resolve")) return "OK";
  if (String(action.action).startsWith("skip")) return "SKIP";
  if (action.action === "play") return "PLAY";
  if (action.action === "profit") return "+";
  if (action.action === "view") return "VIEW";
  if (action.action === "exhaust") return "EXH";
  if (action.action === "endTurn") return "NEXT";
  if (action.action === "cancel") return "X";
  return "ACT";
}
```

These are UI symbols only; no rules behavior changes.

- [ ] **Step 2: Render symbol and label**

Change action button content to:

```tsx
<span className="action-button-main">
  <span className="action-symbol" aria-hidden="true">{actionSymbol(a)}</span>
  <span>{a.label}</span>
</span>
```

Keep the disabled reason `<small>` below it.

- [ ] **Step 3: Style action buttons**

Add:

```css
.action-button-main {
  display: flex;
  align-items: center;
  gap: 7px;
}

.action-symbol {
  display: inline-grid;
  place-items: center;
  min-width: 28px;
  height: 20px;
  border-radius: 4px;
  background: #332d28;
  color: var(--ui-selection);
  font-size: .68rem;
  font-weight: 800;
}
```

- [ ] **Step 4: Verify grouping remains stable**

Run:

```powershell
npm run test -w engine -- uiSelectionModel.test.ts
npm run typecheck -w app
```

Expected: PASS.

## Task 5: Strengthen Selected Card And Valid Target Connection

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/components/CardTile.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`

- [ ] **Step 1: Preserve existing hint helper tests**

Before editing components, run:

```powershell
npm run test -w engine -- uiSelectionModel.test.ts
```

Expected: PASS. Existing tests already cover highlighted target data from `getActionHintsByCardId`.

- [ ] **Step 2: Split card tile target states**

In `CardTile.tsx`, keep `highlighted` but render intent-specific classes:

```tsx
${highlighted ? "is-valid-target" : ""}
${selected ? "is-selected" : ""}
```

Keep `is-action-target` temporarily only if needed for backward CSS compatibility, then remove after CSS is updated.

- [ ] **Step 3: Style selected vs valid target differently**

Use gold for selection and teal/green for valid targets:

```css
.card-tile.is-selected {
  outline: 3px solid var(--ui-selection);
}

.card-tile.is-valid-target {
  border-color: var(--ui-ready);
  box-shadow: 0 0 0 2px rgba(159, 202, 123, .34);
}
```

- [ ] **Step 4: Make action hints visually secondary to target glow**

Keep `.action-hints span`, but reduce visual dominance:

```css
.action-hints span {
  border-color: var(--ui-ready);
  background: rgba(47, 70, 53, .85);
  color: #e8ffd4;
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run typecheck -w app
npm run test -w engine -- uiSelectionModel.test.ts
```

Expected: PASS.

## Task 6: Improve Card Presentation

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/components/CardTile.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/CardDetailPanel.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test: `imperium-like-digital-prototype/app/src/ui/layout/CardInspectionModal.test.tsx`

- [ ] **Step 1: Add static-render test expectations**

In `CardInspectionModal.test.tsx`, add expectations for new structural classes:

```ts
expect(html).toContain("detail-grid");
expect(html).toContain("detail-effects");
```

After updating `CardTile`, add a small render-to-static test file if needed for `CardTile` so it asserts:

```ts
expect(html).toContain("card-tile-strip");
expect(html).toContain("card-stat-row");
```

- [ ] **Step 2: Add card tile strip**

In `CardTile.tsx`, render suit/type in a top strip:

```tsx
<div className="card-tile-strip">
  <span>{card.suit ?? card.type}</span>
  <span>{card.cardType ?? card.type}</span>
</div>
```

Place it above the title.

- [ ] **Step 3: Add stat row**

Replace the plain cost/VP meta line with:

```tsx
<div className="card-stat-row">
  <span>Cost {card.cost?.materials ?? card.cost ?? 0}</span>
  <span>VP {card.vp?.value ?? "-"}</span>
</div>
```

- [ ] **Step 4: Style card structure**

Add:

```css
.card-tile-strip,
.card-stat-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: .72rem;
  color: #d9c7a7;
}

.card-stat-row span {
  border: 1px solid #6e5f50;
  border-radius: 4px;
  padding: 2px 5px;
  background: #332d28;
  color: #f3ead8;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test -w app -- CardInspectionModal.test.tsx
npm run typecheck -w app
```

Expected: PASS.

## Task 7: Reduce Setup Screen Cognitive Load

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`
- Test: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetupSummary.test.tsx`

- [ ] **Step 1: Inspect existing setup summary tests**

Run:

```powershell
npm run test -w app -- NewGameSetupSummary.test.tsx
```

Expected: PASS if the test exists and is already wired. If the file does not exist, create it with static render tests for the setup summary and staged section labels.

- [ ] **Step 2: Group setup sections by stage**

In `NewGameSetup.tsx`, wrap existing fieldsets in these containers without changing state logic:

```tsx
<section className="setup-stage" aria-labelledby="setup-stage-session">
  <h2 id="setup-stage-session">Session</h2>
  ...
</section>
<section className="setup-stage" aria-labelledby="setup-stage-content">
  <h2 id="setup-stage-content">Content</h2>
  ...
</section>
<section className="setup-stage" aria-labelledby="setup-stage-data">
  <h2 id="setup-stage-data">Private Data</h2>
  ...
</section>
```

Session contains Mode, Players, Solo difficulty, Bot nation. Content contains Commons, Expansions, Variants, Nations. Private Data contains upload and transcription controls.

- [ ] **Step 3: Make launch summary sticky on desktop**

In `setup.css`, add:

```css
@media (min-width: 900px) {
  .setup-summary {
    position: sticky;
    top: 10px;
    z-index: 2;
  }
}
```

- [ ] **Step 4: Style stages without nested cards**

Use full-width sections, not card-in-card nesting:

```css
.setup-stage {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.setup-stage h2 {
  margin: 0;
  color: #f3ead8;
  font-size: 1rem;
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test -w app -- NewGameSetupSummary.test.tsx
npm run typecheck -w app
```

Expected: PASS.

## Task 8: Add Accessibility And Theme Preset Foundation

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`
- Test: `imperium-like-digital-prototype/app/src/AboutPage.test.tsx` or create a small static-render app shell test if app shell tests exist.

- [ ] **Step 1: Add root theme attribute**

In `App.tsx`, wrap home and game shell root nodes with `data-theme="default"` for now:

```tsx
<div className="app-home" data-theme="default">
```

and:

```tsx
<div className="game-shell" data-theme="default">
```

This creates a stable hook for later user-selectable presets without adding a settings UI in this pass.

- [ ] **Step 2: Add high-contrast variable overrides**

In `board.css`:

```css
[data-theme="high-contrast"] .board-layout {
  --ui-selection: #ffd166;
  --ui-ready: #8cff98;
  --ui-info: #80d8ff;
  --ui-blocked: #ff8a80;
}
```

In `setup.css`, add equivalent overrides for `.setup-screen`.

- [ ] **Step 3: Add reduced motion guard**

Wrap the existing resource pulse animation:

```css
@media (prefers-reduced-motion: reduce) {
  .badge.is-gain {
    animation: none;
  }
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck -w app
```

Expected: PASS.

## Task 9: Browser And Viewport Verification

**Files:**
- No source edits in this task.

- [ ] **Step 1: Run full verification**

Run from `imperium-like-digital-prototype`:

```powershell
npm run test -w engine -- uiSelectionModel.test.ts
npm run test -w app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Start the app**

Run:

```powershell
npm run dev -w app -- --host 127.0.0.1 --port 5173
```

Expected: Vite serves `http://127.0.0.1:5173/`.

- [ ] **Step 3: Smoke test core flows**

In the browser:

- Start a default game.
- Select a hand card and confirm selected card, action menu, and detail panel agree.
- Trigger or fixture a pending choice and confirm the current-task strip is dominant.
- Confirm valid market targets use the valid-target color, not the selected-card color.
- Open card zoom and confirm the modal remains readable.
- Return to setup and confirm staged sections and sticky summary behave.

- [ ] **Step 4: Check viewports**

Verify:

- Desktop: 1440x900
- Steam Deck target: 1280x800
- Narrow tablet/mobile: 760x900

Expected: no overlapping text, no hidden primary action, no card/action labels spilling outside controls.

## Task 10: Final Diff Review And Commit

**Files:**
- Inspect all touched files.

- [ ] **Step 1: Inspect the diff**

Run:

```powershell
git diff -- imperium-like-digital-prototype/app/src/ui imperium-like-digital-prototype/app/src/App.tsx imperium-like-digital-prototype/app/src/styles.css imperium-like-digital-prototype/docs/superpowers/plans/2026-06-04-board-ui-improvements.md
```

Expected: Diff contains UI presentation, controller presentation helpers, and tests only. No engine rules behavior changes.

- [ ] **Step 2: Commit the finished UI pass**

After all verification passes:

```powershell
git add imperium-like-digital-prototype/app/src imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts imperium-like-digital-prototype/docs/superpowers/plans/2026-06-04-board-ui-improvements.md
git commit -m "feat: improve board UI hierarchy"
```

Expected: Commit succeeds with only intended files staged.

## Self-Review

- Spec coverage: The plan covers pending choices, semantic color roles, action discoverability, blocked reasons, selected/target connection, setup cognitive load, theme/accessibility foundation, and upgraded card presentation.
- Placeholder-language scan: The only occurrence is this self-review note; no task uses vague placeholder language for required implementation work.
- Type consistency: New helper names are `getActionIntent`, `getPrimaryBlockedReason`, and `ActionIntent`; these names are used consistently across tests and implementation tasks.
- Scope check: This pass intentionally avoids save/resume, cloud sync, gamepad API integration, and engine rule behavior.
