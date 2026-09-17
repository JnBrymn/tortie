/**
 * PHASE 268 — auto save: the skip list, the debounce, and the stop that is
 * said ONCE (issue 24).
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. It drives `createAutoSave` with an
 * injected clock and an injected `save`, so every claim about WHEN a save is
 * asked for, and about what happens when one is refused, is measured here with
 * no real time and no real file. It proves nothing about the write itself:
 * that is `fs:writeGuarded`'s, `npm run conformance:save` reads the door
 * structurally, and `npm run probe:p268` drives a real concurrent writer.
 *
 * THE "ONCE" CLAIM IS THE ONE THAT MATTERS. Issue 16 is what an unguarded
 * write costs when somebody else got there first; a 1000 ms timer against a
 * file an agent is rewriting would be a toast a second on top of it. So the
 * count is taken after TEN further changes and TEN further ticks rather than
 * after one.
 */

import { describe, expect, it } from 'vitest';
import type { AutoSaveSettings } from '@shared/settings';
import {
  autoSaveSkipReason,
  createAutoSave,
  type AutoSaveController,
  type AutoSaveStopWhy
} from '../auto-save';
import { keyDisplay } from '@shared/keymap';
import {
  autoSaveStopSentence,
  saveRefusalSentence,
  staleSaveTitle
} from '../save-sentences';

import type { EditorTab } from '../tab-types';

/** The save chord, from the one place chords are spelled. */
const SAVE_CHORD = keyDisplay('editor.save');

const ROOT = '/repo';

function tab(over: Partial<EditorTab> = {}): EditorTab {
  return {
    id: `${ROOT}/notes.md`,
    path: `${ROOT}/notes.md`,
    relPath: 'notes.md',
    origRelPath: null,
    repoPath: ROOT,
    name: 'notes.md',
    mode: 'file',
    canDiff: true,
    markdown: true,
    image: false,
    svg: false,
    html: false,
    imageData: null,
    imageHead: null,
    imageRevision: 0,
    preview: false,
    commit: null,
    pendingSelection: null,
    pendingFocus: true,
    dirty: true,
    deleted: false,
    truncated: false,
    loading: false,
    error: null,
    savedContents: 'one',
    headContents: null,
    lastUsed: 0,
    contextEntry: null,
    ...over
  };
}

// ---------------------------------------------------------------------------
// A clock with no time in it. `advance(ms)` fires every timer that is due.
// ---------------------------------------------------------------------------

interface Clock {
  now: number;
  advance(ms: number): void;
  pending(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

function makeClock(): Clock {
  let seq = 0;
  let now = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    get now() {
      return now;
    },
    set(fn, ms) {
      seq += 1;
      due.set(seq, { at: now + ms, fn });
      return seq;
    },
    clear(handle) {
      due.delete(handle as number);
    },
    pending: () => due.size,
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...due.entries()]) {
        if (entry.at <= now) {
          due.delete(id);
          entry.fn();
        }
      }
    }
  };
}

interface Harness {
  auto: AutoSaveController;
  clock: Clock;
  saves: string[];
  toasts: string[];
  tabs: Map<string, EditorTab>;
  /** Replace a tab wholesale and tell the controller, as `patchTab` does. */
  patch(id: string, patch: Partial<EditorTab>): void;
  policy: AutoSaveSettings;
  /** What the next `save` answers. Default: it writes. */
  answer: (id: string) => AutoSaveStopWhy | null;
  blocked: boolean;
  roots: string[];
}

function harness(over: Partial<EditorTab> = {}): Harness {
  const clock = makeClock();
  const saves: string[] = [];
  const toasts: string[] = [];
  const first = tab(over);
  const tabs = new Map<string, EditorTab>([[first.id, first]]);

  const h: Harness = {
    auto: undefined as unknown as AutoSaveController,
    clock,
    saves,
    toasts,
    tabs,
    policy: { mode: 'afterDelay', delayMs: 1000 },
    answer: () => null,
    blocked: false,
    roots: [ROOT],
    patch(id, patch) {
      const before = tabs.get(id);
      const after = { ...(before as EditorTab), ...patch };
      tabs.set(id, after);
      h.auto.notePatched(id, before, after);
    }
  };

  h.auto = createAutoSave({
    save: (id) => {
      saves.push(id);
      const why = h.answer(id);
      if (why !== null) {
        // What the save path does on a non-`wrote` answer for reason 'auto':
        // one call into the controller, and nothing patched.
        h.auto.recordStop(id, why);
        return Promise.resolve(false);
      }
      h.patch(id, { savedContents: `saved-${String(saves.length)}`, dirty: false });
      return Promise.resolve(true);
    },
    byId: (id) => tabs.get(id),
    openRoots: () => h.roots,
    policy: () => h.policy,
    blocked: () => h.blocked,
    toast: (text) => toasts.push(text),
    setTimer: (fn, ms) => clock.set(fn, ms),
    clearTimer: (handle) => clock.clear(handle)
  });

  return h;
}

const ID = `${ROOT}/notes.md`;

/**
 * Let an unresolved save settle.
 *
 * `deps.save` answers a promise, so a test that fires a timer and then asserts
 * on what the save did is asserting before the answer has come back. Three
 * microtask turns is what this harness's `save` needs to patch the tab and
 * resolve.
 *
 * PHASE 277 REWROTE THIS PARAGRAPH, because it described a mark that no longer
 * exists. It said `run` marks a tab in flight and clears it in a `finally`, and
 * that a second save asked for in the same synchronous turn was refused by that
 * guard, so the test yields rather than the controller dropping it. That set is
 * gone. It was a SECOND TRUTH about one fact, kept in the module a person's ⌘S
 * cannot see, and it cost work twice: a ⌘S and a timer could still both be in
 * flight on one file, and a second timer falling due during a held save was
 * DROPPED rather than deferred — one save, no pending timer, and the newer
 * typing never written. One save at a time per tab is `withSaveSlot` in
 * ../tab-io now, which is the one place that knows about every save of every
 * kind, so the controller asks freely and the yield here is only about the
 * promise.
 */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// ---------------------------------------------------------------------------
// 1. The skip list, one case each.
// ---------------------------------------------------------------------------

describe('the skip list, VS Code editorAutoSave.ts:151 plus Tortie own', () => {
  it('lets an ordinary dirty file inside an open project through', () => {
    expect(autoSaveSkipReason(tab(), [ROOT])).toBeNull();
  });

  it('skips a tab that is not dirty', () => {
    expect(autoSaveSkipReason(tab({ dirty: false }), [ROOT])).toBe('clean');
  });

  it('skips the four tabs that are not files', () => {
    const commit = { sha: 'abc', status: 'M' } as EditorTab['commit'];
    expect(autoSaveSkipReason(tab({ commit }), [ROOT])).toBe('notAFile');
    expect(
      autoSaveSkipReason(tab({ archMap: { repoPath: ROOT } }), [ROOT])
    ).toBe('notAFile');
    expect(
      autoSaveSkipReason(tab({ diagnostics: { kind: 'report' } }), [ROOT])
    ).toBe('notAFile');
    expect(
      autoSaveSkipReason(tab({ compare: { fileName: 'notes.md' } }), [ROOT])
    ).toBe('notAFile');
  });

  it("skips another computer's file, whatever else is true of it", () => {
    const remote: EditorTab['remote'] = {
      machineId: 'studio',
      machineLabel: 'studio',
      repoPath: '/home/greg/api'
    };
    expect(autoSaveSkipReason(tab({ remote }), [ROOT])).toBe('remote');
  });

  it('skips a read-only tab, by all four of its reasons plus an error', () => {
    expect(autoSaveSkipReason(tab({ deleted: true }), [ROOT])).toBe('readOnly');
    expect(autoSaveSkipReason(tab({ truncated: true }), [ROOT])).toBe('readOnly');
    expect(autoSaveSkipReason(tab({ error: 'nope' }), [ROOT])).toBe('readOnly');
  });

  it('skips a draft whose file has never existed', () => {
    expect(
      autoSaveSkipReason(tab({ draft: 'composed', savedContents: '' }), [ROOT])
    ).toBe('draft');
  });

  it('skips a file outside its own repository — the ~/.claude/CLAUDE.md shape', () => {
    expect(
      autoSaveSkipReason(
        tab({ path: '/Users/greg/.claude/CLAUDE.md' }),
        [ROOT, '/Users/greg']
      )
    ).toBe('outsideProject');
  });

  it('skips a tab whose project was closed under it', () => {
    // It passes `fileInRepo` on its own repoPath and would be refused
    // `outside` by the channel, which asks the OPEN projects.
    expect(autoSaveSkipReason(tab(), [])).toBe('projectClosed');
    expect(autoSaveSkipReason(tab(), ['/elsewhere'])).toBe('projectClosed');
  });
});

// ---------------------------------------------------------------------------
// 2. The modes.
// ---------------------------------------------------------------------------

describe('the three modes', () => {
  it('arms nothing at all while the mode is off', () => {
    const h = harness();
    h.policy = { mode: 'off', delayMs: 1000 };
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });

  it('saves once, after the delay, on afterDelay', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.clock.advance(999);
    expect(h.saves).toEqual([]);
    h.clock.advance(1);
    expect(h.saves).toEqual([ID]);
  });

  it('RE-ARMS on every change, so a burst writes once after the last one', () => {
    const h = harness();
    for (let i = 0; i < 3; i += 1) {
      h.auto.noteChanged(ID);
      h.clock.advance(100);
    }
    expect(h.saves).toEqual([]);
    // 1000 ms after the LAST change, not 1000 ms after the first.
    h.clock.advance(899);
    expect(h.saves).toEqual([]);
    h.clock.advance(1);
    expect(h.saves).toEqual([ID]);
    // And exactly one timer was ever outstanding.
    expect(h.clock.pending()).toBe(0);
  });

  it('arms nothing on a change in onFocusChange, and saves at the blur', () => {
    const h = harness();
    h.policy = { mode: 'onFocusChange', delayMs: 1000 };
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
    h.auto.noteBlur(ID);
    expect(h.saves).toEqual([ID]);
  });

  it('ignores a blur while the mode is afterDelay', () => {
    const h = harness();
    h.auto.noteBlur(ID);
    expect(h.saves).toEqual([]);
  });

  it('never arms a tab the skip list refuses', () => {
    const h = harness({ dirty: false });
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(5000);
    expect(h.saves).toEqual([]);
  });

  it('refuses at the TICK too, when the tab went clean while the timer ran', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.tabs.set(ID, { ...(h.tabs.get(ID) as EditorTab), dirty: false });
    h.clock.advance(1000);
    expect(h.saves).toEqual([]);
  });

  it('refuses at the tick when the project closed while the timer ran', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.roots = [];
    h.clock.advance(1000);
    expect(h.saves).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The conflict stop, and the "shown once" rule.
// ---------------------------------------------------------------------------

describe('a refusal stops auto save for that tab and says so ONCE', () => {
  it('records the stop, toasts once, and never writes again', async () => {
    const h = harness();
    h.answer = () => ({ kind: 'stale' });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    // Settle FIRST, so what follows is proved by the stop record rather than
    // by the in-flight guard happening to still be up.
    await settle();

    expect(h.saves).toEqual([ID]);
    expect(h.toasts).toHaveLength(1);
    expect(h.auto.stoppedFor(ID)).toEqual({ kind: 'stale' });
    // The tab is STILL DIRTY: nothing was written and the buffer keeps it.
    expect(h.tabs.get(ID)?.dirty).toBe(true);

    // Ten more changes and ten more delay periods, each fully settled.
    for (let i = 0; i < 10; i += 1) {
      h.auto.noteChanged(ID);
      h.clock.advance(1000);
      await settle();
    }
    expect(h.toasts).toHaveLength(1);
    expect(h.saves).toEqual([ID]);
    expect(h.clock.pending()).toBe(0);
  });

  it('says it once even if the save path records the same stop repeatedly', () => {
    const h = harness();
    for (let i = 0; i < 10; i += 1) {
      h.auto.recordStop(ID, { kind: 'stale' });
    }
    expect(h.toasts).toHaveLength(1);
  });

  it('stops a blur-mode tab just as hard', async () => {
    const h = harness();
    h.policy = { mode: 'onFocusChange', delayMs: 1000 };
    h.answer = () => ({ kind: 'refused', why: 'readOnly' });
    h.auto.noteBlur(ID);
    await settle();
    expect(h.saves).toHaveLength(1);
    for (let i = 0; i < 10; i += 1) {
      h.auto.noteBlur(ID);
      await settle();
    }
    expect(h.saves).toHaveLength(1);
    expect(h.toasts).toHaveLength(1);
  });

  it('is PER TAB: a second file in the same project still saves', async () => {
    const h = harness();
    const other = tab({ id: `${ROOT}/other.md`, path: `${ROOT}/other.md`, name: 'other.md' });
    h.tabs.set(other.id, other);
    h.answer = (id) => (id === ID ? { kind: 'stale' } : null);

    h.auto.noteChanged(ID);
    h.auto.noteChanged(other.id);
    h.clock.advance(1000);
    await settle();

    expect(h.auto.stoppedFor(ID)).toEqual({ kind: 'stale' });
    expect(h.auto.stoppedFor(other.id)).toBeUndefined();
    expect(h.tabs.get(other.id)?.dirty).toBe(false);
  });

  it('TYPING DOES NOT CLEAR THE STOP — VS Code keeps inConflictMode until a save resolves it', async () => {
    const h = harness();
    h.answer = () => ({ kind: 'stale' });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    await settle();
    // Typing is more unsaved work over bytes nobody has looked at.
    h.patch(ID, { dirty: true });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    await settle();
    expect(h.auto.stoppedFor(ID)).toEqual({ kind: 'stale' });
    expect(h.saves).toHaveLength(1);
  });

  it('a successful explicit save clears the stop and the next change arms again', async () => {
    const h = harness();
    h.answer = () => ({ kind: 'stale' });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    await settle();
    expect(h.auto.stoppedFor(ID)).toEqual({ kind: 'stale' });

    // What ⌘S (or its Overwrite) does when it lands: `savedContents` moves.
    // That is the ONE signal, and it reaches the controller through the store
    // patch funnel rather than through a new call site in tab-io.
    h.patch(ID, { savedContents: 'what the person pressed', dirty: false });
    expect(h.auto.stoppedFor(ID)).toBeUndefined();

    h.answer = () => null;
    h.patch(ID, { dirty: true });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    expect(h.saves).toEqual([ID, ID]);
  });

  it('a mode change does not clear it either', async () => {
    const h = harness();
    h.answer = () => ({ kind: 'stale' });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    await settle();
    h.policy = { mode: 'onFocusChange', delayMs: 1000 };
    h.auto.noteBlur(ID);
    await settle();
    expect(h.saves).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. The two other refusals a timer makes on its own.
// ---------------------------------------------------------------------------

describe('a timer never writes underneath a question', () => {
  it('writes nothing while a confirm dialog is on screen', () => {
    const h = harness();
    h.blocked = true;
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    expect(h.saves).toEqual([]);
    h.auto.noteBlur(ID);
    expect(h.saves).toEqual([]);
  });
});

describe('forget, which every dispose site calls', () => {
  it('cancels a pending timer and drops the stop and the touched mark', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(1);
    h.auto.forget(ID);
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);

    h.auto.recordStop(ID, { kind: 'link' });
    expect(h.auto.stoppedFor(ID)).toEqual({ kind: 'link' });
    h.auto.forget(ID);
    expect(h.auto.stoppedFor(ID)).toBeUndefined();
    expect(h.auto.touched(ID)).toBe(false);
  });

  it('marks a tab auto save WROTE, which is what the eviction filter reads', async () => {
    const h = harness();
    expect(h.auto.touched(ID)).toBe(false);
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    await settle();
    expect(h.auto.touched(ID)).toBe(true);
    h.auto.forget(ID);
    expect(h.auto.touched(ID)).toBe(false);
  });

  it('disposeAll leaves no timer behind', () => {
    const h = harness();
    const other = tab({ id: `${ROOT}/other.md`, path: `${ROOT}/other.md` });
    h.tabs.set(other.id, other);
    h.auto.noteChanged(ID);
    h.auto.noteChanged(other.id);
    expect(h.clock.pending()).toBe(2);
    h.auto.disposeAll();
    expect(h.clock.pending()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. The sentences, which are composed and never invented.
// ---------------------------------------------------------------------------

describe('autoSaveStopSentence', () => {
  it('names the file and ends in a full stop, for all three kinds', () => {
    const kinds: AutoSaveStopWhy[] = [
      { kind: 'stale' },
      { kind: 'link' },
      { kind: 'refused', why: 'readOnly' }
    ];
    for (const why of kinds) {
      const said = autoSaveStopSentence(why, 'notes.md');
      expect(said).toContain('notes.md');
      expect(said.endsWith('.')).toBe(true);
    }
  });

  it('starts a refusal with the ⌘S sentence, byte for byte', () => {
    for (const why of ['outside', 'missing', 'readOnly', 'tooLarge', 'notUtf8', 'raced', 'input', 'io'] as const) {
      const explicit = saveRefusalSentence(why, 'notes.md');
      expect(
        autoSaveStopSentence({ kind: 'refused', why }, 'notes.md').startsWith(explicit)
      ).toBe(true);
    }
  });

  it('borrows the dialog own title for a stale answer, so both name one event', () => {
    // The chord is READ from the keymap here too, for the reason the sentence
    // reads it: a test that typed it would pass while the sentence lied.
    expect(autoSaveStopSentence({ kind: 'stale' }, 'notes.md')).toBe(
      `${staleSaveTitle('notes.md')}, so nothing was written. Tortie stopped saving it on its own — press ${SAVE_CHORD} when you are ready.`
    );
  });

  it('says nothing went wrong for a link, and points at the save chord', () => {
    expect(autoSaveStopSentence({ kind: 'link' }, 'notes.md')).toBe(
      `Tortie does not save notes.md on its own, because it is a link. Press ${SAVE_CHORD} to save it.`
    );
  });

  it('names the chord the keymap says, never a typed one', () => {
    for (const why of [
      { kind: 'stale' },
      { kind: 'link' },
      { kind: 'refused', why: 'io' }
    ] as AutoSaveStopWhy[]) {
      expect(autoSaveStopSentence(why, 'notes.md')).toContain(SAVE_CHORD);
    }
  });
});
