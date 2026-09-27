import { database, allRows, HttpError, uuid } from './http.js';
import { predict, groupScore } from '../shared/model.js';
import { tasteProfile, tasteScore, genreIds, seedMovies, diversePicks, hybridScore } from '../shared/taste.js';
import { tmdb } from './tmdb.js';
import { attachRatings } from './ratings.js';
import { tasteEvidence, evidenceSample, peerReason, languageAffinity, directorsOf } from '../shared/evidence.js';
import { placeMember, affinities, becauseOf, peerStrength, similarity } from '../shared/tasteSpace.js';
import { matchesDiscovery } from '../shared/discovery.js';
import { passesFilters } from '../shared/tonight.js';
import { loadTasteSpace, loadTasteMap } from './tasteSpace.js';
import { ratingPredictor, spaceCandidates } from '../shared/predict.js';
import { slate } from '../shared/slate.js';
import { tasteOf, closeness, circlePicks, circleReason } from '../shared/social.js';
import { territoryName } from '../shared/atlas.js';
import { stars } from '../shared/evidence.js';
import { readSignals, readRules } from './signals.js';
import { ruleMatch, STANCES } from '../shared/rules.js';
import { judge } from '../shared/judge.js';
import { signalMap, blocked, signalOf, jitter, withoutRecent } from '../shared/signals.js';
export { tmdb };
export const watchedMovies = rows => rows.filter(r => r.kind === 'watched').map(r => ({...r.movie, id: Number(r.movie_id), rated: r.rating}));
const filmDetails = id => tmdb(`movie/${id}`, { append_to_response: 'credits,keywords' });
async function inBatches(items, work, size = 6) {
  const settled = [];
  for (let i = 0; i < items.length; i += size) settled.push(...await Promise.allSettled(items.slice(i, i + size).map(work)));
  return settled;
}
// Signed evidence from the member's most telling films: who made them, who is
// in them, what they are about, where they come from. Smaller than the
// browser's sample, since it runs inside a request's time budget.
export async function memberEvidence(movies) {
  const sample = evidenceSample(movies, { loved: 12, disliked: 6 });
  const details = await inBatches(sample, m => filmDetails(m.id));
  return tasteEvidence(sample.map((m, i) => ({ rated: m.rated, title: m.title, details: details[i].status === 'fulfilled' ? details[i].value : null })), movies);
}
// On tasteScore's 10-point scale. Genre affinity there carries 2.4; these keep
// the same proportions the browser recommender uses against its genre weight.
const EVIDENCE_WEIGHT = { language: .65 };
const SHORTLIST = 32;
// The judge's adjustments are on the browser's scale; this is tasteScore's.
const JUDGE_SCALE = 4;
// What the critic learned, on what a list result shows (genres, language, decade).
const RULE_POINTS = 1.4;
// The taste space on the same scale: a film six standard deviations above a
// member's ordinary match gains over 2 points, as much as a strongly liked genre.
const PEER_WEIGHT = 3;
const PEER_PICKS = 20;
const peerPoints = z => PEER_WEIGHT * peerStrength(z);
// What the member's critic said, or "Not for me", on tasteScore's scale. A -2
// never reaches scoring: those films are excluded outright.
const SIGNAL_POINTS = { '-1': -2, '1': 1.2, '2': 2 };
// The rating the member's own diary predicts, per point above their mean.
const PREDICTED_POINTS = .7;
// Enough of the member's experience behind a prediction to show it.
const PREDICTION_SHOWN = .4;
// A film close friends loved, per unit of circle score (about 0.5–1.5).
const CIRCLE_POINTS = 1;

// The member's circle, from the films of friends they may read (mutual
// followers who share their activity): each placed in the taste space, and
// what they loved weighted by how close their taste is. id -> pick.
async function circleOf(db, me, space, placedMe, excluded) {
  const rows = await db(`user_movies?user_id=neq.${me}&kind=eq.watched&deleted=eq.false&rating=not.is.null&select=user_id,movie_id,rating,movie&order=updated_at.desc&limit=4000`);
  const byFriend = new Map();
  for (const r of rows) {
    if (!r.user_id || r.user_id === me) continue;
    byFriend.set(r.user_id, [...(byFriend.get(r.user_id) || []), { ...r.movie, id: Number(r.movie_id), rated: r.rating }]);
  }
  // Up to eight friends, the most active first, to stay inside the request's time.
  const ids = [...byFriend.keys()].filter(id => byFriend.get(id).length >= 3).slice(0, 8);
  if (!ids.length) return new Map();
  const people = await db(`profiles?id=in.(${ids.join(',')})&select=id,display_name`);
  const friends = ids.map(id => {
    const taste = tasteOf(space, byFriend.get(id));
    return taste && { id, name: people.find(p => p.id === id)?.display_name || 'A friend', films: byFriend.get(id), match: closeness(space, placedMe, taste) };
  }).filter(Boolean);
  return new Map(circlePicks(space, placedMe, friends, excluded, { limit: 24 }).filter(p => p.by[0].match >= 55).map(p => [p.id, p]));
}
export const contentScore = tasteScore;
export async function recommendations(ctx, members = [], constraints = {}, recentIds = [], { limit = 12, nightFilters = null } = {}) {
  if (!Array.isArray(members) || members.length > 3) throw new HttpError(400, 'Choose up to three friends.');
  const ids = [...new Set([ctx.user.id, ...members.map(uuid)])],
    db = database(ctx.token);
  const libraries = [];
  for (const id of ids) {
    if (id !== ctx.user.id) {
      const allowed = await db('rpc/can_read_library', {
        method: 'POST',
        body: {
          other_id: id
        }
      });
      if (!allowed) throw new HttpError(403, 'Each friend must follow you back and share their activity before a group movie night.');
    }
    const rows = await allRows(db, `user_movies?user_id=eq.${id}&deleted=eq.false&order=movie_id,kind`);
    if (ids.length > 1 && !rows.some(r => r.kind === 'watched' && r.rating)) throw new HttpError(400, 'Everyone in the group needs at least one rated film.');
    libraries.push(rows);
  }
  const excluded = new Set(libraries.flat().filter(r => r.kind === 'watched').map(r => Number(r.movie_id)));
  for (const id of constraints.excluded_ids || []) excluded.add(Number(id));
  // The host's signals hold for every night they host: what their critic
  // warned against, judged "skip", or they dismissed is never offered.
  const signals = signalMap(await readSignals(ctx).catch(() => []));
  // What the host's critic has learned about them. Only a member's own picks
  // follow it: a group night weighs everyone equally.
  const rules = ids.length === 1 ? await readRules(ctx) : [];
  for (const [id] of signals) if (blocked(signals, id)) excluded.add(id);
  const savedIds = new Set(libraries.flat().filter(r => r.kind === 'watchlist').map(r => Number(r.movie_id)));
  let model = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      model = await database(null, true)('rpc/current_model', {
        method: 'POST',
        body: {}
      });
    } catch {/* A failed optional model lookup must not take discovery down. */}
  }
  const collaborative = ids.length === 1 ? await db('rpc/collaborative_candidates', {
    method: 'POST',
    body: {}
  }) : [];
  const candidateMap = new Map();
  const personSets = [];
  const personFilms = [];
  for (const [id, role] of [[constraints.director_id, 'director'], [constraints.actor_id, 'actor']]) {
    if (!id) continue;
    const credits = await tmdb(`person/${id}/movie_credits`);
    const films = role === 'director' ? (credits.crew || []).filter(p => p.job === 'Director') : credits.cast || [];
    personSets.push(new Set(films.map(m => Number(m.id))));
    personFilms.push(...films);
  }
  const add = movies => {
    for (const m of movies || []) if (m.id && !excluded.has(Number(m.id)) && (!constraints.watchlist_only || savedIds.has(Number(m.id))) && personSets.every(ids => ids.has(Number(m.id)))) candidateMap.set(Number(m.id), {...candidateMap.get(Number(m.id)), ...m, genre_ids: genreIds(m)});
  };
  add(personFilms);
  const modelIds = model ? [...new Set(ids.flatMap(id => Object.keys(model.items).map(mid => ({
    id: Number(mid),
    score: predict(model, id, mid)
  })).filter(x => x.score != null && !excluded.has(x.id)).sort((a, b) => b.score - a.score).slice(0, 20).map(x => x.id)))] : [];
  // Every member is placed in the taste space from their own ratings. It costs
  // no provider calls, so group picks use it for everyone.
  const space = await loadTasteSpace();
  const placed = space ? libraries.map(rows => {
    const member = placeMember(space, watchedMovies(rows), rows.filter(r => r.kind === 'watchlist').map(r => Number(r.movie_id)));
    return member && { member, z: affinities(space, member) };
  }) : [];
  const peerZ = (index, id) => {
    const i = space?.index.get(Number(id));
    return i == null || !placed[index] ? null : placed[index].z[i];
  };
  // The films the whole group would love most: each film is only as strong as
  // its weakest match among the members the space could place.
  const spaceIds = [];
  const solo = ids.length === 1;
  const mine = solo ? watchedMovies(libraries[0]) : [];
  // One member's own ratings predict a rating for any film the space knows,
  // including what the films they disliked say about it.
  const predictor = solo && placed[0] ? ratingPredictor(space, mine) : null;
  const gems = new Set();
  if (predictor) {
    const { best, hidden } = spaceCandidates(space, placed[0].z, predictor, excluded);
    spaceIds.push(...best.slice(0, 32), ...hidden.slice(0, 8));
    hidden.forEach(id => gems.add(id));
  } else if (placed.some(Boolean)) {
    const ranked = [];
    for (let i = 0; i < space.n; i++) {
      if (space.counts[i] < 200 || excluded.has(space.tmdb[i])) continue;
      const zs = placed.filter(Boolean).map(p => p.z[i]);
      ranked.push([space.tmdb[i], Math.min(...zs)]);
    }
    spaceIds.push(...ranked.sort((a, b) => b[1] - a[1]).slice(0, PEER_PICKS).map(([id]) => id));
  }
  // Films the critic's rules point to: loved themes, languages and people.
  if (rules.length && !constraints.watchlist_only) {
    const loved = rules.filter(r => STANCES[r.stance] > 0);
    const themes = loved.filter(r => r.kind === 'theme').slice(0, 4).map(r => r.id);
    const tongue = loved.find(r => r.kind === 'language');
    const person = loved.find(r => r.kind === 'person');
    const found = await Promise.allSettled([
      themes.length ? tmdb('discover/movie', { with_keywords: themes.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': '150', include_adult: 'false' }) : null,
      tongue ? tmdb('discover/movie', { with_original_language: tongue.code, sort_by: 'vote_average.desc', 'vote_count.gte': '150', include_adult: 'false' }) : null,
      person ? tmdb(`person/${person.id}/movie_credits`).then(c => ({ results: person.role === 'actor' ? c.cast : (c.crew || []).filter(m => m.job === 'Director') })) : null
    ]);
    for (const r of found) if (r.status === 'fulfilled' && r.value) add(r.value.results);
  }
  // What close friends loved, weighted by how close their taste is.
  const circle = predictor && !constraints.watchlist_only ? await circleOf(db, ctx.user.id, space, placed[0], excluded).catch(() => new Map()) : new Map();
  const criticPicks = [...signals].filter(([id, e]) => e.net > 0 && e.sources.has('critic_pick') && !excluded.has(id)).slice(0, 8).map(([id]) => id);
  const detailIds = constraints.watchlist_only ? [] : [...new Set([...criticPicks, ...spaceIds, ...[...circle.keys()].slice(0, 8), ...collaborative.slice(0, 24).map(x => Number(x.movie_id)), ...modelIds])].slice(0, 64);
  for (let i = 0; i < detailIds.length; i += 5) {
    const results = await Promise.allSettled(detailIds.slice(i, i + 5).map(id => tmdb(`movie/${id}`)));
    for (const r of results) if (r.status === 'fulfilled') add([{
      ...r.value,
      genre_ids: r.value.genres?.map(g => g.id)
    }]);
  }
  for (const rows of libraries) {
    const liked = constraints.watchlist_only ? [] : seedMovies(watchedMovies(rows), 4);
    const results = await Promise.allSettled(liked.map(r => tmdb(`movie/${r.id}/recommendations`)));
    for (const r of results) if (r.status === 'fulfilled') add(r.value.results);
    const saved = rows.filter(r => r.kind === 'watchlist' && !excluded.has(Number(r.movie_id))).slice(0, constraints.watchlist_only ? 100 : 12);
    for (let i = 0; i < saved.length; i += 6) {
      const details = await Promise.allSettled(saved.slice(i, i + 6).map(r => tmdb(`movie/${r.movie_id}`)));
      for (const r of details) if (r.status === 'fulfilled') add([r.value]);
    }
  }
  const profiles = libraries.map(rows => tasteProfile(watchedMovies(rows)));
  // A single member's picks also weigh who made a film and what it is about,
  // in both directions. Group picks stay on the shared content and community
  // signals, since every extra member would multiply the provider calls.
  const evidence = ids.length === 1 ? await memberEvidence(watchedMovies(libraries[0])) : null;
  const genres = constraints.genre_ids?.length ? constraints.genre_ids : [...new Set(profiles.flatMap(p => [...p.genres].filter(([,score]) => score > 0).sort((a,b) => b[1] - a[1]).slice(0, 2).map(([id]) => id)))].slice(0, 6);
  const discoveryParams = {
    ...(constraints.decade ? {'primary_release_date.gte': `${constraints.decade}-01-01`, 'primary_release_date.lte': `${constraints.decade + 9}-12-31`} : {}),
    ...(constraints.country ? {with_origin_country: constraints.country} : {}),
    ...(constraints.actor_id ? {with_cast: String(constraints.actor_id)} : {}),
    ...(constraints.director_id ? {with_crew: String(constraints.director_id)} : {}),
    sort_by: 'vote_average.desc',
    'vote_count.gte': '50',
    include_adult: 'false',
    'primary_release_date.lte': constraints.decade ? `${constraints.decade + 9}-12-31` : new Date().toISOString().slice(0, 10),
    ...(constraints.avoid_genres?.length ? { without_genres: constraints.avoid_genres.join(',') } : {}),
    ...((genres.length && (!constraints.director_id && !constraints.actor_id || constraints.genre_ids?.length)) ? {
      with_genres: genres.join('|')
    } : {}),
    ...(constraints.max_runtime ? {
      'with_runtime.lte': String(constraints.max_runtime)
    } : {})
  };
  const discovery = constraints.watchlist_only ? [] : await Promise.allSettled([1, 2, 3].map(page => tmdb('discover/movie', {...discoveryParams, page: String(page)})));
  const originMatches = new Set();
  for (const r of discovery) if (r.status === 'fulfilled') {
    add(r.value.results);
    if (constraints.country) for (const m of r.value.results || []) originMatches.add(Number(m.id));
  }
  if (constraints.country) for (const [id,m] of candidateMap) {
    if (!originMatches.has(id) && !matchesDiscovery(m, {country:constraints.country})) candidateMap.delete(id);
  }
  if (!candidateMap.size && discovery.length && discovery.every(r => r.status === 'rejected')) throw new HttpError(502, 'Film discovery is temporarily unavailable. Please try again.');
  // IMDb and Rotten Tomatoes drive quality inside tasteScore. A few uncached
  // films are filled per request, so coverage grows as Umbrify is used.
  for (const m of await attachRatings([...candidateMap.values()], { fill: 4 })) candidateMap.set(Number(m.id), m);
  const neighborMap = new Map(collaborative.map(x => [Number(x.movie_id), x]));
  const predicted = new Map();
  const predictionOf = id => {
    if (!predictor) return null;
    if (!predicted.has(id)) predicted.set(id, predictor.predict(id));
    return predicted.get(id);
  };
  // The member's own diary and circle, on tasteScore's scale.
  const personal = id => {
    const p = predictionOf(id);
    const fromDiary = p && p.support >= .15 ? PREDICTED_POINTS * (p.rating - predictor.mean) : 0;
    return fromDiary + CIRCLE_POINTS * (circle.get(Number(id))?.score || 0);
  };
  let movies = [...candidateMap.values()].filter(m => !m.adult && (!m.release_date || m.release_date <= new Date().toISOString().slice(0, 10))).map(m => {
    const scores = ids.map((id, index) => hybridScore(
      contentScore(m, profiles[index]) + (evidence ? EVIDENCE_WEIGHT.language * languageAffinity(m, evidence) : 0) + peerPoints(peerZ(index, m.id)) + (index === 0 ? (SIGNAL_POINTS[signalOf(signals, m.id)] || 0) + RULE_POINTS * ruleMatch(m, rules).score + personal(m.id) : 0),
      predict(model || {users: {}, items: {}}, id, m.id),
      index === 0 ? neighborMap.get(m.id) : null
    ));
    const learned = ids.some(id => predict(model || {
        users: {},
        items: {}
      }, id, m.id) != null),
      neighbor = neighborMap.get(m.id);
    // A single member's strong match names the loved films that pull it up.
    const z = peerZ(0, m.id);
    const peer = ids.length === 1 && z != null && z >= 1.5 ? peerReason(becauseOf(space, placed[0].member, space.index.get(Number(m.id)))) : null;
    const peerAll = ids.length > 1 && placed.length && placed.every(Boolean) && ids.every((_, index) => (peerZ(index, m.id) ?? -Infinity) >= 1);
    return {
      ...m,
      _score: groupScore(scores),
      _engine: learned ? 'matrix-factorization' : neighbor ? 'collaborative' : peer || peerAll ? 'taste-space' : 'content',
      ...(peer ? { _reasonDetail: peer.full, _peer: true } : {}),
      _reason: ids.length === 1 && !peer && signals.get(Number(m.id))?.sources.has('critic_pick') ? 'Your critic recommended it' : peerAll ? 'People with each of your tastes love it' : ids.length > 1 ? 'Balances the group’s film tastes' : peer ? peer.short : learned ? 'Learned from community ratings' : neighbor ? 'Loved by people with similar ratings' : profiles[0].count ? 'Matches patterns in your likes and dislikes' : 'A well-rated starting point — rate films to personalise your picks',
      _support: neighbor ? Number(neighbor.support) : undefined,
      ...(predictionOf(m.id)?.support >= PREDICTION_SHOWN ? { _predicted: Math.round(predictionOf(m.id).rating * 2) / 2 } : {})
    };
  }).sort((a, b) => b._score - a._score);
  if (constraints.decade) movies = movies.filter(m => matchesDiscovery(m, {decade: constraints.decade}));
  if (nightFilters) movies = movies.filter(m => passesFilters(m, nightFilters));
  if (constraints.genre_ids?.length) movies = movies.filter(m => (m.genre_ids || []).some(id => constraints.genre_ids.includes(id)));
  if (constraints.avoid_genres?.length) movies = movies.filter(m => !(m.genre_ids || []).some(id => constraints.avoid_genres.includes(id)));
  // List results carry no credits or keywords, so the shortlist is fetched in
  // full and judged on them: a director the member rates low counts against a
  // film, a theme from films they loved counts for it.
  // The judge weighs every sign for and against each film, as in the browser:
  // several independent signs agreeing lift a film, a single loose link or
  // nothing but its genre drops it, and the reason names each sign.
  if (ids.length === 1 && (evidence?.films || rules.length || placed[0])) {
    const shortlist = movies.slice(0, SHORTLIST);
    for (const m of movies.slice(SHORTLIST)) m._score -= 0.1 * JUDGE_SCALE;
    const details = await inBatches(shortlist, m => filmDetails(m.id));
    shortlist.forEach((m, i) => {
      if (details[i].status !== 'fulfilled') return;
      const d = details[i].value;
      const z = peerZ(0, m.id);
      const verdict = judge({
        details: d,
        evidence: evidence?.films ? evidence : null,
        rules,
        peer: z != null && z >= 1.5 ? { z, films: becauseOf(space, placed[0].member, space.index.get(Number(m.id))) } : null,
        signal: signals.get(Number(m.id)) || null,
        saved: savedIds.has(Number(m.id))
      });
      m._score += JUDGE_SCALE * verdict.adjust;
      m._agree = verdict.agree;
      m._signs = verdict.signs.map(({ kind, short, full }) => ({ kind, short, full }));
      m._against = verdict.against;
      if (verdict.reason) { m._reason = verdict.reason.short; m._reasonDetail = verdict.reason.full; }
      // Lets the diversity pass avoid three films by one director.
      m.dirName = directorsOf(d)[0]?.name || m.dirName;
    });
    movies.sort((a, b) => b._score - a._score);
  }
  // Two more signs of the member's own: the films of theirs most like this
  // one and what they predict, and the close friends who loved it.
  if (predictor) for (const m of movies.slice(0, SHORTLIST)) {
    const extra = [];
    const p = predictionOf(m.id);
    if (p?.support >= PREDICTION_SHOWN && p.neighbours.length >= 2) {
      const films = p.neighbours.slice(0, 2).map(f => `"${f.title}" (${stars(f.rated)})`).join(' and ');
      extra.push({ kind: 'diary', short: `Like ${films.split(' and ')[0]} — about ${stars(p.rating)} for you`, full: `The films of yours most like it are ${films}: on their strength you would give it about ${stars(p.rating)}.` });
    }
    const pick = circle.get(Number(m.id));
    if (pick) extra.push({ kind: 'circle', short: `${pick.by[0].name} (${pick.by[0].match}% match) loved it`, full: circleReason(pick) });
    if (!extra.length) continue;
    m._signs = [...(m._signs || []), ...extra];
    if (!m._reason || /^(Matches patterns|Learned from|Loved by people|A well-rated)/.test(m._reason)) { m._reason = extra[0].short; m._reasonDetail = extra[0].full; }
  }
  if (constraints.max_runtime || constraints.avoid_violence || constraints.theme || constraints.country || constraints.director_id || constraints.actor_id || constraints.decade || nightFilters) {
    const enriched = [];
    // Bound provider calls; never backfill with films that violate an explicit constraint.
    for (let i = 0; i < Math.min(movies.length, 36); i += 6) {
      const part = await Promise.allSettled(movies.slice(i, i + 6).map(async m => ({
        ...m,
        ...(await tmdb(`movie/${m.id}`, {
          append_to_response: 'keywords,credits'
        }))
      })));
      for (const r of part) if (r.status === 'fulfilled') enriched.push(r.value);
      // Check the whole bounded shortlist: early non-matches must not hide later matches.
    }
    movies = enriched.filter(m => {
      if (!matchesDiscovery(m, constraints) || (nightFilters && !passesFilters(m, nightFilters))) return false;
      if (m.adult || (m.release_date && m.release_date > new Date().toISOString().slice(0, 10))) return false;
      const genres = genreIds(m);
      if (constraints.genre_ids?.length && !genres.some(g => constraints.genre_ids.includes(g))) return false;
      if (constraints.avoid_genres?.some(g => genres.includes(g))) return false;
      if (constraints.max_runtime && (!m.runtime || m.runtime > constraints.max_runtime)) return false;
      const keywords = m.keywords?.keywords || [];
      const text = `${m.overview || ''} ${keywords.map(k => k.name).join(' ')}`.toLowerCase();
      if (constraints.avoid_violence && (!(m.genres || []).length || ![16, 35, 10751, 10749, 10402].some(g => (m.genre_ids || m.genres.map(x => x.id)).includes(g)) || /\b(violence|violent|gore|murder|torture|killer|blood|war|gun|assault|rape|abuse)\b/i.test(text))) return false;
      if (constraints.theme && !text.includes(constraints.theme.toLowerCase())) return false;
      return true;
    });
  }
  // "Other picks": films just shown are left out while enough others remain,
  // and each round draws with a little variety among close candidates.
  movies = jitter(withoutRecent(movies, recentIds, limit), { seed: recentIds.length, spread: 0.35 });
  if (predictor) {
    // One member's first picks are composed: the top match, then films that
    // each do a different job, as long as each is still a strong match.
    const atlas = await loadTasteMap();
    const visited = new Set(atlas ? mine.map(f => space.index.get(Number(f.id))).filter(i => i != null).map(i => atlas.map.region[i]) : []);
    const anchors = new Map();
    const anchor = m => {
      const i = space.index.get(Number(m.id));
      if (i == null) return null;
      if (!anchors.has(m.id)) anchors.set(m.id, becauseOf(space, placed[0].member, i, { limit: 3 }).find(f => f.rated >= 8) || null);
      return anchors.get(m.id);
    };
    const territory = m => {
      const i = space.index.get(Number(m.id));
      if (!atlas || i == null || visited.has(atlas.map.region[i])) return null;
      return territoryName(atlas.regions.find(r => r.id === atlas.map.region[i]));
    };
    const gem = m => gems.has(Number(m.id)) || (space.counts[space.index.get(Number(m.id))] ?? Infinity) < 1500;
    const friendOf = m => (circle.get(Number(m.id)) ? { name: circle.get(Number(m.id)).by[0].name } : null);
    const alike = (a, b) => similarity(space, a.id, b.id) ?? 0;
    movies = slate([...movies].sort((a, b) => b._score - a._score), {
      limit, anchor, circle: friendOf, territory, gem, recent: new Set(recentIds.map(Number)),
      similar: alike,
      // Two loved films are one side of the member's taste when the same people love both.
      sameSide: (a, b) => a.id === b.id || alike(a, b) >= 0.8
    });
    // A pick from a territory never visited says where it comes from.
    for (const m of movies) if (m._role?.kind === 'territory') m._reasonDetail = `It comes from a part of the map of cinema you have never visited, the territory of ${m._role.place}. ${m._reasonDetail || m._reason || ''}`.trim();
  } else movies = diversePicks(movies, limit, { recent: new Set(recentIds.map(Number)) });
  const engine = movies.some(m => m._engine === 'matrix-factorization') ? 'matrix-factorization' : movies.some(m => m._engine === 'collaborative') ? 'collaborative' : movies.some(m => m._engine === 'taste-space') ? 'taste-space' : 'content';
  return {
    movies: movies.slice(0, limit),
    engine,
    message: ids.length > 1 ? 'Picks balance everyone’s taste; films already watched by anyone are excluded.' : predictor ? 'Composed for you: your top match, then the other sides of your taste, your circle, new territory and hidden gems, each checked against how you rated the films most like it.' : engine === 'content' ? 'Not enough shared rating history yet. These picks use your film tastes.' : engine === 'collaborative' ? 'These picks use ratings from people with similar tastes.' : engine === 'taste-space' ? 'These picks draw on what people with your taste love.' : 'These picks include predictions from the trained community model.'
  };
}
