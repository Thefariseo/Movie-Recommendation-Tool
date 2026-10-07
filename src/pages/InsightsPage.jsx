import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { backend } from "../utils/backend";

// The way through a first visit, step by step: where people are lost.
const FUNNEL = [
  ["visit", "Visited"],
  ["onboarding_start", "Started the quick choices"],
  ["onboarding_done", "Finished them"],
  ["rated_1", "Rated a film"],
  ["rated_10", "Rated ten films"],
  ["signup", "Created an account"],
];
const ACTIONS = [
  ["pick_open", "Opened a pick"],
  ["pick_save", "Saved a pick to the watchlist"],
  ["pick_dismiss", "Dismissed a pick"],
  ["other_picks", "Asked for other picks"],
  ["quick_round_done", "Finished a quick round"],
  ["onboarding_skip", "Skipped the quick choices"],
  ["import_start", "Opened the Letterboxd import"],
  ["feedback_sent", "Sent feedback"],
  ["taste_card_open", "Opened their taste card"],
  ["taste_card_share", "Shared their taste card"],
  ["compare_open", "Opened a comparison link"],
  ["compare_done", "Saw a comparison"],
];
const percent = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "—");

/**
 * What people do on Umbrify, counted anonymously (src/utils/events.js): the
 * first-visit funnel, what they do with their picks, and how many come back.
 * Only for whoever runs Umbrify (ADMIN_EMAILS on the server).
 */
export default function InsightsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    setData(null);
    setError("");
    backend(`social?insights&days=${days}`).then(setData).catch((e) => setError(e.message));
  }, [user?.id, days]);

  if (!user) return <main className="insights-page"><p>Sign in with the owner's account to see the numbers. <Link className="underline" to="/profile">Sign in</Link></p></main>;
  const steps = data?.steps || {};
  const top = steps.visit || data?.visitors || 0;
  const maxDaily = Math.max(1, ...(data?.daily || []).map((d) => d.visitors));
  return (
    <main className="insights-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">ONLY YOU SEE THIS</p>
          <h1 className="font-display text-2xl uppercase sm:text-3xl">How people use Umbrify</h1>
          <p className="text-sm text-slate-500">Anonymous counts: one random id per browser, no accounts or addresses.</p>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Period">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={days === d ? "account-button" : "account-secondary"}>{`${d} days`}</button>
          ))}
        </div>
      </header>
      {error && <p role="alert" className="account-panel text-sm">{error}</p>}
      {!data && !error && <p role="status" className="text-sm text-slate-500">Counting…</p>}
      {data && (
        <>
          <section className="insights-tiles">
            <div className="account-panel"><span>Visitors</span><strong>{data.visitors}</strong></div>
            <div className="account-panel"><span>Came back the next day or later</span><strong>{percent(data.returned_1.returned, data.returned_1.eligible)}</strong><small>{`${data.returned_1.returned} of ${data.returned_1.eligible}`}</small></div>
            <div className="account-panel"><span>Came back a week later or more</span><strong>{percent(data.returned_7.returned, data.returned_7.eligible)}</strong><small>{`${data.returned_7.returned} of ${data.returned_7.eligible}`}</small></div>
          </section>
          <section className="account-panel space-y-3">
            <h2 className="section-title">First visit</h2>
            {FUNNEL.map(([key, label]) => {
              const n = steps[key] || 0;
              return (
                <div key={key} className="insights-row">
                  <span>{label}</span>
                  <span className="insights-bar"><span style={{ transform: `scaleX(${top ? n / top : 0})` }} /></span>
                  <strong>{n}</strong>
                  <small>{percent(n, top)}</small>
                </div>
              );
            })}
          </section>
          <section className="account-panel space-y-3">
            <h2 className="section-title">What they do</h2>
            {ACTIONS.map(([key, label]) => (
              <div key={key} className="insights-row">
                <span>{label}</span>
                <span className="insights-bar"><span style={{ transform: `scaleX(${top ? (steps[key] || 0) / top : 0})` }} /></span>
                <strong>{steps[key] || 0}</strong>
                <small>{percent(steps[key] || 0, top)}</small>
              </div>
            ))}
          </section>
          <section className="account-panel space-y-3">
            <h2 className="section-title">Visitors per day</h2>
            {data.daily.length ? (
              <div className="insights-days">
                {data.daily.map((d) => (
                  <span key={d.day} title={`${d.day}: ${d.visitors}`}>
                    <span style={{ height: `${(d.visitors / maxDaily) * 100}%` }} />
                    <small>{d.day.slice(5)}</small>
                  </span>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">No visits yet.</p>}
          </section>
        </>
      )}
    </main>
  );
}
