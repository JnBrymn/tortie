/**
 * WHERE opencode KEEPS ITS SESSIONS, and the shape of the one row the harvest
 * reads back (Phase 266, docs/research/121-opencode-integration.md).
 *
 * opencode is the first supported CLI whose session store is a single SQLite
 * DATABASE rather than a directory of per-session files. Every other agent the
 * registry harvests writes a `.jsonl` or `.json` per session and the harvest
 * layer reads files; opencode writes ROWS in one `opencode.db`. This module
 * holds the ONE spelling of where that db lives and the shape of a `session`
 * row, so the registry entry's `storeDb` field and the READ-ONLY reader
 * (`src/main/manifest/harvest/opencode-store.ts`) import the same constant and
 * can never drift.
 *
 * PURE DATA. It names a path relative to a home directory and describes a row.
 * It opens nothing, reads nothing, runs nothing and imports no native code.
 */

/** opencode's session db, relative to the home directory. */
export const OPENCODE_DB_RELPATH = '.local/share/opencode/opencode.db';

/**
 * The directory that CONTAINS the db. Its existence is opencode's
 * install-and-in-use signal (the `storeDirs` entry), and it is the FSEvents
 * root the harvest watches — a directory a change event can name, where a bare
 * file cannot be `readdir`'d.
 */
export const OPENCODE_STORE_DIR_RELPATH = '.local/share/opencode';

/** The `~/`-template the registry row's `storeDb` field carries. */
export const OPENCODE_DB_TEMPLATE = '~/.local/share/opencode/opencode.db';

/**
 * One `session` row — the only three columns the harvest ever selects.
 *
 * The reader touches NOTHING else: not `credential`, not `account`, not
 * `auth`, not the `model`/`metadata`/token/cost columns. A place a person's
 * credential lives is read only, and no byte of one is ever selected.
 */
export interface OpencodeSessionRow {
  /**
   * The `ses_` id. Self-timestamping and DESCENDING, so the newest session
   * sorts FIRST under `ORDER BY id ASC` (research 121 F3). It is the value the
   * resume argv carries as `--session <id>`.
   */
  sessionId: string;
  /**
   * The ABSOLUTE cwd opencode recorded (a real, indexed column). NOT
   * realpath-guaranteed by opencode, so a caller compares it with the
   * codebase's `samePath` resolver, never a raw string `=` (research 121 F2).
   */
  directory: string;
  /**
   * `time_created`, epoch ms — AUTHORITATIVE for a session's age. The id does
   * NOT decode its own timestamp for a descending id (research 121 F4), so the
   * column is what says whether a row is this pane's or an older one.
   */
  timeCreatedMs: number;
}
