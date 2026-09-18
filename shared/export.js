function csv(value) {
  let s = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function letterboxdCSV(movies) {
  // Letterboxd's importer accepts tmdbID and Rating (0.5–5 stars).
  return [['tmdbID', 'Title', 'Year', 'Rating'], ...movies.map(m => [m.id, m.title, m.year || String(m.release_date || '').slice(0, 4), m.rated ? m.rated / 2 : ''])].map(row => row.map(csv).join(',')).join('\r\n');
}
