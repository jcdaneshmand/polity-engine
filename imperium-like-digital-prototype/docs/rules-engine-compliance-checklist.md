# Rules Engine Compliance Checklist

Use this checklist before opening any PR that changes engine logic, data, or rules docs.

Primary reference: `docs/rules-engine-notes.md`.

## Required checks

- [ ] **Legal boundary:** No official card text, art, logos, faction names, or rulebook wording added.
- [ ] **Original data only:** Any new cards/civs/resources are original placeholder content.
- [ ] **Card IDs in zones:** Runtime zones store string IDs, not full card objects.
- [ ] **Determinism:** New randomness is routed through boardgame.io random APIs when in move resolution.
- [ ] **Move signatures:** boardgame.io moves use the current callback shape (`{ G, ctx, events, random }`, then args).
- [ ] **Turn lifecycle:** End-turn behavior advances framework turn state (not just local state mutation).
- [ ] **Draw safety:** Draw loops terminate when no cards are drawable.
- [ ] **Effect runner constraints:** Costs/effects handling remains explicit and data-driven; unsupported ops fail clearly.
- [ ] **State-model consistency:** Changes stay aligned with vocabulary and milestone direction in `rules-engine-notes.md`.
- [ ] **High-risk areas reviewed:** Consider reshuffle timing, market refill source logic, garrison movement, and endgame interrupt implications.

## PR notes requirement

In PR descriptions for engine changes, include a brief "Rules Notes Alignment" section describing which checklist items were touched and how they were satisfied.
