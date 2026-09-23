// Stand-in for src/utils/tasteSpace.js. Tests set `space` to a hand-built taste
// space; by default there is none, as when the file cannot be fetched.
export let space = null;
export function setSpace(value) { space = value; }
export async function loadTasteSpace() { return space; }
