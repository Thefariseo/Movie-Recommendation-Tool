export const GENRES = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];
export const emptyConstraints = () => ({
  genre_ids: [],
  avoid_genres: [],
  avoid_violence: false,
  max_runtime: null,
  theme: null,
  marathon_count: 1,
  excluded_ids: []
});
export function validateConstraints(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid conversation preferences.');
  const ids = name => Array.isArray(value[name]) ? [...new Set(value[name].filter(x => Number.isInteger(x) && GENRES.includes(x)))].slice(0, 10) : [];
  const max = Number(value.max_runtime);
  return {
    genre_ids: ids('genre_ids'),
    avoid_genres: ids('avoid_genres'),
    avoid_violence: value.avoid_violence === true,
    max_runtime: Number.isInteger(max) && max >= 40 && max <= 300 ? max : null,
    theme: typeof value.theme === 'string' ? value.theme.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 40).trim() || null : null,
    marathon_count: Math.max(1, Math.min(5, Number(value.marathon_count) || 1)),
    excluded_ids: Array.isArray(value.excluded_ids) ? value.excluded_ids.filter(Number.isSafeInteger).slice(-100) : []
  };
}
export function parseConversation(message, previous = emptyConstraints(), lastIds = []) {
  const text = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let next = {
    ...previous,
    genre_ids: [...(previous.genre_ids || [])],
    avoid_genres: [...(previous.avoid_genres || [])],
    excluded_ids: [...(previous.excluded_ids || [])]
  };
  if (/\b(reset|start over|ricomincia|riparti|azzera)\b/.test(text)) next = emptyConstraints();
  if (/\b(another|different|altro|altri|diversi|non questi|not these)\b/.test(text)) next.excluded_ids = [...new Set([...next.excluded_ids, ...lastIds])];
  if (/(troppo violent|no violen|senza violen|less violen|too violent|not violent|without violen|gentle|delicato)/.test(text)) {
    next.avoid_violence = true;
    next.avoid_genres = [...new Set([...next.avoid_genres, 28, 27, 80, 53, 10752])];
  }
  if (/(allow violence|violenza va bene|anche violenti)/.test(text)) {
    next.avoid_violence = false;
    next.avoid_genres = next.avoid_genres.filter(x => ![28, 27, 80, 53, 10752].includes(x));
  }
  const runtime = text.match(/(?:under|less than|max|meno di|sotto|entro)\s*(\d{2,3})\s*(?:min|minutes|minuti)?/);
  if (runtime) next.max_runtime = Number(runtime[1]);
  if (/(no time limit|senza limit.*durata)/.test(text)) next.max_runtime = null;
  const map = [[/comedy|commedia|commedie/, 35], [/romance|romantic|romantico/, 10749], [/sci-fi|science fiction|fantascienza/, 878], [/documentary|documentari/, 99], [/animation|animazione/, 16], [/family|famiglia/, 10751], [/horror/, 27], [/thriller/, 53], [/drama|drammatico/, 18], [/action|azione/,28], [/adventure|avventura/,12], [/mystery|mistero|giallo/,9648], [/fantasy|fantastico/,14], [/crime|poliziesco/,80], [/western/,37], [/history|historical|storico/,36], [/war|guerra/,10752], [/music|musical/,10402]];
  for (const [pattern, id] of map) if (pattern.test(text)) {
    if (new RegExp(`(?:no|niente|senza|not)\\s+(?:${pattern.source})`).test(text)) {
      next.avoid_genres = [...new Set([...next.avoid_genres, id])];
      next.genre_ids = next.genre_ids.filter(g => g !== id);
    } else {
      next.genre_ids = [id];
      if (!next.avoid_violence) next.avoid_genres = next.avoid_genres.filter(g => g !== id);
    }
  }
  // Guided mode makes explicit, understandable genre changes for common mood requests.
  if (/divertent|funny|funnier|cheerful|ridere|piu legger|lighter|feel.good|rilassant/.test(text)) {
    next.genre_ids = [35];
    next.avoid_genres = next.avoid_genres.filter(g => g !== 35);
  }
  if (/deep|profond|riflessiv|thought.provoking|cerebral|intellettual/.test(text)) {
    next.genre_ids = [18, 9648];
    next.avoid_genres = next.avoid_genres.filter(g => !next.genre_ids.includes(g));
  }
  const hours = text.match(/(?:under|less than|max|meno di|sotto|entro)\s*(\d(?:[.,]\d)?)\s*(?:hours?|ore?|ora)\b/);
  if (hours) next.max_runtime = Math.round(Number(hours[1].replace(',', '.')) * 60);
  if (/un solo film|solo un film|one film|single movie|no marathon|niente maratona/.test(text)) { next.marathon_count = 1; next.theme = null; }
  else if (/marathon|maratona/.test(text)) {
    next.marathon_count = Number(text.match(/\b([2-5])\s*(?:films?|movies?)\b/)?.[1] || text.match(/(?:maratona|marathon)\s*(?:di|of)?\s*([2-5])\b(?!\s*(?:ore?|hours?))/)?.[1] || 3);
    if (/spazio|space/.test(text)) next.theme = 'space';
    if (/viagg.*tempo|time travel/.test(text)) next.theme = 'time travel';
  }
  return validateConstraints(next);
}

export function guidedUnderstands(message, previous = emptyConstraints(), lastIds = []) {
  if (JSON.stringify(parseConversation(message, previous, lastIds)) !== JSON.stringify(validateConstraints(previous))) return true;
  return /comedy|commedi|romantic|romance|sci-fi|fantascienza|science fiction|documentar|animation|animazione|family|famiglia|horror|thriller|drama|drammatic|maratona|marathon|reset|ricomincia|riparti|azzera|start over|another|different|altro|altri|diversi|non questi|not these|divertent|funny|funnier|deep|profond|riflessiv|cerebral|consigliami|recommend|suggerisci|cosa guard|what.*watch|action|azione|adventure|avventura|mystery|mistero|giallo|fantasy|fantastico|crime|poliziesco|western|historical|storico|guerra|war|music|senza violen|troppo violent|without violen|too violent|gentle|under\s+\d|sotto\s+\d|entro\s+\d|max\s+\d|senza limit|no time limit|violenza va bene|allow violence/i.test(message);
}
export function conversationItalian(message, history = []) {
  const italian = /\b(ciao|troppo|senza|voglio|vorrei|maratona|consigli|qualcosa|meno|altro|altri|pi[uù]|staser[ao]|commedia|fantascienza|romantico|sotto|entro|profondo|divertente)\b/i;
  const english = /\b(please|something|under|comedy|tonight|recommend|funnier|another|without|want|more)\b/i;
  if (italian.test(message)) return true;
  if (english.test(message)) return false;
  const lastUser = [...history].reverse().find(m => m.role === 'user' && (italian.test(m.content) || english.test(m.content)));
  return lastUser ? italian.test(lastUser.content) : true;
}
