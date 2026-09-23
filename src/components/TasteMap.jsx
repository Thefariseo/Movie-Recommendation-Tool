import React, { useEffect, useRef } from "react";

// The taste map on a canvas: every film as a faint dot, the member's films on
// top (loved in indigo, disliked in rose), a few famous films as landmarks,
// the member's centre, and journey paths as dotted lines.
export default function TasteMap({ map, landmarks = [], points = [], centre = null, journeys = [] }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !map) return undefined;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      const dark = document.documentElement.classList.contains("dark");
      // Keep the map's proportions whatever the canvas shape, centred.
      const side = Math.min(w, h * 1.6) - 28;
      const ox = (w - side) / 2, oy = (h - side / 1.6) / 2;
      const px = (x) => ox + x * side, py = (y) => oy + y * (side / 1.6);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dark ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.16)";
      for (let i = 0; i < map.n; i++) ctx.fillRect(px(map.x[i]), py(map.y[i]), 1.2, 1.2);
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = dark ? "rgba(203,213,225,0.55)" : "rgba(71,85,105,0.6)";
      // Best-known first; a label that would overlap one already drawn is skipped.
      const drawn = [];
      for (const l of landmarks.slice(0, 80)) {
        const text = l.title.length > 22 ? `${l.title.slice(0, 21)}…` : l.title;
        const box = { x: px(l.x) + 3, y: py(l.y) - 12, w: ctx.measureText(text).width, h: 12 };
        if (drawn.some((d) => box.x < d.x + d.w + 6 && d.x < box.x + box.w + 6 && box.y < d.y + d.h && d.y < box.y + box.h)) continue;
        drawn.push(box);
        ctx.fillText(text, box.x, box.y + 9);
        if (drawn.length >= 24) break;
      }
      journeys.forEach((j, n) => {
        const colour = ["#f59e0b", "#10b981", "#ec4899"][n % 3];
        ctx.strokeStyle = colour;
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const start = points.find((p) => p.id === j.from.id);
        if (start) ctx.moveTo(px(start.x), py(start.y));
        j.steps.forEach((s, i) => (i === 0 && !start ? ctx.moveTo(px(s.x), py(s.y)) : ctx.lineTo(px(s.x), py(s.y))));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colour;
        for (const s of j.steps) { ctx.beginPath(); ctx.arc(px(s.x), py(s.y), 3, 0, 7); ctx.fill(); }
      });
      for (const p of points) {
        ctx.fillStyle = p.rated >= 7 ? "#6366f1" : p.rated != null && p.rated <= 4 ? "#f43f5e" : dark ? "#94a3b8" : "#64748b";
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), p.rated >= 9 ? 4 : 3, 0, 7);
        ctx.fill();
      }
      if (centre) {
        ctx.strokeStyle = dark ? "#fff" : "#0f172a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px(centre.x), py(centre.y), 7, 0, 7);
        ctx.stroke();
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillStyle = dark ? "#fff" : "#0f172a";
        ctx.fillText("You", px(centre.x) + 9, py(centre.y) + 4);
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [map, landmarks, points, centre, journeys]);
  return <canvas ref={ref} className="w-full rounded-xl bg-slate-50 dark:bg-slate-900" style={{ aspectRatio: "16 / 10", maxHeight: 560 }} role="img" aria-label="Map of films arranged by who loves them, with your films highlighted" />;
}
