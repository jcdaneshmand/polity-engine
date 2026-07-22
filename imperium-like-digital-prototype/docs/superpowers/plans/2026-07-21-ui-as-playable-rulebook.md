# UI As Playable Rulebook Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with checkbox updates and evidence notes. Keep each task commit-sized. Use tests before behavior changes where possible. Do not add official card names, official card text, rulebook prose, scans, art, logos, or private/generated data.

**Goal:** Improve the Polity game UI so players can understand the current rule state, discover legal actions, trust rule enforcement, and learn the play flow without needing a separate manual during active play.

**Core principle:** Treat the UI as a playable rulebook. The board should not only render state; it should explain the current obligation, legal affordances, blocked actions, and rule provenance in public-safe language.

**Primary local anchors:**

- `imperium-like-digital-prototype/docs/superpowers/plans/2026-06-04-board-ui-improvements.md`
- `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`
- `imperium-like-digital-prototype/docs/rules-engine-compliance-checklist.md`
- `imperium-like-digital-prototype/docs/local-playtest-checklist.md`
- `imperium-like-digital-prototype/data/fictional-regression/coverage-map.json`

**External design inputs to preserve in the implementation:**

- Board-game adaptation guidance: preserve familiar mechanics, rules, narrative, aesthetics, and technology while using digital strengths for automation, feedback, and state clarity.
- Rulebook accessibility guidance: reduce cognitive load, prefer clear flow, explain jargon when needed, provide player aids, and avoid relying on one reader's memory.
- Game UX guidance: affordance, feedback, scaffolding, and transparency should be visible in moment-to-moment play.
- Imperium-specific learning lesson: critical rules and complete turn examples are more useful when surfaced before players need them.

---

## 2026-07-21 Execution Evidence

- Tasks 1-3 implemented through selector-backed `CurrentTaskUiState`, action intent, blocked reasons, and public-safe rule provenance metadata in `selectionModel.ts`, `TurnStatusBar.tsx`, `ActionMenu.tsx`, `CardDetailPanel.tsx`, and `BoardLayout.tsx`.
- Task 4 implemented with `RuleAidPanel.tsx` and `ruleAidContent.ts`, using original public-safe player-aid copy and option-aware sections.
- Task 7 implemented by extending playtest diagnostics with current-task metadata, enabled/blocked action labels, reasons, provenance, and public selected-card IDs only when visible.
- Task 9 implemented in `scripts/local-browser-qa.mjs` with desktop `1440x900`, Steam Deck `1280x800`, and narrow/tablet `760x900` viewport checks for current-task, diagnostics, player aid, button clipping, and horizontal overflow.
- Verification evidence: `npm.cmd run test -w engine -- uiSelectionModel.test.ts rulesParityCoverage.test.ts`, `npm.cmd run test -w app -- BoardLayout.test.tsx CardInspectionModal.test.tsx App.test.tsx`, and `node --test scripts/local-browser-qa.test.mjs` passed during this execution pass.
- 2026-07-22 follow-up closed Task 5 component hierarchy metadata, Task 6 guided worked-turn browser QA, and Task 8 coverage-map/parity evidence expansion; see `2026-07-22-next-gates.md`.
- Remaining open work: deployed hosted QA and private-data final gate after a hosted origin is configured.

---

## Guardrails

- [x] No official rulebook prose, card text, card names, art, logos, scans, screenshots with official/private content, generated private JSON, or user-entered private CSVs are committed.  
  Execution note: Implementation uses fictional/public-safe labels and UI copy only.
- [x] All rule explanations are public-safe paraphrases or original UI labels.  
  Execution note: Rule aid and provenance labels are original app text.
- [x] React UI does not duplicate core rule legality. It consumes selectors, action metadata, engine state, and public-safe diagnostics.  
  Execution note: Current-task, action intent, and provenance come from `selectionModel.ts`.
- [ ] Any discovered rule mismatch becomes a public-safe failing test before engine behavior is changed.
- [x] Hidden information remains hidden in UI, diagnostics, logs, save metadata, and tests.  
  Execution note: Existing redaction tests remain green; diagnostics add labels/reasons/counts, not hidden card contents.
- [x] Steam Deck target remains `1280x800`; no primary interaction depends on drag-and-drop.  
  Execution note: `qa:local-browser` now includes a 1280x800 viewport pass and one-click target checks.

---

## Task 1: Make The Current Task Dominant

**Purpose:** A player should immediately know whose turn it is, whether a pending choice blocks play, and what must happen next.

**Files:**

- Modify: `imperium-like-digital-prototype/app/src/ui/layout/TurnStatusBar.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/controller/selectionModel.ts`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`

- [x] **Step 1: Add stable pending UI metadata tests**

Add or extend tests around the existing pending-choice selectors. Verify public-safe fields such as:

- `title`
- `detail`
- `playerId`
- `choiceType`
- whether normal actions should be visually de-emphasized

Execution note:

- [x] **Step 2: Expose current-task metadata from selectors**

Add a pure helper if needed, for example:

```ts
export interface CurrentTaskUiState {
  title: string;
  detail: string;
  playerId?: string;
  choiceType?: string;
  suppressNormalActions: boolean;
}
```

The helper must not expose hidden card IDs or private text.

Execution note:

- [x] **Step 3: Render a dominant current-task strip**

Render the strip in `TurnStatusBar` below compact turn metrics. It should show the current obligation when pending choices exist and a concise "ready" state otherwise.

Execution note:

- [x] **Step 4: Keep the existing choice banner as secondary**

If the top current-task strip is present, keep the right-panel choice banner as a reminder rather than the primary explanation.

Execution note:

- [x] **Step 5: Verify**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w engine -- uiSelectionModel.test.ts
npm.cmd run typecheck -w app
```

Execution note:

---

## Task 2: Add "Why Can't I?" Rule Feedback

**Purpose:** Disabled actions should teach and reassure. The UI should explain why a selected card or action is unavailable.

**Files:**

- Modify: `imperium-like-digital-prototype/app/src/ui/controller/selectionModel.ts`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/ActionMenu.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/CardDetailPanel.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`
- Test as applicable: `imperium-like-digital-prototype/app/src/ui/layout/CardInspectionModal.test.tsx`

- [x] **Step 1: Test action intent and blocked-reason helpers**

Add pure tests for:

- `getPrimaryBlockedReason(actions)`
- `getActionIntent(action)`
- pending-choice actions classified as `choice`
- disabled actions classified as `blocked`
- common enabled actions classified as `ready` or `neutral`

Execution note:

- [x] **Step 2: Implement action intent helpers**

Add a small typed helper surface in `selectionModel.ts`, for example:

```ts
export type ActionIntent = "ready" | "blocked" | "choice" | "neutral";
```

Execution note:

- [x] **Step 3: Render blocked reasons near selected-card detail**

Pass a selected-card-scoped blocked reason into `CardDetailPanel`. Use concise text such as "No Action tokens available" or "Choose a pending target first."

Execution note:

- [x] **Step 4: Render disabled reasons inside action buttons**

Keep disabled buttons visible and readable. The disabled reason should be short and actionable.

Execution note:

- [x] **Step 5: Verify**

Run:

```powershell
npm.cmd run test -w engine -- uiSelectionModel.test.ts
npm.cmd run test -w app -- CardInspectionModal.test.tsx
npm.cmd run typecheck -w app
```

Execution note:

---

## Task 3: Surface Rule Provenance

**Purpose:** A player should be able to tell whether an action is allowed or blocked by normal turn rules, a pending choice, a card effect, a mode/module, or hidden-information constraints.

**Files:**

- Modify: `imperium-like-digital-prototype/app/src/ui/controller/selectionModel.ts`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/ActionMenu.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/CardDetailPanel.tsx`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`

- [x] **Step 1: Define public-safe provenance codes**

Use structured codes plus display labels. Candidate codes:

- `normal_turn_rule`
- `requires_action_token`
- `requires_exhaust_token`
- `pending_choice`
- `free_play_effect`
- `resource_payment`
- `market_target_required`
- `mode_module_rule`
- `hidden_information`

Execution note:

- [x] **Step 2: Attach provenance to action metadata**

Add provenance where action availability is already derived. Do not infer directly in React when selectors can provide it.

Execution note:

- [x] **Step 3: Display provenance compactly**

Show provenance in action detail or selected-card detail. Avoid long tutorial prose.

Execution note:

- [x] **Step 4: Add selector tests**

Verify that representative actions carry the expected public-safe provenance without leaking hidden card identities.

Execution note:

- [x] **Step 5: Verify**

Run:

```powershell
npm.cmd run test -w engine -- uiSelectionModel.test.ts
npm.cmd run typecheck -w app
```

Execution note:

---

## Task 4: Add A Contextual Player Aid Panel

**Purpose:** Replace memory burden with a compact, contextual aid that helps players play correctly without copying official rulebook language.

**Files:**

- Create: `imperium-like-digital-prototype/app/src/ui/layout/RuleAidPanel.tsx`
- Create as needed: `imperium-like-digital-prototype/app/src/ui/layout/ruleAidContent.ts`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test as applicable: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.test.tsx`

- [x] **Step 1: Design the panel placement**

Use an existing right-panel area, tabs, or a compact collapsible section. Do not add nested cards inside existing cards.

Execution note:

- [x] **Step 2: Add public-safe aid content**

Include concise original summaries for:

- turn structure
- Action and Exhaust token basics
- Acquire versus Break through
- pending choices
- hidden/public zone visibility
- Trade Routes when enabled
- solo Bot flow when applicable
- scoring/endgame reminders

Execution note:

- [x] **Step 3: Contextualize by selected state and options**

Hide or de-emphasize irrelevant modules. For example, show Trade Routes aid only when the module is enabled.

Execution note:

- [x] **Step 4: Add static render or integration coverage**

Verify the panel renders relevant sections based on options without official/private content.

Execution note:

- [x] **Step 5: Verify**

Run:

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run typecheck -w app
```

Execution note:

---

## Task 5: Improve Card And Zone Information Hierarchy

**Purpose:** Make board reading faster: selected source, legal target, hidden zone, public zone, cost, VP, and card category should be visually distinct.

**Files:**

- Modify: `imperium-like-digital-prototype/app/src/ui/components/CardTile.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/components/PileTile.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/components/ZoneHeader.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/MarketRow.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/PlayerZonesPanel.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Test: `imperium-like-digital-prototype/engine/src/tests/uiSelectionModel.test.ts`
- Test as applicable: component static render tests

- [ ] **Step 1: Separate selected-card and valid-target states**

Use different class names and visual cues. Selection should not look the same as target legality.

Execution note:

- [ ] **Step 2: Add card scan structure**

Add a compact strip for suit/type and a stable stat row for cost/VP/public status markers.

Execution note:

- [ ] **Step 3: Add zone clarity**

Zone headers should show counts and visibility state. Hidden zones must show counts only.

Execution note:

- [ ] **Step 4: Add non-color cues**

Do not rely on color alone. Pair color with label, icon, border treatment, or shape.

Execution note:

- [ ] **Step 5: Verify**

Run:

```powershell
npm.cmd run test -w engine -- uiSelectionModel.test.ts
npm.cmd run typecheck -w app
```

Execution note:

---

## Task 6: Add A Public-Safe Worked-Turn Scenario

**Purpose:** Let players learn by doing with fictional data, not official card text or rulebook excerpts.

**Files:**

- Modify: `imperium-like-digital-prototype/data/fictional-regression/scenarios.json`
- Modify: `imperium-like-digital-prototype/engine/src/tests/fictionalScenarioSmoke.test.ts`
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`
- Modify as needed: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Create as needed: `imperium-like-digital-prototype/app/src/ui/tutorial/`

- [ ] **Step 1: Define the scenario contract**

Add a fictional scenario that exercises:

- selecting a hand card
- seeing legal Play or alternate action
- resolving an action
- encountering a pending choice
- selecting a valid target
- interacting with the Market
- ending the turn

Execution note:

- [ ] **Step 2: Add setup entry point**

Add a setup option such as "Guided public-safe scenario" that uses only original fictional fixtures.

Execution note:

- [ ] **Step 3: Add contextual prompts**

Prompts should be driven by current selector/game state. They should not hard-code hidden or private facts.

Execution note:

- [ ] **Step 4: Extend fictional smoke**

Ensure the scenario is counted and fails if required tutorial tags disappear.

Execution note:

- [ ] **Step 5: Verify**

Run:

```powershell
npm.cmd run smoke:fictional-game
npm.cmd run test -w engine -- fictionalScenarioSmoke.test.ts
npm.cmd run typecheck
```

Execution note:

---

## Task 7: Extend Playtest Diagnostics With Rule UI State

**Purpose:** Bug reports should capture what the UI believed was legal or blocked, while staying public-safe.

**Files:**

- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify or create: `imperium-like-digital-prototype/app/src/ui/layout/playtestDiagnostics.ts`
- Test: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.test.tsx`
- Modify: `scripts/local-browser-qa.mjs`

- [x] **Step 1: Add rule UI state to diagnostics**

Include:

- active player
- viewer player
- pending choice type
- current-task title/detail
- enabled action labels
- blocked action labels and reasons
- selected public card ID only when viewer-visible
- current mode/options/modules
- recent public log entries

Execution note:

- [x] **Step 2: Preserve redaction tests**

Add or extend tests proving diagnostics do not expose hidden deck order, opponent hand IDs, private raw text, or private generated content.

Execution note:

- [x] **Step 3: Extend local browser QA**

Verify the diagnostics export includes current-task/action metadata and excludes private-debug markers.

Execution note:

- [x] **Step 4: Verify**

Run:

```powershell
npm.cmd run test -w app -- BoardLayout.test.tsx
npm.cmd run qa:local-browser
npm.cmd run typecheck
```

Execution note:

---

## Task 8: Tie UI Claims To Rules-Parity Evidence

**Purpose:** Every major rule-aware UI surface should be auditable against public-safe rules evidence.

**Files:**

- Modify: `imperium-like-digital-prototype/data/fictional-regression/coverage-map.json`
- Modify: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`
- Modify: `imperium-like-digital-prototype/docs/rules-engine-compliance-checklist.md`
- Test: `imperium-like-digital-prototype/engine/src/tests/rulesParityCoverage.test.ts`

- [ ] **Step 1: Add UI-facing evidence notes**

Record evidence for:

- pending choice display
- hidden information display
- move/action availability
- blocked reasons
- Trade Routes UI aid
- solo Bot UI aid
- scoring/endgame reminders

Execution note:

- [ ] **Step 2: Downgrade unsupported UI claims**

If a UI explanation cannot be backed by selector, engine, or public-safe scenario evidence, remove or soften it before shipping.

Execution note:

- [ ] **Step 3: Verify coverage-map consistency**

Run:

```powershell
npm.cmd run test -w engine -- rulesParityCoverage.test.ts
```

Execution note:

---

## Task 9: Accessibility And Viewport QA

**Purpose:** The UI should remain usable on desktop, Steam Deck target, and narrow tablet/mobile layouts.

**Files:**

- Modify: `imperium-like-digital-prototype/app/src/ui/styles/board.css`
- Modify: `imperium-like-digital-prototype/app/src/ui/styles/steamDeck.css`
- Modify: `scripts/local-browser-qa.mjs`
- Modify as needed: `scripts/local-browser-qa.test.mjs`

- [x] **Step 1: Add accessibility styling guards**

Ensure:

- no critical meaning is color-only
- visible focus states remain strong
- reduced-motion preferences are respected
- high-contrast theme tokens have a stable hook

Execution note:

- [x] **Step 2: Add viewport checks**

Verify:

- desktop `1440x900`
- Steam Deck target `1280x800`
- narrow/tablet `760x900`

Execution note:

- [x] **Step 3: Check for layout failures**

Confirm:

- no overlapping text
- no clipped primary action
- no hidden current-task strip
- no card/action labels spilling outside controls
- player aid remains usable

Execution note:

- [x] **Step 4: Verify**

Run:

```powershell
npm.cmd run qa:local-browser
npm.cmd run typecheck -w app
```

Execution note:

---

## Task 10: Final Verification And Diff Review

**Purpose:** Confirm the full pass is public-safe, tested, and scoped to UI/playability unless a public-safe rules gap was deliberately fixed.

- [ ] **Step 1: Run final gates**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w engine -- uiSelectionModel.test.ts
npm.cmd run test -w engine -- rulesParityCoverage.test.ts
npm.cmd run test -w app
npm.cmd run typecheck
npm.cmd run qa:local-browser
npm.cmd run smoke:fictional-game
```

Execution note:

- [ ] **Step 2: Inspect public-safe boundaries**

Run from repo root:

```powershell
git status --short
git diff --cached --name-only
```

Confirm no private data, generated private artifacts, official content, scans, or screenshots with official/private content are staged.

Execution note:

- [ ] **Step 3: Inspect implementation diff**

Expected diff scope:

- UI layout and component presentation
- selector metadata helpers
- public-safe player aid content
- fictional tutorial scenario metadata
- diagnostics redaction tests
- browser QA updates
- rules evidence docs

Unexpected diff scope:

- engine rule behavior without a public-safe failing test
- private/generated data
- official text or names

Execution note:

---

## Recommended Execution Order

1. Task 1: current-task strip.
2. Task 2: blocked reasons.
3. Task 3: rule provenance.
4. Task 5: card and zone hierarchy.
5. Task 4: player aid panel.
6. Task 6: public-safe worked-turn scenario.
7. Task 7: diagnostics.
8. Task 8: parity evidence notes.
9. Task 9: viewport/accessibility QA.
10. Task 10: final verification.

This order gets the largest playability gains early while keeping the broader "playable rulebook" layer grounded in selector and engine state.

## Definition Of Done

- Current task and pending choices are dominant and unambiguous.
- Disabled actions explain why they are blocked.
- Action availability includes public-safe provenance where useful.
- A contextual player aid exists without copying official rulebook prose.
- Card/zone hierarchy distinguishes selection, legal targets, hidden zones, and public state.
- A public-safe worked-turn scenario can teach the interaction model.
- Playtest diagnostics capture current rule UI state without leaking hidden/private information.
- Rules parity docs identify evidence behind major rule-aware UI surfaces.
- Desktop, Steam Deck target, and narrow/tablet viewports are verified.
- Final gates pass, and no private or official content is staged.


