/**
 * SEAM 4 — opening the `context:<id>` detail tab (§7.1).
 *
 * NAMED `open-detail`, NOT `detail`, and the name is load bearing: the detail
 * SURFACE is a directory in this module (`./surface`, and the install flow
 * imports it as `../detail`). A `detail.ts` file beside a `detail/` directory
 * resolves to the file under every bundler in this tree, which is a silent
 * wrong-module import rather than an error. This file requests the tab; that
 * directory draws it.
 *
 * The detail surface is a third tab kind in the editor panel alongside the two
 * diff kinds S5C already defines, so the tab model is being populated rather
 * than extended. That panel is not this builder's file, so the request crosses
 * as a renderer-internal event, exactly the way `state/open-file.ts` already
 * carries open-file and open-diff requests between streams that do not import
 * each other.
 *
 * THE FALLBACK IS THE POINT. `state/open-file.ts` can afford to drop a request
 * when no editor is mounted, because a row click has no other meaning there. A
 * context row click does: the user wants to see the thing. So while no detail
 * host is registered, a click opens the file that DEFINES the entry, which is
 * the honest 90% of the detail tab and needs nothing new. When the host lands
 * it registers, `hasDetailHost()` flips, and the fallback stops firing without
 * anything in this directory changing.
 */

import { requestOpenFile } from '../state/open-file';
import type { ContextEntry } from './model';

export const OPEN_CONTEXT_EVENT = 'gmux:open-context';

export interface OpenContextRequest {
  /** The entry to render. `context:<id>` is the tab key. */
  entry: ContextEntry;
  /** The project the view was showing when the row was clicked. */
  repoPath: string;
  /** Preview tab semantics — a single click previews, ⌘-click keeps. */
  preview: boolean;
}

let hosts = 0;

/** True once a detail host has subscribed. */
export function hasDetailHost(): boolean {
  return hosts > 0;
}

/** Subscribe a detail host. Returns the unsubscribe. */
export function onOpenContext(
  cb: (req: OpenContextRequest) => void
): () => void {
  const handler = (e: Event): void => {
    cb((e as CustomEvent<OpenContextRequest>).detail);
  };
  hosts += 1;
  window.addEventListener(OPEN_CONTEXT_EVENT, handler);
  return () => {
    hosts -= 1;
    window.removeEventListener(OPEN_CONTEXT_EVENT, handler);
  };
}

/** Open an entry's detail tab, or its source file while no host exists. */
export function requestOpenContext(req: OpenContextRequest): void {
  if (hosts > 0) {
    window.dispatchEvent(
      new CustomEvent<OpenContextRequest>(OPEN_CONTEXT_EVENT, { detail: req })
    );
    return;
  }
  openSourceFile(req.entry, req.repoPath, req.preview);
}

/**
 * PHASE 274. WHY A PATH OUTSIDE THE PROJECT HAS NO `relPath`, AND WHY SAYING
 * SO IS THE FIX.
 *
 * `OpenFileRequest.relPath` is documented at `../state/open-file.ts:115` as
 * *"Path relative to repoPath"*, and until this phase this module put an
 * ABSOLUTE path there whenever the prefix test missed. That is not a relative
 * path; it is a different kind of value wearing the same field's name, and
 * every reader downstream is entitled to believe the contract. `Copy Relative
 * Path` pasted an absolute one, and `use-editor-menu.ts:265` offered the
 * History row — which asks git about `tab.relPath` — for a file git has never
 * heard of.
 *
 * THE PHASE 274 HALF, and it is the reason this is a defect and not a wart.
 * The prefix test misses for TWO different reasons and the absolute fallback
 * made them look identical:
 *
 *   - the file really is outside the project (`~/.claude/skills/…`, which this
 *     module's header calls the common case rather than the edge one), and
 *   - the file IS inside the project and the two strings merely SPELL the
 *     folder differently — `~/source/proj` as a person opened it against
 *     `~/Source/proj` as the disk holds it, one folder on a case-insensitive
 *     volume, which is the APFS default. Issue 25.
 *
 * The second one is a bug, it is silent, and an absolute string in the
 * relative field is how it stayed silent. Rules 13 to 17 of this phase are
 * what stop it happening — main now answers in the spelling its caller asked
 * with, so a file inside the project passes the prefix test again — and this
 * is the net underneath them: when the test still misses, the relative form is
 * REFUSED with a word rather than faked with an absolute path.
 *
 * WHAT THE REFUSAL DOES AND DELIBERATELY DOES NOT DO. It refuses the relative
 * SPELLING, never the open. A Context detail tab on a global `~/.claude/
 * CLAUDE.md` is a shipped capability that `../editor/tab-io.ts:1367-1372` and
 * `../editor/p268-auto-save-drive.ts:141` both reason about by name; refusing
 * to open it would break a gesture rather than fix a spelling, and this phase
 * may not change what a person sees. So the request carries `relPath: ''`,
 * which is the value this renderer ALREADY means "this tab has no repo-relative
 * path" by: `../editor/use-editor-menu.ts:265` gates the History row on
 * `tab.relPath !== ''`, and `../editor/tab-menu.ts:157-160` leaves Copy
 * Relative Path off a tab where a relative path would be nothing.
 *
 * It is the same prefix rule as `fileInRepo` in `../editor/tab-identity.ts`,
 * written once here rather than imported, for the reason in this module's own
 * header: the Context stream and the editor stream do not import each other,
 * and a request crosses between them as an event. Importing the editor's tab
 * module for four lines would pull its graph — `machines/review`,
 * `editor/save-sentences` — into this one.
 */
export type RelPathRefusal = 'outside-project';

export type RelPathUnderRoot =
  | { relPath: string }
  | { refusal: RelPathRefusal };

export function relPathUnder(
  repoPath: string,
  path: string
): RelPathUnderRoot {
  if (repoPath.length === 0) return { refusal: 'outside-project' };
  const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  if (!path.startsWith(root)) return { refusal: 'outside-project' };
  return { relPath: path.slice(root.length) };
}

/**
 * Open one absolute path in the editor, landing on `line` when there is one.
 *
 * Most context files live OUTSIDE the project — `~/.claude/skills/…` is the
 * common case here, not the edge one — so `relPath` is only relative when it
 * actually is, and is empty rather than absolute when it is not. That rule and
 * its reasons are `relPathUnder` above, and it is stated once, here.
 *
 * PHASE 26 item 1: every open from this module is a PLAIN open (`mode:
 * 'file'`), and the editor guarantees the rest at tab creation — a file
 * outside the active repository never enters the diff path, no diff is
 * offered for it, and no git call is ever made for it
 * (`fileInRepo` in src/renderer/editor/tab-identity.ts). Opening a global
 * skill used to reach git with an absolute path and surface the refusal raw.
 */
export function openFileAt(
  path: string,
  repoPath: string,
  opts: { preview?: boolean; line?: number; contextEntry?: unknown } = {}
): void {
  const under = relPathUnder(repoPath, path);
  requestOpenFile({
    repoPath,
    relPath: 'relPath' in under ? under.relPath : '',
    path,
    mode: 'file',
    source: 'tree',
    preview: opts.preview ?? true,
    // Set by the detail host and by nothing else. Present turns the tab into
    // the `context:<id>` detail tab, which wears the header card over the same
    // body; absent opens the plain file. Threaded through this ONE function so
    // the relative-path rule above is written once for this directory.
    ...(opts.contextEntry !== undefined ? { contextEntry: opts.contextEntry } : {}),
    ...(opts.line !== undefined ? { selection: { line: opts.line } } : {})
  });
}

/** Open the file that defines an entry, at its problem line where there is one. */
export function openSourceFile(
  entry: ContextEntry,
  repoPath: string,
  preview = true
): void {
  openFileAt(entry.sourcePath, repoPath, {
    preview,
    // The parse error's own line, when the reader found one. Clicking a broken
    // row should land on the bad line, not on line 1 of a file the user then
    // has to search (§11 item 4).
    ...(entry.problem?.line != null ? { line: entry.problem.line } : {})
  });
}
