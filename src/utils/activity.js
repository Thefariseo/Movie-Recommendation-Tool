// The thin progress bar along the top: React's view of src/utils/busy.js.
import { useEffect, useSyncExternalStore } from "react";
import { subscribe, isBusy, hold } from "./busy";

export { track, whenQuiet } from "./busy";

/** True while anything is pending. */
export const useBusy = () => useSyncExternalStore(subscribe, isBusy, () => false);

/** Counts as activity for as long as the calling component is on screen. */
export function useActivity() {
  useEffect(() => hold(), []);
}
