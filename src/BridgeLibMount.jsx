import { useRef, useEffect, useState } from 'react';

// The table components are plain JS modules served by bsd-app under /bridge-lib:
//   BridgePlayer — the user plays, the computer plays the other seats
//   DealViewer   — view a deal / step through its recorded play
const COMPONENTS = {
  player: { url: '/bridge-lib/bridge-player/BridgePlayer.js', mount: 'mountBridgePlayer' },
  viewer: { url: '/bridge-lib/deal-viewer/DealViewer.js', mount: 'mountDealViewer' },
};

export const loadBridgeLib = kind => import(/* @vite-ignore */ COMPONENTS[kind].url);

// "John Smith" → "J Smith", capped at 16 characters (fits the seat label).
export function shortPlayerName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts.at(-1).toLowerCase() === parts.at(-2).toLowerCase()) parts.pop();
  if (parts.length < 2) return parts[0] || '';
  const abbreviated = `${parts.slice(0, -1).map(part => part[0].toUpperCase()).join(' ')} ${parts.at(-1)}`;
  return abbreviated.length > 16 ? `${abbreviated.slice(0, 15).trimEnd()}…` : abbreviated;
}

export function normalizeLin(lin) {
  return String(lin || '').replace(/mb\|ap\|/gi, 'mb|p|mb|p|mb|p|').replace(/mb\|P\|/g, 'mb|p|');
}

// Hosts a bridge-lib table component in a React tree. Remounts when `kind` or
// `options` changes (memoize options); the component's controller is exposed
// through controllerRef (unmount, setDdOverlay, toggleDd…).
export default function BridgeLibMount({ kind, options, controllerRef }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let controller = null;
    let cancelled = false;
    setError(null);
    loadBridgeLib(kind)
      .then(mod => {
        if (cancelled || !ref.current) return;
        controller = mod[COMPONENTS[kind].mount](ref.current, options);
        if (controllerRef) controllerRef.current = controller;
      })
      .catch(err => { if (!cancelled) setError(String(err?.message || err)); });
    return () => {
      cancelled = true;
      controller?.unmount();
      if (controllerRef) controllerRef.current = null;
    };
  }, [kind, options, controllerRef]);
  if (error) return <div style={{ color: '#dc2626', fontSize: '0.85rem', padding: '0.5rem 0' }}>Could not load table: {error}</div>;
  return <div ref={ref} style={{ width: 478, maxWidth: '100%', minHeight: 200 }} />;
}
