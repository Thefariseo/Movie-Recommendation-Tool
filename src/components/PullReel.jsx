import React from "react";

// A reel of film: a disc with five windows round a hub (cut out, so the page
// shows through), drawn once.
const hole = (cx, cy, r) => `M${(cx + r).toFixed(2)} ${cy.toFixed(2)}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z`;
const REEL = [hole(24, 24, 21), ...[0, 1, 2, 3, 4].map((i) => {
  const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return hole(24 + 11.5 * Math.cos(a), 24 + 11.5 * Math.sin(a), 5.6);
}), hole(24, 24, 2.6)].join("");

const LABELS = { pulling: "Pull for other picks", ready: "Release for other picks", loading: "Finding other picks…" };

/** Above the picks while they are drawn down (src/hooks/usePullToRefresh.js). */
export default function PullReel({ phase }) {
  return (
    <div className={`pull-reel pull-reel-${phase}`} aria-hidden={phase === "idle"} role={phase === "loading" ? "status" : undefined}>
      <svg viewBox="0 0 48 48" className="pull-reel-wheel" aria-hidden="true">
        <path d={REEL} fillRule="evenodd" fill="currentColor" />
      </svg>
      {phase !== "idle" && <span>{LABELS[phase]}</span>}
    </div>
  );
}
