// Language models write a little Markdown: *Title* or _Title_ for a film,
// **word** for weight. Split into runs to render as emphasis, never as markup.

/** [{ text, em?, strong? }] for a string with *x*, _x_, **x** or __x__. */
export function richRuns(text) {
  const runs = [];
  const re = /(\*\*|__)(?=\S)([^*_\n]+?)(?<=\S)\1|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])/g;
  let last = 0;
  for (const m of String(text ?? '').matchAll(re)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[2] != null) runs.push({ text: m[2], strong: true });
    else runs.push({ text: m[3] ?? m[4], em: true });
    last = m.index + m[0].length;
  }
  if (last < String(text ?? '').length) runs.push({ text: String(text).slice(last) });
  return runs;
}
