// Lets node:test load browser modules written for Vite: extensionless relative
// imports get their .js, import.meta.env is provided, and network clients are
// swapped for the in-memory fakes next to this file, so no test reaches the
// network.
const fake = (file) => new URL(file, import.meta.url).href;
const FAKES = {
  '../utils/api': fake('./fake-tmdb.mjs'),
  '../utils/ratings': fake('./fake-ratings.mjs'),
  '../utils/tasteSpace': fake('./fake-taste-space.mjs')
};
const fromSrc = (context) => context.parentURL?.includes('/src/');
export async function resolve(specifier, context, next) {
  // A test that imports src/utils/api.js itself gets it real, over a fake axios.
  if (specifier === 'axios' && context.parentURL?.endsWith('/src/utils/api.js')) return { url: fake('./fake-axios.mjs'), shortCircuit: true };
  if (FAKES[specifier] && fromSrc(context)) return { url: FAKES[specifier], shortCircuit: true };
  if (specifier.startsWith('.') && !/\.[cm]?jsx?$/.test(specifier) && fromSrc(context)) return next(`${specifier}.js`, context);
  return next(specifier, context);
}
export async function load(url, context, next) {
  const loaded = await next(url, context);
  if (!url.includes('/src/') || loaded.format !== 'module') return loaded;
  const source = String(loaded.source).replaceAll('import.meta.env', '(globalThis.__VITE_ENV__ || {})');
  return { ...loaded, source, shortCircuit: true };
}
