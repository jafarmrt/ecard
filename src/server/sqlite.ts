/**
 * SQLite connection and schema migrations.
 *
 * Uses Node's built-in `node:sqlite` (Node 22.13+), so there is no native
 * module to compile on the server. The database lives in DATA_DIR/roya.db.
 */
import fs from 'fs';
import path from 'path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

export type SqliteDb = DatabaseSyncType;

let warningFilterInstalled = false;

/** node:sqlite prints an "experimental" warning on load; it is noise for operators. */
function silenceSqliteWarning() {
  if (warningFilterInstalled) return;
  warningFilterInstalled = true;
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: any[]) => {
    const text = typeof warning === 'string' ? warning : warning?.message;
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
    if (type === 'ExperimentalWarning' && /SQLite/i.test(String(text))) return;
    return (original as any)(warning, ...rest);
  }) as typeof process.emitWarning;
}

function loadDriver(): typeof import('node:sqlite') {
  silenceSqliteWarning();
  const mod = process.getBuiltinModule?.('node:sqlite') as typeof import('node:sqlite') | undefined;
  if (!mod?.DatabaseSync) {
    throw new Error(
      `This version of Node.js (${process.version}) has no built-in SQLite. Please upgrade to Node.js 22.13 or newer.`
    );
  }
  return mod;
}

/** Ordered schema migrations. Never edit an applied step; add a new one instead. */
const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE organization (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE COLLATE NOCASE,
    status TEXT NOT NULL DEFAULT 'active',
    branch_id TEXT,
    redirect_to TEXT,
    data TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
  );
  CREATE TABLE profile_aliases (
    alias TEXT PRIMARY KEY COLLATE NOCASE,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE leads (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    profile_name TEXT,
    customer_name TEXT NOT NULL,
    customer_mobile TEXT NOT NULL,
    customer_company TEXT,
    topic TEXT,
    note TEXT,
    consent_at TEXT,
    source TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX leads_created ON leads(created_at);
  CREATE INDEX leads_profile ON leads(profile_id);
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT,
    campaign TEXT,
    device TEXT,
    visitor TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX events_profile_time ON events(profile_id, created_at);
  CREATE INDEX events_time ON events(created_at);
  CREATE TABLE legacy_counters (
    profile_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    summary TEXT,
    ip TEXT
  );
  CREATE INDEX audit_at ON audit_log(at);
  CREATE TABLE revoked_tokens (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
  `,
];

export function getDbPath(dataDir: string): string {
  return path.join(dataDir, 'roya.db');
}

export function openDatabase(file: string): SqliteDb {
  const { DatabaseSync } = loadDriver();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

function migrate(db: SqliteDb) {
  const current = Number((db.prepare('PRAGMA user_version').get() as any)?.user_version || 0);
  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function schemaVersion(db: SqliteDb): number {
  return Number((db.prepare('PRAGMA user_version').get() as any)?.user_version || 0);
}

/** Runs fn inside BEGIN/COMMIT; nested calls join the outer transaction. */
let depth = 0;
export function transaction<T>(db: SqliteDb, fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    depth--;
  }
}

/** Consistent online copy of the database (safe while the server runs). */
export function backupTo(db: SqliteDb, target: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.unlinkSync(target);
  db.prepare('VACUUM INTO ?').run(target);
}
