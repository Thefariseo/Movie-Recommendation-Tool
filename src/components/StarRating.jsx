// =====================================================
// Reusable star rating widget — half-star precision
// Stored internally as 1-10 (0.5★ = 1, 1★ = 2, … 5★ = 10)
// Displayed as 0.5-5 with half-star visual via overflow-clip
// Fix v2: onLeave removed from individual buttons (parent div handles
//         reset) to prevent flicker when crossing the half-star boundary.
//         Hover label added below stars.
// =====================================================
import React, { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { haptic, reducedMotion } from "../utils/motion";

/**
 * A single star position that can be empty, half-filled, or fully filled.
 * Two invisible click-zones cover left (half) and right (full) halves.
 * onLeave is intentionally NOT set per-button — the parent div handles
 * the mouseLeave event so moving between halves doesn't flicker.
 */
function StarSlot({ index, displayValue, hovered, onHover, onClick, readonly, size, lit }) {
  const full = index + 1;
  const half = index + 0.5;

  const active = hovered > 0 ? hovered : displayValue;
  const isFullFilled = active >= full;
  const isHalfFilled = !isFullFilled && active >= half;

  const cls =
    size === "xl" ? "h-9 w-9" :
    size === "lg" ? "h-6 w-6" :
    size === "md" ? "h-5 w-5" :
                   "h-4 w-4";

  return (
    <div className={`relative ${cls} shrink-0 ${lit ? "star-lit" : ""}`} style={lit ? { "--i": index } : undefined}>
      {/* Empty star (background layer) */}
      <Star className={`${cls} fill-slate-200 text-slate-200 dark:fill-slate-600 dark:text-slate-600`} />

      {/* Amber filled overlay — 50% wide for half, 100% for full */}
      {(isFullFilled || isHalfFilled) && (
        <div
          className={`pointer-events-none absolute inset-0 overflow-hidden ${lit ? "star-beam-fill" : ""}`}
          style={{ width: isHalfFilled ? "50%" : "100%" }}
        >
          <Star className={`${cls} fill-amber-400 text-amber-400`} />
        </div>
      )}

      {/* Hit zones — left = half star, right = full star */}
      {!readonly && (
        <>
          <button
            type="button"
            tabIndex={-1}
            data-pop="parent"
            aria-label={`Rate ${half} stars`}
            className="absolute inset-0 right-1/2 cursor-pointer"
            onMouseEnter={() => onHover(half)}
            onClick={() => onClick(half)}
          />
          <button
            type="button"
            tabIndex={-1}
            data-pop="parent"
            aria-label={`Rate ${full} star${full !== 1 ? "s" : ""}`}
            className="absolute inset-0 left-1/2 cursor-pointer"
            onMouseEnter={() => onHover(full)}
            onClick={() => onClick(full)}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * StarRating
 * @param {number}            value     – stored rating 1-10 (0 / undefined = unrated)
 * @param {Function}          onChange  – called with new stored value (1-10)
 * @param {boolean}           readonly  – disable interaction
 * @param {"sm"|"md"|"lg"}    size      – icon size
 * @param {boolean}           showLabel – show hover/current label (default true when !readonly)
 */
export default function StarRating({
  value,
  onChange,
  readonly = false,
  size = "sm",
  showLabel = true,
}) {
  const [hovered, setHovered] = useState(0);
  // A rating just given, shown at once while it is saved.
  const [given, setGiven] = useState(null);
  // The light sweeping across a rating just given, like a projector's beam.
  const [beam, setBeam] = useState(null);
  const [burst, setBurst] = useState(null);
  useEffect(() => { setGiven(null); }, [value]);
  // A rating that was not saved goes back to the one that was.
  useEffect(() => {
    if (given == null) return undefined;
    const timer = setTimeout(() => setGiven(null), 5000);
    return () => clearTimeout(timer);
  }, [given]);

  // Stored 1-10 → display 0.5-5
  const shown = given ?? value;
  const displayValue = shown ? shown / 2 : 0;

  const handleClick = (displayStars) => {
    if (readonly) return;
    // Clicking same value → clear rating
    const newStored = displayValue === displayStars ? 0 : Math.round(displayStars * 2);
    setGiven(newStored);
    if (newStored && !reducedMotion()) {
      setBeam({ stars: newStored / 2, key: Date.now() });
      // Five stars: a burst of film grain, and a longer buzz.
      if (newStored === 10) { setBurst(Date.now()); haptic([12, 40, 22]); }
    }
    setHovered(0);
    onChange?.(newStored);
  };

  const labelValue = hovered > 0 ? hovered : (displayValue > 0 ? displayValue : null);
  const labelStr = labelValue != null
    ? `${labelValue % 1 === 0 ? labelValue.toFixed(0) : labelValue.toFixed(1)}★`
    : null;

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      {/* Stars — parent div handles mouseLeave to avoid per-button flicker */}
      <div
        className="relative flex items-center gap-0.5"
        onMouseLeave={() => setHovered(0)}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <StarSlot
            key={`${i}-${beam?.key || 0}`}
            index={i}
            displayValue={displayValue}
            hovered={beam ? 0 : hovered}
            onHover={setHovered}
            onClick={handleClick}
            readonly={readonly}
            size={size}
            lit={beam != null && i < beam.stars}
          />
        ))}
        {beam && <span key={beam.key} className="star-beam" style={{ "--stars": beam.stars }} aria-hidden="true" onAnimationEnd={(e) => { if (e.animationName === "beamFade") setBeam(null); }} />}
        {burst && <GrainBurst key={burst} onDone={() => setBurst(null)} />}
      </div>

      {/* Hover label — only for interactive ratings */}
      {!readonly && showLabel && labelStr && (
        <span className="min-h-[12px] text-[10px] font-medium leading-none text-amber-500 tabular-nums">
          {hovered > 0 ? labelStr : <span className="text-slate-400 dark:text-slate-500">{labelStr}</span>}
        </span>
      )}
    </div>
  );
}

// Five stars: a burst of film grain from the last star, sparks and a flicker
// of grain over the row, as when a projector's lamp flares.
function GrainBurst({ onDone }) {
  const sparks = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.35;
    const reach = 22 + Math.random() * 34;
    return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * 0.8, size: 2 + Math.random() * 2.5, delay: Math.random() * 0.12 };
  }), []);
  return (
    <span className="grain-burst" aria-hidden="true">
      <span className="grain-flicker" onAnimationEnd={onDone} />
      {sparks.map((s, i) => (
        <span key={i} className="grain-spark" style={{ "--x": `${s.x.toFixed(1)}px`, "--y": `${s.y.toFixed(1)}px`, "--size": `${s.size.toFixed(1)}px`, animationDelay: `${(0.55 + s.delay).toFixed(2)}s` }} />
      ))}
    </span>
  );
}
