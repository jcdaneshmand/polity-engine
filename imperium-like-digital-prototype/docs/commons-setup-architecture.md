# Commons Setup Architecture

This subsystem is metadata-driven and determines which placeholder Commons cards enter play.

- **Commons set selection**: only `ownership="commons"` cards from the selected `commonsSetId` are candidates.
- **Player-count filtering**: `playerCountRequirement` gates candidates by effective Commons player count.
- **Solo/practice handling**: solo/practice use effective Commons setup at 2 players.
- **Trade Routes filtering**: `requiredExpansions`, `excludedExpansions`, and `commonsGroup` (`trade_routes`) enforce expansion legality.
- **Lowered Aggression**: delayable/aggressive attack cards are excluded from initial market setup and shuffled into the main deck afterward.
- **Quick Setup path**: uses combined deck construction while preserving all card legality filters.
- **Default path**: uses suit/banner-separated setup piles and a remainder main deck.
- **Replacement policy**: conflicting cards can be substituted with replacement-group-compatible legal cards.
- **Nation-name conflicts**: metadata (`conflictsWithNationIds`) removes clashing Commons cards for selected nations.

Metadata-driven setup is required so card inclusion behavior can be changed via data import without hardcoding card identities or official card text in source.
