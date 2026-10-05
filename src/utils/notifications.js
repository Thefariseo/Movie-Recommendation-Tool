// The bell, the app install and push notifications in the browser. The bell's
// items come from the server (server/notifications.js); which ones the member
// has seen is remembered in this browser.
import { useCallback, useEffect, useState } from "react";
import { backend } from "./backend";

const SEEN_KEY = "umbrify_notifications_seen_v1";
const POLL = 3 * 60_000;

/** Registers the service worker that makes the site installable and shows pushes. */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// The browser offers the install once; it is kept until the member asks.
let installPrompt = null;
const installListeners = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installListeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installListeners.forEach((l) => l());
  });
}

/** Whether the site can be installed now, and the function that asks. */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    installListeners.add(l);
    return () => installListeners.delete(l);
  }, []);
  const install = useCallback(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice.catch(() => ({}));
    installPrompt = null;
    installListeners.forEach((l) => l());
    return outcome === "accepted";
  }, []);
  return { canInstall: Boolean(installPrompt), install };
}

const seenAt = (userId) => {
  try { return localStorage.getItem(`${SEEN_KEY}:${userId}`) || ""; } catch { return ""; }
};

/** The bell's items for a signed-in member, polled while the tab is visible. */
export function useNotifications(userId) {
  const [state, setState] = useState({ items: [], push: null, seen: "" });
  const load = useCallback(async () => {
    if (!userId || document.visibilityState === "hidden") return;
    try {
      const { items = [], push = null } = await backend("social?notifications=1");
      setState({ items, push, seen: seenAt(userId) });
    } catch { /* the bell stays as it was */ }
  }, [userId]);
  useEffect(() => {
    if (!userId) { setState({ items: [], push: null, seen: "" }); return undefined; }
    load();
    const timer = setInterval(load, POLL);
    document.addEventListener("visibilitychange", load);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [userId, load]);
  const markSeen = useCallback(() => {
    const latest = state.items[0]?.at || "";
    try { localStorage.setItem(`${SEEN_KEY}:${userId}`, latest); } catch { /* optional */ }
    setState((s) => ({ ...s, seen: latest }));
  }, [state.items, userId]);
  const unread = state.items.filter((i) => String(i.at) > state.seen).length;
  return { ...state, unread, markSeen, reload: load };
}

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const toBytes = (base64) => {
  const s = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

/** This device's push subscription, or null. */
export async function currentPush() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) || null;
}

/** Asks for permission and subscribes this device; returns whether it worked. */
export async function enablePush(publicKey) {
  if (!pushSupported() || !publicKey) return false;
  if ((await Notification.requestPermission()) !== "granted") return false;
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const subscription = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) }));
  await backend("social", { action: "push-subscribe", subscription: subscription.toJSON() });
  return true;
}

export async function disablePush() {
  const subscription = await currentPush();
  if (!subscription) return;
  await backend("social", { action: "push-unsubscribe", endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}
