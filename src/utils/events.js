// Anonymous counts of what people do, for whoever runs Umbrify to see where
// they get lost (server/events.js). A random id per browser, the name of what
// happened, and when: no account, email or address. Browsers that ask not to
// be tracked send nothing.
import { backend } from "./backend";

const ID_KEY = "umbrify_visitor_v1";
const DAY_KEY = "umbrify_visit_day_v1";
const off = typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || window.doNotTrack === "1");
let visitor = null;
const queue = [];
const sent = new Set();
let timer = null;

function id() {
  if (visitor) return visitor;
  try {
    visitor = localStorage.getItem(ID_KEY);
    if (!visitor) {
      visitor = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).toLowerCase();
      localStorage.setItem(ID_KEY, visitor);
    }
  } catch {
    visitor = visitor || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  return visitor;
}

function flush() {
  clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const events = queue.splice(0, 20);
  // keepalive: a page being closed still sends what it had.
  backend("social?events", { visitor: id(), events }, { keepalive: true }).catch(() => {});
}

/** Counts that `name` happened (once per page view for each name). */
export function track(name) {
  if (off || sent.has(name)) return;
  sent.add(name);
  queue.push(name);
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 4000);
}

/** A visit, counted once a day per browser: what the return rates are made of. */
export function trackVisit() {
  if (off) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(DAY_KEY) === today) return;
    localStorage.setItem(DAY_KEY, today);
  } catch { /* counted every page view then */ }
  track("visit");
}

/** Clicks on anything marked data-track="name", and on the picks' own buttons. */
export function installTracking() {
  if (off || typeof document === "undefined") return () => {};
  const onClick = (e) => {
    const marked = e.target.closest?.("[data-track]");
    if (marked) track(marked.dataset.track);
    const picks = e.target.closest?.("[data-picks]");
    if (!picks) return;
    if (e.target.closest(".film-save")) track("pick_save");
    else if (e.target.closest(".film-dismiss")) track("pick_dismiss");
    else if (e.target.closest("[data-film-id]")) track("pick_open");
  };
  const onHide = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", onHide);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("visibilitychange", onHide);
  };
}
