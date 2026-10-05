// Whether the page is waiting on something (a page's file, the films it
// fetches), for the thin progress bar along the top.
import { useEffect, useSyncExternalStore } from "react";

let pending = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const start = () => { pending++; emit(); };
const stop = () => { pending = Math.max(0, pending - 1); emit(); };

/** Counts a promise as activity until it settles; returns it. */
export function track(promise) {
  start();
  return Promise.resolve(promise).finally(stop);
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** True while anything is pending. */
export const useBusy = () => useSyncExternalStore(subscribe, () => pending > 0, () => false);

/** Counts as activity for as long as the calling component is on screen. */
export function useActivity() {
  useEffect(() => { start(); return stop; }, []);
}

/**
 * Resolves once nothing has been pending for `quiet` ms (the page has its
 * films), or after `max` ms whatever happens.
 */
export function whenQuiet(quiet = 1000, max = 15000) {
  return new Promise((resolve) => {
    let timer = null;
    const done = () => { clearTimeout(timer); clearTimeout(cap); listeners.delete(check); resolve(); };
    const check = () => {
      clearTimeout(timer);
      if (pending === 0) timer = setTimeout(done, quiet);
    };
    const cap = setTimeout(done, max);
    listeners.add(check);
    check();
  });
}
