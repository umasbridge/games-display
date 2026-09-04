import { useRef, useMemo } from 'react';
import { IpsPlayer } from 'ips';

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
  onPlay,
}) {
  const ipsControllerRef = useRef(null);
  const isView = mode === 'view';
  const isDdPlay = mode === 'dd-play';

  // Strip completion fields in view/dd-play so IPS player starts fresh
  // (completed_result causes reviewAvailable=true which shows Replay button,
  // forces the DD button visible, and skips to the end of the recorded play)
  const ipsResult = useMemo(() => {
    if (!boardResult || (!isView && !isDdPlay)) return boardResult;
    const { completed_result, completion_user_side, completion_other_score, completion_scoring, completion_traveller_scores, ...rest } = boardResult;
    return rest;
  }, [boardResult, isView, isDdPlay]);

  const btnStyle = { boxSizing: 'border-box', height: 28, fontSize: '0.8rem', lineHeight: '28px', padding: '0 10px', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#fff' };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ padding: '4px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
            Board {boardNumber}{(nsTeamName || ewTeamName) ? ':' : ''}
            {nsTeamName && <span style={{ marginLeft: 6, fontWeight: 500 }}>NS = {nsTeamName}</span>}
            {ewTeamName && <span style={{ marginLeft: 10, fontWeight: 500 }}>EW = {ewTeamName}</span>}
          </span>
        </div>

        {boardResult?.lin ? (
          <>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <IpsPlayer
                boardResult={ipsResult}
                mode={isDdPlay ? 'play' : mode}
                autoStart={!isView}
                hideDdButton
                ddPlay={isDdPlay}
                direction={direction}
                cardingNS={cardingNS}
                cardingEW={cardingEW}
                onComplete={isView || isDdPlay ? undefined : onComplete}
                onPlayerReady={isView ? (player) => { ipsControllerRef.current = player; } : undefined}
              />
              {/* Play mode only: Results overlay */}
              {!isView && !isDdPlay && onResults && (
                <div style={{ position: 'absolute', left: 0, bottom: 12, zIndex: 3 }}>
                  <button type="button" onClick={onResults} style={{ ...btnStyle, background: '#0f766e' }}>Results</button>
                </div>
              )}
            </div>
            {/* View / dd-play mode: buttons below IPS player */}
            {(isView || isDdPlay) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {isView && (
                  <button type="button" onClick={() => ipsControllerRef.current?.toggleDd()}
                    style={{ ...btnStyle, background: '#16a34a' }}>
                    DD
                  </button>
                )}
                {onPlay && (
                  <button type="button" onClick={onPlay}
                    style={{ ...btnStyle, background: isDdPlay ? '#6b7280' : '#7c3aed' }}>
                    {isDdPlay ? '◀ View' : '▶ Play'}
                  </button>
                )}
                {onTraveller && (
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
            )}
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
