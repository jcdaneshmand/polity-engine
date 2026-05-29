# Rules Engine Compliance Checklist

Use this checklist before opening any PR that changes engine logic, data, or rules docs.

Primary reference: `docs/rules-engine-notes.md`.
External reference: the public Imperium: Horizons rulebook PDF. Do not copy official prose or card text into this repo.

## Required checks

- [ ] **Legal boundary:** No official card text, art, logos, faction names, or rulebook wording added.
- [ ] **Original data only:** Any new cards/civs/resources are original placeholder content.
- [ ] **Card IDs in zones:** Runtime zones store string IDs, not full card objects.
- [ ] **Visibility:** Hidden zones expose counts only; Development area and public piles expose face-up card IDs.
- [ ] **Determinism:** New randomness is routed through boardgame.io random APIs when in move resolution.
- [ ] **Move signatures:** boardgame.io moves use the current callback shape (`{ G, ctx, events, random }`, then args).
- [ ] **Turn lifecycle:** End-turn behavior advances framework turn state (not just local state mutation).
- [ ] **Draw safety:** Draw loops terminate when no cards are drawable.
- [ ] **Draw-if-able safety:** Draw-if-able effects never trigger reshuffle.
- [ ] **Nation progression:** Reshuffle adds the top Nation card deterministically before shuffling discard.
- [ ] **Development progression:** After Nation deck exhaustion, reshuffle offers a payable face-up Development card choice and places the chosen card in discard.
- [ ] **State/accession timing:** State flip/token movement happens in the reshuffle step required by the rules contract.
- [ ] **Market gain semantics:** Acquire and Break through remain separate operations with correct Unrest/resource/refill side effects.
- [ ] **Payment semantics:** Payment, removal, stealing, and resource gain are modeled as distinct operations.
- [ ] **Effect runner constraints:** Costs/effects handling remains explicit and data-driven; unsupported ops fail clearly.
- [ ] **Solstice/endgame:** Changes that can affect round boundaries, scoring, collapse, or Fame deck timing update tests and notes.
- [ ] **State-model consistency:** Changes stay aligned with vocabulary and milestone direction in `rules-engine-notes.md`.
- [ ] **High-risk areas reviewed:** Consider reshuffle timing, market refill source logic, garrison movement, payment substitution, hidden info, and endgame interrupt implications.

## PR notes requirement

In PR descriptions for engine changes, include a brief "Rules Notes Alignment" section describing which checklist items were touched and how they were satisfied.
