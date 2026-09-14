/**
 * PHASE 266 — reading opencode's session store, and the promise that matters
 * more than the reading.
 *
 * opencode is the first supported CLI whose store is one SQLite database. The
 * reader (../opencode-store.ts) opens it READ ONLY to find the newest resumable
 * session for a pane's cwd. The promise is that Tortie never writes a byte into
 * `~/.local/share/opencode` — not the db, not its WAL, no sidecar it did not
 * find already there — because that database sits beside a person's credential
 * (`auth.json`) and holds `credential`/`account` tables of its own.
 *
 * Everything below is driven over a scratch db this file writes, never his
 * real one. The attack (no write, ever) is measured — mtime, size and the
 * sidecar set before and after — rather than asserted.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  newestOpencodeSessionIdForCwd,
  readOpencodeSessions
} from '../opencode-store';

let root: string;

interface Row {
  id: string;
  directory: string;
  time_created: number;
  parent_id?: string | null;
  time_archived?: number | null;
}

/**
 * Write a scratch opencode-shaped db. The table carries the columns the reader
 * cares about plus a couple of opencode's NOT NULL ones, so the fixture is the
 * real shape rather than a convenient subset.
 */
function writeDb(dbPath: string, rows: Row[]): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(
    `CREATE TABLE session (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT 'p',
       parent_id TEXT, slug TEXT NOT NULL DEFAULT 's', directory TEXT NOT NULL,
       title TEXT NOT NULL DEFAULT 't', version TEXT NOT NULL DEFAULT '1',
       time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL DEFAULT 0,
       time_archived INTEGER);`
  );
  const insert = db.prepare(
    `INSERT INTO session (id, parent_id, directory, time_created, time_archived)
     VALUES (@id, @parent_id, @directory, @time_created, @time_archived)`
  );
  for (const r of rows) {
    insert.run({
      parent_id: null,
      time_archived: null,
      ...r
    });
  }
  db.close();
}

/**
 * opencode ids are DESCENDING: the newest session has the lexically SMALLEST
 * id (research 121 F3, confirmed on his store — `ses_f634…` newest sorts before
 * `ses_fc86…` older). These fixture ids keep that property: `ses_a` is the
 * newest and sorts first under ORDER BY id ASC.
 */
const NEWEST = 'ses_a';
const MIDDLE = 'ses_b';
const OLDEST = 'ses_c';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'p266-opencode-'));
});

afterEach(() => {
  // Remove the scratch tree we created — never a tilde or a HOME path.
  rmSync(root, { recursive: true, force: true });
});

describe('the reader finds the newest resumable session for a cwd', () => {
  it('returns rows newest-first and picks the newest id for the cwd', async () => {
    const db = join(root, 'opencode.db');
    const projX = join(root, 'projX');
    const projY = join(root, 'projY');
    mkdirSync(projX);
    mkdirSync(projY);
    writeDb(db, [
      { id: OLDEST, directory: projX, time_created: 1000 },
      { id: NEWEST, directory: projX, time_created: 3000 },
      { id: MIDDLE, directory: projY, time_created: 2000 }
    ]);

    // Newest first: ses_a (3000), ses_b (2000), ses_c (1000).
    const rows = readOpencodeSessions(db);
    expect(rows.map((r) => r.sessionId)).toEqual([NEWEST, MIDDLE, OLDEST]);
    expect(rows[0]).toMatchObject({ directory: projX, timeCreatedMs: 3000 });

    expect(await newestOpencodeSessionIdForCwd(db, projX)).toBe(NEWEST);
    expect(await newestOpencodeSessionIdForCwd(db, projY)).toBe(MIDDLE);
  });

  it('ignores sub-sessions (parent_id) and archived sessions', async () => {
    const db = join(root, 'opencode.db');
    const projX = join(root, 'projX');
    mkdirSync(projX);
    writeDb(db, [
      { id: NEWEST, directory: projX, time_created: 3000 },
      // A sub-session with an even-newer (smaller) id — must NOT be harvested.
      { id: 'ses_0', directory: projX, time_created: 9000, parent_id: NEWEST },
      // An archived session, also newer — must NOT be harvested.
      { id: 'ses_00', directory: projX, time_created: 9001, time_archived: 5000 }
    ]);

    const rows = readOpencodeSessions(db);
    expect(rows.map((r) => r.sessionId)).toEqual([NEWEST]);
    expect(await newestOpencodeSessionIdForCwd(db, projX)).toBe(NEWEST);
  });

  it('matches a symlinked cwd via realpath, not a raw string', async () => {
    const db = join(root, 'opencode.db');
    const realDir = join(root, 'real');
    const linkDir = join(root, 'link');
    mkdirSync(realDir);
    symlinkSync(realDir, linkDir);
    // opencode recorded the REAL directory; the pane's cwd is the symlink.
    writeDb(db, [{ id: NEWEST, directory: realDir, time_created: 3000 }]);

    expect(await newestOpencodeSessionIdForCwd(db, linkDir)).toBe(NEWEST);
  });

  it('a missing db is an empty list and a null id, not a throw', async () => {
    const db = join(root, 'nope', 'opencode.db');
    expect(readOpencodeSessions(db)).toEqual([]);
    expect(await newestOpencodeSessionIdForCwd(db, root)).toBeNull();
  });

  it('a cwd with no matching row is a null id', async () => {
    const db = join(root, 'opencode.db');
    const projX = join(root, 'projX');
    mkdirSync(projX);
    writeDb(db, [{ id: NEWEST, directory: projX, time_created: 3000 }]);
    expect(await newestOpencodeSessionIdForCwd(db, join(root, 'elsewhere'))).toBeNull();
  });
});

describe('a store it cannot read degrades to nothing, never a throw', () => {
  it('a file that is not a database is an empty list', () => {
    const db = join(root, 'opencode.db');
    writeFileSync(db, 'this is not sqlite');
    expect(() => readOpencodeSessions(db)).not.toThrow();
    expect(readOpencodeSessions(db)).toEqual([]);
  });

  it('a db with no session table is an empty list', () => {
    const db = join(root, 'opencode.db');
    const d = new Database(db);
    d.exec('CREATE TABLE project (id TEXT)');
    d.close();
    expect(readOpencodeSessions(db)).toEqual([]);
  });

  it('a session table missing the directory column degrades to empty', () => {
    const db = join(root, 'opencode.db');
    const d = new Database(db);
    d.exec('CREATE TABLE session (id TEXT PRIMARY KEY, time_created INTEGER)');
    d.close();
    expect(readOpencodeSessions(db)).toEqual([]);
  });

  it('a build without parent_id/time_archived still reads (no filter to apply)', () => {
    const db = join(root, 'opencode.db');
    const d = new Database(db);
    d.exec(
      `CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT NOT NULL,
         time_created INTEGER NOT NULL);`
    );
    d.prepare('INSERT INTO session VALUES (?, ?, ?)').run(NEWEST, '/w', 3000);
    d.close();
    expect(readOpencodeSessions(db).map((r) => r.sessionId)).toEqual([NEWEST]);
  });

  it('a concurrent reader does not block or throw (SQLite allows many readers)', () => {
    // A live opencode writing while we read is the everyday case. SQLite lets
    // any number of read-only connections open at once, so a second one open
    // here must not make the reader throw or return garbage.
    const db = join(root, 'opencode.db');
    const projX = join(root, 'projX');
    mkdirSync(projX);
    writeDb(db, [{ id: NEWEST, directory: projX, time_created: 3000 }]);
    const other = new Database(db, { readonly: true });
    try {
      expect(() => readOpencodeSessions(db)).not.toThrow();
      expect(readOpencodeSessions(db).map((r) => r.sessionId)).toEqual([NEWEST]);
    } finally {
      other.close();
    }
  });
});

describe('THE ATTACK: the reader never writes the store or a sidecar', () => {
  it('refuses a WAL db with no -shm and creates no -shm (the measured hazard)', () => {
    // The shape a read-only open would write into: a -wal present without a
    // -shm. safeToOpenReadOnly (shared with codex-state) refuses it, so the
    // open never happens and no -shm is created beside his live store.
    const source = join(root, 'live.db');
    const live = new Database(source);
    live.pragma('journal_mode = WAL');
    live.exec(
      `CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT NOT NULL,
         time_created INTEGER NOT NULL);`
    );
    live.prepare('INSERT INTO session VALUES (?, ?, ?)').run(NEWEST, '/w', 3000);
    const target = join(root, 'opencode.db');
    // Copy the db and its -wal WITHOUT the -shm.
    writeFileSync(target, readFileSync(source));
    writeFileSync(`${target}-wal`, readFileSync(`${source}-wal`));
    live.close();

    expect(existsSync(`${target}-wal`)).toBe(true);
    expect(existsSync(`${target}-shm`)).toBe(false);
    expect(readOpencodeSessions(target)).toEqual([]);
    // THE PROMISE: nothing appeared beside the file.
    expect(existsSync(`${target}-shm`)).toBe(false);
  });

  it('leaves a checkpointed db byte-for-byte and creates no -wal/-shm', () => {
    const db = join(root, 'opencode.db');
    const projX = join(root, 'projX');
    mkdirSync(projX);
    // Default (DELETE) journal mode: a checkpointed store, no sidecars.
    writeDb(db, [
      { id: NEWEST, directory: projX, time_created: 3000 },
      { id: OLDEST, directory: projX, time_created: 1000 }
    ]);
    expect(existsSync(`${db}-wal`)).toBe(false);
    expect(existsSync(`${db}-shm`)).toBe(false);

    const before = statSync(db);
    // Hammer it: hundreds of reads.
    for (let i = 0; i < 300; i += 1) {
      expect(readOpencodeSessions(db).length).toBe(2);
    }
    const after = statSync(db);

    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    // No sidecar was ever created — no write lock, no WAL, no -shm.
    expect(existsSync(`${db}-wal`)).toBe(false);
    expect(existsSync(`${db}-shm`)).toBe(false);
  });

  it('opens with readonly+fileMustExist and runs no pragma (source)', () => {
    // A source guard, so a later edit cannot quietly relax the open. The
    // reader must open read-only, insist the file exist, run no pragma, and
    // never ask for an immutable snapshot (stale, and forbidden by the rule).
    const src = readFileSync(
      resolve(__dirname, '..', 'opencode-store.ts'),
      'utf8'
    );
    expect(src).toMatch(/readonly:\s*true/);
    expect(src).toMatch(/fileMustExist:\s*true/);
    // No pragma is ever run against someone else's store (a `.pragma(` call is
    // a write). `pragma_table_info(...)` inside a SELECT is a read and is fine.
    expect(src).not.toMatch(/\.pragma\(/);
    // The Database open options never ask for an immutable snapshot (it is
    // stale — it would miss the just-created row — and it is forbidden by the
    // rule). Checked at the open call, not in the prose that explains why.
    const openCall = /new Database\([^)]*\{([^}]*)\}/.exec(src);
    expect(openCall).not.toBeNull();
    expect(openCall?.[1] ?? '').not.toMatch(/immutable/);
  });
});
