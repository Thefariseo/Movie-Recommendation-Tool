// The member's film signals in the browser: "Not for me" and what their critic
// said about films. Signed-in members keep them on the server; guests in this
// browser. Components subscribe through useSignals().
import { useEffect, useState } from "react";
import { backend } from "./backend";
import { signalMap } from "../../shared/signals.js";
import { validRule } from "../../shared/rules.js";

const GUEST_KEY = "umbrify_signals_v1";
let rows = [];
// The critic's taste rules (shared/rules.js), for signed-in members only.
let rules = [];
let owner = undefined;
let loading = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

function readGuest() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || "[]"); } catch { return []; }
}
function writeGuest() {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(rows)); } catch { /* storage may be blocked */ }
}

/** Loads the signals of `userId` (null for a guest), once per account. */
export function loadSignals(userId) {
  if (owner === userId && loading) return loading;
  owner = userId;
  loading = (userId ? backend("signals").catch(() => ({})) : Promise.resolve({ signals: readGuest(), rules: [] }))
    .then((d) => {
      if (owner === userId) {
        rows = Array.isArray(d.signals) ? d.signals : [];
        rules = (Array.isArray(d.rules) ? d.rules : []).filter(validRule);
        emit();
      }
      return signalMap(rows);
    });
  return loading;
}

/** The critic's taste rules, for the recommender. */
export const currentRules = () => rules;

/** Signals as a map (see shared/signals.js), for the recommender. */
export const currentSignals = () => signalMap(rows);

export async function dismissFilm(movie) {
  const entry = { movie_id: Number(movie.id), source: "dismissed", signal: -2, movie: { id: Number(movie.id), title: movie.title, poster_path: movie.poster_path || null, genre_ids: movie.genre_ids || (movie.genres || []).map((g) => g.id ?? g) } };
  rows = [entry, ...rows.filter((r) => !(Number(r.movie_id) === entry.movie_id && r.source === "dismissed"))];
  emit();
  if (owner) await backend("signals", { action: "dismiss", movie: entry.movie });
  else writeGuest();
}

export async function undismissFilm(id) {
  rows = rows.filter((r) => !(Number(r.movie_id) === Number(id) && r.source === "dismissed"));
  emit();
  if (owner) await backend("signals", { action: "undismiss", movie_id: Number(id) });
  else writeGuest();
}

/** Re-renders when signals change; returns the current map. */
export function useSignals(userId) {
  const [, tick] = useState(0);
  useEffect(() => {
    const listener = () => tick((n) => n + 1);
    listeners.add(listener);
    loadSignals(userId ?? null);
    return () => listeners.delete(listener);
  }, [userId]);
  return currentSignals();
}

/** Fetches the signals and the critic's rules again, after the critic may have added some. */
export function reloadSignals() {
  loading = null;
  return loadSignals(owner ?? null);
}
