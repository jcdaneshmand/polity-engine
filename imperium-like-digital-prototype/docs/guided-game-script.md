# The River Assembly Guided Game

Status: original public-safe teaching script, lesson version 1, fictional fixture version 3, rules version 3.

The lesson uses six short chapter resets. A reset is announced before it occurs because the compact public fixture cannot yet form one naturally paced teaching game without adding tutorial-only rules. Every action the learner takes is an ordinary legal engine move. Chapter completion is derived from authoritative game state and public engine events, never from clicking a tutorial control.

## Chapter 1: Commit an Action

- Scenario and seed: F01, `fictional-F01-v2`.
- Starting contract: two Progressors begin with the public synthetic Commons pool; Player 1 has `Foundry Lantern` in hand, 3 Materials, 3 Actions, and 1 Exhaust token.
- Learner sequence: select Foundry Lantern, inspect its legal action and payment preview, then Play it.
- Completion predicate: the authoritative `playCard` phase event for Foundry Lantern exists, Materials equal 4, Actions remaining equal 2, and the Exhaust token remains available.
- Independent change: playing one Action spends one Action and the card gains 1 Material, so `3 Actions - 1 = 2` and `3 Materials + 1 = 4`. The Exhaust token remains 1.
- Likely confusion to watch: Actions and Exhaust tokens are separate pools.

## Chapter 2: Cross a Milestone

- Scenario and seed: F01, `fictional-F01-v2`.
- Starting contract: same bounded setup as Chapter 1.
- Learner sequence: play Foundry Lantern, finish the turn, and continue ordinary turns until the empty draw pile reshuffles.
- Completion predicate: Nation-deck progression is 1, Development progression is 0, Exhaust tokens equal 0, and the public log contains `NationCardAdded`. The full scenario audit separately verifies Milestone Charter's destination because an opponent view must not inspect Player 1's hand.
- Independent change: the reshuffle crosses the first Nation milestone and spends the one Exhaust token; it does not spend an Action. One Nation card moves into the draw lifecycle.
- Reset disclosure: this chapter restarts F01 so the reshuffle can be observed from its clean contract.

## Chapter 3: Answer a Reaction

- Scenario and seed: F03, `fictional-F03-v2`.
- Starting contract: Player 1 can play `Greenway Region`, while `Wayfinder Network` is a legal reactive Exhaust source and `Pathfinder Unit` can garrison the Region.
- Learner sequence: play Greenway Region; when the required reaction opens, choose Wayfinder Network; then garrison Pathfinder Unit and recall Greenway Region.
- Completion predicates: the reaction first exists; after resolution Influence equals 3 and Exhaust tokens equal 0; after recall Greenway and Pathfinder are both in hand and no garrison remains.
- Independent change: Greenway gains 1 Material; Wayfinder Council's reactive Exhaust gains 1 Influence and spends one Exhaust token. Recall returns the Region and its attached Unit in order.
- Persistence checkpoint: reload while the reaction is open. The required choice and lesson step must remain open exactly once.

## Chapter 4: Trade Through a Route

- Scenario and seed: F02, `F02`.
- Starting contract: Player 1 can establish `Sluiceway Route`; Player 2 can use `Canal Exchange` and then open a typed Market acquisition with `Market Lens`.
- Learner sequence: Player 1 plays Sluiceway Route; finish the turn as needed; Player 2 plays Canal Exchange, chooses the legal opponent Route, plays Market Lens, then acquires `Pressure Forum`.
- Completion predicates: Player 2 has 2 Goods and Sluiceway Route holds 1 Goods; the log contains `TradeChoiceResolved(opponent_route/fixture_trade_route_sluice)`; the acquisition choice opens and then closes with Pressure Forum in Player 2's hand.
- Independent change: the trade transfers the rule-defined unit to the Route and leaves Player 2 at 2 Goods. Acquisition moves the selected Market card to hand; it does not invent a tutorial destination.
- Likely confusion to watch: only highlighted legal Routes and Market targets advance the chapter.

## Chapter 5: Arrange the Solstice

- Scenario and seed: F09, `fictional-F09-v2`.
- Starting contract: both Dawn Timekeepers have `Dawn Storehouse` and `Dawn Tollhouse` ready in their Power areas.
- Learner sequence: finish both ordinary turns and cleanup; reload when the ordering panel opens; order and confirm both players' Solstice effects.
- Completion predicate: the public log records the ordering boundary and its resolution, no Solstice order remains pending, and round 2 begins.
- Independent change: Storehouse gains 1 Material and Tollhouse spends 1 Material. Either legal order returns a player starting at 3 Materials to 3, while the order remains behaviorally important at a resource boundary.
- Persistence checkpoint: reload before ordering; neither Power effect may resolve before confirmation or repeat after it.

## Chapter 6: Close and Score

- Scenario and seed: F05, `F05`.
- Starting contract: each Scorekeeper can play `Closing Bell`; the first round opens final-round timing instead of ending immediately.
- Learner sequence: each player plays Closing Bell and finishes the turn; reload at the final-round boundary; then finish both final turns and inspect the score breakdown.
- Completion predicate: normal scoring ends the game with winner `1,2`, reason `normal_scoring:fictional_closing_bell`, and scores 3-3.
- Independent arithmetic for each player: Closing Bell fixed VP 2 + Progress 1 VP + five basic resources scoring 0 at the 10:1 limit = 3 VP.
- Persistence checkpoint: reload at the final-round boundary; no Bell effect or score contribution may repeat.

## Walkthrough Protocol

Start with no private import loaded and an unrelated ordinary autosave present. Enter Learning Game from Basic Setup, complete Chapter 1 with pointer controls, and record elapsed time and unclear wording. Restart the chapter and confirm the reset warning. Exit, resume the ordinary autosave, then continue the learning save. Repeat Chapter 3 with keyboard controls and reload at its pending reaction. Repeat Chapter 4 at a touch viewport. Finish Chapter 5, verify the 3-3 arithmetic, and confirm that no account history, campaign reward, ordinary autosave, or user save slot changed.

The 10-15 minute estimate remains provisional until this protocol is timed by a person. Automated execution proves state transitions, not human comprehension or duration.
