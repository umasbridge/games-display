# DealPlay — Spec

`DealPlay` is exported from `games-display` and consumed by `bsd-games/components/GameAnalysis.jsx` (play route).

---

## Entry point / call chain

1. User clicks **Play** on an analysis in `AnalysisList`
2. `PlayerPickerDialog` opens:
   - If participant has a named roster → user picks their player name + carding preferences
   - If no roster → falls through to `DirectionPickerDialog` (N/S/E/W)
3. `onPlay` fires with a `playSet` object; `GameAnalysis` switches to the `play` route and renders `DealPlay`

---

## Props

| Prop | Type | Notes |
|------|------|-------|
| `supabase` | Supabase client | |
| `playSet` | object | See below |
| `userId` | string | Not yet used inside DealPlay |
| `onBack` | `() => void` | |
| `DiscussionView` | component | Not yet wired inside DealPlay |

**`playSet` shape**

| Field | Type | Source |
|-------|------|--------|
| `name` | string | `analysis.name` |
| `analysis` | object | Full `bsd_game_analyses` row, joined `bg_events` → `bg_tournaments` |
| `player` | string \| null | Selected player name from roster; null if direction was chosen instead |
| `direction` | `'N'\|'S'\|'E'\|'W'\|null` | Set only when no roster exists |
| `cardingNS` | `'UDCA'\|'STD'` | Default `'UDCA'` |
| `cardingEW` | `'UDCA'\|'STD'` | Default `'UDCA'` |

---

## Data fetching (on mount, keyed to `analysis.id`)

1. **Stage IDs** — resolves from `filters.stage_ids` → `filters.stage_id` → all stages for the event
2. **Boards** — `bg_boards` for those stage IDs, ordered by `board_number`
3. **Results** — `bg_board_results` for those stage IDs, paginated in 1000-row chunks
4. **Participants** — `bg_participants` for the event(s); handles multi-event via `filters.selections`
5. **Fresh filters** — re-fetches `bsd_game_analyses.filters` to pick up latest `play_progress`

On completion: restores `currentIdx` and `playedResults` from `play_progress`.

---

## Display rows

`buildPairRows` or `buildTeamRows` (from `boardUtils.js`) produce the ordered row array based on `event.type === 'teams'`.

Each row:
```js
{
  board,              // bg_boards record
  result,             // "our room" bg_board_results record
  otherRoom,          // other room result (teams only, or paired-session pairs)
  ourImps,            // pre-computed IMPs (teams / paired sessions)
  displayBoardNumber  // e.g. "R2B7" or plain board number
}
```

Rows are filtered by `filters.active_filters` and `filters.participant_id` inside the build functions.

---

## Player / direction resolution

Priority per board (inside `PlayBoardRow`):

1. `selectedPlayer` set → match `result.player_{n,s,e,w}_name` case-insensitively → resolved compass direction
2. Match fails but `ourParticipantId` set → fall back to NS/EW participant ID
3. `playSet.direction` set (no roster) → use directly
4. None → `null` (all four hands visible)

If `selectedPlayer` is null AND a roster exists AND no `direction` → DealPlay renders an **inline player picker** rather than boards.

---

## Board navigation

- Prev/Next buttons step through `displayRows`
- `visitedIdxs` tracks which boards have been rendered. All visited boards stay mounted with `display:none` to prevent IPS player re-initialization on navigation.

---

## Per-board lifecycle (`PlayBoardRow`)

Each row renders a `PlayBoard` (IPS player) with a `mode` state:

| Mode | Description |
|------|-------------|
| `'play'` | Initial — live play via IPS |
| `'view'` | After completion, or toggled back from dd-play |
| `'dd-play'` | Double-dummy play mode |

**`boardResult`** passed to `PlayBoard` includes standard result fields plus:

| Field | Value |
|-------|-------|
| `lin` | Normalized: `mb\|ap\|` → `mb\|p\|mb\|p\|mb\|p\|` (IPS compatibility) |
| `player_{n,s,e,w}_name` | From result; falls back to participant roster names if absent |
| `completion_user_side` | `'NS'` or `'EW'` |
| `completion_other_score` | Other room score from our side's perspective (teams / paired sessions) |
| `completion_scoring` | `'IMP'` or `'MP'` |
| `completion_traveller_scores` | Array of scores from our side's perspective (pairs only) |
| `completed_result` | Saved completion object (replayed on revisit) |

In `view` / `dd-play` modes, completion fields are stripped before passing to IPS so the player starts fresh.

**On `onComplete`**: completion is stored in `playedResults[board.id]`, mode switches to `'view'`.

---

## Popups

Both rendered as `DraggablePlayPopup` — fixed-position, draggable, z-index 50.

| Popup | Trigger | Content |
|-------|---------|---------|
| Traveller | Available only after board is completed | `TravellerTable` for the board; highlights our participant |
| My Results | Always available | Table of all completed boards: board#, contract, score, MP%/IMPs; footer shows running overall |

---

## Progress persistence

- Saved to `bsd_game_analyses.filters.play_progress` with a **1500 ms debounce** on every change to `currentIdx` or `playedResults`
- Shape: `{ currentIdx, playedResults }`
- `playedResults` keyed by `board.id`; each value is the IPS completion object extended with `boardNumber`, including: `level`, `denomCode`, `doubled`, `declarer`, `resultText`, `score`, `imps`, `mpPercent`

---

## Scoring

| Context | Comparison shown |
|---------|-----------------|
| Teams event, or `scoring` contains `'imp'` | IMPs |
| Pairs event without IMP scoring | MP% |

My Results overall: cumulative IMPs or average MP% across all completed boards.
