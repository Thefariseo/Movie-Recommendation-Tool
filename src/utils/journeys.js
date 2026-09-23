// The journeys a member follows. Signed-in members keep them on their account,
// so every device shows the same journeys; guests keep them in this browser.
// Journeys followed in this browser before they were kept on the account move
// there on the first visit.
import { useCallback, useEffect, useState } from "react";
import { backend } from "./backend";

const keyOf = (userId) => `umbrify_journeys_v1:${userId || "guest"}`;
const idOf = (j) => j.id || `${j.from.id}-${j.region.id}-${j.steps[0].id}`;

function readLocal(userId) {
  try { return JSON.parse(localStorage.getItem(keyOf(userId)) || "[]").map((j) => ({ ...j, id: idOf(j) })); } catch { return []; }
}
function writeLocal(userId, journeys) {
  try {
    if (journeys.length) localStorage.setItem(keyOf(userId), JSON.stringify(journeys));
    else localStorage.removeItem(keyOf(userId));
  } catch { /* storage may be blocked */ }
}

async function loadAccount(userId) {
  const { journeys } = await backend("signals?journeys=1");
  // Journeys followed in this browser, signed in before accounts kept them or as a guest.
  const guest = readLocal(null);
  if (guest.length) { writeLocal(userId, [...readLocal(userId), ...guest.filter((g) => !readLocal(userId).some((j) => j.id === g.id))]); writeLocal(null, []); }
  const local = readLocal(userId).filter((j) => !journeys.some((s) => s.id === j.id));
  const moved = [];
  for (const j of local) {
    try { moved.push((await backend("signals", { action: "save-journey", journey: j })).journey); } catch { /* keep it for the next visit */ }
  }
  writeLocal(userId, local.filter((j) => !moved.some((m) => m.id === j.id)));
  return [...journeys, ...moved];
}

/** [journeys, { follow, update, drop }, error] for the signed-in member or the guest. */
export function useFollowedJourneys(userId) {
  const [journeys, setJourneys] = useState(() => (userId ? [] : readLocal(null)));
  const [error, setError] = useState("");
  const [remote, setRemote] = useState(Boolean(userId));

  useEffect(() => {
    let live = true;
    if (!userId) { setJourneys(readLocal(null)); setRemote(false); return undefined; }
    setJourneys(readLocal(userId));
    loadAccount(userId)
      .then((list) => { if (live) { setJourneys(list); setRemote(true); } })
      // Without the account (offline, or the server not ready), this browser keeps them.
      .catch(() => { if (live) setRemote(false); });
    return () => { live = false; };
  }, [userId]);

  // Changes apply to the latest list, so several in a row (two journeys
  // re-routing at once) all land.
  const persist = useCallback(async (change, send) => {
    setError("");
    setJourneys((prev) => {
      const next = change(prev);
      if (!remote) writeLocal(userId, next);
      return next;
    });
    if (remote) {
      try { await send(); } catch (e) { setError(e.message); }
    }
  }, [remote, userId]);

  const follow = (j) => persist((list) => [...list.filter((f) => f.id !== j.id), j], () => backend("signals", { action: "save-journey", journey: j }));
  const update = (j) => persist((list) => list.map((f) => (f.id === j.id ? j : f)), () => backend("signals", { action: "save-journey", journey: j }));
  const drop = (j) => persist((list) => list.filter((f) => f.id !== j.id), () => backend("signals", { action: "drop-journey", id: j.id }));
  return [journeys, { follow, update, drop }, error];
}
