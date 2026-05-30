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
- Action and Exhaust token availability is modeled from the visible State card pool. Taking a normal Action spends one Action token from the State card. Using an Exhaust ability moves one Exhaust token from the State card onto the exhausted card, and cleanup removes Action/Exhaust markers from cards before resetting the State card pool.
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
- Runtime card-instance data stores resources, Action/Exhaust token markers, garrisoned child card IDs, side/state, and other counters.
- Imported runtime card definitions must preserve state requirements and all suit icons, because play legality and multi-suit targeting depend on those metadata fields.
- Track `actionTokens`, `exhaustTokens`, `handSize`, `state`, current turn type, and per-turn constraints.
- Track market slots as structured objects: visible card ID, suit/source deck, resources on the slot card, unrest tucked under the card, and refill metadata.
- Track source decks separately from market slots. Cards visible above the market board are not in the market until moved into a market slot.
- Track `pendingChoice` style interruptions for choices created by effects, Develop during reshuffle, optional cleanup discards, and rare order-dependent simultaneous effects. Effect-created interruptions carry the remaining effect list so resolution resumes in printed/data order after the player choice.
- Preserve an audit log for setup, market refill, reshuffle, progression, scoring trigger, collapse trigger, invalid moves, and user choices.

## Hidden Information Policy

- Draw decks, nation decks, main/small decks, fame deck, bot decks, and face-down bot cards expose counts only to the UI.
- A player's hand is owner-visible; in local hotseat/debug mode it may be rendered, but the selector layer should still label it as private.
- Development area cards are face up and inspectable.
- Market slot cards and resources are public. Tucked Unrest under market cards is public by count/type, but the implementation can store the exact card ID if all Unrest cards are equivalent for prototype purposes.
- Region cards in the market do not receive tucked Unrest during setup or refill.
- History is owner-visible: its owner may inspect the cards, while other players see only the count. Discard, play area, exile, and garrison contents are public unless a nation-specific rule says otherwise.
- Nation deck order is deterministic but hidden; Development choice is face-up and player-selected.

## Setup Pipeline

`setupGame(config)` should be deterministic from seed/config and flow through:

1. Select player nations and initialize player count, first player, and enabled modules.
2. For each player, configure Power card, State card, starting deck, starting resources, Nation deck, Development area, hand size, action/exhaust tokens, and any nation-specific setup rules.
   - A single physical two-sided State card must still have an active side in runtime state. Default nations start on the Barbarian/uncivilized side unless a nation ruleset explicitly starts on another side.
3. Nation deck order is fixed by nation setup data. The top card is the next progression card that will be added during reshuffle.
4. Development cards start face up in the Development area. They are not in the player's deck and do not score until developed into the deck/discard lifecycle.
5. Build Commons from enabled card sets and player-count/variant filters.
6. Build Region, Uncivilised, Civilised, Tributary, Fame, Unrest, Main, and optional expansion decks/piles.
   - The Fame deck is built with the special bottom Fame card excluded from the ordinary face-down stack. After shuffling ordinary Fame cards, keep 6 cards for two players, 7 for three players, or 8 for four players; when Trade Routes is enabled, keep one additional ordinary Fame card.
7. Seed the Market to its required slot count, using the correct source deck/refill rules for each slot.
8. Place the required Unrest under eligible market cards during setup/refill.
9. Initialize Solstice marker/order and round tracking.
10. For solo, initialize bot state card, bot deck/discard, bot slots, difficulty options, and any practice-mode overrides.

## Turn Model

### Activate Turn

- The normal player turn.
- A player spends Action tokens to play eligible action cards, resolve Profit where allowed, and perform other action-costed effects.
- Acquire is resolved from card/effect text or a pending Acquire choice, not from a generic Market-row click. UI Market rows may show costs and inspectability, but must not advertise direct Market acquisition as a normal player action, and the public boardgame.io move map must not expose a direct Market Acquire move.
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
- Return any selected Unrest cards from hand to the shared Unrest pile, then proceed to normal cleanup. Non-returned cards remain in hand unless the player later chooses to discard them during the cleanup discard step.
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
- Draw text is only a resolvable card effect if it can actually draw now or start a reshuffle that can make at least one card available, including a deterministic Nation/Accession addition or a payable Development choice. An unpayable Development area by itself does not make draw text playable.
- Draw-if-able effects never trigger reshuffle. They stop when the draw deck is empty.
- If a Draw effect specifies a non-draw-deck location, all drawn cards come from that location instead. Drawing from face-up piles such as Discard or Exile creates an explicit player choice of which card to draw, and multi-card draws repeat that choice from the same source before later effects resume.
- Reshuffle progression can still add a Nation or Development card when discard starts empty; after that card is added, shuffle and continue the draw.
- Reshuffle must terminate safely if draw, discard, and all eligible progression sources are empty or unavailable.

When reshuffle is triggered:

1. If the player has cards in their Nation deck, take the next/top Nation card and put it in the discard pile. If this was the accession/state-changing card, flip or change the State card at the correct point. Move the tracking token from the State card onto the Nation deck, or into the Development area if the Nation deck has become empty.
2. If the player has no Nation deck cards left and has at least one card in Development area, they may pay the development cost of one face-up Development card they can afford. The chosen card goes to discard. Move the tracking token from State to Development area. If no remaining Development card is payable, no Develop occurs.
3. Shuffle discard to become the new draw deck.
4. Resolve "when you reshuffle" effects.
5. Continue drawing until the draw request or draw-up requirement is satisfied.

Important implementation consequences:

- Nation progression is deterministic and order-based.
- Development availability does not preempt a non-empty Nation deck; use the deterministic Nation/Accession step first unless a nation-specific rule explicitly replaces default Nation progression.
- Development progression is a player choice among visible, payable Development cards.
- Development choice can interrupt cleanup/draw-up and therefore needs pending-choice state.
- Development choices created by card effects are not reshuffle completions; resolving one should develop the selected card without requiring or placing the reshuffle tracking token, shuffling discard, drawing, or running reshuffle hooks.
- Unplayed cards still in Nation deck or Development area do not score at game end.
- Some nations may have no Nation deck, no Development area, or neither; the service must skip missing steps cleanly.

## Market And Card Gain

### Acquire

- Acquire selects a legal face-up market card unless an effect expands the eligible zone.
- Card effects that acquire from the market with suit/type/card criteria must use the matching eligible market cards, not default to the first slot.
- The acquired card moves to the destination specified by the effect, usually discard or hand depending on keyword/effect.
- Resources on the acquired market card are gained by the acquiring player.
- The Unrest tucked under an acquired market card is taken unless the acquisition rule says otherwise. Region cards should not have tucked Unrest.
- Refill the market slot from the correct source. If the relevant small deck is depleted, use the main deck/refill fallback.
- Newly refilled cards can become eligible for additional acquisitions in the same resolving effect when the effect allows multiple acquisitions.
- Cards with Acquire-triggered text trigger after they are acquired.
- Acquiring from Exile usually adds Unrest unless the acquired card is Unrest or a specific effect overrides it.

### Break Through

- The player first declares the requested suit when multiple suits are allowed.
- One path takes a matching face-up market card into hand, gains resources on it, and returns its tucked Unrest instead of taking it. If more than one market card matches, the choice must be explicit or otherwise deterministic by the relevant solo/bot tie-break rule.
- Another path takes from the matching face-down small deck.
- If the small deck is depleted or the suit has no small deck, reveal from the main deck until a matching card is found; take it and shuffle nonmatching revealed cards back. If no matching card can be found, including when the main deck is absent or unavailable, apply the fallback reward.
- Break-through behavior is not the same as Acquire; model it as a separate operation with shared refill helpers where appropriate, and do not trigger text that only fires when a card is Acquired.

### Take, Gain, Find, Draw

- Keep card-movement verbs distinct in the effect DSL. They often share movement mechanics but differ in source, destination, visibility, and whether Unrest/market refill side effects happen.
- Find normally searches hand, discard, draw deck, then Nation deck while excluding the accession card and shuffling searched draw/Nation decks afterward. Effects may explicitly restrict the searched sources or include play area and History; those non-default sources should be searched only when specified.
- Look effects reveal the requested cards to the looking player without moving them. If fewer eligible cards exist, reveal as many as possible. Look-only action text is playable only when the requested source has at least one eligible card to inspect. When looking at multiple cards from the same hidden deck, the player may return the looked cards in any order. When looking at the Nation deck, ignore the accession card unless it is the only card available; when looking at Fame, ignore the special bottom card unless it is the only Fame card available.
- "Gain a resource" adds a token from supply to a pool/card.
- "Gain a card" and "Take a card" should use keyword-specific movement rules, not generic add-to-hand shortcuts.
- Return a card moves the specified eligible Unrest card from the indicated player zone, usually hand or discard, back to the shared Unrest pile. Returning Unrest ignores the printed text on that Unrest card and does not use payment substitution.
- Place a card on top of the deck moves the selected card from hand by default, or from an explicitly indicated source such as discard, to the top of the player's draw deck.
- Give a card moves a selected card from the active player's hand to an opponent's hand. When multiple cards or opponents are legal, the engine must represent the player choice before resuming the remaining effect text.
- Swap exchanges an eligible player-owned card, usually from hand, with a matching-suited market card. "Matching-suited" means the Market card has at least one suit icon also present on the swapping card; card import should preserve additional printed suit icons as explicit suit metadata, currently represented by `suit:<name>` tags when one primary `suit` is not enough. Resources on the market card stay with the market slot and transfer onto the incoming card; Unrest tucked under the outgoing market card returns to the Unrest pile; a fresh Unrest is tucked under the incoming card unless that card is ineligible such as Unrest or Region. The outgoing market card moves to the source zone the swapping card came from, and multi-option swaps interrupt the effect list until the player chooses the exact pair.

## Resources And Payment

- Resource tokens in the player's resource pool can be paid. Resources on cards generally cannot be paid unless a rule explicitly permits it.
- Payment is a cost. If the player cannot pay, they cannot choose that action/ability/option.
- Payment conversion follows the rulebook hierarchy: when paying Materials, Progress and Goods may each be spent as 2 Materials with no change; when paying Population, Progress and Goods may each be spent as 1 Population; Progress and Goods costs must be paid directly. Materials and Population do not convert into each other by default.
- When more than one Progress/Goods substitution can satisfy a payment, the player-selected payment must be honored. Development choice, paid choice-option, direct Action, and Exhaust resolution accept an explicit payment selection so state-gated spend penalties and preserved resources match the physical rules.
- Removing, stealing, and returning resources are not the same as paying and must not use payment substitution unless explicitly allowed.
- Nation rules can react to the actual resources spent after substitution. For Alien Martians, every Progress token spent, including Progress spent as a substitute payment, causes that player to take one Unrest; converting Progress into another resource is not a payment and should not trigger this penalty.
- Resource tokens are not normally component-limited; the default game state treats omitted supply counts as unlimited. Optional shared supply counts are only for rule-defined finite pools, such as Practice mode's 12 Progress-token market churn pool. If a supply count is present, gaining or placing a resource token is capped by the remaining supply; spending, removing, or returning a resource sends that token back to supply.

## Card Text Resolution

- Resolve effects sentence-by-sentence in printed/data order.
- Costs resolve before benefits.
- Explicit top-level Pay costs gate the whole Action or Exhaust ability during legality checks; if the player cannot pay them, the move is not legal even when a later benefit would otherwise resolve.
- Choice groups require explicit player choice unless the choice is deterministic from legality.
- Choice options that include explicit costs must remain unresolved and unavailable when those costs cannot be paid; failed choice resolution should not clear the pending choice or leak partial effects.
- Any effect-created player choice interrupts the current effect list: effects after the choice do not resolve until the player resolves the pending choice, then the remaining effects resume in order. This applies to choose-one/optional choices and keyword choices such as Find, Acquire, Break through, Exile, Garrison, Recall/Abandon, Develop, and Trade, including choices created during reshuffle hooks, Solstice, and scoring hooks.
- Optional effects must be represented as optional. The non-skip branch of optional action text must still be legal/resolvable for that optional text to make the card playable; a skip-only optional path is not a playable effect by itself. Mandatory effects resolve as much as possible.
- Triggered responses can occur between sentences when the rules allow.
- State-gated phrases/options only resolve if the player's current State card shows the required symbol/state.
- Passive effects must be queryable by services they modify: market refill, resource placement, reshuffle, scoring, card movement, and damage/unrest handling.

## Play Area, Regions, Garrison, And History

- Cards in play remain available for persistent effects, exhaust abilities, Solstice, scoring, and region-style actions until moved.
- A bare Garrison keyword uses the source card itself as the host when that source is an eligible Region in play; garrisoning under a third unrelated card should be explicit in effect data.
- If a garrisoned card itself is targeted by Exile, History, Recall/Abandon-style movement, or a nation replacement effect, move only that garrisoned card and leave its host in play. Effects that target garrisoned children directly should use a garrison-specific source instead of the host's play-area source.
- Recalling a region returns it and its garrisoned cards to hand and moves resources on it to the player's pool.
- Abandoning a region moves it to discard unless an effect says otherwise, carries its garrisoned cards with it, and moves resources on it to the player's pool; only legal card types can be recalled/abandoned.
- When a card is removed from play to History, Exile, discard, or a nation-specific replacement zone, resources on that card move to the owning player's resource pool unless the effect explicitly says otherwise.
- Garrisoned cards are attached to a host card and move according to the host's movement rule.
- History is an owner-visible scored zone. Cards in History are normally out of future play but still count for scoring unless a specific rule says otherwise.
- Exile is public and can be targeted by effects. Acquiring from Exile has special Unrest implications.
- Exile can target any zone specified by the effect. Exiling a Market card moves that card to Exile only if it has no resource tokens, returns any tucked Unrest to the Unrest pile, then refills the market slot from the matching small deck, falling back to Main only when that deck is depleted, and tucks Unrest under the replacement when eligible. The Acquire/Break-through first-two-slot Main-deck exception does not apply to Exile. Exiling from a player-owned zone such as hand, discard, draw deck, play area, or History moves the chosen card into Exile without market refill or Unrest side effects; when exiling a play-area host, move its resources to the owner and move garrisoned cards with it. When an Exile effect names criteria instead of a specific card, the active player must choose one eligible card from the specified source before the effect list resumes.

## Solstice

- After all players finish a turn in round order, Solstice begins before the next round.
- Players resolve Solstice effects on their play area, Power card, and State card.
- Effects are simultaneous in ordinary cases. If order matters, resolve in turn order.
- A player with multiple simultaneous effects chooses their own resolution order when those effects can interact or create public choices such as Exile; independent resource gains can resolve automatically.
- Deck-manipulating Solstice effects such as Look, Draw, Draw-if-able, and Fame gain are order-sensitive when multiple Solstice cards are resolving for the same player, because the chosen order can change hidden deck order, pending choices, and scoring triggers.
- If a Solstice effect creates a player choice or other pending interruption, pause the Solstice sequence and resume from that exact point after the interruption resolves.
- End-of-Solstice effects resolve after that player's other Solstice effects.
- End-of-Solstice nation exceptions may remove cards after printed End-of-Solstice effects have resolved. For Martians, if the Reactor/nadir card is in play and the Alien State's resource condition is empty at End of Solstice, remove that card and the rest of the Nation deck from future play, then activate the Native side of the State card.
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
- Score Progress tokens in the player's resource pool at 1 victory point each. Materials, Population, Goods, and Unrest do not inherently score as resource-pool tokens. Tokens on cards do not score as resource-pool tokens unless a card or nation rule explicitly says otherwise.
- Nation rules may replace resource-pool scoring with a state-gated ratio, such as Alien Martians scoring Progress at 1 victory point per 3 Progress.
- Variable VP cards have the rulebook's cap unless a card/rule overrides it.
- Ties share victory unless a specific end condition provides a different tie-break.

Collapse:

- Collapse ends the game immediately without finishing the current action.
- Collapse scoring counts Unrest cards in hand, play area, draw deck, discard pile, and history, plus garrisoned cards attached to those zones, and uses lowest Unrest as the primary winner condition with the rulebook's tie handling. Resource-pool Unrest counters and cards still in the Nation deck, Development area, Exile, market, or Unrest pile do not count unless a nation/card rule explicitly says otherwise.
- Nation-specific immediate-win Collapse exceptions, such as a Cultist-style empty Chaos pile, are checked before ordinary Collapse scoring and before the solo Bot's default Collapse win.
- Collapse can interrupt multi-player Unrest distribution. If a single effect would give Unrest to multiple players but the pile is short, the active player or Solstice card owner chooses which recipients get the remaining Unrest before Collapse scoring is finalized.

## Fame Deck

- The special bottom Fame card remains unavailable until all cards above it are gone.
- Effects that look at, draw, gain, or return Fame cards must preserve the bottom-card rule. Player-facing gain/draw Fame effects route through the Fame service so the special bottom card resolves instead of moving to discard when no ordinary Fame remains.
- A Gain Fame action is only playable when at least one ordinary Fame card is available or the player is eligible to resolve the special bottom Fame card. A player who already resolved the special Fame card cannot spend an action on Fame-only text that would do nothing.
- Returned Fame cards go to the top unless a specific effect says otherwise.
- The special bottom Fame card starts Side A up. The first resolution flips it to Side B without triggering normal scoring. Each player may resolve either side only once total; a player who resolved Side A cannot resolve Side B. Resolving Side B flips the card face down and triggers normal scoring.
- Resolving the special bottom Fame card gives 6 Progress while the player's active State side matches the uncivilized/barbarian icon, or 3 Progress plus a free Develop while the active State side matches the civilized/empire icon. For a single two-sided State card, use the runtime active side rather than every icon printed on the card. Free Develop does not pay the Development cost, does not require a reshuffle tracking token, and does not place one.
- In solo, if the Bot would gain the special bottom Fame card, resolve the Bot-specific reward regardless of side showing: barbarian-side Bot gains 6 Progress; empire-side Bot gains 3 Progress and moves the top Dynasty card to the top of the Bot deck. This triggers scoring, and later Bot attempts to gain the special card do nothing.
- Bot table effects that gain Fame take ordinary face-down Fame cards onto the top of the Bot deck. If no ordinary Fame remains, the same effect resolves the special bottom Fame card through the Bot-specific King of Kings rule instead.
- Track per-player resolution of the special Fame card sides/eligibility.

## Solo And Bot Ruleset

- Solo bot logic should be a separate controller that consumes public state and table-driven rows.
- Bot has its own deck, discard, state, slots, and difficulty/campaign modifiers.
- Default Bot Dynasty setup uses the Bot nation's own card groups: shuffle Nation cards onto the top of the Dynasty deck, place the Accession card beneath them, then place Development cards beneath that sorted by Bot VP value from highest to lowest. Bot VP valuation treats fixed values literally, variable values as 5, conditional values as their best value, and negative values as negative. Nation-specific Bot setup overrides may replace this default order; placeholder/import data may still provide explicit `bot_dynasty` tags as a fallback when nation grouping is unavailable.
- Chieftain and Warlord use only Bot slots 1-4; Imperator and Sovereign use slots 1-5; Overlord and Supreme Ruler use slots 1-6.
- Chieftain, Warlord, and Imperator start the Bot with no resource tokens. Sovereign, Overlord, and Supreme Ruler start the Bot with 3 Materials, 2 Population, and 1 Progress; when Trade Routes is enabled, use 1 Goods instead of that starting Progress.
- Chieftain/Warlord resolve 3 or 4 Bot cards depending on whether a roll blocks a populated slot; Imperator/Sovereign resolve 4 or 5; Overlord/Supreme Ruler resolve 5.
- Warlord follows the Chieftain slot limit and, after Bot cleanup refills slots, discards the top card of the Bot deck if one remains.
- During Bot cleanup, place 1 Progress from supply on the Market card above the die-blocked unresolved slot. If the die roll has no corresponding Market slot, including a roll of 6, no cleanup Market token is placed.
- During Bot cleanup, when a slot refill needs a card and the Bot deck is empty, move the top Dynasty card to Bot discard, then shuffle Bot discard into a new Bot deck before continuing slot refill. This can repeat during the same cleanup, and emptying the Dynasty deck triggers normal Scoring.
- Nation-specific Bot cleanup exceptions are represented as Bot cleanup override effects and resolve after the default Bot cleanup movement/refill unless the nation override data replaces those steps more specifically.
- In solo, normal Scoring is triggered when the Bot Dynasty deck becomes empty, the Main deck becomes empty, or the Bot would gain the special bottom Fame card. These triggers start normal scoring timing rather than immediate score counting.
- In solo, Collapse is an immediate human loss regardless of the Bot's Unrest total, except for nation-specific overrides such as an empty Cultist Chaos pile.
- In Bot scoring, each Progress scores 1 VP. Below Sovereign, score 1 VP per 10 Materials/Population with each Goods counting as 5 toward that total. On Sovereign, Overlord, and Supreme Ruler, score 1 VP per 5 Materials/Population, and score Goods separately at 1 VP each.
- Bot-owned cards use the solo Bot VP valuation during final scoring: fixed VP is literal, variable VP is 5 unless imported data supplies a specific Bot value, conditional VP uses the higher/best imported value, and negative conditional-style cards can be worth 0 to the Bot when the rulebook says to ignore the penalty.
- Bot cards often resolve, move to discard, the bottom of the Bot deck, history, or trigger state changes according to table/card data.
- Bot face-down deck information is hidden; face-up slot/state information is visible.
- Bot Acquire and market Break through choose the eligible market card with the highest bot VP value, then the most total tokens on it, then the lowest-numbered slot. The gained card goes to the top of the Bot deck and market resource tokens enter the Bot resource pool. When Bot Acquire takes tucked Unrest, the acquired card is gained first and the Unrest card second, so the Unrest ends above the acquired card on top of the Bot deck. Market Break through returns tucked Unrest to the Unrest pile instead.
- Bot Acquire effects marked as including Exile may choose eligible exiled cards alongside market cards. Acquiring a non-Unrest card from Exile still Takes an Unrest card, and both cards are added to the top of the Bot deck in gained order.
- If Bot Break through has no eligible market card, it takes from the matching small deck when possible, then searches the Main deck for a matching suit while preserving nonmatching revealed order, and gains 2 Materials if no matching card exists. Bot table rows may then either top-deck the gained card, discard it, or resolve it immediately through the current Bot state table depending on the row instruction.
- Bot effects that resolve the top Bot deck or Dynasty deck card use the current Bot state table recursively. If the requested deck is empty, the Bot gains 2 Materials and does not reshuffle outside Clean-up.
- Bot effects that discard from the Bot deck or Dynasty deck move only currently available cards to the Bot discard and do not reshuffle or award fallback Materials when empty. Bot Unrest rows can return the revealed Unrest card to the shared Unrest pile instead of discarding it. Bot Return effects take the most recent matching discard card back to the shared pile; Bot Recall effects put the most recently played matching in-play card on top of the Bot deck.
- When resolving a Bot table card, skip a matching row if none of its effects or card-destination instructions can resolve. Destination-only movement such as putting the revealed card into History counts as resolved.
- Bot table effects whose bold text targets the human player route resource and Unrest effects to the solo human player. Choice-bearing human Abandon/Recall effects pause the Bot turn with a pending Region choice, then resume remaining Bot slots and cleanup after the human resolves that choice.
- With the Trade Routes module enabled, Bot Trade picks an available Trade Route card with fewer than 3 Goods, preferring the route with the most Goods, then Bot-owned routes over human routes, then the earliest route in the Trade Routes table. It adds 1 Goods to that route, gains the human-route reward when it chose the player's route, and resolves that route's table-driven Commerce effects. If no route is available, the Bot converts 1 Goods to 1 Progress where able; if it has no Goods, the Trade effect does not resolve and a Bot table row can fall through.
- Bot Trade Route triggers and end-of-turn Trade Routes rows resolve through the same Bot effect executor as Bot state table cards. End-of-turn Trade Routes use the first resolvable row matching the Bot's Merchant state by table priority, skipping rows whose effects cannot currently do anything so printed fallback rows can apply.
- Bot Trade Route Profit effects can move the most recent Bot discard card to the top of the Bot deck when the private table data specifies that route behavior.
- Bot Trade Route Profit effects can resolve the top Main deck card through the current Bot state table, with optional VP-value-gated follow-up effects for rows such as Welcoming. Emptying the Main deck this way triggers normal Scoring.
- Bot Trade Routes end-of-turn rows can require exact Bot resource payment before resolving follow-up effects. If the Bot cannot pay the full cost, or the paid follow-up cannot resolve, that row does not resolve and the table continues to the next applicable row with the payment refunded.
- Bot Trade Route Profit effects can gain resources based on the count of matching Bot in-play cards, such as Trans-Saharan Trade's Region-scaling Progress reward.
- Bot effect rows can encode table-driven if-unable fallbacks for effects such as return-from-discard, recall, acquire, break-through, and top-card discard; the fallback resolves only when the primary effect cannot do anything.
- Practice mode is a simplified solo variant and should be feature-flagged separately from full solo.
- Practice setup follows the special practice variant: after Market setup, Exile the top 15 Main deck cards, then track a 12-turn/12-Progress market-churn clock. Each cleanup places one of those Progress tokens on a player-chosen Market card, offers the optional Market Exile choice immediately afterward, then continues the remaining cleanup steps. The practice game scores immediately when the 12-turn clock expires, without the normal extra final round.
- Solo changes to multiplayer rules should live in a solo rules adapter, not scattered through core services.

## Options And Variants

- Trade Routes expansion is a module with its own deck/cards/timing and should remain feature-flagged.
- Card effect execution must receive the active expansion/variant context from every move path, so Trade Routes-only keywords are ignored when disabled and available for real resolution when enabled.
- With Trade Routes enabled, Trade Route cards stay in play after being played and resolve their Commerce effects immediately. A human Trade effect offers all available Trade Route cards with fewer than 3 Goods plus the Goods-for-Progress fallback when the player can pay it. Triggering your own route moves 1 Goods from your pool to the card and resolves that route's Commerce effects for you. Triggering an opponent's route adds 1 Goods from supply to that card, gives the active player 1 Progress, and resolves Commerce for the route owner. If no route is available, Trade may convert 1 Goods to 1 Progress. Trade-only action text is not playable when no route is available and the player has no Goods fallback. A completed route can use a Profit action by spending an available Action token, collecting its stored Goods to the owner, moving the route to discard unless the effect specifies another destination, and resolving its Profit effects.
- Lowered aggression, quick setup, precious cards, short game, practice mode, difficulty levels, and campaign mode are configuration options.
- Precious Cards prevents the voluntary cleanup discard choice entirely; players keep their hand through draw-up unless another explicit effect discards cards.
- In the short game variant setup, after Market setup exile the top 10 Main deck cards, then put the top 2 Nation deck cards into each player's discard unless a nation exception replaces that step. The short-game setup exceptions are: Atlanteans free-Develop one Development and remove another; Arthurians garrison one non-Graal impending Quest and add the top Nation card to the starting deck in addition to the normal 2-card advance; Inuit remove all starting Materials/Population/Progress/Goods and choose one Winter and one Summer card for discard; Martians remove 4 starting Progress; Polynesians turn one of the advanced Nation cards into mana at random. Short game is not suitable for Utopians or Cultists.
- In the short game variant, when an Accession card is added to discard, the player removes one Development card from the game, except Arthurians and Polynesians skip this step.
- In the short game variant, normal Scoring completes the current round and Solstice, then scores immediately; it does not add the usual final round.
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
