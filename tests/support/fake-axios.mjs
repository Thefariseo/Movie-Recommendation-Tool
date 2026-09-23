// A controllable axios: each GET is recorded, and the test decides when and how
// it settles, to exercise concurrency and failure paths deterministically.
export const requests = [];
export function reset() { requests.length = 0; }
const client = {
  get(url, { params } = {}) {
    let settle;
    const promise = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    requests.push({ url, params, resolve: (data) => settle.resolve({ data }), reject: (e) => settle.reject(e) });
    return promise;
  }
};
export default { create: () => client };
