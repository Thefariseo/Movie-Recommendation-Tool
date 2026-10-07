// The page's door to the recommendation worker (src/workers/recommend.worker.js).
// A browser that cannot start it, or a worker that fails to load, falls back
// to building the recommendations on the page, as before.
import { currentLanguage } from "../i18n/index.js";
import { track } from "./busy";

let worker = null;
let broken = typeof Worker === "undefined";
let next = 0;
const waiting = new Map();

function spawn() {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL("../workers/recommend.worker.js", import.meta.url), { type: "module", name: "recommendations" });
  } catch {
    broken = true;
    return null;
  }
  worker.onmessage = ({ data }) => {
    const job = waiting.get(data?.id);
    if (!job) return;
    waiting.delete(data.id);
    if (data.error) job.reject(new Error(data.error));
    else job.resolve(data.result);
  };
  // The worker's own file could not load (an old browser, a blocked script):
  // everything waiting is rebuilt on the page, and later calls go there too.
  worker.onerror = (event) => {
    event.preventDefault?.();
    broken = true;
    worker.terminate();
    worker = null;
    const jobs = [...waiting.values()];
    waiting.clear();
    for (const job of jobs) onPage(job.args).then(job.resolve, job.reject);
  };
  return worker;
}

async function onPage(args) {
  const { getRecommendations, warmNextRound } = await import("../algorithms/recommender.js");
  const result = await getRecommendations(args);
  setTimeout(warmNextRound, 1500);
  return result;
}

/** getRecommendations(args), computed in the worker when the browser allows it. */
export function recommend(args) {
  const w = spawn();
  if (!w) return track(onPage(args));
  return track(new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, { resolve, reject, args });
    try {
      w.postMessage({ id, args, language: currentLanguage() });
    } catch {
      // Something in the arguments could not be copied to the worker.
      waiting.delete(id);
      onPage(args).then(resolve, reject);
    }
  }));
}

