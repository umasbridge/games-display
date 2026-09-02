import { IpsPlayer } from 'ips';

export default function PlayBoard({
  boardNumber,
  boardResult,
  direction = 'S',
  cardingNS = 'UDCA',
  cardingEW = 'UDCA',
  onComplete,
  onTraveller,
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ padding: '4px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Board {boardNumber}</span>
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
            {onTraveller && (
              <button
                type="button"
                onClick={onTraveller}
                style={{
                  position: 'absolute', left: 78, bottom: 12, zIndex: 3,
                  boxSizing: 'border-box', height: 28, padding: '0 10px',
                  border: 'none', borderRadius: 4, background: '#2563eb',
                  color: '#fff', cursor: 'pointer', fontSize: '0.8rem', lineHeight: '28px',
                }}
              >
                Traveller
              </button>
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
