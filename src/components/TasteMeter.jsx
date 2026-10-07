import { tasteLevel, TASTE_LEVELS } from "../../shared/quickRate.js";

/**
 * How well Umbrify knows the member's taste, from their ratings: the level
 * reached, a meter in five steps that fills with every rating, and how many
 * more it takes to reach the next one.
 */
export default function TasteMeter({ rated, compact = false }) {
  const { label, fill, toNext } = tasteLevel(rated);
  const steps = TASTE_LEVELS.length - 1;
  return (
    <div className={`taste-meter ${compact ? "taste-meter-compact" : ""}`}>
      <div className="taste-meter-head">
        <span className="taste-meter-title">How well Umbrify knows you</span>
        <strong>{label}</strong>
      </div>
      <div className="taste-meter-track" role="meter" aria-label="How well Umbrify knows you" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill * 100)} aria-valuetext={label}>
        <span className="taste-meter-fill" style={{ transform: `scaleX(${fill})` }} />
        {Array.from({ length: steps - 1 }, (_, i) => <span key={i} className="taste-meter-tick" style={{ left: `${((i + 1) / steps) * 100}%` }} />)}
      </div>
      {!compact && <p className="taste-meter-hint">{toNext ? (toNext === 1 ? "One more rating to the next level." : `${toNext} more ratings to the next level.`) : "Every rating still sharpens your picks."}</p>}
    </div>
  );
}
