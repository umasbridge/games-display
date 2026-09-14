import React, { useState } from 'react';
import HandDiagram, { BiddingTable } from './HandDiagram.jsx';
import { scoreToImps } from './boardUtils.js';

function linHasCards(lin) {
  if (!lin) return false;
  const m = lin.match(/(^|\|)md\|([^|]*)/);
  return !!m && /[AKQJT2-9]/.test(m[2].replace(/^\d/, ''));
}
export function linHasBidding(lin) { return linHasCards(lin) && /(^|\|)mb\|/.test(lin); }
export function linHasPlay(lin) {
  return linHasCards(lin) && ((lin.match(/(^|\|)pc\|/g) || []).length >= 2);
}

const SUIT_SYMBOLS_T = { S: '♠', H: '♥', D: '♦', C: '♣' };
const DENOM_ORDER = { C: 0, D: 1, H: 2, S: 3, NT: 4 };
function denomRank(d) { return DENOM_ORDER[d] ?? -1; }

function suitColor(d) {
  switch (d) {
    case 'S': return '#000';
    case 'H': case 'D': return '#c62828';
    case 'C': return '#2e7d32';
    default: return '#333';
  }
}

function pctVal(r, boardResults = []) {
  const ns = r.mp_ns == null ? null : Number(r.mp_ns);
  const ew = r.mp_ew == null ? null : Number(r.mp_ew);
  const nsValid = Number.isFinite(ns);
  const ewValid = Number.isFinite(ew);

  if (nsValid && ewValid && ns + ew > 0) return Math.round((ns / (ns + ew)) * 100);
  if (nsValid && ns >= 0 && ns <= 100) return Math.round(ns);
  if (ewValid && ew >= 0 && ew <= 100) return Math.round(100 - ew);

  const peers = boardResults.filter(other => other !== r && Number.isFinite(Number(other.score)));
  if (!peers.length || !Number.isFinite(Number(r.score))) return null;
  const score = Number(r.score);
  const matchpoints = peers.reduce((total, other) => {
    const otherScore = Number(other.score);
    return total + (score > otherScore ? 1 : score === otherScore ? 0.5 : 0);
  }, 0);
  return Math.round((matchpoints / peers.length) * 100);
}

function impValue(result, impPairs) {
  const stored = result.imps_ns ?? (impPairs ? result.mp_ns : null);
  if (stored == null || stored === '') return null;
  const value = Number(stored);
  return Number.isFinite(value) ? value : null;
}

function PctBadge({ pct }) {
  let color = 'text-red-600';
  if (pct >= 65) color = 'text-green-700';
  else if (pct >= 45) color = 'text-gray-600';
  return <span className={`font-medium ${color}`}>{pct}%</span>;
}

function renderTeamsPanels(pairs, roomPanel, highlightParticipantId, participantMap) {
  const signed = (n) => n == null ? '—' : n > 0 ? `+${n}` : `${n}`;
  const impLine = (name, imps, pid) => {
    const isOurs = highlightParticipantId && pid === highlightParticipantId;
    return (
      <div className={`flex items-center justify-between gap-3 py-0.5 ${isOurs ? 'font-bold' : ''}`}>
        <span className="text-gray-700 truncate max-w-[110px]">{name}</span>
        <span className={`font-mono tabular-nums ${imps > 0 ? 'text-green-700' : imps < 0 ? 'text-red-600' : 'text-gray-500'}`}>{signed(imps)}</span>
      </div>
    );
  };
  return (
    <table className="text-xs" style={{ borderCollapse: 'collapse', width: 'auto' }}>
      <thead><tr className="border-b border-gray-300 text-gray-600 bg-gray-50">
        <th className="py-1.5 px-3 text-left">Closed Room</th>
        <th className="py-1.5 px-3 text-left border-l border-gray-200">Open Room</th>
        <th className="py-1.5 px-3 text-left border-l border-gray-200">IMPs</th>
      </tr></thead>
      <tbody>{pairs.map((pair, index) => {
        const c = pair.closed; const o = pair.open;
        const openNsScore = o?.score != null ? Number(o.score) : null;
        const closedNsScore = c?.score != null ? Number(c.score) : null;
        const openNsSwing = openNsScore != null && closedNsScore != null ? openNsScore - closedNsScore : null;
        const openNsImps = openNsSwing != null ? scoreToImps(openNsSwing) : null;
        const closedNsImps = openNsImps != null ? -openNsImps : null;
        const openNsId = o?.ns_participant_id;
        const closedNsId = c?.ns_participant_id;
        const openNsName = (participantMap[openNsId]?.name || 'Open NS').replace(/\s*&\s*$/, '').trim();
        const closedNsName = (participantMap[closedNsId]?.name || 'Closed NS').replace(/\s*&\s*$/, '').trim();
        const pairInvolvesUs = highlightParticipantId && (
          o?.ns_participant_id === highlightParticipantId || o?.ew_participant_id === highlightParticipantId ||
          c?.ns_participant_id === highlightParticipantId || c?.ew_participant_id === highlightParticipantId
        );
        return <tr key={index} className={pairInvolvesUs ? 'bg-blue-50' : ''}>
          <td className="py-2 px-3 align-top border-b border-gray-200">{roomPanel(c)}</td>
          <td className="py-2 px-3 align-top border-l border-b border-gray-200">{roomPanel(o)}</td>
          <td className="py-2 px-3 align-top border-l border-b border-gray-200 min-w-[160px]">
            <div className="min-h-[112px] flex flex-col justify-center gap-1">
              {impLine(openNsName, openNsImps, openNsId)}
              {impLine(closedNsName, closedNsImps, closedNsId)}
            </div>
          </td>
        </tr>;
      })}</tbody>
    </table>
  );
}

export function TravellerTable({ board, boardResults, participantMap, highlightParticipantId, isTeams, scoring }) {
  const [sortKey, setSortKey] = useState('ns');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [viewResult, setViewResult] = useState(null);

  if (!boardResults.length) return null;

  const scoringKey = String(scoring || '').toLowerCase();
  const scoringSaysImps = scoringKey.includes('imp') || scoringKey.includes('butler');
  const valuesLookLikeImps = boardResults.some(r =>
    Number(r.mp_ns) < 0 || Number(r.mp_ew) < 0
  );
  const isImpPairs = !isTeams && (scoringSaysImps || valuesLookLikeImps || boardResults.some(r => r.imps_ns != null));

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return '';
    return sortAsc ? ' ▲' : ' ▼';
  };

  const sorted = sortKey ? [...boardResults].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    if (a.passed_out && !b.passed_out) return 1;
    if (!a.passed_out && b.passed_out) return -1;

    let cmp = 0;
    switch (sortKey) {
      case 'contract': {
        cmp = (a.contract_level || 0) - (b.contract_level || 0);
        if (cmp === 0) cmp = (DENOM_ORDER[a.contract_denom] || 0) - (DENOM_ORDER[b.contract_denom] || 0);
        if (cmp === 0) cmp = (a.declarer || '').localeCompare(b.declarer || '');
        if (cmp === 0) cmp = (b.tricks || 0) - (a.tricks || 0);
        break;
      }
      case 'tricks': cmp = (a.tricks || 0) - (b.tricks || 0); break;
      case 'score': cmp = (a.score || 0) - (b.score || 0); break;
      case 'lead': cmp = (a.lead || '').localeCompare(b.lead || ''); break;
      case 'ns': cmp = (participantMap[a.ns_participant_id]?.number || 0) - (participantMap[b.ns_participant_id]?.number || 0); break;
      case 'ew': cmp = (participantMap[a.ew_participant_id]?.number || 0) - (participantMap[b.ew_participant_id]?.number || 0); break;
      case 'pct': {
        const pa = pctVal(a, boardResults); const pb = pctVal(b, boardResults);
        cmp = (pa ?? -1) - (pb ?? -1); break;
      }
      case 'imps': cmp = impValue(a, isImpPairs) - impValue(b, isImpPairs); break;
      case 'room': cmp = (a.room || '').localeCompare(b.room || ''); break;
      default: break;
    }
    return cmp * dir;
  }) : boardResults;

  const thClass = "py-1.5 px-1.5 text-left font-medium cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap";

  const rosterNames = (participantId) => {
    const rawRoster = participantMap[participantId]?.roster;
    let roster = rawRoster;
    if (typeof roster === 'string') {
      try { roster = JSON.parse(roster); } catch { roster = []; }
    }
    if (!Array.isArray(roster)) return [];
    return roster.map(player => typeof player === 'string' ? player : player?.name).filter(Boolean);
  };

  const hasTeamsStructure = boardResults.some(r => r.room != null || r.match_id != null);
  if (isTeams && hasTeamsStructure) {
    const grouped = new Map();
    for (const r of boardResults) {
      const key = `${r.match_id || ''}__${r.round || ''}`;
      if (!grouped.has(key)) grouped.set(key, {});
      grouped.get(key)[r.room === 'closed' ? 'closed' : 'open'] = r;
    }
    const pairs = [...grouped.values()].filter(p => p.closed || p.open);
    const seatCell = (r, side) => {
      if (!r) return <span className="text-gray-300">—</span>;
      const participantId = side === 'NS' ? r.ns_participant_id : r.ew_participant_id;
      const team = participantMap[participantId]?.name || '—';
      const players = side === 'NS'
        ? [r.player_n_name || 'North', r.player_s_name || 'South']
        : [r.player_e_name || 'East', r.player_w_name || 'West'];
      return <><div className="font-semibold">{team}</div><div className="text-gray-500">{players.join(' · ')}</div></>;
    };
    const contractCell = (r) => r ? (r.passed_out ? 'Pass' : <>{r.contract_level}<span style={{ color: suitColor(r.contract_denom) }}>{SUIT_SYMBOLS_T[r.contract_denom] || r.contract_denom}</span>{r.contract_x || ''} <span className="text-gray-400">{r.declarer}</span></>) : '—';
    const leadCell = (r) => r?.lead_suit ? <><span style={{ color: suitColor(r.lead_suit) }}>{SUIT_SYMBOLS_T[r.lead_suit]}</span>{r.lead_rank}</> : '—';
    const overlay = viewResult && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.3)' }} onClick={() => setViewResult(null)}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'max-content', maxWidth: 'calc(100vw - 16px)', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.18)', overflow: 'auto' }} onClick={event => event.stopPropagation()}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Board {board.board_number} — View</span>
            <button type="button" onClick={() => setViewResult(null)} style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}>&times;</button>
          </div>
          <div style={{ padding: 16 }}><HandDiagram board={board} result={viewResult} participantMap={participantMap} isTeams /></div>
        </div>
      </div>
    );

    const roomPanel = (r) => {
      if (!r) return <div className="text-gray-300 p-2">No result</div>;
      const score = Number(r.score || 0);
      const scoreSide = score > 0 ? 'NS' : score < 0 ? 'EW' : '';
      const canView = linHasPlay(r.lin) || linHasBidding(r.lin);
      return <div className="min-w-0">
        <div className="grid grid-cols-[26px_1fr] gap-x-2 gap-y-1">
          <div className="font-semibold text-gray-500">NS</div><div>{seatCell(r, 'NS')}</div>
          <div className="font-semibold text-gray-500 border-t border-gray-100 pt-1">EW</div><div className="border-t border-gray-100 pt-1">{seatCell(r, 'EW')}</div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="text-gray-400">Contract </span>{contractCell(r)}</span>
          <span><span className="text-gray-400">Tricks </span>{r.tricks ?? '—'}</span>
          <span><span className="text-gray-400">Lead </span>{leadCell(r)}</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-semibold"><span className="text-gray-400 font-normal">Score </span>{scoreSide} {score === 0 ? '0' : `+${Math.abs(score)}`}</span>
          {canView && <button onClick={() => setViewResult(r)} className="px-2 py-0.5 rounded bg-emerald-600 text-white">View</button>}
        </div>
      </div>;
    };

    return <>{renderTeamsPanels(pairs, roomPanel, highlightParticipantId, participantMap)}{overlay}</>;
  }

  if (isTeams && !hasTeamsStructure) {
    const byPair = new Map();
    for (const r of boardResults) {
      const key = [r.ns_participant_id, r.ew_participant_id].sort().join('__');
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key).push(r);
    }

    const pairs = [];
    for (const results of byPair.values()) {
      if (results.length === 2) {
        const [a, b] = results;
        let open, closed;
        if (highlightParticipantId) {
          open = a.ns_participant_id === highlightParticipantId ? a : b;
          closed = open === a ? b : a;
        } else {
          open = a.ns_participant_id <= b.ns_participant_id ? a : b;
          closed = open === a ? b : a;
        }
        pairs.push({ open, closed });
      } else {
        pairs.push({ open: results[0], closed: null });
      }
    }

    pairs.sort((a, b) => {
      const aOurs = highlightParticipantId && (
        a.open?.ns_participant_id === highlightParticipantId || a.open?.ew_participant_id === highlightParticipantId ||
        a.closed?.ns_participant_id === highlightParticipantId || a.closed?.ew_participant_id === highlightParticipantId
      );
      const bOurs = highlightParticipantId && (
        b.open?.ns_participant_id === highlightParticipantId || b.open?.ew_participant_id === highlightParticipantId ||
        b.closed?.ns_participant_id === highlightParticipantId || b.closed?.ew_participant_id === highlightParticipantId
      );
      return (aOurs ? 0 : 1) - (bOurs ? 0 : 1);
    });

    const seatCell2 = (r, side) => {
      if (!r) return <span className="text-gray-300">—</span>;
      const pid = side === 'NS' ? r.ns_participant_id : r.ew_participant_id;
      const team = participantMap[pid]?.name || '—';
      const players = side === 'NS'
        ? [r.player_n_name || 'North', r.player_s_name || 'South']
        : [r.player_e_name || 'East', r.player_w_name || 'West'];
      return <><div className="font-semibold">{team}</div><div className="text-gray-500">{players.join(' · ')}</div></>;
    };
    const contractCell2 = (r) => r ? (r.passed_out ? 'Pass' : <>{r.contract_level}<span style={{ color: suitColor(r.contract_denom) }}>{SUIT_SYMBOLS_T[r.contract_denom] || r.contract_denom}</span>{r.contract_x || ''} <span className="text-gray-400">{r.declarer}</span></>) : '—';
    const leadCell2 = (r) => r?.lead_suit ? <><span style={{ color: suitColor(r.lead_suit) }}>{SUIT_SYMBOLS_T[r.lead_suit]}</span>{r.lead_rank}</> : '—';
    const overlay2 = viewResult && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.3)' }} onClick={() => setViewResult(null)}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'max-content', maxWidth: 'calc(100vw - 16px)', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.18)', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Board {board.board_number} — View</span>
            <button type="button" onClick={() => setViewResult(null)} style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}>&times;</button>
          </div>
          <div style={{ padding: 16 }}><HandDiagram board={board} result={viewResult} participantMap={participantMap} isTeams /></div>
        </div>
      </div>
    );
    const roomPanel2 = (r) => {
      if (!r) return <div className="text-gray-300 p-2">No result</div>;
      const score = Number(r.score || 0);
      const scoreSide = score > 0 ? 'NS' : score < 0 ? 'EW' : '';
      const canView = linHasPlay(r.lin) || linHasBidding(r.lin);
      return <div className="min-w-0">
        <div className="grid grid-cols-[26px_1fr] gap-x-2 gap-y-1">
          <div className="font-semibold text-gray-500">NS</div><div>{seatCell2(r, 'NS')}</div>
          <div className="font-semibold text-gray-500 border-t border-gray-100 pt-1">EW</div><div className="border-t border-gray-100 pt-1">{seatCell2(r, 'EW')}</div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="text-gray-400">Contract </span>{contractCell2(r)}</span>
          <span><span className="text-gray-400">Tricks </span>{r.tricks ?? '—'}</span>
          <span><span className="text-gray-400">Lead </span>{leadCell2(r)}</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-semibold"><span className="text-gray-400 font-normal">Score </span>{scoreSide} {score === 0 ? '0' : `+${Math.abs(score)}`}</span>
          {canView && <button onClick={() => setViewResult(r)} className="px-2 py-0.5 rounded bg-emerald-600 text-white">View</button>}
        </div>
      </div>;
    };

    return <>{renderTeamsPanels(pairs, roomPanel2, highlightParticipantId, participantMap)}{overlay2}</>;
  }

  return (
    <>
    <style>{'.traveller-table th, .traveller-table td { padding-left: 4px !important; padding-right: 4px !important; }'}</style>
    <table className="traveller-table text-xs" style={{ borderCollapse: 'collapse', width: 'auto' }}>
      <thead>
        <tr className="border-b border-gray-300 text-gray-600 bg-gray-50">
          {isTeams && <th className={thClass} onClick={() => handleSort('ns')}>Team{sortIndicator('ns')}</th>}
          <th className={thClass} onClick={() => handleSort('ns')}>N / S{!isTeams && sortIndicator('ns')}</th>
          <th className={thClass} onClick={() => handleSort('ew')}>E / W{sortIndicator('ew')}</th>
          <th className={thClass} onClick={() => handleSort('contract')}>{sortIndicator('contract')}</th>
          <th className={`${thClass} text-center`} onClick={() => handleSort('tricks')}>Tricks{sortIndicator('tricks')}</th>
          <th className={thClass} onClick={() => handleSort('lead')}>Lead{sortIndicator('lead')}</th>
          <th className={`${thClass} text-right`} onClick={() => handleSort('score')}>Score{sortIndicator('score')}</th>
          {isTeams && <th className={`${thClass} text-center`} onClick={() => handleSort('room')}>Room{sortIndicator('room')}</th>}
          {isTeams || isImpPairs
            ? <th className={`${thClass} text-right`} onClick={() => handleSort('imps')}>IMPs{sortIndicator('imps')}</th>
            : <th className={`${thClass} text-right`} onClick={() => handleSort('pct')}>MP%{sortIndicator('pct')}</th>
          }
          <th className="py-1.5 px-1.5 text-center font-medium text-gray-600"></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const hl = highlightParticipantId &&
            (r.ns_participant_id === highlightParticipantId ||
             r.ew_participant_id === highlightParticipantId);
          const nsName = participantMap[r.ns_participant_id]?.name || '';
          const ewName = participantMap[r.ew_participant_id]?.name || '';
          const nsRoster = !isTeams ? rosterNames(r.ns_participant_id) : [];
          const ewRoster = !isTeams ? rosterNames(r.ew_participant_id) : [];
          const northName = r.player_n_name || nsRoster[0] || 'North';
          const southName = r.player_s_name || nsRoster[1] || 'South';
          const eastName = r.player_e_name || ewRoster[0] || 'East';
          const westName = r.player_w_name || ewRoster[1] || 'West';
          const pct = pctVal(r, boardResults);
          const imps = impValue(r, isImpPairs);
          const scoreStr = r.score > 0 ? `+${r.score}` : `${r.score}`;

          const hasBidding = r.lin && /mb\|[^|]+\|/.test(r.lin);
          const isExpanded = expandedIdx === i;
          const colCount = isTeams ? 10 : 8;

          return (
            <React.Fragment key={i}>
              <tr className={`border-b border-gray-50 ${hl ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'} ${hasBidding ? 'cursor-pointer' : ''}`}
                onClick={hasBidding ? () => setExpandedIdx(isExpanded ? null : i) : undefined}>
                {isTeams && (
                  <td className="py-1 px-1.5 whitespace-nowrap">
                    <div className="font-medium truncate max-w-[60px] sm:max-w-[105px]" title={nsName}>{nsName || '—'}</div>
                    <div className="text-gray-400 truncate max-w-[60px] sm:max-w-[105px]" title={ewName}>{ewName || '—'}</div>
                  </td>
                )}
                <td className="py-1 px-1.5 whitespace-nowrap">
                  <div className="truncate max-w-[55px] sm:max-w-[95px]" title={northName}>{northName}</div>
                  <div className="text-gray-400 truncate max-w-[55px] sm:max-w-[95px]" title={southName}>{southName}</div>
                </td>
                <td className="py-1 px-1.5 whitespace-nowrap">
                  <div className="truncate max-w-[55px] sm:max-w-[95px]" title={eastName}>{eastName}</div>
                  <div className="text-gray-400 truncate max-w-[55px] sm:max-w-[95px]" title={westName}>{westName}</div>
                </td>
                <td className="py-1 px-1.5">
                  {r.passed_out ? 'Pass' : (
                    <>
                      {r.contract_level}
                      <span style={{ color: suitColor(r.contract_denom) }}>{SUIT_SYMBOLS_T[r.contract_denom] || r.contract_denom}</span>
                      {r.contract_x || ''}
                      <span className="text-gray-400 ml-0.5">{r.declarer}</span>
                    </>
                  )}
                </td>
                <td className="py-1 px-1.5 text-center">{r.passed_out ? '' : r.tricks}</td>
                <td className="py-1 px-1.5">
                  {r.lead_suit && (<><span style={{ color: suitColor(r.lead_suit) }}>{SUIT_SYMBOLS_T[r.lead_suit]}</span>{r.lead_rank}</>)}
                </td>
                <td className="py-1 px-1.5 text-right font-mono">{r.passed_out ? '' : scoreStr}</td>
                {isTeams && <td className="py-1 px-1.5 text-center text-gray-400">{r.room === 'open' ? 'O' : 'C'}</td>}
                {isTeams || isImpPairs
                  ? <td className={`py-1 px-1.5 text-right font-medium ${imps > 0 ? 'text-green-700' : imps < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {imps != null ? (imps > 0 ? `+${imps}` : imps) : ''}
                    </td>
                  : <td className="py-1 px-1.5 text-right">{pct != null && <PctBadge pct={pct} />}</td>
                }
                <td className="py-1 px-1.5 text-center">
                  {(() => {
                    const hasPlay = linHasPlay(r.lin);
                    const hasBid = linHasBidding(r.lin);
                    return (hasPlay || hasBid) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewResult(r); }}
                        className="px-1.5 py-0.5 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        View
                      </button>
                    );
                  })()}
                </td>
              </tr>
              {isExpanded && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <BiddingTable lin={r.lin} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
    {viewResult && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.3)' }}
        onClick={() => setViewResult(null)}
      >
        <div
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'max-content', maxWidth: 'calc(100vw - 16px)', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.18)', overflow: 'auto' }}
          onClick={event => event.stopPropagation()}
        >
          <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Board {board.board_number} — View</span>
            <button type="button" onClick={() => setViewResult(null)} style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1 }}>&times;</button>
          </div>
          <div style={{ padding: 16 }}>
            <HandDiagram
              board={board}
              result={viewResult}
              participantMap={participantMap}
              isTeams={isTeams}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
