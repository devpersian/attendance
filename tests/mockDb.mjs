// Node module customization hook (used via --import by tests/routeAuth.test.mjs)
// Replaces server/db.mjs with an inert stub so the route-auth smoke test can
// import every router WITHOUT a live SQL Server connection.
//
// Any query from a properly-guarded route should never reach here — if it
// does, the globalThis counter records it (guards failed to short-circuit).

const inert = async () => { throw new Error('DB STUB: a route hit the database without authentication (guard leak!)'); };

export async function load(url, context, nextLoad) {
  if (url.includes('/server/db.mjs')) {
    const src = `
      let calls = 0;
      const bump = () => { calls++; globalThis.__ROUTEAUTH_DB_STUB__?.(); };
      export async function getPool() { bump(); return { request: () => ({ input(){return this;}, query(){ return Promise.resolve({ recordset: [] }); } }) }; }
      export async function query() { bump(); return []; }
      export async function execute() { bump(); return []; }
      export async function executeInsert() { bump(); return 0; }
      export function coerceIdParams(p) { return p; }
      export const __stub = true;
    `;
    return { format: 'module', source: src, shortCircuit: true };
  }
  return nextLoad(url, context);
}
