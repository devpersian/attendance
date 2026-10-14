// ============================================
// Boot-time migration runner (Phase 3 / P3.1)
//
// Applies database/migrations/*.sql in filename order against SQL Server,
// tracking applied files in [attendance]._migrations so each file runs once.
//
// Design notes:
//  - Migration files use sqlcmd-style `GO` batch separators; mssql's
//    request.query() cannot execute a batch containing USE or multiple
//    batches, so we split on ^GO and run each batch separately.
//  - Every shipped migration is written idempotent (IF NOT EXISTS guards),
//    which makes re-runs safe after partial failures.
//  - Controlled by env RUN_MIGRATIONS: default ON at server boot; set
//    RUN_MIGRATIONS=false to skip (tests / manual SSMS workflow).
//  - Requires the base schema (database/schema.sql) to have been applied
//    first — it creates the DB + attendance schema itself. If the schema
//    is missing we log a clear hint instead of crashing the server.
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

/** Split a T-SQL script into batches on lines that are just `GO`. */
export function splitBatches(sqlText) {
  const parts = sqlText.split(/^\s*GO\s*$/im);
  return parts
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !/^--\s*$/.test(b))
    // Drop comment-only fragments
    .filter((b) => b.split('\n').some((line) => !/^\s*(--.*)?$/.test(line)));
}

async function ensureMigrationsTable(pool) {
  await pool
    .request()
    .query(`IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
                           WHERE s.name = 'attendance' AND t.name = '_migrations')
             BEGIN
               CREATE TABLE [attendance].[_migrations] (
                 [Id]        INT IDENTITY(1,1) PRIMARY KEY,
                 [Name]      NVARCHAR(255) NOT NULL UNIQUE,
                 [AppliedAt] DATETIME NOT NULL DEFAULT GETDATE()
               );
             END`);
}

async function getAppliedNames(pool) {
  const result = await pool
    .request()
    .query('SELECT [Name] FROM [attendance].[_migrations]');
  return new Set(result.recordset.map((r) => r.Name));
}

/**
 * Apply all pending migrations. Returns { applied: string[], skipped: number, failed?: {name,error} }.
 * Throws only if the failure should be fatal to boot (caller decides).
 */
export async function runMigrations({ dir = MIGRATIONS_DIR, log = console.log } = {}) {
  const pool = await getPool();

  // Guard: base schema must exist (schema.sql creates the attendance schema).
  const schemaCheck = await pool
    .request()
    .query("SELECT COUNT(*) AS c FROM sys.schemas WHERE name = 'attendance'");
  if (Number(schemaCheck.recordset[0].c) === 0) {
    throw new Error(
      '[migrate] Schema "attendance" not found. Run database/schema.sql first (CREATE DATABASE + schema), then restart.'
    );
  }

  await ensureMigrationsTable(pool);
  const applied = await getAppliedNames(pool);

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const newlyApplied = [];
  let skipped = 0;

  for (const file of files) {
    if (applied.has(file)) {
      skipped++;
      continue;
    }
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const batches = splitBatches(text);
    try {
      for (const batch of batches) {
        await pool.request().query(batch);
      }
      await pool
        .request()
        .input('name', file)
        .query('INSERT INTO [attendance].[_migrations] ([Name]) VALUES (@name)');
      newlyApplied.push(file);
      log(`✅ Migration applied: ${file}`);
    } catch (err) {
      const wrapped = new Error(`[migrate] Failed applying ${file}: ${err.message}`);
      wrapped.migration = file;
      wrapped.cause = err;
      throw wrapped;
    }
  }

  if (newlyApplied.length === 0) {
    log(`✔ Migrations up to date (${skipped} already applied)`);
  } else {
    log(`✔ Migrations complete: ${newlyApplied.length} applied, ${skipped} already present`);
  }
  return { applied: newlyApplied, skipped };
}

/** Env gate: default ON, disabled with RUN_MIGRATIONS=false|0|off (and always off under NODE_ENV=test). */
export function migrationsEnabled(env = process.env) {
  if ((env.NODE_ENV || '').toLowerCase() === 'test') return false;
  const flag = String(env.RUN_MIGRATIONS ?? 'true').trim().toLowerCase();
  return !['false', '0', 'off', 'no'].includes(flag);
}
