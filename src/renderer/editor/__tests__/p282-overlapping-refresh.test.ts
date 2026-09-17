/**
 * PHASE 282'S FIX ROUND. TWO WATCHER TICKS IN FLIGHT AT ONCE LEAVE THE TAB ON
 * THE BYTES THAT ARE REALLY ON DISK.
 *
 * Phase 282 added one clause to `refreshRepo`'s clean-reload arm (./tab-io):
 * the tab's `savedContents` must still be the value it was before the read, so
 * that a read which crossed an adoption or a ⌘S cannot roll the buffer back
 * (p282-watcher-race.test.ts drives that half). The clause says "the baseline
 * moved since before my read", which says nothing about WHICH read is newer —
 * and the verifier drove the shape the phase never did.
 *
 * `refreshRepo` is fire and forget from ./store's `onRepoChanged`
 * (`void io.refreshRepo(repoPath)`), the bus that wakes it debounces only
 * 150 ms (../state/repo-changed), and one walk awaits a directory read, a file
 * read and a `git show HEAD` PER TAB. So two walks of one repo overlapped, and
 * with them two reads of one tab: the older read answered first and moved
 * `savedContents`, and the newer one — issued later, so carrying bytes at
 * least as new — failed the clause, was dropped WHOLE, and left the tab
 * showing an agent's second-to-last write with nothing scheduled to read
 * again. The parent, 9217ae0d, applied the newer read.
 *
 * THE FIX IS ONE WALK OF A REPO AT A TIME, not a weaker clause: with a single
 * walk in flight, the only thing that can move `savedContents` under a read is
 * a writer, and a writer leaves the tab holding the NEWEST bytes, which is
 * exactly the interleaving the clause was written to drop.
 *
 * THE METHOD IS REAL FILES, as p282-watcher-race's is: the bridge opens a real
 * descriptor and is held AFTER the open, so a read that opened before a rename
 * answers the old inode's bytes the way main's `readTextCapped` does.
 */

import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const { models } = vi.hoisted(() => ({
  models: new Map<string, { text: string; getValue(): string }>()
}));

vi.mock('../monaco-loader', () => ({
  getWorkingModel: (key: string) => models.get(key) ?? null,
  resetWorkingModel: (key: string, contents: string) => {
    const m = models.get(key);
    if (m !== undefined) m.text = contents;
  }
}));

const dir = mkdtempSync(join(tmpdir(), 'p282-overlap-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Every read opens its descriptor at once and then waits, so the test decides
 * when each one answers and every held read is pinned to the inode that was at
 * the path when it opened.
 */
const gate = { on: false, held: [] as (() => void)[] };

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
          if (gate.on) {
            await new Promise<void>((go) => {
              gate.held.push(go);
            });
          }
          const { size } = await fh.stat();
          const buf = Buffer.alloc(size);
          await fh.read(buf, 0, size, 0);
          return { path: p, contents: buf.toString('utf8'), encoding: 'utf8', truncated: false };
        } finally {
          await fh.close();
        }
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
type EditorTab = import('../store').EditorTab;

const V0 = 'one\n';
const V1 = 'one\ntwo\n';
const V2 = 'one\ntwo\nthree\n';

/** An agent's write, as main's guarded door makes it: a staged file and a rename. */
function agentWrites(path: string, contents: string): void {
  const staged = join(dirname(path), '.staged');
  writeFileSync(staged, contents);
  renameSync(staged, path);
}

const settle = async (turns = 20): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((done) => setTimeout(done, 0));
};
/** Let every read that is waiting answer. */
const releaseHeld = (): number => {
  const waiting = gate.held.splice(0);
  for (const go of waiting) go();
  return waiting.length;
};

function rig() {
  gate.on = false;
  gate.held = [];
  const repo = mkdtempSync(join(dir, 'repo-'));
  const path = join(repo, 'notes.md');
  writeFileSync(path, V0);
  models.set(path, {
    text: V0,
    getValue() {
      return this.text;
    }
  });
  let tab = {
    id: path, path, relPath: 'notes.md', origRelPath: null, repoPath: repo, name: 'notes.md',
    mode: 'redline', canDiff: true, commit: null, dirty: false, loading: false, error: null,
    deleted: false, draft: null, image: false, savedContents: V0, headContents: V0
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
    buffer: models.get(path)!.text,
    disk: readFileSync(path, 'utf8')
  });
  return { io, repo, path, reading };
}

describe('two refreshes of one repo in flight together', () => {
  it('leaves the tab on the bytes that are really on disk, not on the older read’s', async () => {
    const r = rig();
    // The agent's first write, and the tick it woke. Its read opens on this
    // inode and is held.
    agentWrites(r.path, V1);
    gate.on = true;
    const first = r.io.refreshRepo(r.repo);
    await settle();
    // 150 ms later the agent has written again and the bus wakes a second
    // tick while the first is still reading.
    agentWrites(r.path, V2);
    const second = r.io.refreshRepo(r.repo);
    await settle();
    // The reads answer, oldest first, which is the order they were issued in.
    gate.on = false;
    releaseHeld();
    await first;
    releaseHeld();
    await second;
    await settle();
    // THE CLAIM. Nothing further is scheduled — both of this repo's events have
    // been spent — so whatever the tab holds now is what the person sees until
    // somebody writes to this repository again.
    expect(r.reading()).toEqual({ saved: V2, buffer: V2, disk: V2 });
  });

  it('CONTROL: one tick at a time still follows every write', async () => {
    const r = rig();
    agentWrites(r.path, V1);
    await r.io.refreshRepo(r.repo);
    expect(r.reading()).toEqual({ saved: V1, buffer: V1, disk: V1 });
    agentWrites(r.path, V2);
    await r.io.refreshRepo(r.repo);
    expect(r.reading()).toEqual({ saved: V2, buffer: V2, disk: V2 });
  });

  it('CONTROL: a third and a fourth tick inside one walk join the one already waiting, so the repo is walked twice and not four times', async () => {
    const r = rig();
    agentWrites(r.path, V1);
    gate.on = true;
    const walks = [
      r.io.refreshRepo(r.repo),
      r.io.refreshRepo(r.repo),
      r.io.refreshRepo(r.repo),
      r.io.refreshRepo(r.repo)
    ];
    await settle();
    // Only the first walk has opened a read; the other three are one queued
    // walk behind it.
    expect(gate.held).toHaveLength(1);
    agentWrites(r.path, V2);
    gate.on = false;
    releaseHeld();
    await Promise.all(walks);
    await settle();
    expect(r.reading()).toEqual({ saved: V2, buffer: V2, disk: V2 });
  });
});
