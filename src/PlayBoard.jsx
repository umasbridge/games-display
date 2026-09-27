import { useRef, useEffect, useMemo, useState } from 'react';
import { completionSummary } from './playScoring.js';
import BridgeLibMount, { shortPlayerName, normalizeLin } from './BridgeLibMount.jsx';

// Play mode: the user plays in BridgePlayer (computer plays the other seats).
// View mode: DealViewer shows the deal and steps through the table's recorded play.
// This component only supplies the surrounding UI (header, result box, buttons)
// and turns the played tricks into a scored result.

const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_HEX = { H: '#c0241c', D: '#c0241c', S: '#111', C: '#2a7d0e' };
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

function CompletionResultBox({ result }) {
  if (!result) return null;
  const denomDisplay = result.denomCode === 'N' ? 'NT' : (SUIT_SYM[result.denomCode] || result.denomCode);
  const denomColor = SUIT_HEX[result.denomCode] || '#111';
  const comparison = result.imps != null
    ? ` (IMPs = ${result.imps > 0 ? '+' : ''}${result.imps})`
    : result.mpPercent != null ? ` (MP% = ${result.mpPercent})` : '';
  return (
    <div style={{
      display: 'inline-block', boxSizing: 'border-box', minWidth: 108, marginTop: 6,
      padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5,
      background: '#fff', color: '#1f2937',
      fontFamily: 'ui-sans-serif, system-ui', fontSize: '0.82rem', fontWeight: 700,
    }}>
      <div>
        Result: {result.level}
        <span style={{ color: denomColor }}>{denomDisplay}</span>
        {result.doubled} {result.declarer} {result.resultText}
      </div>
      <div style={{ marginTop: 2, fontWeight: 600 }}>
        Score: {result.score > 0 ? '+' : ''}{result.score}{comparison}
      </div>
    </div>
  );
}

// Declarer's side plays declarer + dummy with only declarer's hand shown (dummy
// appears after the opening lead); a defender plays and sees just their own seat.
function seatAccess(direction, declarer) {
  const dir = String(direction || '').toUpperCase();
  const decl = String(declarer || '').toUpperCase();
  if (!PARTNER[dir]) return { userSeats: PARTNER[decl] ? [decl, PARTNER[decl]] : ['N', 'S'], visibleSeats: ['N', 'E', 'S', 'W'] };
  if (decl === dir || decl === PARTNER[dir]) return { userSeats: [decl, PARTNER[decl]], visibleSeats: [decl] };
  return { userSeats: [dir], visibleSeats: [dir] };
}

export default function PlayBoard({
  boardNumber,
  boardResult,
  nsTeamName,
  ewTeamName,
  direction = 'S',
  cardingNS = 'UDCA',
  cardingEW = 'UDCA',
  mode = 'play',
  onComplete,
  onTraveller,
  onResults,
}) {
  const isView = mode === 'view';
  const controllerRef = useRef(null);
  const [ddOn, setDdOn] = useState(false);

  // Keep the latest callbacks/scoring inputs in a ref so a parent re-render
  // doesn't remount the table mid-play.
  const completeRef = useRef(null);
  completeRef.current = { onComplete, boardResult };

  const lin = useMemo(() => {
    const base = normalizeLin(boardResult?.lin);
    if (!base || /pc\|/i.test(base)) return base;
    // No recorded play: add the known lead so a computer leader plays it.
    const lead = boardResult?.lead || (boardResult?.lead_suit && boardResult?.lead_rank
      ? `${boardResult.lead_suit}${String(boardResult.lead_rank).replace('10', 'T')}` : '');
    return lead ? `${base}pc|${lead}|` : base;
  }, [boardResult?.lin, boardResult?.lead, boardResult?.lead_suit, boardResult?.lead_rank]);

  const options = useMemo(() => {
    if (!lin) return null;
    const declarer = boardResult?.declarer || null;
    const shared = {
      lin,
      showAuction: true,
      contract: boardResult?.contract_level && boardResult?.contract_denom
        ? `${boardResult.contract_level}${boardResult.contract_denom}${boardResult.contract_x || ''}` : null,
      declarer,
      showResult: false,
      vulnerability: boardResult?.vulnerability,
      playerNames: {
        N: shortPlayerName(boardResult?.player_n_name),
        S: shortPlayerName(boardResult?.player_s_name),
        E: shortPlayerName(boardResult?.player_e_name),
        W: shortPlayerName(boardResult?.player_w_name),
      },
    };
    if (isView) return shared;
    const { userSeats, visibleSeats } = seatAccess(direction, declarer);
    return {
      ...shared,
      userSeats,
      visibleSeats,
      preplayLead: 'computer',
      pauseAfterTrick: true,
      cardingNS: cardingNS || 'UDCA',
      cardingEW: cardingEW || 'UDCA',
      onComplete: ({ contractData, declarerTricks }) => {
        const { onComplete: done, boardResult: br } = completeRef.current;
        if (!done || !contractData) return;
        const summary = completionSummary({
          contract: contractData,
          declarer: contractData.declarer,
          declarerTricks,
          vulnerability: br?.vulnerability,
          userSide: br?.completion_user_side,
          scoring: br?.completion_scoring,
          otherScore: br?.completion_other_score,
          travellerScores: br?.completion_traveller_scores,
        });
        if (summary) done({ ...summary, interactive: true, gaveUp: false, timestamp: new Date().toISOString() });
      },
    };
    // Scoring inputs are read from completeRef, so they don't remount the table.
  }, [lin, isView, direction, boardResult?.declarer, boardResult?.contract_level, boardResult?.contract_denom,
      boardResult?.contract_x, boardResult?.vulnerability, boardResult?.player_n_name, boardResult?.player_s_name,
      boardResult?.player_e_name, boardResult?.player_w_name, cardingNS, cardingEW]);

  // A fresh table (new board or mode) starts with DD off.
  useEffect(() => { setDdOn(false); }, [options]);

  // DD on the cards while stepping through recorded play, else a DD tricks table.
  const toggleDd = () => {
    controllerRef.current?.toggleDd();
    setDdOn(on => !on);
  };

  const btnStyle = { boxSizing: 'border-box', height: 28, fontSize: '0.8rem', lineHeight: '28px', padding: '0 10px', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#fff' };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ padding: '4px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
            {typeof boardNumber === 'string' ? boardNumber : `Board ${boardNumber}`}{(nsTeamName || ewTeamName) ? ':' : ''}
            {nsTeamName && <span style={{ marginLeft: 6, fontWeight: 500 }}>NS = {nsTeamName}</span>}
            {ewTeamName && <span style={{ marginLeft: 10, fontWeight: 500 }}>EW = {ewTeamName}</span>}
          </span>
        </div>

        {options ? (
          <>
            <BridgeLibMount kind={isView ? 'viewer' : 'player'} options={options} controllerRef={controllerRef} />
            {/* The result is only shown once the board is done (view mode), never during play. */}
            {isView && <div><CompletionResultBox result={boardResult?.completed_result} /></div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {isView && (
                <button type="button" onClick={toggleDd}
                  style={{ ...btnStyle, background: ddOn ? '#15803d' : '#16a34a' }}>
                  DD
                </button>
              )}
              {isView && (
                <button type="button" onClick={() => import(/* @vite-ignore */ '/bridge-lib/ddplay/DDPlay.js').then(m => m.openDdPlay(
                  lin,
                  boardResult.contract_level && boardResult.contract_denom
                    ? `${boardResult.contract_level}${boardResult.contract_denom}${boardResult.contract_x || ''} by ${boardResult.declarer || ''}`
                    : undefined
                ))}
                  style={{ ...btnStyle, background: '#7c3aed' }}>
                  DD Play
                </button>
              )}
              {isView && onTraveller && (
                <button type="button" onClick={onTraveller}
                  style={{ ...btnStyle, background: '#2563eb' }}>
                  Traveller
                </button>
              )}
              {onResults && (
                <button type="button" onClick={onResults}
                  style={{ ...btnStyle, background: '#0f766e' }}>
                  Results
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: '16px 0', textAlign: 'center' }}>
            No play data available.
          </div>
        )}
      </div>
    </div>
  );
}
