# Seven-Feature Player Audit

Scope: audit the seven uncommitted improvement tracks, use the actual browser as a player, fix reproducible defects, run the complete verification gate, then commit/push and deploy the exact SHA. Pre-existing deleted temporary artifacts are excluded.

## Findings and Fixes

1. **P1: Autosaves captured redacted player views.** Hidden draw/nation decks, other players' private zones and random-plugin state could be omitted. Local persistence now subscribes to the authoritative Redux store; online clients never use this path. A real-client regression saves a non-empty hidden deck, restores it, plays another move and compares authoritative state. Legacy saves are recovered from their last full undo checkpoint only when context, log and available player-view fields agree; unrelated checkpoints are rejected. Original migration sources remain untouched. Unverified legacy snapshots are visibly flagged.
2. **P1: Single-card look effects could be undone after revealing information.** Information-safety comparison now includes the looked-card state. A client test proves unchanged deck contents do not make a reveal reversible.
3. **P2: Selected-card feedback used unrelated turn-action failures.** Playing a resource card showed "No Unrest in hand" from Revolt. Detail feedback now uses card actions only, suppresses a blocked warning when a card action is legal, and does not apply the selected card's reason to another pinned card.
4. **P2: Imports were inaccessible to keyboard/controller navigation.** Hidden file inputs used display:none. They now remain focusable with a visible focus outline on the import label. Browser regressions check both save and preset imports.
5. **P2: Commons eligibility omitted nation conflicts and could retain an inactive campaign condition.** The picker now shares the engine's nation-conflict predicate and uses campaign rules only in solo mode. Missing selections remain visible and block launch pending deliberate repair.
6. **P2: Controller commands could modify a background select while a modal was open.** Modal focus is recovered before executing commands; aria-disabled controls and disabled option groups are respected. Card-inspection focus no longer resets just because callback identity changes.
7. **P2: Release retries had pagination and concurrency gaps.** Release reads all result pages, rejects inconsistent pagination, holds a per-service local lock and verifies build/start/root/runtime/health configuration before deployment. Tests cover later-page reuse, command drift and concurrent attempts. Cross-machine releases still require coordination.
8. **P3: Save and preset management had confusing feedback.** Saves now use inline rename controls and named downloads, copies retain a distinguishing suffix, libraries offer explicit refresh, import work disables conflicting actions, newly created/imported presets become selected, and preset writes use Web Locks where available. Autosave failures use a separate alert that clears after a successful write. Readable save slots remain available if legacy-copy migration hits quota.
9. **P2: Card details overlapped later controls on compact desktops.** The visual 1280x720 walkthrough exposed flex shrinking that pushed detail content into Undo. Right-rail children now retain their content height and the rail scrolls; browser regression checks detail content containment.
10. **P2: Production bug reports identified the frontend as local-dev.** The post-deployment player check caught the missing build stamp. Vite now embeds Render's commit SHA, and hosted browser QA checks the frontend diagnostic SHA as well as the server release checks.

## Player Verification

- Actual browser walkthrough: start Practice, select and play a card, undo, inspect/close card details, return to setup, name/copy/rename/resume a save and inspect import accessibility.
- Automated browser scenarios: fictional Commons upload, preset save/load and launch blocking, inline saved-game rename, recovery, keyboard focus, deferred-load failure/recovery, multiplayer, and five viewport sizes.
- Engine verification: deterministic stress/replay, one-card reveal boundary, legal/illegal move rejection, reactions and scoring suites.
- Release verification: fake-API failures/retries, read-only live configuration check, exact-commit deployment, hosted smoke and hosted browser proof. Deployment evidence is recorded separately in ignored `tmp/releases` reports.

## Limits

- No private card data is added, read into audit reports or published.
- Physical controller/Steam Deck and screen-reader testing are not claimed.
- Legacy saves without a matching full checkpoint cannot have missing hidden information reconstructed safely. Their data is preserved and their completeness remains unverified.
- A randomly selected solo bot is not known at picker time; final engine setup remains authoritative for bot-specific replacement rules. Browser localStorage without Web Locks cannot promise fully atomic cross-tab writes.
- This document is not itself evidence that deployment succeeded; exact-SHA live proof is recorded in the release report.

## Verification Results

- Final `npm run verify:improvements`: passed, with 15 release tests, 37 QA-script tests, 222 app tests, 76 server tests and 1,540 engine tests (1,890 total). Typechecks, fictional gameplay, multiplayer restart/reconnect and complete browser QA passed.
- Final initial JavaScript: 940,583 bytes / 239,510 bytes gzip, below the 980,000 / 250,000 budgets.
- Large fictional board (210 added cards): desktop resume 114 ms, five sampled interactions 58-68 ms; mobile at 4x CPU throttle resume 437 ms, interactions 100-129 ms. These are local observations, not cross-device guarantees.
- Actual UI: legacy test save recovered, named save created/renamed/resumed, public-effect Undo restored resources/hand, card-inspection Tab/Escape restored focus, import controls exposed as accessible buttons, and 1280x720 screenshot confirmed no detail/Undo overlap.
- The in-app automation tool could open a native overwrite confirmation but could not dismiss it because its focus-emulation request timed out. No replacement was confirmed; the audit continued in a fresh tab. Automated workflows and storage tests cover the normal save paths.
- Read-only production preflight passed against the existing release, including the expanded configuration checks. Render currently auto-deploys main; the explicit release command will reuse the matching deployment if pushing starts it first.
- The main audit commit c836cbda57b22f0bdbfe865eb828b0d228efedb6 was pushed, deployed and verified with hosted smoke/browser QA. The subsequent frontend-stamp fix passed all unit/typecheck suites, a negative browser check rejecting an unstamped build, and the full browser suite with the matching SHA enforced (`frontendCommitChecked: true`).
- Follow-up stamped-build asset check: 940,596 bytes / 239,506 bytes gzip. The final deployment's exact server/frontend SHA checks are recorded in its separate release report.

API contract checked against Render's [trigger-deploy documentation](https://api-docs.render.com/reference/create-deploy) and [deployment-list documentation](https://api-docs.render.com/reference/list-deploys).
