import { useState, useEffect, useRef } from 'react';
import { mountIpsPlayer } from 'ips';
import { BiddingTable } from './HandDiagram.jsx';

const SCRIPT_ORDER = [
  '/bridge-problems/lin.js',
  '/bridge-problems/play.js',
  '/bridge-lib/ips/ips.js',
];
const DDS_PATH = '/bridge-problems/dds/dds-api.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let _scriptsReady = null;
function ensureScripts() {
  if (!_scriptsReady) {
    _scriptsReady = SCRIPT_ORDER.reduce(
      (p, src) => p.then(() => loadScript(src)),
      Promise.resolve()
    );
  }
  return _scriptsReady;
}

function normalizeLinForIps(lin) {
  if (!lin) return null;
  return lin.replace(/mb\|ap\|/gi, 'mb|p|mb|p|mb|p|');
}

function linPlayCards(lin) {
  return [...(lin || '').matchAll(/pc\|([^|]+)\|/g)].map(m => m[1]);
}

export default function ReplayModal({ board, result, playerNames, onClose }) {
  const containerRef = useRef(null);
  const navRef = useRef(null);
  const playerRef = useRef(null);
  const [error, setError] = useState(null);
  const [pos, setPos] = useState(null);
  const dragRef = useRef(null);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const el = dragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (pos === null) setPos({ x: rect.left, y: rect.top });
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    const onMove = (ev) => setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  const ipsLin = normalizeLinForIps(result?.lin);
  const playCards = linPlayCards(result?.lin);
  const dealer = board?.dealer;

  useEffect(() => {
    if (!ipsLin) return;
    setError(null);
    ensureScripts()
      .then(() => {
        if (!containerRef.current) return;
        playerRef.current?.unmount();
        playerRef.current = mountIpsPlayer(containerRef.current, {
          row: {
            lin: ipsLin,
            problem_visible_hands: ['N', 'S', 'E', 'W'],
            play: playCards.length ? playCards : undefined,
            player_names: playerNames || null,
          },
          ddsPath: DDS_PATH,
          navEl: navRef.current,
          ddOn: true,
          hideDdButton: true,
        });
      })
      .catch(err => setError(String(err?.message || err)));
    return () => {
      playerRef.current?.unmount();
      playerRef.current = null;
    };
  }, [ipsLin]);

  const dialogStyle = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, width: 700, maxWidth: '95vw', maxHeight: '92vh', zIndex: 201, background: '#fff', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 700, maxWidth: '95vw', maxHeight: '92vh', zIndex: 201, background: '#fff', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }}
        onClick={onClose}
      />
      <div ref={dragRef} style={dialogStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #e5e7eb', cursor: 'move', userSelect: 'none' }}
             onMouseDown={handleMouseDown}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Board {board?.board_number}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 14px' }}>
          {result?.lin && dealer && (
            <div style={{ marginBottom: 12 }}>
              <BiddingTable lin={result.lin} dealer={dealer} />
            </div>
          )}
          <div ref={navRef} style={{ display: 'flex', gap: 4, alignItems: 'center', minHeight: 28, marginBottom: 4 }} />
          {error ? (
            <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>Could not load player: {error}</div>
          ) : (
            <div ref={containerRef} style={{ minHeight: 200 }} />
          )}
        </div>
      </div>
    </>
  );
}
