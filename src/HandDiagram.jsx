import { useRef, useState } from 'react';
import { IpsPlayer } from 'ips';

const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_CLR = { S: '#000', H: '#c62828', D: '#c62828', C: '#2e7d32' };

function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      position: 'absolute', top: -7, right: -7,
      background: '#dc2626', color: '#fff', borderRadius: 9,
      fontSize: '0.6rem', fontWeight: 700, lineHeight: '14px',
      minWidth: 14, height: 14, padding: '0 3px', textAlign: 'center',
      boxSizing: 'border-box', pointerEvents: 'none',
    }}>{count > 99 ? '99+' : count}</span>
  );
}

export default function HandDiagram({ board, result, otherRoom, participantMap, ourParticipantId, onOtherRoom, onTraveller, onNotes, notesLoading, notesUnread, isTeams, boardNumber, isImpPairs }) {
  const ipsControllerRef = useRef(null);
  const [ddPlaying, setDdPlaying] = useState(false);
  const vul = board.vulnerability;
  const invalidLead = result && hasInvalidOpeningLead(result);
  const nsTeamName = isTeams ? participantMap?.[result?.ns_participant_id]?.name : null;
  const ewTeamName = isTeams ? participantMap?.[result?.ew_participant_id]?.name : null;
  const nsParticipant = participantMap?.[result?.ns_participant_id];
  const ewParticipant = participantMap?.[result?.ew_participant_id];

  const scoreStr = result ? (result.score > 0 ? `+${result.score}` : `${result.score}`) : '';
  const resultStr = result?.overtricks != null
    ? (result.overtricks === 0 ? '=' : result.overtricks > 0 ? `+${result.overtricks}` : `${result.overtricks}`)
    : '';

  const mpPct = !isTeams && !isImpPairs && (result?.mp_ns != null || result?.mp_ew != null)
    ? (() => {
        const ns = result.mp_ns == null ? null : Number(result.mp_ns);
        const ew = result.mp_ew == null ? null : Number(result.mp_ew);
        const ourSideIsEw = ourParticipantId && result.ew_participant_id === ourParticipantId;
        if (Number.isFinite(ns) && Number.isFinite(ew) && ns + ew > 0) {
          return Math.round(((ourSideIsEw ? ew : ns) / (ns + ew)) * 100);
        }
        if (ourSideIsEw && Number.isFinite(ew)) return Math.round(ew);
        if (!ourSideIsEw && Number.isFinite(ns)) return Math.round(ns);
        if (ourSideIsEw && Number.isFinite(ns)) return Math.round(100 - ns);
        if (!ourSideIsEw && Number.isFinite(ew)) return Math.round(100 - ew);
        return null;
      })()
    : null;

  let boardImps = null;
  if (otherRoom && result) {
    let ourScoreHere, ourScoreThere;
    if (ourParticipantId) {
      ourScoreHere = result.ns_participant_id === ourParticipantId ? (result.score || 0) : -(result.score || 0);
      ourScoreThere = otherRoom.ns_participant_id === ourParticipantId ? (otherRoom.score || 0) : -(otherRoom.score || 0);
    } else {
      ourScoreHere = result.score || 0;
      const swapped = result.ns_participant_id === otherRoom.ew_participant_id;
      ourScoreThere = swapped ? -(otherRoom.score || 0) : (otherRoom.score || 0);
    }
    boardImps = scoreToImps(ourScoreHere + ourScoreThere);
  } else if (result?.imps_ns != null || result?.imps_ew != null) {
    if (ourParticipantId && result.ew_participant_id === ourParticipantId) {
      boardImps = result.imps_ew;
    } else {
      boardImps = result.imps_ns;
    }
  } else if (isImpPairs && (result?.mp_ns != null || result?.mp_ew != null)) {
    boardImps = ourParticipantId && result.ew_participant_id === ourParticipantId
      ? result.mp_ew
      : result.mp_ns;
  }

  const resultBlock = result && (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 5, padding: '4px 8px', marginTop: 4 }}>
      {!result.passed_out && (
        <div style={{ fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap' }}>
          {fmtContractColored(result)} <span style={{ color: '#6b7280', fontWeight: 400 }}>by {result.declarer}</span>
          {' '}{resultStr}
        </div>
      )}
      <div style={{ whiteSpace: 'nowrap' }}>
        <span style={{ color: '#6b7280' }}>Score: </span>
        <span style={{ fontWeight: 700 }}>{scoreStr}</span>
        {mpPct != null && (
          <span style={{ marginLeft: 6, fontWeight: 700, color: mpPct >= 60 ? '#15803d' : mpPct <= 40 ? '#dc2626' : '#6b7280' }}>
            (MP% = {mpPct})
          </span>
        )}
        {boardImps != null && (
          <span style={{ marginLeft: 6, fontWeight: 700, color: boardImps > 0 ? '#15803d' : boardImps < 0 ? '#dc2626' : '#6b7280' }}>
            (IMPs = {boardImps > 0 ? '+' : ''}{boardImps})
          </span>
        )}
      </div>
    </div>
  );

  const btnStyle = { boxSizing: 'border-box', height: 28, fontSize: '0.8rem', lineHeight: '28px', padding: '0 10px', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#fff' };

  const buttonsBlock = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {!ddPlaying && (
        <button type="button" onClick={() => ipsControllerRef.current?.toggleDd()}
          style={{ ...btnStyle, background: '#16a34a' }}>
          DD
        </button>
      )}
      {result?.lin && (
        <button type="button" onClick={() => setDdPlaying(p => !p)}
          style={{ ...btnStyle, background: ddPlaying ? '#6b7280' : '#7c3aed' }}>
          {ddPlaying ? '◀ View' : '▶ Play'}
        </button>
      )}
      {onTraveller && (
        <button onClick={onTraveller}
          style={{ ...btnStyle, background: '#2563eb' }}>
          Traveller
        </button>
      )}
      <button type="button"
        style={{ ...btnStyle, background: '#0f766e' }}>
        Analysis
      </button>
      {onNotes && (
        <button onClick={onNotes} disabled={notesLoading}
          style={{ ...btnStyle, background: '#7c3aed', opacity: notesLoading ? 0.5 : 1, position: 'relative' }}>
          {notesLoading ? '...' : 'Notes'}
          <UnreadBadge count={notesUnread} />
        </button>
      )}
    </div>
  );

  const otherRoomBlock = isTeams && otherRoom && (
    <div
      onClick={onOtherRoom}
      style={{
        border: '1px solid #d1d5db',
        borderRadius: 5, padding: '4px 8px', marginTop: 4,
        cursor: onOtherRoom ? 'pointer' : 'default',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '0.72rem', color: '#1e40af' }}>OTHER ROOM</span>
        {onOtherRoom && <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>→</span>}
      </div>
      <div style={{ marginTop: 2 }}>
        {fmtContractColored(otherRoom)} by {otherRoom.declarer}
        {' '}{otherRoom.overtricks != null ? (otherRoom.overtricks === 0 ? '= ' : otherRoom.overtricks > 0 ? `+${otherRoom.overtricks} ` : `${otherRoom.overtricks} `) : ' '}
        ({otherRoom.score > 0 ? `+${otherRoom.score}` : `${otherRoom.score}`})
      </div>
    </div>
  );

  const ipsBoardResult = result ? {
    ...result,
    dealer: result.dealer || board.dealer,
    vulnerability: result.vulnerability || board.vulnerability,
    player_n_name: result.player_n_name || nsParticipant?.roster?.[0]?.name || nsParticipant?.name,
    player_s_name: result.player_s_name || nsParticipant?.roster?.[1]?.name || nsParticipant?.name,
    player_e_name: result.player_e_name || ewParticipant?.roster?.[0]?.name || ewParticipant?.name,
    player_w_name: result.player_w_name || ewParticipant?.roster?.[1]?.name || ewParticipant?.name,
  } : null;

  const ipsPlayer = ipsBoardResult?.lin
    ? ddPlaying
      ? <IpsPlayer boardResult={ipsBoardResult} mode="play" ddPlay autoStart hideDdButton direction={result?.declarer || 'S'} topRightOffset={otherRoomBlock ? 72 : 0} onPlayerReady={player => { ipsControllerRef.current = player; }} />
      : <IpsPlayer boardResult={ipsBoardResult} mode="view" topRightOffset={otherRoomBlock ? 72 : 0} hideDdButton onPlayerReady={player => { ipsControllerRef.current = player; }} />
    : <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '12px 0' }}>No play data available.</div>;

  return (
    <div style={{ position: 'relative' }}>
      {boardNumber != null && (
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4, color: '#1f2937' }}>
          Board {boardNumber}{isTeams && (nsTeamName || ewTeamName) ? ':' : ''}
          {isTeams && nsTeamName && (
            <span style={{ marginLeft: 6, fontWeight: 500 }}>NS = {nsTeamName}</span>
          )}
          {isTeams && ewTeamName && (
            <span style={{ marginLeft: 10, fontWeight: 500 }}>EW = {ewTeamName}</span>
          )}
          <span className="md:hidden" style={{ fontWeight: 400, fontSize: '0.7rem', color: '#6b7280', marginLeft: 6 }}>
            Dlr {board.dealer} · Vul {vul === 'none' ? 'Nil' : vul === 'both' ? 'All' : vul.toUpperCase()}
          </span>
        </div>
      )}
      <div style={{ position: 'relative', display: 'inline-block', minWidth: 0 }}>
        {ipsPlayer}
        <div style={{ position: 'absolute', left: 0, bottom: 12, width: 'max-content', fontSize: '0.8rem', zIndex: 3 }}>
          {invalidLead && (
            <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 3 }}>
              Invalid lead: {fmtLead(result)}
            </div>
          )}
          {resultBlock}
        </div>
        {otherRoomBlock && (
          <div style={{ position: 'absolute', right: 0, top: 0, width: 132, fontSize: '0.8rem', zIndex: 3 }}>
            {otherRoomBlock}
          </div>
        )}
      </div>
      <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
        {buttonsBlock}
      </div>
    </div>
  );
}


export function Compass({ vul, dealer }) {
  const nsVul = vul === 'ns' || vul === 'both';
  const ewVul = vul === 'ew' || vul === 'both';

  const ball = (dir, cx, cy) => {
    const isVul = (nsVul && (dir === 'N' || dir === 'S')) || (ewVul && (dir === 'E' || dir === 'W'));
    const bg = isVul ? '#e00000' : '#2e7d32';
    const decor = dir === dealer ? ' text-decoration="underline"' : '';
    return `<circle cx="${cx}" cy="${cy}" r="10" fill="${bg}"/>` +
           `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="bold"${decor}>${dir}</text>`;
  };

  const svg = `<svg width="56" height="56" viewBox="0 0 56 56">
    ${ball('N', 28, 10)}
    ${ball('W', 10, 28)}
    ${ball('E', 46, 28)}
    ${ball('S', 28, 46)}
  </svg>`;

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}


// ── Bidding table ────────────────────────────────────────────────

export function BidTooltip({ text }) {
  return (
    <span style={{
      position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
      background: '#1f2937', color: '#fff', fontSize: '0.65rem', padding: '2px 6px',
      borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none',
      opacity: 0, transition: 'opacity 0.15s',
      zIndex: 20,
    }} className="bid-tooltip">{text}</span>
  );
}

export function BiddingTable({ lin, dealer, compact }) {
  const bids = parseBiddingFromLin(lin);
  if (!bids || bids.length === 0) return null;

  const dirs = ['W', 'N', 'E', 'S'];
  const dealerMatch = lin.match(/md\|(\d)/);
  const linDealer = dealerMatch ? parseInt(dealerMatch[1]) : 3;
  const linDirOrder = ['S', 'W', 'N', 'E'];
  const startDir = linDirOrder[linDealer - 1] || dealer || 'N';
  const startIdx = dirs.indexOf(startDir);

  const rows = [];
  let currentRow = new Array(4).fill(null);
  for (let i = 0; i < startIdx; i++) currentRow[i] = '';
  let col = startIdx;

  for (const bid of bids) {
    currentRow[col] = bid;
    col++;
    if (col >= 4) { rows.push(currentRow); currentRow = new Array(4).fill(null); col = 0; }
  }
  if (currentRow.some(c => c !== null)) rows.push(currentRow);

  const fontSize = compact ? '0.7rem' : '0.75rem';
  const headSize = compact ? '0.65rem' : '0.7rem';

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: compact ? 3 : 4, display: 'inline-block' }}>
      <style>{'td:hover > .bid-tooltip { opacity: 1 !important; }'}</style>
      <table style={{ borderCollapse: 'collapse', fontSize, width: '100%' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #d1d5db' }}>
            {dirs.map(d => (
              <th key={d} style={{ padding: compact ? '1px 6px' : '1px 10px', textAlign: 'center', fontWeight: 700, color: '#374151', fontSize: headSize }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: compact ? '1px 6px' : '1px 10px',
                  textAlign: 'center',
                  position: 'relative',
                  ...(cell && cell.alert ? { background: '#dbeafe' } : {}),
                }}>
                  {cell === null ? '' : formatBidCell(cell, compact)}
                  {cell && cell.explanation && <BidTooltip text={cell.explanation} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CALL_MAP = { P: 'P', PASS: 'P', D: 'X', X: 'X', DBL: 'X', R: 'XX', XX: 'XX', RDBL: 'XX' };

function normalizeCall(s) {
  const u = (s || '').trim().toUpperCase();
  if (CALL_MAP[u]) return CALL_MAP[u];
  const m = u.match(/^([1-7])(NT?|[CDHS])$/);
  return m ? m[1] + m[2] : null;
}

export function parseBiddingFromLin(lin) {
  if (!lin) return null;
  const tags = lin.split('|');
  const bids = [];
  let hasMb = false;

  for (let i = 0; i < tags.length; i++) {
    if (tags[i] === 'mb' && i + 1 < tags.length) {
      hasMb = true;
      const raw = tags[i + 1];
      if (!raw) continue;
      const isAlert = raw.endsWith('!');
      const bidStr = isAlert ? raw.slice(0, -1) : raw;
      let explanation = null;
      if (i + 2 < tags.length && tags[i + 2] === 'an' && i + 3 < tags.length) {
        explanation = tags[i + 3].trim() || null;
      }
      const call = normalizeCall(bidStr);
      if (call) bids.push({ bid: call, alert: isAlert || !!explanation, explanation });
    }
  }

  if (!hasMb) return null;

  if (bids.length === 0) {
    const mbMatch = lin.match(/mb\|([^|]+)\|/);
    if (mbMatch) {
      const regex = /([1-7][CDHSN]T?|[PDR]|X{1,2})/gi;
      let m;
      while ((m = regex.exec(mbMatch[1])) !== null) {
        const t = m[1].toUpperCase();
        bids.push({ bid: CALL_MAP[t] || t, alert: false, explanation: null });
      }
    }
  }

  return bids.length > 0 ? bids : null;
}

function formatBidCell(entry, compact) {
  const bid = typeof entry === 'string' ? entry : entry.bid;
  if (!bid) return '';
  const sz = compact ? '0.75rem' : '0.85rem';
  if (bid === 'P') return <span style={{ color: '#15803d', fontSize: sz }}>Pass</span>;
  if (bid === 'X') return <span style={{ color: '#dc2626', fontWeight: 700, fontSize: sz }}>X</span>;
  if (bid === 'XX') return <span style={{ color: '#2563eb', fontWeight: 700, fontSize: sz }}>XX</span>;
  const level = bid[0];
  const ds = bid.substring(1);
  const map = { C: ['♣','#2e7d32'], D: ['♦','#c62828'], H: ['♥','#c62828'], S: ['♠','#000'], NT: ['NT','#333'], N: ['NT','#333'] };
  const [sym, col] = map[ds] || [ds, '#333'];
  return <span style={{ fontSize: sz }}>{level}<span style={{ color: col, fontWeight: 700 }}>{sym}</span></span>;
}


// ── IMP table ────────────────────────────────────────────────────

const IMP_TABLE = [
  [0,10,0],[20,40,1],[50,80,2],[90,120,3],[130,160,4],[170,210,5],
  [220,260,6],[270,310,7],[320,360,8],[370,420,9],[430,490,10],
  [500,590,11],[600,740,12],[750,890,13],[900,1090,14],[1100,1290,15],
  [1300,1490,16],[1500,1740,17],[1750,1990,18],[2000,2240,19],
  [2250,2490,20],[2500,2990,21],[3000,3490,22],[3500,3990,23],[4000,Infinity,24],
];

function scoreToImps(swing) {
  const abs = Math.abs(swing);
  const sign = swing >= 0 ? 1 : -1;
  for (const [lo, hi, imp] of IMP_TABLE) {
    if (abs >= lo && abs <= hi) return sign * imp;
  }
  return sign * 24;
}


// ── Formatting helpers ───────────────────────────────────────────

export function fmtContractColored(r) {
  if (r.passed_out) return 'Pass';
  const x = r.contract_x || '';
  const d = r.contract_denom;
  const sym = SUIT_SYM[d] || d || '';
  const col = SUIT_CLR[d] || '#333';
  return <>{r.contract_level}<span style={{ color: col }}>{sym}</span>{x}</>;
}

export function fmtLead(r) {
  if (!r.lead_suit) return '';
  const sym = SUIT_SYM[r.lead_suit] || r.lead_suit;
  const col = SUIT_CLR[r.lead_suit] || '#333';
  return <><span style={{ color: col }}>{sym}</span>{r.lead_rank || ''}</>;
}

function hasInvalidOpeningLead(result) {
  if (!result?.lin || !result?.declarer || !result?.lead_suit || !result?.lead_rank) return false;
  const match = result.lin.match(/(^|\|)md\|(\d)([^|]*)/i);
  if (!match) return false;

  const hands = match[3].split(',');
  if (hands.length < 4) return false;
  const seats = ['S', 'W', 'N', 'E'];
  const wantedSuit = String(result.lead_suit).toUpperCase();
  const wantedRank = String(result.lead_rank).toUpperCase().replace('10', 'T');
  let holder = null;

  hands.forEach((hand, index) => {
    const suitMatch = String(hand).match(new RegExp(`${wantedSuit}([^SHDC]*)`, 'i'));
    if (suitMatch?.[1]?.toUpperCase().includes(wantedRank)) holder = seats[index];
  });

  const leader = { N: 'E', E: 'S', S: 'W', W: 'N' }[String(result.declarer).toUpperCase()];
  return !holder || holder !== leader;
}
