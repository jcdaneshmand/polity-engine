# Fictional Regression Fixtures

This directory contains fictional public-safe data for Polity Engine regression testing.

The fixtures must not contain official card names, official rules text, official nation names, decklists, scans, images, or generated private data. They are designed to exercise engine contracts through invented cards and nations that use the same normalized data shape as local imports.

Coverage goals:
- setup with two fictional nations
- Market, Small deck, Main deck, Fame, Unrest, History, Exile, and Development zones
- costs, resources, Action tokens, Exhaust tokens, pending choices, cleanup, Solstice, scoring, and Collapse
- Trade Routes, Practice, solo Bot, campaign, and short-game option surfaces
- import-like data shape without requiring private transcription files
