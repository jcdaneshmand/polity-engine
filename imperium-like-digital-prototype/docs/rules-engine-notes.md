# Rules Engine Notes - Imperium: Horizons-Inspired Digital Prototype

> **Purpose:** implementation-oriented notes distilled from the public Imperium: Horizons rulebook PDF for a private rules-engine prototype. These notes summarize mechanics, timing, state boundaries, and data requirements. They intentionally do not reproduce official card text, card names, art, logos, faction names, or rulebook language.
>
> **Boundary:** keep official PDFs, card transcription, scans, exports, and proprietary card data outside the public repo. Use a gitignored `reference/` folder for private source material. Committed data should stay placeholder/original unless the repo is explicitly made private and the legal boundary is re-reviewed.
>
> **Source of truth:** rulebook sections for Core Concepts, Setup, Flow of Play, Reshuffling, Solstice, Game End, Keywords, and Solo Ruleset. When this file and engine behavior disagree, treat this file as the rules contract to update or implement against.

## Core Modeling Direction

- Turn-based, asymmetric deck-building civilization game.
- Player decks cycle repeatedly; reshuffle timing is a major progression trigger.
- Each player has a current state shown by a State card. State gates playable cards and some effect branches, but it does not prevent owning, acquiring, or using already-played cards unless a rule/effect says so.
- Players build from a shared market, small source decks, a main deck, nation-specific progression cards, and face-up development cards.
- Per-turn economy uses separate Action and Exhaust tokens. Resource tokens are persistent between turns.
- Some cards remain in play, host resources, or host garrisoned cards. Card instances need runtime state separate from definitions.
- History, Exile, Garrison, Development, Nation deck, Fame deck, Unrest pile, and Market all have distinct timing/scoring rules and should not be collapsed into generic discard behavior.

## Stable Typed Vocabulary

- `Suit`: `region | uncivilised | civilised | tributary | fame | unrest | trade_route | merchant | power | gadget | nation_specific`.
- `CivState`: support at least the two base state symbols plus nation-specific aliases. Prefer data labels such as `barbarian | empire | custom_1 | custom_2` in code, with display text supplied by private nation data.
- `ZoneName`: `hand | drawDeck | discard | playArea | history | nationDeck | developmentArea | garrison | exile | market | unrestPile | fameDeck | mainDeck | regionDeck | uncivilisedDeck | civilisedDeck | tributaryDeck | tradeRouteDeck | botDeck | botDiscard | botSlots | removedFromGame`.
- `Resource`: `materials | population | progress | goods`.
- `TurnType`: `activate | innovate | revolt`.
- `CardVisibility`: `face_up | face_down | hidden_count_only | owner_visible`.

## State Shape Priorities

- Zones store `CardID[]`; card definitions live in `cardDb`.
- Runtime card-instance data stores resources, exhaustion markers, garrisoned child card IDs, side/state, and other counters.
- Track `actionTokens`, `exhaustTokens`, `handSize`, `state`, current turn type, and per-turn constraints.
- Track market slots as structured objects: visible card ID, suit/source deck, resources on the slot card, unrest tucked under the card, and refill metadata.
- Track source decks separately from market slots. Cards visible above the market board are not in the market until moved into a market slot.
- Track `pendingChoice` style interruptions for choices created by effects, Develop during reshuffle, optional cleanup discards, and rare order-dependent simultaneous effects.
- Preserve an audit log for setup, market refill, reshuffle, progression, scoring trigger, collapse trigger, invalid moves, and user choices.

## Hidden Information Policy

- Draw decks, nation decks, main/small decks, fame deck, bot decks, and face-down bot cards expose counts only to the UI.
- A player's hand is owner-visible; in local hotseat/debug mode it may be rendered, but the selector layer should still label it as private.
- Development area cards are face up and inspectable.
- Market slot cards and resources are public. Tucked Unrest under market cards is public by count/type, but the implementation can store the exact card ID if all Unrest cards are equivalent for prototype purposes.
- History, discard, play area, exile, and garrison contents are public unless a nation-specific rule says otherwise.
- Nation deck order is deterministic but hidden; Development choice is face-up and player-selected.

## Setup Pipeline

`setupGame(config)` should be deterministic from seed/config and flow through:

1. Select player nations and initialize player count, first player, and enabled modules.
2. For each player, configure Power card, State card, starting deck, starting resources, Nation deck, Development area, hand size, action/exhaust tokens, and any nation-specific setup rules.
3. Nation deck order is fixed by nation setup data. The top card is the next progression card that will be added during reshuffle.
4. Development cards start face up in the Development area. They are not in the player's deck and do not score until developed into the deck/discard lifecycle.
5. Build Commons from enabled card sets and player-count/variant filters.
6. Build Region, Uncivilised, Civilised, Tributary, Fame, Unrest, Main, and optional expansion decks/piles.
7. Seed the Market to its required slot count, using the correct source deck/refill rules for each slot.
8. Place the required Unrest under eligible market cards during setup/refill.
9. Initialize Solstice marker/order and round tracking.
10. For solo, initialize bot state card, bot deck/discard, bot slots, difficulty options, and any practice-mode overrides.

## Turn Model

### Activate Turn

- The normal player turn.
- A player spends Action tokens to play eligible action cards, resolve Profit where allowed, and perform other action-costed effects.
- A player spends Exhaust tokens to use exhaust abilities on cards in play, Power card, or other legal sources.
- Costs are checked and paid before benefits resolve.
- If an effect cannot be resolved in full, follow the keyword's "as much as possible" or "cannot choose this option" rule.
- End turn proceeds to cleanup.

### Innovate Turn

- A specialized turn type controlled by state/card rules.
- It does not use the normal action/exhaust cadence unless the relevant rule or card explicitly grants that permission.
- It still needs cleanup and draw-up resolution after its specialized effect sequence.

### Revolt Turn

- A specialized turn type tied to Unrest/state pressure.
- It should skip normal action/exhaust sequencing unless explicitly allowed.
- It still resolves cleanup/draw-up as defined by the turn type.

## Cleanup Contract

Cleanup should be a fixed service, not duplicated in moves:

1. Add the cleanup resource token to a market card, or apply the active nation/Power replacement rule.
2. Remove the player's Action/Exhaust tokens from play-area cards, Nation deck, Development area, and Power card.
3. Reset Action and Exhaust tokens on the State card to the state's normal values, including nation/expansion exceptions.
4. Resolve optional discard from hand to discard. The player is not forced to discard down to hand size.
5. Draw up to the player's hand limit using the draw/reshuffle lifecycle.
6. Complete turn handoff. After all players have taken a turn, enter Solstice before the next round.

Played cards usually move to discard immediately after resolving unless they are persistent/in-play cards or specify another destination. Cleanup should not blindly discard the whole play area.

## Draw And Reshuffle Lifecycle

Use one central draw service.

- Normal draw draws from the top of the draw deck.
- If a normal draw needs a card and the draw deck is empty, run reshuffle progression.
- Draw-if-able effects never trigger reshuffle. They stop when the draw deck is empty.
- Reshuffle must terminate safely if both draw and discard are empty.

When reshuffle is triggered:

1. If the player has cards in their Nation deck, take the next/top Nation card and put it in the discard pile. If this was the accession/state-changing card, flip or change the State card at the correct point. Move the tracking token from the State card onto the Nation deck, or into the Development area if the Nation deck has become empty.
2. If the player has no Nation deck cards left and has at least one card in Development area, they may pay the development cost of one face-up Development card they can afford. The chosen card goes to discard. Move the tracking token from State to Development area. If no remaining Development card is payable, no Develop occurs.
3. Shuffle discard to become the new draw deck.
4. Resolve "when you reshuffle" effects.
5. Continue drawing until the draw request or draw-up requirement is satisfied.

Important implementation consequences:

- Nation progression is deterministic and order-based.
- Development progression is a player choice among visible, payable Development cards.
- Development choice can interrupt cleanup/draw-up and therefore needs pending-choice state.
- Unplayed cards still in Nation deck or Development area do not score at game end.
- Some nations may have no Nation deck, no Development area, or neither; the service must skip missing steps cleanly.

## Market And Card Gain

### Acquire

- Acquire selects a legal face-up market card unless an effect expands the eligible zone.
- The acquired card moves to the destination specified by the effect, usually discard or hand depending on keyword/effect.
- Resources on the acquired market card are gained by the acquiring player.
- The Unrest tucked under an acquired market card is taken unless the acquisition rule says otherwise.
- Refill the market slot from the correct source. If the relevant small deck is depleted, use the main deck/refill fallback.
- Newly refilled cards can become eligible for additional acquisitions in the same resolving effect when the effect allows multiple acquisitions.
- Acquiring from Exile usually adds Unrest unless the acquired card is Unrest or a specific effect overrides it.

### Break Through

- The player first declares the requested suit when multiple suits are allowed.
- One path takes a matching face-up market card into hand, gains resources on it, and returns its tucked Unrest instead of taking it.
- Another path takes from the matching face-down small deck.
- If the small deck is depleted or the suit has no small deck, reveal from the main deck until a matching card is found; take it and shuffle nonmatching revealed cards back. If none is found, apply the fallback reward.
- Break-through behavior is not the same as Acquire; model it as a separate operation with shared refill helpers where appropriate.

### Take, Gain, Find, Draw

- Keep card-movement verbs distinct in the effect DSL. They often share movement mechanics but differ in source, destination, visibility, and whether Unrest/market refill side effects happen.
- "Gain a resource" adds a token from supply to a pool/card.
- "Gain a card" and "Take a card" should use keyword-specific movement rules, not generic add-to-hand shortcuts.

## Resources And Payment

- Resource tokens in the player's resource pool can be paid. Resources on cards generally cannot be paid unless a rule explicitly permits it.
- Payment is a cost. If the player cannot pay, they cannot choose that action/ability/option.
- Goods can substitute for some resource payments according to the rulebook's payment hierarchy, but materials and population do not convert into each other by default.
- Removing, stealing, and returning resources are not the same as paying and must not use payment substitution unless explicitly allowed.
- Resource supply limitations and component limits should be represented even if the prototype initially treats supply as unlimited.

## Card Text Resolution

- Resolve effects sentence-by-sentence in printed/data order.
- Costs resolve before benefits.
- Choice groups require explicit player choice unless the choice is deterministic from legality.
- Optional effects must be represented as optional. Mandatory effects resolve as much as possible.
- Triggered responses can occur between sentences when the rules allow.
- State-gated phrases/options only resolve if the player's current State card shows the required symbol/state.
- Passive effects must be queryable by services they modify: market refill, resource placement, reshuffle, scoring, card movement, and damage/unrest handling.

## Play Area, Regions, Garrison, And History

- Cards in play remain available for persistent effects, exhaust abilities, Solstice, scoring, and region-style actions until moved.
- Recalling a region returns it and its garrisoned cards to hand and moves resources on it to the player's pool.
- Abandoning a region moves it to discard unless an effect says otherwise; only legal card types can be recalled/abandoned.
- Garrisoned cards are attached to a host card and move according to the host's movement rule.
- History is a public scored zone. Cards in History are normally out of future play but still count for scoring unless a specific rule says otherwise.
- Exile is public and can be targeted by effects. Acquiring from Exile has special Unrest implications.

## Solstice

- After all players finish a turn in round order, Solstice begins before the next round.
- Players resolve Solstice effects on their play area, Power card, and State card.
- Effects are simultaneous in ordinary cases. If order matters, resolve in turn order.
- A player with multiple simultaneous effects chooses their own resolution order.
- End-of-Solstice effects resolve after that player's other Solstice effects.
- Players cannot spend Actions or use Exhaust abilities during Solstice unless a specific rule overrides this.

## Game End And Scoring

Game end can be triggered by normal Scoring or by Collapse.

Scoring triggers include:

- Main deck empty.
- A player develops the last card in their Development area.
- A nation-specific scoring condition is met.
- The Fame deck's special terminal condition occurs.
- A card effect explicitly triggers game end.

At normal scoring:

- When Scoring is triggered, finish the current round and Solstice, then play one final round and Solstice before counting points.
- Score cards in hand, play area, draw deck, discard, history/related scored zones, and Power card.
- Do not score unplayed Nation deck cards or undeveloped Development area cards.
- Score resource-pool tokens according to the rules. Tokens on cards do not score as resource-pool tokens unless a card's scoring rule counts them.
- Variable VP cards have the rulebook's cap unless a card/rule overrides it.
- Ties share victory unless a specific end condition provides a different tie-break.

Collapse:

- Collapse ends the game immediately without finishing the current action.
- Collapse scoring counts Unrest in the relevant player zones and uses lowest Unrest as the primary winner condition, with the rulebook's tie handling.
- Collapse can interrupt multi-player Unrest distribution, so Unrest pile exhaustion needs deterministic allocation.

## Fame Deck

- The special bottom Fame card remains unavailable until all cards above it are gone.
- Effects that look at, draw, gain, or return Fame cards must preserve the bottom-card rule.
- Returned Fame cards go to the top unless a specific effect says otherwise.
- Track per-player resolution of the special Fame card sides/eligibility.

## Solo And Bot Ruleset

- Solo bot logic should be a separate controller that consumes public state and table-driven rows.
- Bot has its own deck, discard, state, slots, and difficulty/campaign modifiers.
- Bot cards often resolve, move to discard, bottom deck, history, or trigger state changes according to table/card data.
- Bot face-down deck information is hidden; face-up slot/state information is visible.
- Practice mode is a simplified solo variant and should be feature-flagged separately from full solo.
- Solo changes to multiplayer rules should live in a solo rules adapter, not scattered through core services.

## Options And Variants

- Trade Routes expansion is a module with its own deck/cards/timing and should remain feature-flagged.
- Lowered aggression, quick setup, precious cards, short game, practice mode, difficulty levels, and campaign mode are configuration options.
- Setup and scoring must record the active options so saves/replays are deterministic.

## Implementation Milestones

- **M1:** minimal playable shell: placeholder cards, draw/play/acquire/cleanup, deterministic market refill, legal move reporting, tests.
- **M2:** full progression: Nation deck deterministic reshuffle additions, Development choice/payment during reshuffle, state/accession hooks, draw-if-able behavior, scoring triggers.
- **M3:** keyword coverage: Break through, garrison, recall, abandon, history, exile, payment substitution, passive hooks.
- **M4:** Solstice, endgame, collapse, Fame deck edge cases, broader scoring.
- **M5:** civilization hooks, expansion modules, full solo bot, save/replay determinism.

## High-Risk Areas

1. Reshuffle progression timing and pending Development choice.
2. State/accession flipping order.
3. Draw-if-able vs normal draw.
4. Market refill source-deck fallback.
5. Acquire vs Break through side effects.
6. Payment substitution vs remove/steal/return resource operations.
7. Garrison host movement.
8. Passive timing and simultaneous effects.
9. Solstice order when Collapse is possible.
10. Fame bottom-card availability.
11. Scoring exclusions for Nation deck and Development area.
12. Solo bot overrides leaking into multiplayer services.
