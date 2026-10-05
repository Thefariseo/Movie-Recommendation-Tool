// The member's friends in the browser: who follows whom, loaded once a minute
// at most and shared by every component that needs it.
import { useEffect, useState } from "react";
import { backend } from "./backend";

const FRESH_MS = 60_000;
let cached = { user: null, at: 0, value: null };

/** The social summary (people, following, followers, activity…), cached briefly. */
export function loadSocial(userId, { fresh = false } = {}) {
  if (!fresh && cached.user === userId && cached.value && Date.now() - cached.at < FRESH_MS) return cached.value;
  const value = backend("social");
  cached = { user: userId, at: Date.now(), value };
  value.catch(() => { cached = { user: null, at: 0, value: null }; });
  return value;
}

/** Drops the cache after the member changes something (a follow, a reaction). */
export const forgetSocial = () => { cached = { user: null, at: 0, value: null }; };

/** People who follow the member and whom the member follows. */
export const mutualFriends = (social) => (social?.people || []).filter((p) => social.following.includes(p.id) && social.followers.includes(p.id));

export function useMutualFriends(userId) {
  const [friends, setFriends] = useState(null);
  useEffect(() => {
    if (!userId) { setFriends([]); return undefined; }
    let live = true;
    loadSocial(userId).then((d) => live && setFriends(mutualFriends(d))).catch(() => live && setFriends([]));
    return () => { live = false; };
  }, [userId]);
  return friends;
}
