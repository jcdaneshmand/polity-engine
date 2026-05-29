# Web-mined Imperium card-data notes

These notes collect public, structural information that is useful for private manual transcription. Do not treat this as a complete card database, and do not copy official card text into committed files.

For the actual transcription pass, use `docs/card-transcription-workflow.md` and the local-only tracker at `private-card-data/manual-transcription-tracker.csv`.

## Best sources found

- Osprey gaming resources page: canonical downloads for rulebooks, errata, corrected cards, and civilisation spotlight PDFs.
  - https://www.ospreypublishing.com/us/discover/gaming-resources/board-card-games/
- Imperium Classics/Legends updated rulebook PDF:
  - https://www.ospreypublishing.com/media/twilvlpe/imp_rulebook_a_main_update1-0_bgg.pdf
- Imperium Horizons rulebook PDF:
  - https://www.ospreypublishing.com/media/1kmpbipw/imperium-horizons-rulebook.pdf
- Osprey common-card blog:
  - https://www.ospreypublishing.com/us/osprey-blog/2021/imperium-blog-common-cards/
- Osprey Horizons compatibility/replacement-card blog:
  - https://www.ospreypublishing.com/us/osprey-blog/2024/imperium-horizons-compatibility/
- Imperium Card Game Wiki, useful for navigation and public overview:
  - https://imperiumcardgame.fandom.com/wiki/Commons
  - https://imperiumcardgame.fandom.com/wiki/Category%3AImperium%3AClassics
  - https://imperiumcardgame.fandom.com/wiki/Category%3AImperium%3AHorizons

## Structural facts worth encoding

- Commons suits: Region, Tributary, Civilised, Uncivilised, Fame, Unrest, and Trade Route expansion cards.
- Market cards acquired from the market go to hand, not discard, which matters for `starting_location`, acquisition effects, and immediate playability tests.
- Civilised cards are gated by empire state. The card can be acquired before empire, but usually cannot be played until the state changes.
- Unrest is a shared collapse pressure resource and is not just another negative VP card. It should stay distinct in the schema and move rules.
- Classics and Legends each have 83 common cards. Public breakdown from the wiki: 9 Fame, 14 Region, 22 Uncivilised, 15 Civilised, 11 Tributary, 12 Unrest.
- Horizons has an optional Trade Routes expansion and new Goods economy. Some Horizons nations require Trade Routes.
- Horizons includes 49 replacement cards for Classics/Legends. Replacement card numbers retain the original reference with an added `X`, such as `1CAR2X/23` replacing a Carthaginian card and `2REG3X/14` replacing a Legends region card.
- Horizons compatibility updates add/adjust Ocean and Hunting Grounds icons and update some nation-deck regions, including Balearic Islands, Celtica, and Crete.

## Box / nation coverage

Private strategy CSV currently covers the expected 30 nations:

- Classics: Carthaginians, Celts, Greeks, Macedonians, Persians, Romans, Scythians, Vikings.
- Legends: Arthurians, Atlanteans, Egyptians, Mauryans, Minoans, Olmecs, Qin, Utopians.
- Horizons: Abbasids, Aksumites, Cultists, Guptas, Inuit, Japanese, Magyars, Martians, Mayans, Polynesians, Sassanids, Taino, Tang, Wagadou.

Useful public component counts:

- Classics: Carthaginians 23, Celts 28, Greeks 23, Macedonians 23, Persians 23, Romans 23, Scythians 24, Vikings 26, commons 83.
- Horizons searchable rulebook text reports 14 new civilisation decks and common piles with 9 Fame, 18 Civilised, 25 Uncivilised, 14 Region, 13 Tributary, 12 Unrest. Nation counts visible in public text include Abbasids 23, Aksumites 23, Cultists 29, Guptas 24, Inuit 25, Japanese 24, Magyars 27, Martians 29, Mayans 28, Polynesians 29, Sassanids 24, Taino 24, Tang 27, Wagadou 23.

## Public strategy/mechanics hooks by nation

Use these as checklist hints while manually transcribing, not as final card effects.

- Carthaginians: materials and market-control focus; puts materials on market cards; early region setup via Queen Dido; Caravans/Traders support direct market acquisition; empire path splits between trade/unrest export and military expansion.
- Celts: aggression and Unrest pressure; long-game development and extra shared Unrest handling are likely important.
- Greeks: market timing, city/metropolis synergies, and development flexibility.
- Macedonians: leader-driven acquisition; Phillip II and Alexander-style flexible market/region/tributary play; discard-zone play support likely matters.
- Persians: public comments suggest Tributary focus and region/card acquisition priorities.
- Romans: Fame and power-card timing appear strategically important; likely needs robust Fame and scoring hooks.
- Scythians: nomadic region synergy; Tents/Nomads replace usual Prosperity pattern; attack/defense hooks; Horizons gives some replacement-card buffs.
- Vikings: raider/aggressive identity; likely region, attack, and history/deck-thinning interactions.
- Egyptians: Nile/river region engine; recurring resource generation while young; Unification accession.
- Minoans: progress-resource focus; traders/architects; Minos as accession; development/resource tempo.
- Qin: population placed on market cards instead of progress; conquest/control of smaller nations; population economy.
- Atlanteans: starts as empire; no normal history pile, uses sunken pile/flooding replacement behavior.
- Aksumites: Trade Routes required; straightforward trader nation; Ocean-icon market relevance; Stelae helps manage unrest/deck thinning; empire choices around trade and coinage.
- Tang: Trade Routes required; population on market cards instead of progress; city/metropolis and Unrest tension.
- Sassanids: Trade Routes required; aggressive and intricate trader deck; cavalry/knight package; Western Silk Road theme.
- Mayans: complex Mesoamerican deck; masks/headpieces and early development exceptions.
- Cultists: very high-complexity alternate-state progression around ceremony/summoning; state path is not normal barbarian-to-empire.
- Martians: reverse progression; starts as empire/alien and can regress toward barbarian/native; needs custom state/progression hooks.

## Manual transcription priorities

1. Start with card IDs, source box, nation/set, card number, card name, suit, card type, state requirement, and starting location. These fields unlock validation without needing effect text.
2. Mark cards whose behavior needs engine hooks: custom state, custom progression, alternate history zone, replacement cards, Trade Routes, Goods, Fame, Collapse, solo bot, and market-resource placement.
3. For effects, first encode only safe generic ops already supported by the engine. Leave exact official text in `raw_effect_text_private` locally and gitignored.
4. Use `implemented=false,tested=false` until an effect is represented and covered by tests.
5. Treat Horizons replacement cards as overrides/replacements, not duplicate independent cards. Preserve both the original reference and replacement reference in notes while deciding canonical IDs.

## Suggested local private workflow

1. Generate `private-card-data/imperium_cards_private.csv` from `card-data-template.csv`.
2. Enter rows in three passes: identities first, setup/deck placement second, effects third.
3. Run `cards:validate` after each batch.
4. Once cards exist, create `imperium_nations_private.csv` so private cards and nations can be imported together.
5. Run `private:import-all`; runtime now auto-uses generated private replacements when `generated-private/cards.normalized.json` and `generated-private/nations.normalized.json` both exist.
