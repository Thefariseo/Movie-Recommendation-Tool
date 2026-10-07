// The taste card as an image to share (1080×1350, the shape stories and feeds
// take): the member's films on the map of cinema, their home territory, how
// much of the map they have explored, the directors they return to and the
// films that define them. Drawn on a canvas, in the interface language.
import { t } from "../i18n/index.js";

const W = 1080, H = 1350;
const BG = "#120d0f", INK = "#ffffff", MUTED = "#a99ea1", ACCENT = "#db96a0", DEEP = "#9a2e3e";
const font = (weight, size) => `${weight} ${size}px "Albert Sans", system-ui, sans-serif`;

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Draws the card on `canvas`; returns it. */
export async function drawTasteCard(canvas, { name, space, map, films, summary, directors }) {
  try { await document.fonts?.ready; } catch { /* the system font then */ }
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Heading.
  ctx.fillStyle = ACCENT;
  ctx.font = font(700, 26);
  ctx.fillText("UMBRIFY", 60, 92);
  ctx.fillStyle = INK;
  ctx.font = font(700, 76);
  ctx.fillText(t("MY CINEMA").toUpperCase(), 60, 172);
  if (name) {
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 34);
    ctx.fillText(fit(ctx, name, W - 120), 60, 222);
  }

  // The map of cinema: every well-known film a faint dot, the member's films
  // bright, and where their taste sits.
  const box = { x: 60, y: 260, w: W - 120, h: 560 };
  ctx.fillStyle = "#1c1518";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const px = (i) => box.x + 20 + map.x[i] * (box.w - 40);
  const py = (i) => box.y + 20 + map.y[i] * (box.h - 40);
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  for (let i = 0; i < map.n; i++) {
    if (space.counts[i] < 300) continue;
    ctx.fillRect(px(i), py(i), 2, 2);
  }
  let sx = 0, sy = 0, sw = 0;
  for (const f of films) {
    const i = space.index.get(Number(f.id));
    if (i == null) continue;
    const loved = Number(f.rated) >= 8;
    ctx.fillStyle = loved ? ACCENT : "rgba(219,150,160,0.55)";
    ctx.beginPath();
    ctx.arc(px(i), py(i), loved ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    const w = Math.max(0, Number(f.rated) - 6);
    sx += w * px(i); sy += w * py(i); sw += w;
  }
  if (sw) {
    const cx = sx / sw, cy = sy / sw;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = font(700, 28);
    ctx.fillText(t("You"), Math.min(cx + 24, box.x + box.w - 70), cy + 10);
  }

  // What defines it.
  let y = 890;
  const row = (label, value) => {
    if (!value) return;
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 26);
    ctx.fillText(t(label).toUpperCase(), 60, y);
    ctx.fillStyle = INK;
    ctx.font = font(600, 38);
    ctx.fillText(fit(ctx, value, W - 120), 60, y + 48);
    y += 112;
  };
  row("Home territory", summary.home);
  row("Directors I keep coming back to", directors.slice(0, 3).join(" · "));
  row("Films that define me", summary.defining.map((f) => f.title).join(" · "));
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 26);
  ctx.fillText(t("{0} of {1} territories explored · {2} films rated").replace("{0}", summary.explored).replace("{1}", summary.territories).replace("{2}", summary.rated), 60, y + 6);

  // The invitation.
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = INK;
  ctx.font = font(700, 32);
  ctx.fillText(t("How close is your taste to mine?"), 60, H - 62);
  ctx.fillStyle = "#f3d7db";
  ctx.font = font(500, 26);
  ctx.fillText("umbrify.vercel.app", 60, H - 26);
  return canvas;
}
