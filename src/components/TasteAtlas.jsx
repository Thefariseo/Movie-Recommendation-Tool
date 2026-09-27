import React, { useEffect, useMemo, useRef, useState } from "react";
import { territoryName } from "../../shared/atlas.js";

// Colours of the territories, light and dark.
const FILL = {
  conquered: ["rgba(79,70,229,0.62)", "rgba(129,140,248,0.62)"],
  settled: ["rgba(129,140,248,0.34)", "rgba(99,102,241,0.34)"],
  frontier: ["rgba(245,158,11,0.30)", "rgba(245,158,11,0.26)"],
  unexplored: ["rgba(148,163,184,0.16)", "rgba(100,116,139,0.20)"],
};
const STATUS_LABEL = { conquered: "Conquered", settled: "Visited", frontier: "On your frontier", unexplored: "Unexplored" };
const JOURNEY_COLOURS = ["#f59e0b", "#10b981", "#ec4899", "#0ea5e9"];
const short = (t, n = 20) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * The taste map as territories: every region's shape from a grid over the
 * map, filled by what the member has made of it (conquered, visited,
 * frontier, unexplored), with borders, names, the member's films and centre,
 * journeys as trails, and friends' footprints on top. `onPick(regionId)`.
 */
export default function TasteAtlas({ model, grid, lands, points = [], centre = null, journeys = [], friends = [], selected = null, onPick, compact = false }) {
  const ref = useRef(null);
  const layout = useRef(null);
  const [hover, setHover] = useState(null);
  // Where each region's name goes: the middle of its cells.
  const anchors = useMemo(() => {
    const sum = new Map();
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
      const r = grid.cells[y * grid.w + x];
      if (r < 0) continue;
      const s = sum.get(r) || { x: 0, y: 0, n: 0 };
      sum.set(r, { x: s.x + (x + 0.5) / grid.w, y: s.y + (y + 0.5) / grid.h, n: s.n + 1 });
    }
    return new Map([...sum].map(([r, s]) => [r, { x: s.x / s.n, y: s.y / s.n, n: s.n }]));
  }, [grid]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      const dark = document.documentElement.classList.contains("dark");
      const d = dark ? 1 : 0;
      const side = Math.min(w, h * 1.6) - 16;
      const ox = (w - side) / 2, oy = (h - side / 1.6) / 2;
      const px = (x) => ox + x * side, py = (y) => oy + y * (side / 1.6);
      const cw = side / grid.w, ch = side / 1.6 / grid.h;
      layout.current = { ox, oy, side };
      ctx.clearRect(0, 0, w, h);

      // Land: each cell in its territory's colour; the selected one brighter.
      for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
        const r = grid.cells[y * grid.w + x];
        if (r < 0) continue;
        const status = lands.get(r)?.status || "unexplored";
        ctx.fillStyle = r === selected ? (dark ? "rgba(251,191,36,0.55)" : "rgba(217,119,6,0.45)") : FILL[status][d];
        ctx.fillRect(ox + x * cw, oy + y * ch, cw + 0.5, ch + 0.5);
      }
      // Borders between territories, and the coast.
      ctx.strokeStyle = dark ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
        const r = grid.cells[y * grid.w + x];
        if (r < 0) continue;
        const right = x + 1 < grid.w ? grid.cells[y * grid.w + x + 1] : -1;
        const below = y + 1 < grid.h ? grid.cells[(y + 1) * grid.w + x] : -1;
        if (right !== r) { ctx.moveTo(ox + (x + 1) * cw, oy + y * ch); ctx.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
        if (below !== r) { ctx.moveTo(ox + x * cw, oy + (y + 1) * ch); ctx.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
        if (x === 0 || grid.cells[y * grid.w + x - 1] < 0) { ctx.moveTo(ox + x * cw, oy + y * ch); ctx.lineTo(ox + x * cw, oy + (y + 1) * ch); }
        if (y === 0 || grid.cells[(y - 1) * grid.w + x] < 0) { ctx.moveTo(ox + x * cw, oy + y * ch); ctx.lineTo(ox + (x + 1) * cw, oy + y * ch); }
      }
      ctx.stroke();

      // Friends' footprints: the edge of the territories they have visited,
      // their films as small dots, and their centre, named.
      for (const f of friends) {
        const theirs = f.visited || new Map();
        ctx.strokeStyle = f.colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
          const r = grid.cells[y * grid.w + x];
          if (r < 0 || !theirs.has(r)) continue;
          const out = (nx, ny) => nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h || !theirs.has(grid.cells[ny * grid.w + nx]);
          if (out(x + 1, y)) { ctx.moveTo(ox + (x + 1) * cw, oy + y * ch); ctx.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
          if (out(x - 1, y)) { ctx.moveTo(ox + x * cw, oy + y * ch); ctx.lineTo(ox + x * cw, oy + (y + 1) * ch); }
          if (out(x, y + 1)) { ctx.moveTo(ox + x * cw, oy + (y + 1) * ch); ctx.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
          if (out(x, y - 1)) { ctx.moveTo(ox + x * cw, oy + y * ch); ctx.lineTo(ox + (x + 1) * cw, oy + y * ch); }
        }
        ctx.stroke();
        ctx.fillStyle = f.colour;
        for (const p of f.points) { ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 2.2, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
        if (f.centre) {
          ctx.strokeStyle = f.colour;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px(f.centre.x), py(f.centre.y), 6, 0, 7); ctx.stroke();
          ctx.font = "bold 11px system-ui, sans-serif";
          ctx.fillText(f.name, px(f.centre.x) + 8, py(f.centre.y) + 4);
        }
      }

      // Journeys as trails, with a flag where they arrive.
      journeys.map((j) => ({ ...j, steps: j.steps.filter((s) => s.x != null && s.y != null) })).filter((j) => j.steps.length).forEach((j, n) => {
        const colour = JOURNEY_COLOURS[n % JOURNEY_COLOURS.length];
        ctx.strokeStyle = colour;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const start = points.find((p) => p.id === j.from?.id);
        if (start) ctx.moveTo(px(start.x), py(start.y));
        j.steps.forEach((s, i) => (i === 0 && !start ? ctx.moveTo(px(s.x), py(s.y)) : ctx.lineTo(px(s.x), py(s.y))));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colour;
        for (const s of j.steps) { ctx.beginPath(); ctx.arc(px(s.x), py(s.y), 3, 0, 7); ctx.fill(); }
        const end = j.steps.at(-1);
        ctx.fillRect(px(end.x), py(end.y) - 14, 1.5, 14);
        ctx.beginPath(); ctx.moveTo(px(end.x) + 1.5, py(end.y) - 14); ctx.lineTo(px(end.x) + 10, py(end.y) - 10.5); ctx.lineTo(px(end.x) + 1.5, py(end.y) - 7); ctx.fill();
      });

      // The member's films: loved in indigo, disliked in rose.
      for (const p of points) {
        ctx.fillStyle = p.rated >= 7 ? (dark ? "#c7d2fe" : "#312e81") : p.rated != null && p.rated <= 4 ? "#f43f5e" : dark ? "#94a3b8" : "#475569";
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), p.rated >= 9 ? 3.2 : 2.4, 0, 7);
        ctx.fill();
      }

      // Names: every territory the member knows or borders, the selected one, and the largest others.
      ctx.textAlign = "center";
      const drawn = [];
      const named = [...anchors].map(([r, a]) => ({ r, a, t: lands.get(r) }))
        .filter(({ t }) => t)
        .sort((x, y) => (y.r === selected) - (x.r === selected) || ["conquered", "settled", "frontier", "unexplored"].indexOf(x.t.status) - ["conquered", "settled", "frontier", "unexplored"].indexOf(y.t.status) || y.a.n - x.a.n);
      for (const { r, a, t } of named) {
        if (compact && t.status === "unexplored" && r !== selected) continue;
        const title = (t.status === "frontier" ? "? " : "") + short(t.region.landmarks?.[0]?.title || territoryName(t.region), compact ? 16 : 22);
        ctx.font = `${t.status === "conquered" || r === selected ? "600 " : ""}${compact ? 9 : 10}px system-ui, sans-serif`;
        const tw = ctx.measureText(title).width;
        // Kept inside the canvas, so names at the edge are not cut.
        const cx = Math.min(w - tw / 2 - 4, Math.max(tw / 2 + 4, px(a.x)));
        const box = { x: cx - tw / 2, y: py(a.y) - 6, w: tw, h: 12 };
        if (drawn.some((b) => box.x < b.x + b.w + 4 && b.x < box.x + box.w + 4 && box.y < b.y + b.h && b.y < box.y + box.h)) continue;
        drawn.push(box);
        ctx.fillStyle = t.status === "conquered" ? (dark ? "#e0e7ff" : "#1e1b4b") : t.status === "frontier" ? (dark ? "#fcd34d" : "#92400e") : dark ? "rgba(226,232,240,0.75)" : "rgba(51,65,85,0.75)";
        ctx.fillText(title, cx, py(a.y) + 4);
      }
      ctx.textAlign = "start";

      if (centre) {
        ctx.strokeStyle = dark ? "#fff" : "#0f172a";
        ctx.fillStyle = dark ? "#fff" : "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px(centre.x), py(centre.y), 7, 0, 7); ctx.stroke();
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.fillText("You", px(centre.x) + 10, py(centre.y) + 4);
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [grid, lands, points, centre, journeys, friends, selected, anchors, compact]);

  const regionUnder = (event) => {
    const box = ref.current?.getBoundingClientRect();
    const l = layout.current;
    if (!box || !l) return null;
    const x = (event.clientX - box.left - l.ox) / l.side;
    const y = (event.clientY - box.top - l.oy) / (l.side / 1.6);
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    const r = grid.cells[Math.floor(y * grid.h) * grid.w + Math.floor(x * grid.w)];
    return r < 0 ? null : { r, left: event.clientX - box.left, top: event.clientY - box.top };
  };
  const tip = hover && lands.get(hover.r);
  return (
    <div className="relative">
      <canvas
        ref={ref}
        onClick={(e) => { const hit = regionUnder(e); if (hit && onPick) onPick(hit.r); }}
        onMouseMove={(e) => setHover(regionUnder(e))}
        onMouseLeave={() => setHover(null)}
        className={`w-full rounded-xl bg-sky-50/60 dark:bg-slate-950 ${onPick ? "cursor-pointer" : ""}`}
        style={{ aspectRatio: "16 / 10", maxHeight: compact ? 460 : 640 }}
        role="img"
        aria-label={`Map of cinema in ${model.regions.length} territories, coloured by how much of each you have explored.`}
      />
      {tip && (
        <div className="pointer-events-none absolute z-10 max-w-xs rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: Math.min(hover.left + 12, (ref.current?.clientWidth || 0) - 220), top: hover.top + 12 }}>
          <p className="font-semibold">{territoryName(tip.region)}</p>
          <p className="text-slate-300">{STATUS_LABEL[tip.status]}{tip.seen ? ` · ${tip.seen} seen, ${tip.loved} loved` : ""}</p>
        </div>
      )}
    </div>
  );
}
