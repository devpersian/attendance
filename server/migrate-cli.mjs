// ============================================
// Phase 3 / P3.1 companion: manual migration CLI
//   node server/migrate-cli.mjs            → apply pending migrations
//   node server/migrate-cli.mjs --list     → show applied/pending status
// For DBs created before _migrations existed, run --baseline first so the
// runner doesn't re-apply already-executed files (they are idempotent, but
// this keeps the tracking table honest).
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.mjs';
import { runMigrations } from './services/migrate.mjs';

const args = process.argv.slice(2);

async function list() {
  const pool = await getPool();
  const res = await pool.request().query('SELECT [Name], [AppliedAt] FROM [attendance].[_migrations] ORDER BY [Name]');
  console.log('Applied migrations:');
  for (const r of res.recordset) console.log(`  ${r.Name}  (${r.AppliedAt.toISOString()})`);
  if (!res.recordset.length) console.log('  (none — attendance._migrations is empty)');
}

async function baseline() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(__dirname, '../database/migrations');
  const pool = await getPool();
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let n = 0;
  for (const f of files) {
    await pool.request().input('name', f)
      .query(`IF NOT EXISTS (SELECT 1 FROM [attendance].[_migrations] WHERE [Name] = @name)
              INSERT INTO [attendance].[_migrations] ([Name]) VALUES (@name)`);
    n++;
  }
  console.log(`Baselined ${n} migration filenames as applied.`);
}

try {
  if (args.includes('--list')) {
    await list();
  } else if (args.includes('--baseline')) {
    await baseline();
  } else {
    const result = await runMigrations();
    console.log(result.applied.length ? `Applied: ${result.applied.join(', ')}` : 'Nothing to apply.');
  }
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
