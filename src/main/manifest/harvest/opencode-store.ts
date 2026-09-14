/**
 * opencode STATES ITS SESSIONS IN A DATABASE, and this is the READ-ONLY reader
 * of that file (Phase 266, docs/research/121-opencode-integration.md).
 *
 * opencode is the first supported CLI whose store is one SQLite database,
 * `~/.local/share/opencode/opencode.db`, rather than a directory of
 * per-session files. Its `session` table carries `id` (a self-timestamping,
 * DESCENDING `ses_` id), `directory` (the ABSOLUTE cwd, in a real indexed
 * column), `time_created`, `parent_id` (opencode has sub-sessions) and
 * `time_archived`. The harvest reads the newest RESUMABLE session for a pane's
 * cwd out of it, exactly as the file agents read a filename out of a directory.
 *
 * WHAT THIS MODULE IS AND IS NOT. It is a READER of somebody else's file, and
 * that file is one where a person's credential lives (`auth.json` sits beside
 * it; a `credential` and an `account` table sit inside it). Every promise
 * below is enforced in code, not asserted:
 *
 *  1. IT NEVER WRITES. The open is `readonly + fileMustExist` and NOTHING
 *     else — no pragma is ever run, because a `journal_mode` or an `optimize`
 *     on somebody else's store is a write. The MEASURED `-shm` hazard
 *     (codex-state.ts) applies to every read-only open of a WAL database, so
 *     the same `safeToOpenReadOnly` guard is reused verbatim: a `-wal` present
 *     without a `-shm` is refused rather than opened, because opening it would
 *     CREATE the `-shm` beside his live store. The live db carries both
 *     sidecars (research 121 F7), so the guard passes and the open creates
 *     nothing.
 *  2. NEVER `immutable=1`. It creates nothing, and it is STALE: a row
 *     committed into the WAL and not checkpointed is invisible to it, and this
 *     harvest's whole job is to find the NEWEST row seconds after it was
 *     written. A stale answer is a wrong resume id, which is the whole defect.
 *  3. IT SELECTS THREE COLUMNS. `id`, `directory`, `time_created` — and it
 *     touches only the `session` table. No `credential`, no `account`, no
 *     `auth`, no token, no cost. No byte of any credential is read, logged,
 *     copied or returned.
 *  4. IT NEVER THROWS UP THE STACK. A locked db (another opencode writing), a
 *     missing db (opencode never run), a mid-recovery db or a renamed column
 *     all degrade to an empty list. The harvest simply finds nothing this
 *     cycle and retries, exactly as it does for a file store that is not there
 *     yet.
 *
 * DERIVED STREAMS ARE FILTERED IN THE QUERY. opencode writes sub-sessions
 * (`parent_id`) and archived sessions (`time_archived`) into the SAME table, so
 * a resume must never name one. The reader excludes them at the SQL level
 * (`parent_id IS NULL AND time_archived IS NULL`), so a derived row never even
 * reaches the harvest as a candidate. This is the opencode analogue of codex's
 * sub-agent-rollout refusal (the descriptor's `derivedStream` records the
 * measured evidence).
 *
 * Ownership: src/main/manifest/**. Synchronous, because its caller is.
 */

import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { OPENCODE_DB_RELPATH, type OpencodeSessionRow } from '@shared/opencode-store';
import { getLog } from '../../log';
import { safeToOpenReadOnly } from './codex-state';

const log = getLog('manifest');

/** Where opencode's session db lives for this home directory. */
export function opencodeDbPath(home: string): string {
  return join(home, OPENCODE_DB_RELPATH);
}

/**
 * A ceiling on how many recent sessions the reader hands back. The store is
 * tiny (research 121 read three rows), and the harvest only wants the newest
 * that matches a cwd, so a bounded window keeps a pathological store from ever
 * costing more than one small statement.
 */
const MAX_ROWS = 200;

/**
 * The recent RESUMABLE sessions opencode's store holds, NEWEST FIRST, or an
 * empty list.
 *
 * READ ONLY (see the module header). Newest first because `id` is descending,
 * so `ORDER BY id ASC` returns the largest `time_created` first (research 121
 * F3). Derived streams (sub-sessions, archived) are excluded in the query so
 * they never reach the harvest. Never throws: every failure is an empty list.
 */
export function readOpencodeSessions(dbPath: string): OpencodeSessionRow[] {
  // The `-shm` hazard guard, reused verbatim from codex-state: refuse a
  // WAL db with no `-shm`, because opening it read-only would CREATE the
  // `-shm` beside his live store. A missing db is also `false` here.
  if (!safeToOpenReadOnly(dbPath)) return [];

  let db: Database.Database;
  try {
    // readonly + fileMustExist, and NOTHING else. No pragma is run.
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    // Locked, mid recovery, or a shape sqlite refuses. The harvest retries.
    log.warn(
      `opencode session store at ${dbPath} could not be read: ` +
        `${(err as Error).message}. The harvest finds nothing this cycle.`
    );
    return [];
  }

  try {
    // A SCHEMA PROBE IN FRONT OF THE QUERY, exactly as codex-state does. The
    // select list is composed from the columns the file actually holds, so a
    // future opencode that renames or drops one degrades to an empty list
    // rather than throwing on the first query.
    const columns = new Set(
      (
        db
          .prepare("SELECT name FROM pragma_table_info('session')")
          .all() as { name: string }[]
      ).map((c) => c.name)
    );
    if (!columns.has('id') || !columns.has('directory') || !columns.has('time_created')) {
      return [];
    }

    // DERIVED STREAMS FILTERED HERE. Both predicates are added only when the
    // column exists, so a build without one still reads (and simply cannot
    // exclude on the missing dimension — the honest degrade).
    const where: string[] = [];
    if (columns.has('parent_id')) where.push('parent_id IS NULL');
    if (columns.has('time_archived')) where.push('time_archived IS NULL');
    const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT id, directory, time_created FROM session${whereSql} ORDER BY id ASC LIMIT ?`
      )
      .all(MAX_ROWS) as {
      id: unknown;
      directory: unknown;
      time_created: unknown;
    }[];

    const out: OpencodeSessionRow[] = [];
    for (const r of rows) {
      if (typeof r.id !== 'string' || r.id.length === 0) continue;
      if (typeof r.directory !== 'string' || r.directory.length === 0) continue;
      out.push({
        sessionId: r.id,
        directory: r.directory,
        timeCreatedMs: typeof r.time_created === 'number' ? r.time_created : 0
      });
    }
    return out;
  } catch (err) {
    // A mid-write db can throw on the query even after opening. Never a crash:
    // the harvest finds nothing this cycle and retries.
    log.warn(
      `opencode session store at ${dbPath} could not be queried: ` +
        `${(err as Error).message}. The harvest finds nothing this cycle.`
    );
    return [];
  } finally {
    try {
      db.close();
    } catch {
      /* already gone */
    }
  }
}

/** Realpath-resolving folder equality — a symlinked cwd keys on its target. */
async function samePath(a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return false;
  }
}

/**
 * The newest RESUMABLE `session.id` whose directory is the pane's cwd, or null.
 *
 * The rows come back newest first, so the FIRST whose `directory` resolves to
 * the same folder as `cwd` (via `samePath`, not a raw string `=`) is the
 * answer. Null when the db is missing, locked, or holds no matching row. This
 * is the convenience the reader tests and the boot rescue use; the live
 * harvest feeds every matching row through the shared settle path so grace,
 * rivals and the claim ladder apply unchanged.
 */
export async function newestOpencodeSessionIdForCwd(
  dbPath: string,
  cwd: string
): Promise<string | null> {
  for (const row of readOpencodeSessions(dbPath)) {
    if (await samePath(row.directory, cwd)) return row.sessionId;
  }
  return null;
}
