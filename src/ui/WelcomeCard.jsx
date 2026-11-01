import { useEffect, useRef } from 'react';

// Key under which "the guide has been seen" is remembered in this browser.
export const WELCOME_KEY = 'pegc.welcome.seen';

export function welcomeSeen() {
  try { return window.localStorage.getItem(WELCOME_KEY) === '1'; } catch { return false; }
}
export function rememberWelcome() {
  try { window.localStorage.setItem(WELCOME_KEY, '1'); } catch { /* storage may be unavailable; the card simply shows again */ }
}

// First-visit guide. Opens automatically once, closes with the button, Esc or a click outside,
// and can be reopened from the "?" button in the top bar.
export function WelcomeCard({ onClose }) {
  const btn = useRef(null);

  useEffect(() => {
    const before = document.activeElement;
    if (btn.current) btn.current.focus();
    return () => { if (before && before.focus) before.focus(); };
  }, []);

  // Keys pressed inside the card must not reach the map shortcuts (pan, zoom, space to pause).
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'Tab') { e.preventDefault(); if (btn.current) btn.current.focus(); }
    e.stopPropagation();
  };

  return (
    <div className="welcome-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="welcome glass" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-intro" onKeyDown={onKeyDown}>
        <h2 id="welcome-title">Welcome to PEGC</h2>
        <p id="welcome-intro" className="welcome-intro">
          Predictive Emergency Green Corridor: does clearing signals for an ambulance cost the rest of the traffic?
        </p>
        <ol className="welcome-steps">
          <li><b>Watch it.</b> Press <b>Launch simulation</b> on the Command Centre and follow the ambulance across the six-junction grid. Use the Strategy menu to switch between A (fixed-time), B (basic priority) and C (PEGC).</li>
          <li><b>Compare it.</b> Open <b>Compare</b> to run all three on the same seeds and read the table. A result that is worse is shown as worse.</li>
          <li><b>Stress it.</b> Open <b>Stress Test</b> to add heavy traffic or block a road on the route, then see what changes.</li>
        </ol>
        <p className="welcome-fine">
          Move the map by scrolling or dragging; hold Ctrl and scroll (or pinch) to zoom. This is a <b>browser mini-simulator: not SUMO results</b>. It uses a simulated grid, simplified driver behaviour and a rule-based arrival estimate (not machine learning), with no real-world validation.
        </p>
        <div className="welcome-actions">
          <button ref={btn} className="btn primary" onClick={onClose}>Start exploring</button>
        </div>
      </div>
    </div>
  );
}
