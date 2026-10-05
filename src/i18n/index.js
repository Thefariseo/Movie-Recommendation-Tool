// The interface in the member's language. The components are written in
// English; when another language is chosen, the page's text and the
// attributes people read (placeholders, labels, titles) are translated in
// place from a dictionary of exact strings and of patterns with {0}-style
// slots for what changes (a name, a count). Film titles, names and anything
// a member wrote are never in the dictionary, and anything inside
// translate="no" is left alone. Explanations written by the recommender or
// the critic come in the language they were written in.
const KEY = "umbrify_lang_v1";
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" }
];

const AUTO_KEY = "umbrify_lang_country_v1";
// The language spoken in a country, among those the interface has.
const COUNTRY_LANGUAGES = { IT: "it", SM: "it", VA: "it" };
const readStorage = (key) => { try { return localStorage.getItem(key); } catch { return null; } };

/**
 * The interface language: the member's own choice, else the language of the
 * country in their profile, else the browser's.
 */
export function currentLanguage() {
  const saved = readStorage(KEY);
  if (LANGUAGES.some((l) => l.code === saved)) return saved;
  const country = readStorage(AUTO_KEY);
  if (LANGUAGES.some((l) => l.code === country)) return country;
  const browser = (typeof navigator !== "undefined" && navigator.language) || "en";
  return browser.toLowerCase().startsWith("it") ? "it" : "en";
}

/** TMDB's locale for the interface language, so films come with their local titles and plots. */
export const tmdbLocale = () => ({ it: "it-IT" }[currentLanguage()] || "en-US");

/** Switches the language. The page reloads, so every text starts from its source. */
export function setLanguage(code) {
  try { localStorage.setItem(KEY, code); } catch { /* the choice lasts this visit */ }
  window.location.reload();
}

/**
 * Follows the country in a member's profile, unless they chose a language
 * themselves. Reloads once when that changes the language.
 */
export function followCountry(country) {
  if (readStorage(KEY)) return;
  const lang = COUNTRY_LANGUAGES[String(country || "").toUpperCase()] || "en";
  if (readStorage(AUTO_KEY) === lang) return;
  const before = currentLanguage();
  try { localStorage.setItem(AUTO_KEY, lang); } catch { return; }
  if (currentLanguage() !== before) window.location.reload();
}

const space = (s) => s.replace(/\s+/g, " ").trim();
const escape = (s) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

/**
 * A translator from a dictionary { english: translation }. Keys with {0},
 * {1}… are patterns: a slot matches any text within one sentence and is
 * carried over, in the translation's order. Two optional lists refine it:
 * `__inside` rewrites bits of a slot ("(your pick)"), `__suffixes` peels an
 * ending off before translating the rest (" · +2 more"). Text of several
 * sentences that matches nothing whole is translated sentence by sentence.
 */
export function translator(dictionary) {
  const { __inside = [], __suffixes = [], ...entries } = dictionary;
  const inside = __inside.map(([re, out]) => [new RegExp(re, "g"), out]);
  const suffixes = __suffixes.map(([re, out]) => [new RegExp(`${re}$`), out]);
  const exact = new Map();
  const patterns = [];
  // A slot never runs across the end of a sentence.
  const SLOT = "((?:(?![.!?] [A-Z]).)+?)";
  for (const [en, out] of Object.entries(entries)) {
    if (/\{\d\}/.test(en)) {
      const order = [...en.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1]));
      const source = escape(space(en)).replace(/\{(\d)\}/g, SLOT);
      patterns.push({ re: new RegExp(`^${source}$`), order, out });
    } else exact.set(space(en), out);
  }
  // Longer patterns first: they are the more specific.
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  const slot = (value) => exact.get(space(value)) ?? inside.reduce((v, [re, out]) => v.replace(re, out), value);
  const one = (key) => {
    const hit = exact.get(key);
    if (hit != null) return hit;
    // An ending is peeled off first, so no slot swallows it.
    for (const [re, out] of suffixes) {
      const m = key.match(re);
      if (!m || m.index === 0) continue;
      const rest = one(key.slice(0, m.index));
      if (rest != null) return rest + m[0].replace(re, out);
    }
    for (const p of patterns) {
      const m = key.match(p.re);
      if (!m) continue;
      const slots = {};
      p.order.forEach((n, i) => { slots[n] = slot(m[i + 1]); });
      return p.out.replace(/\{(\d)\}/g, (_, n) => slots[n] ?? "");
    }
    return null;
  };
  const memo = new Map();
  return (text) => {
    if (text == null) return text;
    const raw = String(text);
    const key = space(raw);
    if (!key || !/[A-Za-z]/.test(key)) return raw;
    let hit = memo.get(key);
    if (hit === undefined) {
      hit = one(key);
      if (hit == null) {
        const sentences = key.split(/(?<=[.!?])\s+(?=[A-Z"“])/);
        if (sentences.length > 1) {
          const parts = sentences.map((x) => one(x));
          if (parts.some((x) => x != null)) hit = parts.map((x, i) => x ?? sentences[i]).join(" ");
        }
      }
      if (memo.size > 5000) memo.clear();
      memo.set(key, hit);
    }
    if (hit == null) return raw;
    // Keep the spacing around the text, which separates it from its neighbours.
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    return lead + hit + trail;
  };
}

const ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);

/**
 * Translates the document in place and keeps it translated as React renders.
 * Each text node remembers its source text: when React writes a new one, the
 * new source is translated; the translator's own writes are recognised and
 * left alone. Returns a function that stops it.
 */
export function translateDocument(tr, root = document.body) {
  const texts = new WeakMap(); // text node -> { source, shown }
  const attrs = new WeakMap(); // element -> { [attribute]: { source, shown } }
  const skipped = (el) => !el || el.closest?.('[translate="no"], [contenteditable="true"]') || SKIP.has(el.tagName);

  const sourceOf = (node) => {
    const seen = texts.get(node);
    if (seen && node.nodeValue === seen.shown) return seen.source;
    return node.nodeValue;
  };
  const write = (node, source, shown) => {
    texts.set(node, { source, shown });
    if (node.nodeValue !== shown) node.nodeValue = shown;
  };

  // An element whose children are all text (a sentence around a count or a
  // name, which React renders as several text nodes) is translated whole.
  const element = (el) => {
    if (skipped(el)) return;
    const kids = el.childNodes;
    if (kids.length > 1 && [...kids].every((n) => n.nodeType === 3)) {
      const sources = [...kids].map(sourceOf);
      const joined = sources.join("");
      const out = tr(joined);
      if (out !== joined) {
        kids.forEach((n, i) => write(n, sources[i], i === 0 ? out : ""));
        return;
      }
    }
    kids.forEach((n) => { if (n.nodeType === 3) text(n, false); });
  };
  const text = (node, whole = true) => {
    const parent = node.parentElement;
    if (skipped(parent)) return;
    if (whole && parent.childNodes.length > 1 && [...parent.childNodes].every((n) => n.nodeType === 3)) return element(parent);
    const source = sourceOf(node);
    const out = tr(source);
    if (out !== source || texts.has(node)) write(node, source, out);
  };
  const attributes = (el) => {
    if (skipped(el)) return;
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value == null) continue;
      const kept = attrs.get(el) || {};
      const seen = kept[name];
      const source = seen && value === seen.shown ? seen.source : value;
      const out = tr(source);
      kept[name] = { source, shown: out };
      attrs.set(el, kept);
      if (out !== value) el.setAttribute(name, out);
    }
  };
  const tree = (node) => {
    if (node.nodeType === 3) return text(node);
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
    if (node.getAttribute("translate") === "no") return;
    attributes(node);
    element(node);
    for (const child of node.children) tree(child);
  };

  tree(root);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") text(r.target);
      else if (r.type === "attributes") attributes(r.target);
      else {
        r.addedNodes.forEach(tree);
        if (r.target.nodeType === 1 && r.removedNodes.length) element(r.target);
      }
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  return () => observer.disconnect();
}

// Each dictionary is its own file, downloaded only by those who read that language.
const DICTIONARIES = { it: () => import("./it.js") };

/** Starts translating the page when the language is not English. */
export async function startTranslation() {
  const lang = currentLanguage();
  document.documentElement.lang = lang;
  if (lang === "en") return;
  const { default: dictionary } = await DICTIONARIES[lang]();
  const tr = translator(dictionary);
  // Questions the browser asks on the page's behalf.
  const confirm = window.confirm.bind(window), alert = window.alert.bind(window);
  window.confirm = (message) => confirm(tr(message));
  window.alert = (message) => alert(tr(message));
  translateDocument(tr);
}
