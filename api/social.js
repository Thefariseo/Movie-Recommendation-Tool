import { nodeHandler, identify, database, allRows, body, HttpError, uuid } from '../server/http.js';
import { normalizeMovie } from '../shared/library.js';
export async function social(ctx) {
  await identify(ctx);
  const db = database(ctx.token),
    me = ctx.user.id;
  if (ctx.request.method === 'GET') {
    const q = (ctx.url.searchParams.get('q') || '').trim();
    if (q) {
      if (q.length < 2 || q.length > 60) throw new HttpError(400, 'Search with 2–60 characters.');
      const safe = q.replace(/[%,.*()]/g, '');
      return {
        people: await db(`profiles?discoverable=eq.true&id=neq.${me}&display_name=ilike.${encodeURIComponent(`*${safe}*`)}&select=id,display_name,avatar_url&limit=20&order=display_name,id`)
      };
    }
    const [following, followers, lists] = await Promise.all([db(`follows?follower_id=eq.${me}&select=followed_id&limit=500`), db(`follows?followed_id=eq.${me}&select=follower_id&limit=500`), db('shared_lists?select=*,list_members(user_id),list_movies(*)&order=created_at.desc&limit=100')]);
    const ids = [...new Set([...following.map(f => f.followed_id), ...followers.map(f => f.follower_id)])];
    const people = ids.length ? await db(`profiles?id=in.(${ids.join(',')})&select=id,display_name,avatar_url,share_activity&limit=1000`) : [];
    const activity = await db(`user_movies?user_id=neq.${me}&deleted=eq.false&select=user_id,movie_id,movie,kind,rating,updated_at&order=updated_at.desc&limit=40`);
    return {
      following: following.map(f => f.followed_id),
      followers: followers.map(f => f.follower_id),
      people,
      activity,
      lists
    };
  }
  const input = await body(ctx);
  if (input.action === 'profile') {
    const {
      display_name,
      country,
      discoverable,
      share_activity,
      collaborative
    } = input.profile || {};
    if (typeof display_name !== 'string' || !display_name.trim() || display_name.length > 60 || !/^[A-Z]{2}$/.test(country || '') || [discoverable, share_activity, collaborative].some(v => typeof v !== 'boolean')) throw new HttpError(400, 'Check your profile fields.');
    await db(`profiles?id=eq.${me}`, {
      method: 'PATCH',
      body: {
        display_name: display_name.trim(),
        country,
        discoverable,
        share_activity,
        collaborative
      }
    });
    return {
      ok: true
    };
  }
  if (input.action === 'follow') {
    await db('follows', {
      method: 'POST',
      body: {
        follower_id: me,
        followed_id: uuid(input.user_id)
      },
      prefer: 'resolution=ignore-duplicates'
    });
    return {
      ok: true
    };
  }
  if (input.action === 'unfollow') {
    await db(`follows?follower_id=eq.${me}&followed_id=eq.${uuid(input.user_id)}`, {
      method: 'DELETE'
    });
    return {
      ok: true
    };
  }
  if (input.action === 'create-list') {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100 || !Array.isArray(input.members) || input.members.length > 10) throw new HttpError(400, 'Choose a list name and up to ten friends.');
    const id = await db('rpc/create_shared_list', {
      method: 'POST',
      body: {
        list_title: input.title.trim(),
        members: [...new Set(input.members.map(uuid))]
      }
    });
    return {
      id
    };
  }
  if (input.action === 'add-movie') {
    let movie;
    try {
      movie = normalizeMovie(input.movie);
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    await db('list_movies', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates',
      body: {
        list_id: uuid(input.list_id),
        movie_id: movie.id,
        movie,
        added_by: me
      }
    });
    return {
      ok: true
    };
  }
  if (input.action === 'remove-movie') {
    if (!Number.isSafeInteger(input.movie_id) || input.movie_id <= 0) throw new HttpError(400, 'Invalid movie.');
    await db(`list_movies?list_id=eq.${uuid(input.list_id)}&movie_id=eq.${input.movie_id}`, {
      method: 'DELETE'
    });
    return {
      ok: true
    };
  }
  if (input.action === 'delete-list') {
    await db(`shared_lists?id=eq.${uuid(input.list_id)}&owner_id=eq.${me}`, {
      method: 'DELETE'
    });
    return {
      ok: true
    };
  }
  if (input.action === 'leave-list') {
    await db(`list_members?list_id=eq.${uuid(input.list_id)}&user_id=eq.${me}`, {
      method: 'DELETE'
    });
    return {
      ok: true
    };
  }
  if (input.action === 'friend-library') {
    const id = uuid(input.user_id);
    const rows = await allRows(db, `user_movies?user_id=eq.${id}&deleted=eq.false&order=movie_id,kind`);
    return {
      rows
    };
  }
  throw new HttpError(400, 'Unknown community action.');
}
export default nodeHandler(social);
