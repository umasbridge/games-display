# games-display

Reusable composition layer for bridge game View and Play screens.

This package owns presentation and delegates domain actions through callbacks.
It has no database dependency. Hosts such as `bsd-games` remain responsible for
loading boards/results and implementing Traveller, Analysis, and Notes.

Exports:

- `HandDiagram` — finalized board View layout
- `PlayBoard` — finalized interactive Play layout
- `BiddingTable` — reusable auction rendering
- `ReplayModal` — recorded-play presentation

