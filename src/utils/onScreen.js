// Which films the "Picked for you" section is showing right now, so rows
// further down the page do not show them a second time.
import { useEffect, useState } from "react";

let picked = new Set();
const listeners = new Set();

export function setPicked(ids) {
  picked = new Set(ids.map(Number));
  listeners.forEach((l) => l(picked));
}

export function usePicked() {
  const [value, setValue] = useState(picked);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}
