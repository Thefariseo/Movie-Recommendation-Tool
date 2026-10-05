// Film titles in the interface language. Films saved to a library, a list or
// a friend's feed keep the title they had when saved, in whatever language
// that was (a Letterboxd import is in English). The title in the current
// language is remembered here once seen, per language, across visits.
import { currentLanguage } from "../i18n/index.js";

const MAX = 4000;
const keyOf = (lang) => `umbrify_titles_v1:${lang}`;
let titles = null;
let language = null;
let timer = null;

function store() {
  const lang = currentLanguage();
  if (titles && language === lang) return titles;
  language = lang;
  try {
    titles = new Map(Object.entries(JSON.parse(localStorage.getItem(keyOf(lang)) || "{}")));
  } catch {
    titles = new Map();
  }
  return titles;
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(keyOf(language), JSON.stringify(Object.fromEntries([...titles].slice(-MAX))));
    } catch { /* storage full or blocked: titles are looked up again */ }
  }, 1500);
}

/** Remembers the titles of films that came from TMDB in the current language. */
export function noteTitles(data) {
  const films = Array.isArray(data?.results) ? data.results : data?.id ? [data] : [];
  let changed = false;
  for (const f of films) {
    if (!f?.id || typeof f.title !== "string" || f.original_title == null) continue;
    const id = String(f.id);
    if (store().get(id) !== f.title) { titles.delete(id); titles.set(id, f.title); changed = true; }
  }
  if (changed) save();
}

/** The film's title in the interface language, when known; its saved title otherwise. */
export const knownTitle = (film) => (film?.id != null && store().get(String(film.id))) || film?.title || "";

/**
 * Whether the title has to be looked up: a saved film (one without TMDB's
 * original_title) whose current-language title is not known yet.
 */
export const needsTitle = (film) => film?.id != null && film.original_title == null && !store().has(String(film.id));
