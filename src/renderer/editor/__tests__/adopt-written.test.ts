/**
 * THE BYTES A CONFIRMED WRITE PUT ON DISK, adopted by the tab that wrote them
 * (2026-09-16).
 *
 * The operator's complaint: "when I option delete instead of option return,
 * the delete takes a little bit of time... option return is instantaneous."
 * The app run put a number on it — 1,139 ms for the rewind against 35 ms for
 * the accept (`npm run probe:redlinemoveon`, arm H8b) — and the cause was that
 * an accept moves the baseline in memory while a rewind wrote the file and
 * waited for the FILE WATCHER to re-read a file the view had just written.
 * `adoptWritten` is that wait removed.
 *
 * THE TWO REFUSALS ARE THE WHOLE REASON REMOVING THE WAIT IS SAFE, and they
 * are not symmetric with each other:
 *
 *   - A tab that has become DIRTY has a buffer whose text is newer than the
 *     plan that was written, so adopting would replace a person's unsaved
 *     words with an older file. The keystroke can land inside the write's own
 *     round trip, which is exactly the window this action opens.
 *   - A tab whose saved contents MOVED has a save, a watcher tick or a read of
 *     its own to believe, and `was` no longer describes the file this tab
 *     knows about.
 *
 * Either way the watcher is the honest reader and this does nothing.
 *
 * WHAT IS NOT PROVEN HERE. Nothing redraws, so the timing pair is the app
 * run's and not this file's; the working model is stubbed, so what is pinned
 * is that the patch and the model move TOGETHER and that neither moves when it
 * must not. The real model's real effect on a redline is the app run's too.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Monaco does not run here. The stub answers no model and records every
 * replacement, which is the half of this action a patch cannot show: with the
 * model left holding the old text, the next ⌘S would write that old text back
 * over the bytes the door just wrote, with `savedContents` as its precondition
 * and therefore nothing to refuse it.
 */
const reset = vi.hoisted(() => vi.fn());
vi.mock('../monaco-loader', () => ({
  getWorkingModel: () => null,
  resetWorkingModel: reset
}));

vi.stubGlobal('window', {
  addEventListener() {},
  removeEventListener() {},
  gmux: { fs: { readFile: vi.fn(), readDir: vi.fn() }, git: { onChanged: () => () => undefined } }
});
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem() {},
  removeItem() {}
});
vi.stubGlobal('document', {
  body: { classList: { add() {}, remove() {}, contains: () => false } }
});

const { createTabIo } = await import('../tab-io');
type EditorTab = import('../store').EditorTab;

const ON_DISK = 'The quick brown fox jumps over the lazy dog.\n';
const REWOUND = 'The quick red fox jumps over the lazy dog.\n';

function proseTab(over: Partial<EditorTab> = {}): EditorTab {
  return {
    id: '/repo/notes.txt',
    path: '/repo/notes.txt',
    relPath: 'notes.txt',
    origRelPath: null,
    repoPath: '/repo',
    name: 'notes.txt',
    mode: 'redline',
    canDiff: true,
    commit: null,
    dirty: false,
    loading: false,
    error: null,
    savedContents: ON_DISK,
    headContents: ON_DISK,
    ...over
  } as Partial<EditorTab> as EditorTab;
}

/** The action and the patches it produced, over one live tab object. */
function adoptOver(initial: EditorTab | null): {
  adopt: (contents: string, was: string) => void;
  patches: Partial<EditorTab>[];
} {
  const patches: Partial<EditorTab>[] = [];
  let current = initial;
  const io = createTabIo({
    patch: (_id, patch) => {
      patches.push(patch);
      if (current !== null) current = { ...current, ...patch };
    },
    byId: () => current ?? undefined,
    worktreeTabsIn: () => [],
    autoStop: () => false as const
  });
  return {
    patches,
    adopt: (contents, was) => {
      io.adoptWritten('/repo/notes.txt', contents, was);
    }
  };
}

beforeEach(() => {
  reset.mockReset();
});

describe('a confirmed write is adopted in the tick it lands', () => {
  it('a clean tab still holding what the plan read takes the new bytes, and the model moves with it', () => {
    const { adopt, patches } = adoptOver(proseTab());
    adopt(REWOUND, ON_DISK);
    // ONE patch, and `savedContents` is the only field in it: this action has
    // no business clearing `dirty` or anything else on a tab it decided to
    // trust, and a `dirty: false` written here would hide a keystroke nobody
    // has saved.
    expect(patches).toEqual([{ savedContents: REWOUND }]);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledWith('/repo/notes.txt', REWOUND);
  });

  it('A KEYSTROKE INSIDE THE WRITE IS NOT OVERWRITTEN: a dirty tab adopts nothing at all', () => {
    const typed = `${ON_DISK}a word the person typed while the door was open\n`;
    const { adopt, patches } = adoptOver(proseTab({ dirty: true, savedContents: ON_DISK }));
    adopt(REWOUND, ON_DISK);
    expect(patches).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
    // And the person's words are still the tab's, which is the property the
    // empty patch list is standing for.
    expect(typed).toContain('a word the person typed');
  });

  it('A TAB THAT HAS MOVED ON IS NOT DRAGGED BACK: saved contents that are not `was` adopt nothing', () => {
    const savedWhileTheDoorWasOpen = 'what a save or a watcher tick just read\n';
    const { adopt, patches } = adoptOver(proseTab({ savedContents: savedWhileTheDoorWasOpen }));
    adopt(REWOUND, ON_DISK);
    expect(patches).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
  });

  it('a tab that is gone adopts nothing and says nothing', () => {
    const { adopt, patches } = adoptOver(null);
    expect(() => {
      adopt(REWOUND, ON_DISK);
    }).not.toThrow();
    expect(patches).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
  });
});
