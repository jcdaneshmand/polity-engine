# Legal Content Boundary

This repository is an original prototype scaffold only.

## Hard boundaries
- Do **not** include official card names, official card text, faction names, logos, trademarks, art, rulebook language, or branding from any published game.
- Use only original placeholder civilizations, resources, cards, and effects.
- Keep card JSON and UI text generic and non-infringing.

## Intended use
- Build a reusable engine and interface that could support licensed content later.
- Treat this as neutral technical infrastructure, not a copy of any specific product.

## Contributor guidance
When adding data or UI copy:
1. Write original names/text.
2. Avoid references to known franchises or proprietary lore.
3. Keep mechanics descriptions abstract and implementation-focused.

## Public/stream-safe release criteria
A build is safe for stream/public release only if all of the following are true:
1. No private/proprietary card names or text are committed.
2. `privateName` and `rawEffectTextPrivate` are protected behind the single canonical UI guard in `app/src/ui/debug/privateCardDebug.ts`.
3. The debug gate (`VITE_SHOW_PRIVATE_CARD_DEBUG`) is disabled for release/public deployments.

## Debug toggle verification before release
Before cutting a release or sharing a public stream/demo:
1. Verify production/public env config does not set `VITE_SHOW_PRIVATE_CARD_DEBUG=true`.
2. Verify private field render points route through the canonical guard (`rg "privateName|rawEffectTextPrivate" app/src/ui`).
3. Run a manual smoke check using a non-debug build and confirm private fields are not displayed.
