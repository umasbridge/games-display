# DealView — Spec

`DealView` is exported from `games-display` and consumed by `bsd-games/components/GameAnalysis.jsx` (view route). Renders all boards in an analysis as a scrollable read-only list.

---

## Entry point

`GameAnalysis` switches to the `view` route when the user clicks **View** on an analysis in `AnalysisList`, passing the full analysis record.

---

## Props

| Prop | Type | Notes |
|------|------|-------|
| `supabase` | Supabase client | |
| `analysis` | object | Full `bsd_game_analyses` row, joined `bg_events` → `bg_tournaments` |
| `userId` | string | Used for notes ownership and unread tracking |
| `onBack` | `() => void` | |
| `DiscussionView` | component | Injected from bsd-app; renders the notes panel |

---

## Data fetching (keyed to `analysis.id`)

Two paths depending on `filters.board_ids`:

**Smart Query path** (`filters.board_ids` present): fetches boards and results directly by board IDs — bypasses stages.

**Stage path** (default): resolves stage IDs from `filters.stage_ids` → `filters.stage_id` → all stages for the event, then fetches boards and results.

In both paths, participants are fetched in parallel. Results are paginated in 1000-row chunks.

A separate effect fetches unread notes counts via `get_game_notes_unread` RPC, keyed by `${analysisId}:${boardId}`.

---

## Scoring

`eventScoring` resolves in priority order: `filters.event_scoring` → matching `filters.selections[].event_scoring` → `event.scoring`.

`isImpPairs` detected per board: scoring key contains `'imp'` or `'butler'`, or any board result has `imps_ns` set or negative MP values.

---

## Display rows

`buildTeamRows` or `buildPairRows` (from `boardUtils.js`) based on `event.type`. If `isTeams` but `buildTeamRows` returns empty, falls back to `buildPairRows`.

`effectiveIsTeams` = `isTeams` OR any row has `otherRoom` — handles paired pair sessions.

`displayBoards` adds `boardNumber` (display label) and `boardResults` (all results for the board, filtered to the relevant match if `filters.match_keys` is set).

---

## Board layout

**Match-grouped** — when any board has `matchOpponentId` (paired pair sessions): boards grouped by opponent with a header showing match number, opponent name, and total IMPs.

**Flat list** — all other cases.

---

## Header subtitle

| Condition | Subtitle |
|-----------|----------|
| `filters.board_ids` set | `{query_label \| 'Smart query'} · N boards` |
| `filters.stage_ids.length > 1` | `N stages · N boards` |
| Default | `{tournament.name} · N boards` |

---

## Per-board rendering (`renderBoard`)

Each board renders `HandDiagram` with three optional popup triggers:

| Popup | Trigger condition | Content |
|-------|------------------|---------|
| Traveller | `boardResults.length > 1` | `TravellerTable` for all results on the board |
| OtherRoom | Teams with `otherRoom` | `HandDiagram` of the other room result |
| Notes | Always (when `supabase` present) | Per-board discussion |

`activePopup` is a single `{ boardId, type }` in `DealView` state — only one popup open at a time across all boards.

---

## HandDiagram

The full board card. Shows hands, bidding, compass/vul, contract+score overlay, other room block, and button row. Also owns the view ↔ DD play toggle (`ddPlaying` local state) — no `onComplete`, no completion tracking. See `HandDiagram` source for details.

---

## Notes

On first open: looks up or creates a `discussions` row with `resource_type = 'game_board'`, `resource_id = '{analysisId}:{boardId}'`. Adds current user and all `filters.shared_with` users as `discussion_members`. Cached in `notesDiscussions` map (keyed by `boardId`) — subsequent opens reuse it.

Unread badge: set from RPC on mount, cleared locally when the panel opens.

Renders `DiscussionView` (from bsd-app) if provided, otherwise falls back to `NotesPopupFallback` — a basic inline chat UI.

---

## Popup layout

Both `TravellerPopup` and `NotesPopup` are draggable:
- **Desktop (md+)**: fixed panel anchored to the right edge; draggable to reposition
- **Mobile**: full-screen overlay
