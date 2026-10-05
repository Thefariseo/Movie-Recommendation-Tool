// The member's own film lists, shared by the film sheet and the Library.
import { useCallback, useEffect, useState } from "react";
import { backend } from "./backend";

let cached = { user: null, value: null };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function loadMyLists(userId, { fresh = false } = {}) {
  if (!userId) return Promise.resolve([]);
  if (!fresh && cached.user === userId && cached.value) return cached.value;
  const value = backend("social?lists=1").then((d) => d.lists || []);
  cached = { user: userId, value };
  value.catch(() => { cached = { user: null, value: null }; });
  return value;
}

/** Saves a list (new or changed) or one film in or out of it, then refreshes everyone's copy. */
export async function changeList(action, payload) {
  const result = await backend("social", { action, ...payload });
  cached = { user: null, value: null };
  emit();
  return result;
}

export function useMyLists(userId) {
  const [lists, setLists] = useState(null);
  const reload = useCallback(() => {
    loadMyLists(userId).then(setLists).catch(() => setLists([]));
  }, [userId]);
  useEffect(() => {
    reload();
    listeners.add(reload);
    return () => listeners.delete(reload);
  }, [reload]);
  return lists;
}

export const listUrl = (id) => `${window.location.origin}/list/${id}`;

/** Shares a link with the system sheet where there is one, else copies it. Returns "shared" or "copied". */
export async function shareLink(url, title) {
  if (navigator.share) {
    await navigator.share({ title, url });
    return "shared";
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
