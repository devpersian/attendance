// Node module customization hook (registered via register() by
// tests/routeAuth.test.mjs). Replaces server/db.mjs with an INERT stub so the
// route-auth smoke test can import every router WITHOUT a live SQL Server
// connection — and crucially, without any background TCP connect attempts
// (a real db.mjs import opens pool connections that keep the test process
// alive for many seconds per probe).
//
// Any call from a properly-guarded route should never reach the stub — if it
// does, the globalThis counter records it (guards failed to short-circuit).

export async function load(url, context, nextLoad) {
  if (url.includes('/server/db.mjs')) {
    const src = `
      const bump = () => { globalThis.__ROUTEAUTH_DB_STUB__?.(); };
      export async function getPool() { bump(); return { request: () => ({ input(){return this;}, query(){ return Promise.resolve({ recordset: [] }); } }) }; }
      export async function query() { bump(); return []; }
      export async function execute() { bump(); return []; }
      export async function executeInsert() { bump(); return 0; }
      export function coerceIdParams(p) { return p; }
      // Stub sql/config so modules that touch them at import time don't pull in mssql.
      export const sql = { connect: async () => { bump(); return { on(){}, request: () => ({ input(){return this;}, query(){ return Promise.resolve({ recordset: [] }); } }) }; } };
      export const config = {};
      export const __stub = true;
    `;
    return { format: 'module', source: src, shortCircuit: true };
  }
  return nextLoad(url, context);
}
