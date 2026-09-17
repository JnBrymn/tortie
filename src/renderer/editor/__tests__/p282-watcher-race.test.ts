/**
 * PHASE 282, finding 6. A WATCHER READ THAT OPENED THE FILE BEFORE THE REWIND'S
 * RENAME, AND ANSWERS AFTER THE ADOPTION, DOES NOT ROLL THE TAB BACK.
 *
 * `refreshRepo` (./tab-io) reads the file and reloads a tab that is still
 * clean and still holds the model the read started with, which is Phase 277's
 * guard. PR 28's `adoptWritten` passes both: it moves `savedContents` and the
 * model's text, and leaves the tab clean and the instance the same. So a read
 * that opened the old inode before the guarded write's `renameSync` and
 * answered after the adoption put the pre-rewind bytes back into
 * `savedContents` and the buffer while the disk held the rewind. The review
 * measured it at 37 of 500 interleavings over the real main handlers, and 0 of
 * 500 with the adoption taken out. ⌘S from there answers `stale` about a writer
 * that is Tortie itself.
 *
 * The fix is one more clause on the clean-reload arm: `savedContents` must be
 * the value it was before the read. A read that raced a newer baseline is
 * dropped, and the rewind's own file event re-reads. The clause names the
 * fact rather than the rewind, so a ⌘S that completes while a read is open is
 * driven too: that arm was red at 9217ae0d with no adoption anywhere, because
 * `completeSave` moves `savedContents` over the same model and passes Phase
 * 277's two questions exactly as the adoption does.
 *
 * THE METHOD IS REAL FILES, NOT A STRING HANDED BACK. The bridge opens a real
 * file handle and is held AFTER the open, the way main's `readTextCapped`
 * awaits open, stat, read and close; the rewind is the shipping `applyRewind`;
 * the guarded write is a staged write plus `renameSync`, as main's is. The stale
 * bytes come from the old inode through a descriptor opened before the rename.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const { models, modelOn } = vi.hoisted(() => ({
  models: new Map<string, { text: string; getValue(): string }>(),
  modelOn: { value: true }
}));

vi.mock('../monaco-loader', () => ({
  getWorkingModel: (key: string) => (modelOn.value ? (models.get(key) ?? null) : null),
  // Production's resetWorkingModel edits the SAME instance in place.
  resetWorkingModel: (key: string, contents: string) => {
    const m = modelOn.value ? models.get(key) : undefined;
    if (m !== undefined) m.text = contents;
  }
}));

const dir = mkdtempSync(join(tmpdir(), 'p282-watcher-race-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** One read, held with its descriptor OPEN, until the test lets it go. */
const hold: { next: boolean; opened?: () => void; release?: Promise<void> } = { next: false };

vi.stubGlobal('window', {
  addEventListener() {},
  removeEventListener() {},
  gmux: {
    setSessionsPosition: async () => {},
    setProjectsPosition: async () => {},
    fs: {
      readDir: async (p: string) => ({ entries: readdirSync(p).map((name) => ({ name })) }),
      readFile: async (p: string) => {
        const fh = await open(p, 'r');
        try {
          if (hold.next) {
            hold.next = false;
            hold.opened?.();
            await hold.release;
          }
          const { size } = await fh.stat();
          const buf = Buffer.alloc(size);
          await fh.read(buf, 0, size, 0);
          return { path: p, contents: buf.toString('utf8'), encoding: 'utf8', truncated: false };
        } finally {
          await fh.close();
        }
      },
      writeGuarded: async (input: { path: string; expect: string; contents: string }) => {
        const now = createHash('sha256').update(readFileSync(input.path)).digest('hex');
        if (now !== input.expect) return { outcome: 'stale', sha256: now };
        const staged = join(dirname(input.path), '.staged');
        writeFileSync(staged, input.contents);
        renameSync(staged, input.path);
        return { outcome: 'wrote', sha256: createHash('sha256').update(input.contents).digest('hex') };
      }
    },
    git: {
      onChanged: () => () => undefined,
      showHead: async () => {
        throw new Error('no git here');
      }
    }
  }
});
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
vi.stubGlobal('document', { body: { classList: { add() {}, remove() {}, contains: () => false } } });

const { createTabIo } = await import('../tab-io');
const { applyRewind } = await import('../redline-write');
const { composeRedlineDocument } = await import('../redline-document');
const { changesOf } = await import('../rewind');
type EditorTab = import('../store').EditorTab;

const BASELINE = 'The application is a disposable client: it attaches and gets out of the way.\n';
const CURRENT = 'The application is a throwaway viewer: it attaches and gets out of the way.\n';
const REWOUND = BASELINE;

async function rig(model: boolean) {
  modelOn.value = model;
  const repo = mkdtempSync(join(dir, 'repo-'));
  const path = join(repo, 'notes.md');
  writeFileSync(path, CURRENT);
  models.set(path, {
    text: CURRENT,
    getValue() {
      return this.text;
    }
  });
  let tab = {
    id: path, path, relPath: 'notes.md', origRelPath: null, repoPath: repo, name: 'notes.md', mode: 'redline',
    canDiff: true, commit: null, dirty: false, loading: false, error: null, deleted: false, draft: null,
    image: false, savedContents: CURRENT, headContents: BASELINE
  } as unknown as EditorTab;
  const io = createTabIo({
    patch: (_id, p) => {
      tab = { ...tab, ...p };
    },
    byId: () => tab,
    worktreeTabsIn: () => [tab],
    autoStop: () => false as const
  });
  const reading = () => ({
    saved: tab.savedContents,
    buffer: model ? models.get(path)!.text : tab.savedContents,
    dirty: tab.dirty,
    disk: readFileSync(path, 'utf8')
  });
  /** RedlineDocument's press: the shipping write, then the view's adoption. */
  const rewindAndAdopt = async () => {
    const [change] = changesOf(composeRedlineDocument(BASELINE, CURRENT).runs);
    const result = await applyRewind({
      root: repo, path, baseline: BASELINE, generation: 1, drawnGeneration: 1,
      pressed: { off: change!.off, del: change!.del, ins: change!.ins }, kind: 'rewind'
    });
    if (!('wrote' in result)) throw new Error(`rewind refused: ${JSON.stringify(result)}`);
    io.adoptWritten(path, result.contents, result.was);
  };
  /** A keystroke as MonacoHost's content listener records it: the model moves and the tab is dirty in the same step. */
  const type = (text: string): void => {
    models.get(path)!.text = text;
    tab = { ...tab, dirty: text !== tab.savedContents };
  };
  return { io, repo, path, reading, rewindAndAdopt, type };
}

describe('a watcher read that crosses the adoption', () => {
  for (const model of [true, false]) {
    it(`does not put the pre-rewind bytes back (${model ? 'with' : 'without'} a working model)`, async () => {
      const r = await rig(model);
      // The watcher's refresh, held with its descriptor open on the pre-rewind inode.
      let release!: () => void;
      hold.next = true;
      hold.release = new Promise<void>((done) => {
        release = done;
      });
      const opened = new Promise<void>((done) => {
        hold.opened = done;
      });
      const refresh = r.io.refreshRepo(r.repo);
      await opened;
      await r.rewindAndAdopt();
      expect(r.reading()).toEqual({ saved: REWOUND, buffer: REWOUND, dirty: false, disk: REWOUND });
      release();
      await refresh;
      // THE CLAIM. The read answered the old inode's bytes; the tab keeps the rewind.
      expect(r.reading()).toEqual({ saved: REWOUND, buffer: REWOUND, dirty: false, disk: REWOUND });
    });
  }

  it("does not put the pre-save bytes back over a ⌘S that completed while the read was open", async () => {
    // The same race with a save as the writer, which is why the clause names
    // the fact rather than the rewind: the read opens on a clean tab, the
    // person types and saves through the guarded door (a staged write and a
    // rename), `completeSave` moves `savedContents` and leaves the tab clean
    // over the same model, and the read answers the old inode's bytes.
    const r = await rig(true);
    let release!: () => void;
    hold.next = true;
    hold.release = new Promise<void>((done) => {
      release = done;
    });
    const opened = new Promise<void>((done) => {
      hold.opened = done;
    });
    const refresh = r.io.refreshRepo(r.repo);
    await opened;
    const typed = `${CURRENT}A line the person typed and saved.\n`;
    r.type(typed);
    expect(await r.io.save(r.path)).toBe(true);
    expect(r.reading()).toEqual({ saved: typed, buffer: typed, dirty: false, disk: typed });
    release();
    await refresh;
    expect(r.reading()).toEqual({ saved: typed, buffer: typed, dirty: false, disk: typed });
  });

  it('CONTROL: a read that raced nothing still follows an outside write, so the watcher is not stopped', async () => {
    const r = await rig(true);
    const agent = `${CURRENT}An agent's next line.\n`;
    writeFileSync(r.path, agent);
    await r.io.refreshRepo(r.repo);
    expect(r.reading()).toEqual({ saved: agent, buffer: agent, dirty: false, disk: agent });
  });
});
