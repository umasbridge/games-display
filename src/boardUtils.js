import { parseBiddingFromLin } from './HandDiagram.jsx';

const IMP_TABLE = [
  [0,10,0],[20,40,1],[50,80,2],[90,120,3],[130,160,4],[170,210,5],
  [220,260,6],[270,310,7],[320,360,8],[370,420,9],[430,490,10],
  [500,590,11],[600,740,12],[750,890,13],[900,1090,14],[1100,1290,15],
  [1300,1490,16],[1500,1740,17],[1750,1990,18],[2000,2240,19],
  [2250,2490,20],[2500,2990,21],[3000,3490,22],[3500,3990,23],[4000,Infinity,24],
];

export function scoreToImps(swing) {
  const abs = Math.abs(swing);
  const sign = swing >= 0 ? 1 : -1;
  for (const [lo, hi, imp] of IMP_TABLE) {
    if (abs >= lo && abs <= hi) return sign * imp;
  }
  return sign * 24;
}

function isVul(side, vulnerability) {
  if (vulnerability === 'both') return true;
  if (vulnerability === 'none') return false;
  return vulnerability === side;
}

function computeScore(level, denom, tricks, vul, isMinor) {
  const needed = level + 6;
  if (tricks < needed) return 0;
  const ot = tricks - needed;
  let ts, otv;
  if (isMinor) { ts = level * 20; otv = 20; }
  else if (denom === 'NT') { ts = 40 + (level - 1) * 30; otv = 30; }
  else { ts = level * 30; otv = 30; }
  const isGame = ts >= 100;
  let score = ts + ot * otv;
  if (level === 7) score += vul ? 1500 : 1000;
  else if (level === 6) score += vul ? 750 : 500;
  if (isGame) score += vul ? 500 : 300;
  else score += 50;
  return score;
}

function bestDDScore(board, side, vul) {
  const dirs = side === 'ns' ? ['n', 's'] : ['e', 'w'];
  const denoms = [
    { key: 'c', minor: true },
    { key: 'd', minor: true },
    { key: 'h', minor: false },
    { key: 's', minor: false },
    { key: 'nt', minor: false },
  ];
  let best = 0;
  for (const { key, minor } of denoms) {
    let maxTricks = 0;
    for (const dir of dirs) {
      const t = board[`dd_${dir}_${key}`];
      if (t != null && t > maxTricks) maxTricks = t;
    }
    if (maxTricks < 7) continue;
    const maxLevel = maxTricks - 6;
    for (let level = 1; level <= maxLevel; level++) {
      const sc = computeScore(level, key === 'nt' ? 'NT' : key.toUpperCase(), maxTricks, vul, minor);
      if (sc > best) best = sc;
    }
  }
  return best;
}

function isSuboptimalTeam(open, closed, board, teamId) {
  for (const result of [open, closed]) {
    const ourSide = result.ns_participant_id === teamId ? 'ns' : 'ew';
    const vul = isVul(ourSide, board.vulnerability);
    const ddBest = bestDDScore(board, ourSide, vul);
    const actualScore = ourSide === 'ns' ? result.score : -result.score;
    if (ddBest > 0 && actualScore < ddBest) return true;
  }
  return false;
}

function isSuboptimalPair(result, board, pairId) {
  const ourSide = result.ns_participant_id === pairId ? 'ns' : 'ew';
  const vul = isVul(ourSide, board.vulnerability);
  const ddBest = bestDDScore(board, ourSide, vul);
  const actualScore = ourSide === 'ns' ? result.score : -result.score;
  return ddBest > 0 && actualScore < ddBest;
}

function hasDefenderBidHigh(result) {
  if (!result?.lin) return false;
  const declarer = result.declarer;
  if (!declarer) return false;
  const declarerSide = (declarer === 'N' || declarer === 'S') ? 'NS' : 'EW';
  const parsed = parseBiddingFromLin(result.lin);
  if (!parsed) return false;
  const dealerMatch = result.lin.match(/md\|(\d)/);
  if (!dealerMatch) return false;
  const dealerIdx = parseInt(dealerMatch[1]);
  const dirOrder = ['S', 'W', 'N', 'E'];
  let currentDirIdx = dealerIdx - 1;
  for (const { bid } of parsed) {
    const dir = dirOrder[currentDirIdx % 4];
    const side = (dir === 'N' || dir === 'S') ? 'NS' : 'EW';
    if (side !== declarerSide && bid.length >= 2 && bid !== 'XX') {
      const level = parseInt(bid[0]);
      if (!isNaN(level) && level >= 3) return true;
    }
    currentDirIdx++;
  }
  return false;
}

export function buildTeamRows(boards, results, filters) {
  const boardMap = {};
  for (const b of boards) boardMap[b.id] = b;

  const sorted = [...results].sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const groups = {};
  for (const r of sorted) {
    if (!r.match_id) continue;
    const key = `${r.board_id}__${r.match_id}__${r.round || ''}`;
    if (!groups[key]) groups[key] = {};
    if (r.room === 'open') groups[key].open = r;
    else if (r.room === 'closed') groups[key].closed = r;
  }

  let pairs = Object.values(groups).filter(g => g.open && g.closed);

  if (filters.match_keys?.length) {
    const keySet = new Set(filters.match_keys);
    pairs = pairs.filter(({ open }) =>
      keySet.has(`${open.board_id}__${open.match_id}__${open.round || ''}`)
    );
  }

  const pid = filters.participant_id;
  if (pid) {
    pairs = pairs.filter(({ open, closed }) =>
      open.ns_participant_id === pid || open.ew_participant_id === pid ||
      closed.ns_participant_id === pid || closed.ew_participant_id === pid
    );
  }

  const activeFilters = filters.active_filters || [];

  const withImps = pairs.map(pair => {
    let ourImps = null;
    if (pid) {
      const openOurs = pair.open.ns_participant_id === pid;
      const openScore = openOurs ? (pair.open.score || 0) : -(pair.open.score || 0);
      const closedOurs = pair.closed.ns_participant_id === pid;
      const closedScore = closedOurs ? (pair.closed.score || 0) : -(pair.closed.score || 0);
      ourImps = scoreToImps(openScore + closedScore);
    }
    return { ...pair, ourImps };
  });

  let filtered = withImps;

  if (activeFilters.length > 0) {
    filtered = withImps.filter(({ open, closed, ourImps }) => {
      const board = boardMap[open.board_id];

      for (const f of activeFilters) {
        if (f === 'diff_contract') {
          if (open.contract_level === closed.contract_level &&
              open.contract_denom === closed.contract_denom) return false;
        }
        if (f === 'same_contract_down') {
          if (!(open.contract_level === closed.contract_level &&
              open.contract_denom === closed.contract_denom &&
              ((open.overtricks >= 0 && closed.overtricks < 0) ||
               (open.overtricks < 0 && closed.overtricks >= 0)))) return false;
        }
        if (f === 'game_both_tables') {
          if (!((open.contract_level || 0) >= 4 && (closed.contract_level || 0) >= 4)) return false;
        }
        if (f === 'defender_bid_high') {
          if (!(hasDefenderBidHigh(open) || hasDefenderBidHigh(closed))) return false;
        }
        if (f === 'imp_loss') {
          const threshold = filters.imp_threshold || 5;
          if (ourImps !== null) {
            if (Math.abs(ourImps) <= threshold) return false;
          } else {
            const maxImp = Math.max(Math.abs(open.imps_ns || 0), Math.abs(closed.imps_ns || 0));
            if (maxImp <= threshold) return false;
          }
        }
        if (f === 'suboptimal' && board && pid) {
          if (!isSuboptimalTeam(open, closed, board, pid)) return false;
        }
      }
      return true;
    });
  }

  filtered.sort((a, b) => {
    const ra = a.open.round || 0;
    const rb = b.open.round || 0;
    if (ra !== rb) return ra - rb;
    const ba = boardMap[a.open.board_id]?.board_number || 0;
    const bb = boardMap[b.open.board_id]?.board_number || 0;
    if (ba !== bb) return ba - bb;
    if (a.open.board_id < b.open.board_id) return -1;
    if (a.open.board_id > b.open.board_id) return 1;
    if (a.open.match_id < b.open.match_id) return -1;
    if (a.open.match_id > b.open.match_id) return 1;
    return 0;
  });

  let rows = filtered.map(({ open, closed, ourImps }) => {
    let ours = open;
    let theirs = closed;
    if (pid) {
      const ourInOpen = open.ns_participant_id === pid || open.ew_participant_id === pid;
      if (!ourInOpen) {
        ours = closed;
        theirs = open;
      }
    }
    return {
      board: boardMap[open.board_id],
      result: ours,
      otherRoom: theirs,
      ourImps,
    };
  });

  if (!pid) {
    const seen = {};
    rows = rows.filter(r => {
      const bid = r.board?.id;
      if (!bid) return true;
      if (seen[bid]) return false;
      seen[bid] = true;
      return true;
    });
  }

  for (const row of rows) {
    const b = row.board;
    row.displayBoardNumber = b?.round != null ? `R${b.round}B${b.board_number}` : (b?.board_number ?? null);
  }

  return rows;
}

export function buildPairRows(boards, results, filters) {
  const boardMap = {};
  for (const b of boards) boardMap[b.id] = b;

  let filtered = [...results].sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const pid = filters.participant_id;
  if (pid) {
    filtered = filtered.filter(r =>
      r.ns_participant_id === pid || r.ew_participant_id === pid
    );
  }

  const activeFilters = filters.active_filters || [];

  if (activeFilters.length > 0) {
    filtered = filtered.filter(r => {
      const board = boardMap[r.board_id];

      for (const f of activeFilters) {
        if (f === 'low_pct') {
          const threshold = filters.pct_threshold || 40;
          const maxMp = (r.mp_ns || 0) + (r.mp_ew || 0);
          const pct = maxMp > 0 ? ((r.mp_ns || 0) / maxMp) * 100 : 50;
          const ourPct = pid && r.ew_participant_id === pid
            ? (maxMp > 0 ? ((r.mp_ew || 0) / maxMp) * 100 : 50)
            : pct;
          if (ourPct >= threshold) return false;
        }
        if (f === 'suboptimal' && board && pid) {
          if (!isSuboptimalPair(r, board, pid)) return false;
        }
      }
      return true;
    });
  }

  const stageIds = filters.stage_ids || [];
  const multiSession = stageIds.length > 1;
  const stageIndex = {};
  const stageLabel = {};
  if (multiSession) {
    stageIds.forEach((sid, i) => { stageIndex[sid] = i + 1; });
    const sels = filters.selections || [];
    const uniqueTournaments = new Set(sels.map(s => s.tournament_id));
    const uniqueEvents = new Set(sels.map(s => s.event_id));
    for (const sel of sels) {
      let label = sel.stage_name || `S${stageIndex[sel.stage_id] || ''}`;
      if (uniqueEvents.size > 1) {
        label = `${sel.event_name} - ${label}`;
      }
      if (uniqueTournaments.size > 1) {
        const dateMatch = sel.tournament_name?.match(/(\d{4}-\d{2}-\d{2})/);
        const dateShort = dateMatch ? dateMatch[1].slice(5) : '';
        label = dateShort ? `${dateShort} ${label}` : label;
      }
      stageLabel[sel.stage_id] = label;
    }
  }

  filtered.sort((a, b) => {
    const sa = stageIndex[boardMap[a.board_id]?.stage_id] || 0;
    const sb = stageIndex[boardMap[b.board_id]?.stage_id] || 0;
    if (sa !== sb) return sa - sb;
    const ra = a.round || 0;
    const rb = b.round || 0;
    if (ra !== rb) return ra - rb;
    const ba = boardMap[a.board_id]?.board_number || 0;
    const bb = boardMap[b.board_id]?.board_number || 0;
    return ba - bb;
  });

  const rows = filtered.map(r => {
    const board = boardMap[r.board_id];
    return {
      board,
      result: r,
      otherRoom: null,
      displayBoardNumber: board?.round != null ? `R${board.round}B${board.board_number}` : (board?.board_number ?? null),
    };
  });

  if (pid) {
    const byBN = {};
    for (const db of rows) {
      const bn = db.board?.board_number;
      const rnd = db.board?.round;
      if (bn == null) continue;
      const key = rnd != null ? `${rnd}:${bn}` : `${bn}`;
      (byBN[key] = byBN[key] || []).push(db);
    }

    const pairedRows = [];
    let anyPaired = false;

    for (const dbs of Object.values(byBN)) {
      if (dbs.length === 2) {
        const [a, b] = dbs;
        const aSide = a.result?.ns_participant_id === pid ? 'ns' : 'ew';
        const bSide = b.result?.ns_participant_id === pid ? 'ns' : 'ew';
        const aOpp = aSide === 'ns' ? a.result?.ew_participant_id : a.result?.ns_participant_id;
        const bOpp = bSide === 'ns' ? b.result?.ew_participant_id : b.result?.ns_participant_id;

        if (aSide !== bSide && aOpp === bOpp) {
          anyPaired = true;
          const nsDb = aSide === 'ns' ? a : b;
          const ewDb = aSide === 'ew' ? a : b;
          const nsScore = nsDb.result?.score || 0;
          const ewScore = ewDb.result?.score || 0;
          const ourImps = scoreToImps(nsScore - ewScore);
          pairedRows.push({
            board: nsDb.board,
            result: nsDb.result,
            otherRoom: ewDb.result,
            ourImps,
            matchOpponentId: aOpp,
            displayBoardNumber: nsDb.board?.board_number ?? null,
          });
          continue;
        }
      }
      for (const db of dbs) pairedRows.push(db);
    }

    if (anyPaired) return pairedRows;
  }

  return rows;
}
