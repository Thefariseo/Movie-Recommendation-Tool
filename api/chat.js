import { nodeHandler, identify, database, body, HttpError, uuid, rateLimit } from '../server/http.js';
import { recommendations } from '../server/recommendations.js';
import { interpret } from '../server/conversation.js';
import { tmdb } from '../server/tmdb.js';
import { emptyConstraints, conversationItalian } from '../shared/conversation.js';
const lastAnswer = session => [...(session.messages || [])].reverse().find(m => m.role === 'assistant');
export async function restoreMovies(session) {
  const last = lastAnswer(session);
  if (Array.isArray(last?.movies)) return last.movies;
  const ids = (last?.movie_ids || []).filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 6);
  const found = await Promise.allSettled(ids.map(id => tmdb(`movie/${id}`)));
  return found.filter(r => r.status === 'fulfilled').map(r => r.value);
}
const snapshot = movie => ({ id: movie.id, title: String(movie.title || '').slice(0, 180), poster_path: movie.poster_path, release_date: movie.release_date, genre_ids: movie.genre_ids || movie.genres?.map(g => g.id) || [] });
export async function chat(ctx) {
  await identify(ctx);
  const db = database(ctx.token),
    me = ctx.user.id;
  if (ctx.request.method === 'GET') {
    const id = ctx.url.searchParams.get('id');
    if (id) {
      const rows = await db(`chat_sessions?id=eq.${uuid(id)}&user_id=eq.${me}`);
      if (!rows.length) throw new HttpError(404, 'Conversation not found.');
      return {
        session: rows[0],
        movies: await restoreMovies(rows[0]),
        mode: lastAnswer(rows[0])?.mode || 'guided'
      };
    }
    return {
      sessions: await db(`chat_sessions?user_id=eq.${me}&select=id,title,updated_at&order=updated_at.desc&limit=50`)
    };
  }
  const input = await body(ctx);
  if (input.action === 'delete') {
    await db(`chat_sessions?id=eq.${uuid(input.id)}&user_id=eq.${me}`, {
      method: 'DELETE'
    });
    return {
      ok: true
    };
  }
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 1000) throw new HttpError(400, 'Write a message of 1–1,000 characters.');
  await rateLimit(ctx, 'chat-minute');
  await rateLimit(ctx, 'chat-day');
  let session;
  if (input.id) {
    [session] = await db(`chat_sessions?id=eq.${uuid(input.id)}&user_id=eq.${me}`);
    if (!session) throw new HttpError(404, 'Conversation not found.');
  } else session = { messages: [], constraints: {}, version: 0 };
  const lastIds = session.messages.filter(m => m.role === 'assistant').at(-1)?.movie_ids || [];
  const {
    constraints,
    mode, understood
  } = await interpret(input.message, session.constraints && Object.keys(session.constraints).length ? session.constraints : emptyConstraints(), session.messages, lastIds);
  const result = understood ? await recommendations(ctx, [], constraints, lastIds) : { movies: await restoreMovies(session) };
  const picks = result.movies.slice(0, constraints.marathon_count > 1 ? constraints.marathon_count : 6);
  const italian = conversationItalian(input.message, session.messages);
  let reply = picks.length ? italian ? 'Ecco una selezione aggiornata sui tuoi gusti.' : 'Here’s a fresh selection for your taste.' : italian ? 'Non ho trovato film che rispettino tutti i filtri. Puoi allargare il genere o la durata?' : 'No films matched every filter. Would you like to broaden the genre or runtime?';
  if (understood && constraints.avoid_violence) reply += italian ? ' Ho cercato titoli più delicati usando generi e descrizioni; non è una classificazione dei contenuti.' : ' I looked for gentler picks using genres and descriptions; this is not a content rating.';
  if (understood && constraints.marathon_count > 1 && picks.length) reply += italian ? ` Maratona: ${picks.map(m => m.title).join(' → ')}.` : ` Marathon: ${picks.map(m => m.title).join(' → ')}.`;
  if (mode !== 'conversational') reply += italian ? ' Modalità guidata: puoi chiedere genere, durata, film più delicati o una maratona.' : ' Guided mode: try a genre, runtime, gentler films or a marathon.';
  if (!understood) reply = italian
    ? 'Non ho capito questa preferenza. In modalità guidata posso filtrare per genere e durata: prova “più divertente”, “più profondo”, “senza violenza” oppure “sotto 2 ore”. Ho mantenuto la selezione precedente.'
    : 'I didn’t understand that preference. Guided mode supports genres and runtime: try “funnier”, “more thought-provoking”, “without violence” or “under 2 hours”. I kept the previous selection.';
  else if (mode !== 'conversational' && /deep|profond|riflessiv|cerebral/i.test(input.message)) reply += italian ? ' Per “più profondo” ho privilegiato drammi e misteri.' : ' For “more thought-provoking”, I prioritised drama and mystery.';
  const messages = [...session.messages.map(({ movies, ...message }) => message), {
    role: 'user',
    content: input.message
  }, {
    role: 'assistant',
    content: reply,
    movie_ids: picks.map(m => m.id),
    movies: picks.map(snapshot),
    mode
  }].slice(-40);
  if (!session.id) {
    const [created] = await db('chat_sessions', { method: 'POST', prefer: 'return=representation', body: { user_id: me, title: input.message.trim().slice(0, 80), messages, constraints } });
    return { session: created, movies: picks, mode };
  }
  const saved = await db(`chat_sessions?id=eq.${session.id}&user_id=eq.${me}&version=eq.${session.version}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      messages,
      constraints,
      version: session.version + 1,
      updated_at: new Date().toISOString()
    }
  });
  if (!saved.length) throw new HttpError(409, 'This conversation changed on another device. Reopen it and try again.');
  return {
    session: saved[0],
    movies: picks,
    mode, understood
  };
}
export default nodeHandler(chat);
