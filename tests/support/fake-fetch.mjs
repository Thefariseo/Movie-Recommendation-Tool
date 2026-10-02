// A controllable fetch: each request is recorded, and the test decides when and
// how it settles, to exercise concurrency and failure paths deterministically.
export const requests = [];
export function reset() { requests.length = 0; }
export function install() {
  globalThis.fetch = (url) => new Promise((resolve, reject) => {
    requests.push({ url: String(url), resolve: (data) => resolve(Response.json(data)), reject });
  });
}
