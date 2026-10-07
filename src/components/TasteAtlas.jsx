import React, { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { territoryName } from "../../shared/atlas.js";
import { reducedMotion } from "../utils/motion";

// Colours of the territories, light and dark.
const FILL = {
  conquered: ["rgba(119,33,46,0.62)", "rgba(219,150,160,0.62)"],
  settled: ["rgba(192,90,105,0.28)", "rgba(219,150,160,0.25)"],
  frontier: ["rgba(245,158,11,0.30)", "rgba(245,158,11,0.26)"],
  unexplored: ["rgba(148,163,184,0.16)", "rgba(100,116,139,0.20)"],
};
const STATUS_LABEL = { conquered: "Conquered", settled: "Visited", frontier: "On your frontier", unexplored: "Unexplored" };
const JOURNEY_COLOURS = ["#f59e0b", "#10b981", "#ec4899", "#0ea5e9"];
const short = (t, n = 20) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// How the map moves: how far it zooms, how long things take to come and go,
// and how quickly a flung map slows down (its speed kept per millisecond).
const MAX_ZOOM = 6, FADE = 420, MOVE = 700, FRICTION = 0.9955;
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// Things on the map that come and go (the member's films, friends' maps,
// journeys): each fades in when it arrives and out when it leaves.
function track(map, items, key, now) {
  const here = new Set();
  for (const item of items) {
    const k = key(item);
    here.add(k);
    const had = map.get(k);
    if (had && had.out == null) had.item = item;
    else map.set(k, { item, in: now, out: null });
  }
  for (const entry of map.values()) if (!here.has(key(entry.item)) && entry.out == null) entry.out = now;
}
const alphaOf = (e, now) => (e.out != null ? 1 - ease((now - e.out) / FADE) : ease((now - e.in) / FADE));

// The map's shape on the canvas: where its corner sits and how wide it is.
function frameOf(w, h) {
  const side = Math.min(w, h * 1.6) - 16;
  return { ox: (w - side) / 2, oy: (h - side / 1.6) / 2, side };
}

// The camera never shows past the map's edges.
function clamp(sc, cam = sc.cam) {
  cam.k = Math.min(MAX_ZOOM, Math.max(1, cam.k));
  cam.x = Math.min(0, Math.max(sc.w - sc.w * cam.k, cam.x));
  cam.y = Math.min(0, Math.max(sc.h - sc.h * cam.k, cam.y));
  return cam;
}

// The territories, drawn once into a picture (at the sharpness the zoom
// needs) and laid under the camera on every frame: each row's runs of one
// colour as single blocks, on whole pixels, so no seams show when zoomed in.
// Their borders are a path, stroked as a hairline at any zoom.
function paintLand(sc, d, w, h, res, dark) {
  const canvas = sc.land?.canvas || document.createElement("canvas");
  canvas.width = Math.round(w * res);
  canvas.height = Math.round(h * res);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(res, 0, 0, res, 0, 0);
  const { grid, lands, selected } = d;
  const { ox, oy, side } = frameOf(w, h);
  const cw = side / grid.w, ch = side / 1.6 / grid.h;
  const dk = dark ? 1 : 0;
  const snap = (v) => Math.round(v * res) / res;
  const pick = dark ? "rgba(251,191,36,0.55)" : "rgba(217,119,6,0.45)";
  for (let y = 0; y < grid.h; y++) {
    const y0 = snap(oy + y * ch), y1 = snap(oy + (y + 1) * ch);
    let from = 0, fill = null;
    for (let x = 0; x <= grid.w; x++) {
      const r = x < grid.w ? grid.cells[y * grid.w + x] : -1;
      const next = r < 0 ? null : r === selected ? pick : FILL[lands.get(r)?.status || "unexplored"][dk];
      if (next === fill) continue;
      if (fill) {
        const x0 = snap(ox + from * cw), x1 = snap(ox + x * cw);
        ctx.fillStyle = fill;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      fill = next;
      from = x;
    }
  }
  // Borders between territories, and the coast.
  const borders = sc.land?.key === `${d.version}|${w}x${h}` ? sc.land.borders : new Path2D();
  if (borders !== sc.land?.borders) {
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
      const r = grid.cells[y * grid.w + x];
      if (r < 0) continue;
      const right = x + 1 < grid.w ? grid.cells[y * grid.w + x + 1] : -1;
      const below = y + 1 < grid.h ? grid.cells[(y + 1) * grid.w + x] : -1;
      if (right !== r) { borders.moveTo(ox + (x + 1) * cw, oy + y * ch); borders.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
      if (below !== r) { borders.moveTo(ox + x * cw, oy + (y + 1) * ch); borders.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
      if (x === 0 || grid.cells[y * grid.w + x - 1] < 0) { borders.moveTo(ox + x * cw, oy + y * ch); borders.lineTo(ox + x * cw, oy + (y + 1) * ch); }
      if (y === 0 || grid.cells[(y - 1) * grid.w + x] < 0) { borders.moveTo(ox + x * cw, oy + y * ch); borders.lineTo(ox + (x + 1) * cw, oy + y * ch); }
    }
  }
  return { canvas, res, borders, key: `${d.version}|${w}x${h}`, dark };
}

// A friend's footprint: the edge of the territories they have visited.
function footprint(grid, theirs, w, h) {
  const { ox, oy, side } = frameOf(w, h);
  const cw = side / grid.w, ch = side / 1.6 / grid.h;
  const path = new Path2D();
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    const r = grid.cells[y * grid.w + x];
    if (r < 0 || !theirs.has(r)) continue;
    const out = (nx, ny) => nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h || !theirs.has(grid.cells[ny * grid.w + nx]);
    if (out(x + 1, y)) { path.moveTo(ox + (x + 1) * cw, oy + y * ch); path.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
    if (out(x - 1, y)) { path.moveTo(ox + x * cw, oy + y * ch); path.lineTo(ox + x * cw, oy + (y + 1) * ch); }
    if (out(x, y + 1)) { path.moveTo(ox + x * cw, oy + (y + 1) * ch); path.lineTo(ox + (x + 1) * cw, oy + (y + 1) * ch); }
    if (out(x, y - 1)) { path.moveTo(ox + x * cw, oy + y * ch); path.lineTo(ox + (x + 1) * cw, oy + y * ch); }
  }
  return path;
}

// One frame of the map. Returns whether anything is still moving.
function paint(canvas, sc, d, now) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  if (sc.w !== w || sc.h !== h) { sc.w = w; sc.h = h; sc.prints = new Map(); clamp(sc); }
  const dt = sc.last ? Math.min(64, now - sc.last) : 16;
  sc.last = now;
  let moving = false;

  // The camera: a flung map glides on and slows; a zoom eases to its goal.
  const cam = sc.cam;
  if (sc.vel) {
    const before = { x: cam.x + sc.vel.x * dt, y: cam.y + sc.vel.y * dt };
    cam.x = before.x; cam.y = before.y;
    clamp(sc);
    // At an edge it stops that way.
    if (cam.x !== before.x) sc.vel.x = 0;
    if (cam.y !== before.y) sc.vel.y = 0;
    const decay = Math.pow(FRICTION, dt);
    sc.vel.x *= decay; sc.vel.y *= decay;
    if (Math.hypot(sc.vel.x, sc.vel.y) < 0.015) sc.vel = null;
    else moving = true;
  }
  if (sc.goal) {
    const g = sc.goal, f = 1 - Math.pow(0.8, dt / 16);
    cam.x += (g.x - cam.x) * f; cam.y += (g.y - cam.y) * f; cam.k += (g.k - cam.k) * f;
    if (Math.abs(g.x - cam.x) < 0.3 && Math.abs(g.y - cam.y) < 0.3 && Math.abs(g.k - cam.k) < 0.002) { Object.assign(cam, g); sc.goal = null; }
    else moving = true;
  }
  const { x: tx, y: ty, k } = cam;
  const settled = !moving && !sc.held;

  const dark = document.documentElement.classList.contains("dark");
  const { ox, oy, side } = frameOf(w, h);
  sc.layout = { ox, oy, side };
  const px = (x) => ox + x * side, py = (y) => oy + y * (side / 1.6);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // The land, sharp enough for the zoom once the camera rests.
  const want = Math.min(dpr * Math.max(1, Math.ceil(k)), 4096 / w);
  const key = `${d.version}|${w}x${h}`;
  if (!sc.land || sc.land.key !== key || sc.land.dark !== dark || (settled && sc.land.res < want - 0.01)) sc.land = paintLand(sc, d, w, h, settled ? want : Math.min(want, dpr * 2), dark);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
  ctx.drawImage(sc.land.canvas, 0, 0, w, h);
  ctx.strokeStyle = dark ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1 / k;
  ctx.stroke(sc.land.borders);

  // Sizes that stay the same on screen at any zoom, or grow a little.
  const px1 = 1 / k, grow = 1 / Math.pow(k, 0.65);

  // Friends' footprints: the edge of their territories, their films as small
  // dots, and their centre, named.
  for (const [id, e] of sc.friends) {
    const a = alphaOf(e, now);
    if (a <= 0 && e.out != null) { sc.friends.delete(id); continue; }
    if (a < 1) moving = true;
    const f = e.item;
    let path = sc.prints.get(id);
    if (!path || path.of !== f.visited) { path = { of: f.visited, p: footprint(d.grid, f.visited || new Map(), w, h) }; sc.prints.set(id, path); }
    ctx.globalAlpha = a;
    ctx.strokeStyle = f.colour;
    ctx.lineWidth = 2 * px1;
    ctx.stroke(path.p);
    ctx.fillStyle = f.colour;
    ctx.globalAlpha = a * 0.75;
    for (const p of f.points) { ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 2.2 * grow, 0, 7); ctx.fill(); }
    ctx.globalAlpha = a;
    if (f.centre) {
      ctx.lineWidth = 2 * px1;
      ctx.beginPath(); ctx.arc(px(f.centre.x), py(f.centre.y), 6 * px1, 0, 7); ctx.stroke();
      ctx.font = `bold ${11 * px1}px system-ui, sans-serif`;
      ctx.fillText(f.name, px(f.centre.x) + 8 * px1, py(f.centre.y) + 4 * px1);
    }
  }
  ctx.globalAlpha = 1;

  // Journeys as trails, with a flag where they arrive.
  let n = 0;
  for (const [id, e] of sc.trails) {
    const a = alphaOf(e, now);
    if (a <= 0 && e.out != null) { sc.trails.delete(id); continue; }
    if (a < 1) moving = true;
    const j = e.item, colour = JOURNEY_COLOURS[n++ % JOURNEY_COLOURS.length];
    ctx.globalAlpha = a;
    ctx.strokeStyle = colour;
    ctx.setLineDash([4 * px1, 4 * px1]);
    ctx.lineWidth = 2 * px1;
    ctx.beginPath();
    const start = d.points.find((p) => p.id === j.from?.id);
    if (start) ctx.moveTo(px(start.x), py(start.y));
    j.steps.forEach((s, i) => (i === 0 && !start ? ctx.moveTo(px(s.x), py(s.y)) : ctx.lineTo(px(s.x), py(s.y))));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colour;
    for (const s of j.steps) { ctx.beginPath(); ctx.arc(px(s.x), py(s.y), 3 * grow, 0, 7); ctx.fill(); }
    const end = j.steps.at(-1), fx = px(end.x), fy = py(end.y);
    ctx.fillRect(fx, fy - 14 * px1, 1.5 * px1, 14 * px1);
    ctx.beginPath(); ctx.moveTo(fx + 1.5 * px1, fy - 14 * px1); ctx.lineTo(fx + 10 * px1, fy - 10.5 * px1); ctx.lineTo(fx + 1.5 * px1, fy - 7 * px1); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The member's films: loved in deep red, disliked in rose. A film just
  // added grows into its place; one taken away shrinks out of it.
  for (const [id, e] of sc.dots) {
    const a = alphaOf(e, now);
    if (a <= 0 && e.out != null) { sc.dots.delete(id); continue; }
    if (a < 1) moving = true;
    const p = e.item;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.rated >= 7 ? (dark ? "#f5e1e3" : "#4a151d") : p.rated != null && p.rated <= 4 ? "#f43f5e" : dark ? "#94a3b8" : "#475569";
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), (p.rated >= 9 ? 3.2 : 2.4) * grow * (0.4 + 0.6 * a), 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Names: every territory the member knows or borders, the selected one,
  // and the largest others, kept inside the part of the map in view.
  const view = { left: -tx / k, right: (w - tx) / k };
  ctx.textAlign = "center";
  const drawn = [];
  const order = ["conquered", "settled", "frontier", "unexplored"];
  const named = [...d.anchors].map(([r, a]) => ({ r, a, t: d.lands.get(r) }))
    .filter(({ t }) => t)
    .sort((x, y) => (y.r === d.selected) - (x.r === d.selected) || order.indexOf(x.t.status) - order.indexOf(y.t.status) || y.a.n - x.a.n);
  for (const { r, a, t } of named) {
    if (d.compact && t.status === "unexplored" && r !== d.selected) continue;
    const title = (t.status === "frontier" ? "? " : "") + short(t.region.landmarks?.[0]?.title || territoryName(t.region), d.compact ? 16 : 22);
    ctx.font = `${t.status === "conquered" || r === d.selected ? "600 " : ""}${(d.compact ? 9 : 10) * px1}px system-ui, sans-serif`;
    const tw = ctx.measureText(title).width;
    const cx = Math.min(view.right - tw / 2 - 4 * px1, Math.max(view.left + tw / 2 + 4 * px1, px(a.x)));
    const box = { x: cx - tw / 2, y: py(a.y) - 6 * px1, w: tw, h: 12 * px1 };
    const gap = 4 * px1;
    if (drawn.some((b) => box.x < b.x + b.w + gap && b.x < box.x + box.w + gap && box.y < b.y + b.h && b.y < box.y + box.h)) continue;
    drawn.push(box);
    ctx.fillStyle = t.status === "conquered" ? (dark ? "#fbf1f2" : "#341014") : t.status === "frontier" ? (dark ? "#fcd34d" : "#92400e") : dark ? "rgba(226,232,240,0.75)" : "rgba(51,65,85,0.75)";
    ctx.fillText(title, cx, py(a.y) + 4 * px1);
  }
  ctx.textAlign = "start";

  // "You", moving to where the member's taste now sits.
  if (sc.you) {
    const { from, to, t0 } = sc.you;
    const p = from ? ease((now - t0) / MOVE) : 1;
    if (p < 1) moving = true;
    const yx = px(from ? from.x + (to.x - from.x) * p : to.x), yy = py(from ? from.y + (to.y - from.y) * p : to.y);
    sc.you.at = { x: from ? from.x + (to.x - from.x) * p : to.x, y: from ? from.y + (to.y - from.y) * p : to.y };
    ctx.strokeStyle = dark ? "#fff" : "#0f172a";
    ctx.fillStyle = dark ? "#fff" : "#0f172a";
    ctx.lineWidth = 2.5 * px1;
    ctx.beginPath(); ctx.arc(yx, yy, 7 * px1, 0, 7); ctx.stroke();
    ctx.font = `bold ${12 * px1}px system-ui, sans-serif`;
    ctx.fillText("You", yx + 10 * px1, yy + 4 * px1);
  }
  return moving || (settled && sc.land.res < want - 0.01);
}

/**
 * The taste map as territories: every region's shape from a grid over the
 * map, filled by what the member has made of it (conquered, visited,
 * frontier, unexplored), with borders, names, the member's films and centre,
 * journeys as trails, and friends' footprints on top. `onPick(regionId)`.
 *
 * It can be explored: dragged (and flung, gliding on as it slows), zoomed
 * with a pinch, a double tap or click, Ctrl and the wheel, or the buttons in
 * its corner. Films, trails and friends' maps fade in and out as they come
 * and go, and "You" moves to where the member's taste now sits.
 */
export default function TasteAtlas({ model, grid, lands, points = [], centre = null, journeys = [], friends = [], selected = null, onPick, compact = false }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const [zoomed, setZoomed] = useState(false);
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

  // The scene: the camera and everything on the map as it moves.
  const scene = useRef(null);
  if (!scene.current) scene.current = { cam: { x: 0, y: 0, k: 1 }, vel: null, goal: null, w: 0, h: 0, dots: new Map(), friends: new Map(), trails: new Map(), prints: new Map(), you: null, land: null, raf: 0, first: true };
  const data = useRef(null);
  const version = useRef(0);
  const shape = useMemo(() => ({}), [grid, lands, selected, compact]);
  if (data.current?.shape !== shape) version.current++;
  data.current = { grid, lands, selected, compact, anchors, points, shape, version: version.current };

  const draw = () => {
    const sc = scene.current;
    sc.raf = 0;
    const canvas = ref.current;
    if (!canvas) return;
    const busy = paint(canvas, sc, data.current, performance.now());
    if (busy) sc.raf = requestAnimationFrame(draw);
    else sc.last = 0;
    const isZoomed = sc.cam.k > 1.01;
    canvas.style.touchAction = isZoomed ? "none" : "pan-y";
    setZoomed((z) => (z === isZoomed ? z : isZoomed));
  };
  const schedule = () => { if (!scene.current.raf) scene.current.raf = requestAnimationFrame(draw); };

  // What is on the map: what arrives fades in, what leaves fades out.
  useEffect(() => {
    const sc = scene.current, now = sc.first || reducedMotion() ? -1e9 : performance.now();
    track(sc.dots, points, (p) => p.id, now);
    track(sc.friends, friends, (f) => f.id ?? f.name, now);
    track(sc.trails, journeys.map((j) => ({ ...j, steps: j.steps.filter((s) => s.x != null && s.y != null) })).filter((j) => j.steps.length), (j) => j.id ?? j.region?.id, now);
    if (centre) {
      const at = sc.you?.at || sc.you?.to;
      const moved = at && (Math.abs(at.x - centre.x) > 1e-4 || Math.abs(at.y - centre.y) > 1e-4);
      sc.you = moved && now > 0 ? { from: at, to: centre, t0: now, at } : { to: centre, at: centre };
    } else sc.you = null;
    sc.first = false;
    schedule();
  }, [points, friends, journeys, centre]);

  // The land and names redraw with the data; a territory picked elsewhere
  // (off the screen while zoomed in) comes into view.
  useEffect(() => {
    const sc = scene.current;
    if (selected != null && sc.cam.k > 1.01 && sc.layout) {
      const a = anchors.get(selected);
      if (a) {
        const { ox, oy, side } = sc.layout;
        const wx = ox + a.x * side, wy = oy + a.y * (side / 1.6);
        const sx = sc.cam.x + wx * sc.cam.k, sy = sc.cam.y + wy * sc.cam.k;
        if (sx < 0 || sy < 0 || sx > sc.w || sy > sc.h) aim({ k: sc.cam.k, x: sc.w / 2 - wx * sc.cam.k, y: sc.h / 2 - wy * sc.cam.k });
      }
    }
    schedule();
  }, [shape]);

  useEffect(() => {
    const redraw = () => schedule();
    window.addEventListener("resize", redraw);
    // The theme changes the colours.
    const theme = new MutationObserver(redraw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { window.removeEventListener("resize", redraw); theme.disconnect(); cancelAnimationFrame(scene.current.raf); scene.current.raf = 0; };
  }, []);

  // The camera's next resting place, eased to (at once for those who ask
  // for less motion).
  const aim = (goal) => {
    const sc = scene.current;
    sc.vel = null;
    const g = clamp(sc, { ...goal });
    if (reducedMotion()) { Object.assign(sc.cam, g); sc.goal = null; } else sc.goal = g;
    schedule();
  };
  const zoomAt = (factor, sx = scene.current.w / 2, sy = scene.current.h / 2) => {
    const sc = scene.current, from = sc.goal || sc.cam;
    const k = Math.min(MAX_ZOOM, Math.max(1, from.k * factor));
    const wx = (sx - from.x) / from.k, wy = (sy - from.y) / from.k;
    aim({ k, x: sx - wx * k, y: sy - wy * k });
  };
  const fit = () => aim({ k: 1, x: 0, y: 0 });

  // Screen point → the region under it.
  const regionAt = (clientX, clientY) => {
    const sc = scene.current, box = ref.current?.getBoundingClientRect(), l = sc.layout;
    if (!box || !l) return null;
    const wx = (clientX - box.left - sc.cam.x) / sc.cam.k, wy = (clientY - box.top - sc.cam.y) / sc.cam.k;
    const x = (wx - l.ox) / l.side, y = (wy - l.oy) / (l.side / 1.6);
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    const g = data.current.grid;
    const r = g.cells[Math.floor(y * g.h) * g.w + Math.floor(x * g.w)];
    return r < 0 ? null : { r, left: clientX - box.left, top: clientY - box.top };
  };

  // Dragging, flinging, pinching, double taps and Ctrl + wheel.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const sc = scene.current;
    const fingers = new Map();
    let pan = null, pinch = null, lastTap = 0, moved = false;
    const local = (e) => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const startPan = (e) => {
      const p = local(e);
      pan = { x: p.x, y: p.y, cam: { ...sc.cam }, samples: [[p.x, p.y, e.timeStamp]] };
    };
    const onDown = (e) => {
      if (e.button > 0) return;
      canvas.setPointerCapture?.(e.pointerId);
      fingers.set(e.pointerId, local(e));
      sc.vel = null; sc.goal = null; sc.held = true;
      moved = false;
      if (fingers.size === 1) startPan(e);
      else if (fingers.size === 2) {
        const [a, b] = [...fingers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { ...sc.cam } };
        pan = null;
      }
    };
    const onMove = (e) => {
      if (!fingers.has(e.pointerId)) return;
      const p = local(e);
      fingers.set(e.pointerId, p);
      if (pinch && fingers.size >= 2) {
        const [a, b] = [...fingers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = Math.min(MAX_ZOOM, Math.max(1, pinch.cam.k * (d / pinch.d)));
        const wx = (pinch.mid.x - pinch.cam.x) / pinch.cam.k, wy = (pinch.mid.y - pinch.cam.y) / pinch.cam.k;
        Object.assign(sc.cam, clamp(sc, { k, x: mid.x - wx * k, y: mid.y - wy * k }));
        moved = true;
        schedule();
      } else if (pan) {
        const dx = p.x - pan.x, dy = p.y - pan.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        Object.assign(sc.cam, clamp(sc, { k: pan.cam.k, x: pan.cam.x + dx, y: pan.cam.y + dy }));
        pan.samples.push([p.x, p.y, e.timeStamp]);
        if (pan.samples.length > 6) pan.samples.shift();
        setHover(null);
        schedule();
      }
    };
    const onUp = (e) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.delete(e.pointerId);
      if (fingers.size === 1 && pinch) {
        // One finger left after a pinch: it pans from here.
        pinch = null;
        const [id] = fingers.keys();
        startPan({ clientX: fingers.get(id).x + canvas.getBoundingClientRect().left, clientY: fingers.get(id).y + canvas.getBoundingClientRect().top, timeStamp: e.timeStamp });
        return;
      }
      if (fingers.size) return;
      sc.held = false;
      pinch = null;
      if (pan && moved) {
        // Let go while moving, the map glides on.
        const s = pan.samples, [x0, y0, t0] = s[0], [x1, y1, t1] = s[s.length - 1];
        const dt = t1 - t0;
        if (dt > 0 && e.timeStamp - t1 < 80 && !reducedMotion()) sc.vel = { x: (x1 - x0) / dt, y: (y1 - y0) / dt };
      } else if (!moved && e.type === "pointerup") {
        const p = local(e);
        if (e.timeStamp - lastTap < 320) {
          // A double tap or click zooms in there, or back out when close.
          lastTap = 0;
          if (sc.cam.k > MAX_ZOOM / 1.6) fit(); else zoomAt(2, p.x, p.y);
        } else {
          lastTap = e.timeStamp;
          const hit = regionAt(e.clientX, e.clientY);
          if (hit && onPickRef.current) onPickRef.current(hit.r);
        }
      }
      pan = null;
      schedule();
    };
    const onWheel = (e) => {
      // Ctrl (or a trackpad's pinch) and the wheel zoom; the wheel alone
      // scrolls the page as usual.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = local(e);
      const amount = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-amount * 0.0025), p.x, p.y);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const tip = hover && lands.get(hover.r);
  return (
    <div className="relative">
      <canvas
        ref={ref}
        onMouseMove={(e) => { if (!scene.current.held) setHover(regionAt(e.clientX, e.clientY)); }}
        onMouseLeave={() => setHover(null)}
        className={`atlas-canvas w-full rounded-xl bg-slate-50 dark:bg-slate-950 ${zoomed ? "atlas-zoomed" : ""} ${onPick ? "cursor-pointer" : ""}`}
        style={{ aspectRatio: "16 / 10", maxHeight: compact ? 460 : 640, touchAction: "pan-y" }}
        role="img"
        aria-label={`Map of cinema in ${model.regions.length} territories, coloured by how much of each you have explored.`}
      />
      <div className="atlas-zoom">
        <button type="button" onClick={() => zoomAt(1.6)} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => zoomAt(1 / 1.6)} disabled={!zoomed} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
        {zoomed && <button type="button" onClick={fit} aria-label="Show the whole map"><Maximize2 className="h-4 w-4" /></button>}
      </div>
      {tip && (
        <div className="pointer-events-none absolute z-10 max-w-xs rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: Math.min(hover.left + 12, (ref.current?.clientWidth || 0) - 220), top: hover.top + 12 }}>
          <p className="font-semibold">{territoryName(tip.region)}</p>
          <p className="text-slate-300">{STATUS_LABEL[tip.status]}{tip.seen ? ` · ${tip.seen} seen, ${tip.loved} loved` : ""}</p>
        </div>
      )}
    </div>
  );
}
