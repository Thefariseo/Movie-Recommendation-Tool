// The member's circle: mutual followers who share their activity, each with
// their diary, placed in the taste space next to the member. Loaded once per
// visit (and again after five minutes), since each friend is one request.
import { useEffect, useState } from "react";
import { backend } from "./backend";
import { loadTasteSpace } from "./tasteSpace";
import { loadTasteMap } from "./tasteMap";
import { tasteOf, closeness, closenessLabel, regionTaste } from "../../shared/social.js";

const MAX_FRIENDS = 12;
const FRESH_MS = 5 * 60 * 1000;
let cached = { user: null, at: 0, value: null };

const diary = (rows) => rows.filter((r) => r.kind === "watched").map((r) => ({ ...r.movie, id: Number(r.movie_id), rated: r.rating }));

async function loadFriends(userId) {
  if (cached.user === userId && cached.value && Date.now() - cached.at < FRESH_MS) return cached.value;
  const value = (async () => {
    const social = await backend("social");
    const mutual = social.people.filter((p) => social.following.includes(p.id) && social.followers.includes(p.id) && p.share_activity).slice(0, MAX_FRIENDS);
    const libraries = await Promise.allSettled(mutual.map((p) => backend("social", { action: "friend-library", user_id: p.id })));
    return mutual.map((p, i) => {
      const rows = libraries[i].status === "fulfilled" ? libraries[i].value.rows : [];
      return { id: p.id, name: p.display_name || "A friend", avatar_url: p.avatar_url, films: diary(rows), saved: rows.filter((r) => r.kind === "watchlist").map((r) => Number(r.movie_id)) };
    });
  })();
  cached = { user: userId, at: Date.now(), value };
  value.catch(() => { cached = { user: null, at: 0, value: null }; });
  return value;
}

/**
 * { model, me, friends, loading, error }: the taste space and map, the member
 * placed in them, and each friend with their taste, match and region ranks.
 * Friends the space cannot place (too few loved films) come with taste null.
 */
export function useCircle(userId, watched) {
  const [state, setState] = useState({ model: null, me: null, friends: [], loading: true, error: "" });
  const key = JSON.stringify(watched.map((m) => [m.id, m.rated]));
  useEffect(() => {
    if (!userId) { setState({ model: null, me: null, friends: [], loading: false, error: "" }); return undefined; }
    let live = true;
    Promise.all([loadTasteSpace(), loadTasteMap(), loadFriends(userId)]).then(([space, atlas, people]) => {
      if (!live) return;
      if (!space || !atlas) { setState({ model: null, me: null, friends: [], loading: false, error: "The taste map could not be loaded." }); return; }
      const model = { space, ...atlas };
      const me = tasteOf(space, watched);
      const mine = me && regionTaste(space, atlas.map, atlas.regions, me.z);
      const friends = people.map((f) => {
        const taste = tasteOf(space, f.films, f.saved);
        const match = me && taste ? closeness(space, me, taste) : null;
        return { ...f, taste, match, label: match == null ? null : closenessLabel(match), regions: taste ? regionTaste(space, atlas.map, atlas.regions, taste.z) : null };
      }).sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
      setState({ model, me: me && { ...me, regions: mine }, friends, loading: false, error: "" });
    }).catch((e) => live && setState({ model: null, me: null, friends: [], loading: false, error: e.message }));
    return () => { live = false; };
  }, [userId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
