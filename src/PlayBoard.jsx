import { IpsPlayer } from 'ips';

export default function PlayBoard({
  boardNumber,
  boardResult,
  nsTeamName,
  ewTeamName,
  direction = 'S',
  cardingNS = 'UDCA',
  cardingEW = 'UDCA',
  onComplete,
  onTraveller,
  onResults,
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ padding: '4px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
            Board {boardNumber}{(nsTeamName || ewTeamName) ? ':' : ''}
            {nsTeamName && (
              <span style={{ marginLeft: 6, fontWeight: 500 }}>NS = {nsTeamName}</span>
            )}
            {ewTeamName && (
              <span style={{ marginLeft: 10, fontWeight: 500 }}>EW = {ewTeamName}</span>
            )}
          </span>
        </div>

        {boardResult?.lin ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <IpsPlayer
              boardResult={boardResult}
              mode="play"
              autoStart
              hideDdButton
              direction={direction}
              cardingNS={cardingNS}
              cardingEW={cardingEW}
              onComplete={onComplete}
            />
            {(onTraveller || onResults) && (
              <div style={{ position: 'absolute', left: 0, bottom: 12, zIndex: 3, display: 'flex', gap: 6 }}>
                {onResults && <button type="button" onClick={onResults} style={{ boxSizing: 'border-box', height: 28, padding: '0 10px', border: 'none', borderRadius: 4, background: '#0f766e', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', lineHeight: '28px' }}>Results</button>}
                {onTraveller && <button type="button" onClick={onTraveller} style={{ boxSizing: 'border-box', height: 28, padding: '0 10px', border: 'none', borderRadius: 4, background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', lineHeight: '28px' }}>Traveller</button>}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: '16px 0', textAlign: 'center' }}>
            No play data available.
          </div>
        )}
      </div>
    </div>
  );
}
