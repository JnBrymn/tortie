/**
 * PHASE 274 — a path outside the project has NO relative path, and an open
 * request says so instead of putting an absolute one in the relative field.
 *
 * `OpenFileRequest.relPath` is documented at `../../state/open-file.ts:115` as
 * *"Path relative to repoPath"*. `openFileAt` used to put the ABSOLUTE path
 * there whenever its prefix test missed, and the prefix test misses for two
 * different reasons that the absolute fallback made look identical: a file
 * genuinely outside the project, which is the `~/.claude/skills/…` shape this
 * module's header calls the common case, and a file INSIDE the project whose
 * spelling merely differs from the project's — `~/source/proj` against
 * `~/Source/proj`, one folder on a case-insensitive volume, which is issue 25.
 *
 * Rules 13 to 17 of this phase are what stop the second one reaching here.
 * This is the net underneath them: the relative SPELLING is refused with a
 * word, the open still happens, and `relPath` is empty rather than a lie.
 * Empty is the value this renderer already means "no repo-relative path" by —
 * `../../editor/use-editor-menu.ts:265` gates the History row on it and
 * `../../editor/tab-menu.ts` leaves Copy Relative Path off such a tab.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenFileRequest } from '../../state/open-file';
import { openFileAt, relPathUnder } from '../open-detail';

/**
 * The renderer suite runs in the `node` environment, so `window` is faked the
 * way `src/renderer/app/__tests__/p129-session-rail.test.ts` fakes it: a
 * recorder, not a DOM.
 */
function fakeWindow(sent: OpenFileRequest[]): unknown {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: (e: { detail: OpenFileRequest }) => {
      sent.push(e.detail);
      return true;
    },
    CustomEvent: class {
      detail: OpenFileRequest;
      constructor(_type: string, init: { detail: OpenFileRequest }) {
        this.detail = init.detail;
      }
    }
  };
}

function drive(path: string, repoPath: string): OpenFileRequest {
  const sent: OpenFileRequest[] = [];
  const win = fakeWindow(sent) as { CustomEvent: unknown };
  vi.stubGlobal('window', win);
  vi.stubGlobal('CustomEvent', win.CustomEvent);
  openFileAt(path, repoPath);
  const req = sent[0];
  if (req === undefined) throw new Error('no open request was emitted');
  return req;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('relPathUnder', () => {
  it('answers the relative path for a file inside the project', () => {
    expect(relPathUnder('/repo', '/repo/src/auth.ts')).toEqual({
      relPath: 'src/auth.ts'
    });
  });

  it('tolerates a trailing separator on the root, as fileInRepo does', () => {
    expect(relPathUnder('/repo/', '/repo/src/auth.ts')).toEqual({
      relPath: 'src/auth.ts'
    });
  });

  it('refuses a file outside the project, and names the reason', () => {
    expect(relPathUnder('/repo', '/Users/gdc/.claude/CLAUDE.md')).toEqual({
      refusal: 'outside-project'
    });
  });

  it('refuses a sibling whose name merely starts the same way', () => {
    expect(relPathUnder('/repo', '/repo2/src/auth.ts')).toEqual({
      refusal: 'outside-project'
    });
  });

  it('refuses the root itself, which is not a file in the project', () => {
    expect(relPathUnder('/repo', '/repo')).toEqual({
      refusal: 'outside-project'
    });
  });

  it('refuses an empty root rather than treating everything as inside it', () => {
    expect(relPathUnder('', '/repo/src/auth.ts')).toEqual({
      refusal: 'outside-project'
    });
  });

  it('REFUSES A CASE-DIFFERENT SPELLING, and that is the point', () => {
    // It does NOT fold the case and it must never start to: on a
    // case-sensitive volume `Source` and `source` are two real folders, and
    // that is the reporter's own recorded wrong fix. The repair for this shape
    // is upstream — main answers in the spelling its caller asked with — and
    // what this file guarantees is that the miss is nameable rather than
    // silent.
    expect(
      relPathUnder('/Users/sean/source/proj', '/Users/sean/Source/proj/a.md')
    ).toEqual({ refusal: 'outside-project' });
  });
});

describe('openFileAt never puts an absolute path in relPath', () => {
  it('a file inside the project keeps its relative path', () => {
    const req = drive('/repo/src/auth.ts', '/repo');
    expect(req.relPath).toBe('src/auth.ts');
    expect(req.path).toBe('/repo/src/auth.ts');
    expect(req.repoPath).toBe('/repo');
  });

  it('a file outside it still OPENS, at its absolute path, with no relPath', () => {
    const req = drive('/Users/gdc/.claude/CLAUDE.md', '/repo');
    // The open is not refused. A Context detail tab on a global CLAUDE.md is a
    // shipped capability that `../../editor/tab-io.ts` reasons about by name,
    // and this phase may not change what a person sees.
    expect(req.path).toBe('/Users/gdc/.claude/CLAUDE.md');
    expect(req.relPath).toBe('');
    expect(req.relPath.startsWith('/')).toBe(false);
  });

  it('and the mis-spelled-project shape is empty rather than absolute', () => {
    const req = drive('/Users/sean/Source/proj/a.md', '/Users/sean/source/proj');
    expect(req.relPath).toBe('');
  });
});
