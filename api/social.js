import { nodeHandler, identify, database, allRows, body, HttpError, uuid } from '../server/http.js';
import { normalizeMovie } from '../shared/library.js';
import { personView, recommendFilm, inbox, markRecommendationsSeen, dismissRecommendation, react, reactionsFor } from '../server/friends.js';
import { readList, myLists, saveList, changeListFilm, deleteList } from '../server/lists.js';
import { sendFeedback } from '../server/feedback.js';
import { readNotifications, subscribePush, unsubscribePush, notify, senderName } from '../server/notifications.js';
export async function social(ctx) {
  // A public list opens for anyone with the link, signed in or not.
  if (ctx.request.method === 'GET' && ctx.url.searchParams.get('list')) {
    await identify(ctx, false);
    return readList(ctx, ctx.url.searchParams.get('list'));
  }
  // Feedback comes from guests too.
  if (ctx.request.method === 'POST' && ctx.url.searchParams.has('feedback')) {
    await identify(ctx, false);
    return sendFeedback(ctx, await body(ctx));
  }
  await identify(ctx);
  const db = database(ctx.token),
    me = ctx.user.id;
  if (ctx.request.method === 'GET') {
    if (ctx.url.searchParams.has('notifications')) return readNotifications(ctx);
    if (ctx.url.searchParams.get('person')) return personView(ctx, ctx.url.searchParams.get('person'));
    if (ctx.url.searchParams.has('inbox')) return inbox(ctx);
    if (ctx.url.searchParams.has('lists')) return myLists(ctx);
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
    const activity = await db(`user_movies?user_id=neq.${me}&deleted=eq.false&select=user_id,movie_id,movie,kind,rating,updated_at&order=updated_at.desc&limit=80`);
    // Reactions to friends' films, and how many films friends sent that are still unseen.
    const [reactions, unseen] = await Promise.all([
      reactionsFor(ctx, activity.filter(a => a.kind === 'watched')),
      db(`film_recommendations?recipient=eq.${me}&seen_at=is.null&select=id&limit=100`).catch(() => [])
    ]);
    return {
      following: following.map(f => f.followed_id),
      followers: followers.map(f => f.follower_id),
      people,
      activity,
      reactions,
      unseen: unseen.length,
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
    await notify([uuid(input.user_id)], async () => ({ title: `${await senderName(ctx)} follows you`, body: 'Follow back to share picks and plan movie nights.', link: '/friends', tag: `follow-${me}` }));
    return {
      ok: true
    };
  }
  if (input.action === 'recommend') return recommendFilm(ctx, input);
  if (input.action === 'list-save') return saveList(ctx, input.list || {});
  if (input.action === 'list-add') return changeListFilm(ctx, input.id, input.movie);
  if (input.action === 'list-remove') return changeListFilm(ctx, input.id, input.movie_id, true);
  if (input.action === 'list-delete') return deleteList(ctx, input.id);
  if (input.action === 'recommend-seen') return markRecommendationsSeen(ctx);
  if (input.action === 'recommend-dismiss') return dismissRecommendation(ctx, input.id);
  if (input.action === 'react') return react(ctx, input);
  if (input.action === 'push-subscribe') return subscribePush(ctx, input.subscription);
  if (input.action === 'push-unsubscribe') return unsubscribePush(ctx, input.endpoint);
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
