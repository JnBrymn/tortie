/**
 * The Phase 37 invariant, pinned: NOTHING exists on disk until Enter (or an
 * equivalent commit) lands a valid name. Every exit from the inline create
 * editor is driven against a mocked fs bridge and a fake model, and the
 * number of create calls is counted through the whole hostile sequence.
 *
 * Also pinned here: the silent no-op hole (committing the seed name fires no
 * library callback at all) now CREATES, and an invalid click-away removes
 * the placeholder row instead of stranding it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileTreeRenameEvent } from '@pierre/trees';

const h = vi.hoisted(() => ({
  createFile: vi.fn(),
  createFolder: vi.fn(),
  toast: vi.fn(),
  relist: vi.fn(),
  forgetUnder: vi.fn(),
  requestOpenFile: vi.fn(),
  followMoves: vi.fn()
}));

vi.mock('../fs-ops-bridge', () => ({
  createFile: h.createFile,
  createFolder: h.createFolder,
  rename: vi.fn(),
  duplicate: vi.fn(),
  move: vi.fn(),
  trash: vi.fn(),
  canMutate: () => true,
  canDuplicate: () => true
}));

vi.mock('../../state/store', () => ({
  useApp: {
    getState: () => ({ toast: h.toast, setConfirm: vi.fn() })
  },
  errorPayload: () => null,
  errorText: (err: unknown) => String(err)
}));

vi.mock('../store', () => ({
  useFileTree: {
    getState: () => ({ relist: h.relist, forgetUnder: h.forgetUnder })
  }
}));

vi.mock('../open-file', () => ({ requestOpenFile: h.requestOpenFile }));
vi.mock('../editor-follow', () => ({ followMoves: h.followMoves }));
vi.mock('../tree-menu', () => ({
  describeConflicts: () => '',
  describeEntries: () => ''
}));

import { createTreeOps } from '../tree-ops';
import type { TreeOps, TreeOpsContext } from '../tree-ops';
import type { TreeRenameView } from '../rename-view';

/** A fake rename editor that behaves like the library's: path + live text. */
interface FakeView extends TreeRenameView {
  path: string | null;
  value: string;
}

function makeView(): FakeView {
  const view: FakeView = {
    path: null,
    value: '',
    getPath: () => view.path,
    getValue: () => view.value,
    isActive: () => view.path !== null,
    setValue: (value: string) => {
      view.value = value;
    },
    cancel: () => {
      view.path = null;
    },
    commit: () => {
      view.path = null;
    }
  };
  return view;
}

/** The slice of the Pierre model the create path touches, over a path set. */
function makeModel(view: FakeView): {
  rows: Set<string>;
  model: TreeOpsContext['model'];
  focusPath: ReturnType<typeof vi.fn>;
} {
  const rows = new Set<string>();
  const focusPath = vi.fn();
  const model = {
    add: (path: string) => {
      rows.add(path);
    },
    remove: (path: string) => {
      rows.delete(path);
    },
    getItem: (path: string) => (rows.has(path) ? ({} as never) : null),
    startRenaming: (path: string) => {
      view.path = path;
      // The library seeds the box with the leaf name — the exact behavior
      // the empty-editor change has to overwrite.
      view.value = path.endsWith('/')
        ? path.slice(0, -1).split('/').pop() ?? ''
        : path.split('/').pop() ?? '';
      return true;
    },
    batch: vi.fn(),
    resetPaths: vi.fn(),
    focusPath,
    getSelectedPaths: () => [] as string[]
  };
  return {
    rows,
    model: model as unknown as TreeOpsContext['model'],
    focusPath
  };
}

interface Rig {
  ops: TreeOps;
  view: FakeView;
  rows: Set<string>;
  focusPath: ReturnType<typeof vi.fn>;
  selectOnly: ReturnType<typeof vi.fn>;
  releases: () => number;
  viewMissing: { value: boolean };
}

function makeRig(): Rig {
  const view = makeView();
  const { rows, model, focusPath } = makeModel(view);
  const selectOnly = vi.fn();
  const viewMissing = { value: false };
  let fed = new Set<string>();
  let released = 0;
  const ctx: TreeOpsContext = {
    rootPath: '/repo',
    model,
    readFed: () => fed,
    writeFed: (next) => {
      fed = next;
    },
    hold: () => () => {
      released += 1;
    },
    renameView: () => (viewMissing.value ? null : view),
    selectOnly
  };
  return {
    ops: createTreeOps(ctx),
    view,
    rows,
    focusPath,
    selectOnly,
    releases: () => released,
    viewMissing
  };
}

function renameEvent(
  sourcePath: string,
  destinationPath: string,
  isFolder: boolean
): FileTreeRenameEvent {
  return { sourcePath, destinationPath, isFolder } as FileTreeRenameEvent;
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createCalls = (): number =>
  h.createFile.mock.calls.length + h.createFolder.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  h.relist.mockResolvedValue(undefined);
  h.createFile.mockImplementation((input: { path: string }) =>
    Promise.resolve({
      path: `/repo/${input.path}`,
      relPath: input.path,
      kind: 'file'
    })
  );
  h.createFolder.mockImplementation((input: { path: string }) =>
    Promise.resolve({
      path: `/repo/${input.path}`,
      relPath: input.path,
      kind: 'dir'
    })
  );
});

describe('the editor opens empty, and nothing exists yet', () => {
  it('seeds the box empty in the same task and touches no fs channel', () => {
    const rig = makeRig();
    rig.ops.newEntry('', 'file');
    expect(rig.view.path).toBe('untitled');
    expect(rig.view.value).toBe('');
    expect(rig.ops.pendingPath()).toBe('untitled');
    expect(createCalls()).toBe(0);
  });

  it('refuses the gesture outright when the adapter is missing', () => {
    const rig = makeRig();
    rig.viewMissing.value = true;
    rig.ops.newEntry('', 'file');
    expect(rig.rows.size).toBe(0);
    expect(rig.ops.pendingPath()).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(
      'error',
      'Could not start a new item here.'
    );
    expect(createCalls()).toBe(0);
  });
});

describe('issue 22: New File at an EMPTY project root', () => {
  // The bug: in a completely empty project the create button did nothing and
  // toasted "Could not start a new item here." The tree (and its inline-rename
  // adapter) was UNMOUNTED at zero rows, so renameView() was null. These pin
  // the create-at-empty-root contract the render fix restores: with the adapter
  // present a create at '' reaches the inline editor; with it absent it refuses.
  it('adapter present, empty root: reaches the inline editor, no toast', () => {
    const rig = makeRig();
    // Empty root: no siblings, so the seed is the bare unique name at ''.
    rig.ops.newEntry('', 'file');
    expect(rig.rows.has('untitled')).toBe(true); // placeholder row placed
    expect(rig.view.path).toBe('untitled'); // startRenaming reached the editor
    expect(rig.view.value).toBe(''); // opened empty, ready to type
    expect(rig.ops.pendingPath()).toBe('untitled');
    expect(h.toast).not.toHaveBeenCalled();
    expect(createCalls()).toBe(0);
  });

  it('pending is set BEFORE the model emits, so the createPending guard is reactive', () => {
    // The empty-folder hint hides off `createPending`, which use-tree-rename
    // recomputes from ops.pendingPath() inside a model.subscribe callback —
    // and the only emits during a create are the ones model.add and
    // startRenaming fire. If `pending` were assigned AFTER those calls, both
    // emits would read pendingPath() === null, createPending would never rise,
    // and the hint would cover the placeholder row (issue 22 / Phase 267,
    // the verifier's Finding 1). Pin that pendingPath() is already the
    // placeholder DURING both mutations.
    const view = makeView();
    const rows = new Set<string>();
    let ops: TreeOps | null = null;
    const seenDuringAdd: (string | null)[] = [];
    const seenDuringStart: (string | null)[] = [];
    const model = {
      add: (path: string) => {
        rows.add(path);
        seenDuringAdd.push(ops?.pendingPath() ?? null);
      },
      remove: (path: string) => {
        rows.delete(path);
      },
      getItem: (path: string) => (rows.has(path) ? ({} as never) : null),
      startRenaming: (path: string) => {
        view.path = path;
        view.value = path.split('/').pop() ?? '';
        seenDuringStart.push(ops?.pendingPath() ?? null);
        return true;
      },
      batch: vi.fn(),
      resetPaths: vi.fn(),
      focusPath: vi.fn(),
      getSelectedPaths: () => [] as string[]
    };
    const ctx: TreeOpsContext = {
      rootPath: '/repo',
      model: model as unknown as TreeOpsContext['model'],
      readFed: () => new Set<string>(),
      writeFed: () => {},
      hold: () => () => {},
      renameView: () => view,
      selectOnly: vi.fn()
    };
    ops = createTreeOps(ctx);
    ops.newEntry('', 'file');
    expect(seenDuringAdd).toEqual(['untitled']);
    expect(seenDuringStart).toEqual(['untitled']);
  });

  it('adapter absent (the bug shape): toasts and never opens the editor', () => {
    const rig = makeRig();
    rig.viewMissing.value = true; // renameView() === null, as when unmounted
    rig.ops.newEntry('', 'file');
    expect(rig.view.path).toBeNull(); // startRenaming never reached
    expect(rig.rows.size).toBe(0);
    expect(rig.ops.pendingPath()).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(
      'error',
      'Could not start a new item here.'
    );
    expect(createCalls()).toBe(0);
  });
});

describe('every no-create exit really creates nothing', () => {
  it('Escape: the library removed the row; settle frees the gesture', () => {
    const rig = makeRig();
    rig.ops.newEntry('', 'file');
    // Pierre's cancel path: row out, editor closed, no callback.
    rig.rows.delete('untitled');
    rig.view.path = null;
    rig.ops.settle();
    expect(rig.ops.pendingPath()).toBeNull();
    expect(rig.releases()).toBeGreaterThan(0);
    expect(createCalls()).toBe(0);
  });

  it('invalid click-away: onRenameRejected removes the placeholder row', () => {
    const rig = makeRig();
    rig.ops.newEntry('', 'file');
    expect(rig.rows.has('untitled')).toBe(true);
    // Pierre's onError path: editor closed, row KEPT, error fired.
    rig.view.path = null;
    rig.ops.onRenameRejected('Name cannot include "/".');
    expect(rig.rows.has('untitled')).toBe(false);
    expect(rig.ops.pendingPath()).toBeNull();
    expect(h.toast).toHaveBeenCalledWith('error', 'Name cannot include "/".');
    expect(createCalls()).toBe(0);
  });

  it('settle with the editor still open leaves the gesture alone', () => {
    const rig = makeRig();
    rig.ops.newEntry('', 'file');
    rig.ops.settle();
    expect(rig.ops.pendingPath()).toBe('untitled');
    expect(createCalls()).toBe(0);
  });
});

describe('the two commits, each exactly one disk write', () => {
  it('a committed valid name creates once, then selects and opens', async () => {
    const rig = makeRig();
    rig.ops.newEntry('', 'file');
    expect(createCalls()).toBe(0);
    // Pierre's commit: editor closed, onRename fired.
    rig.view.path = null;
    rig.ops.onRenameCommitted(renameEvent('untitled', 'note.md', false));
    await flush();
    expect(h.createFile).toHaveBeenCalledTimes(1);
    expect(h.createFile).toHaveBeenCalledWith({
      root: '/repo',
      path: 'note.md'
    });
    expect(h.createFolder).not.toHaveBeenCalled();
    expect(rig.selectOnly).toHaveBeenCalledWith('note.md');
    expect(rig.focusPath).toHaveBeenCalledWith('note.md');
    expect(h.requestOpenFile).toHaveBeenCalledWith(
      expect.objectContaining({ relPath: 'note.md', preview: false })
    );
  });

  it('the silent no-op commit (seed typed by hand) creates for real', async () => {
    const rig = makeRig();
    rig.ops.newEntry('', 'file');
    // Pierre's source === destination branch: editor closed, row kept,
    // NOTHING fired. settle() is the only observer left.
    rig.view.path = null;
    expect(rig.rows.has('untitled')).toBe(true);
    rig.ops.settle();
    await flush();
    expect(h.createFile).toHaveBeenCalledTimes(1);
    expect(h.createFile).toHaveBeenCalledWith({
      root: '/repo',
      path: 'untitled'
    });
    expect(rig.ops.pendingPath()).toBeNull();
    expect(rig.selectOnly).toHaveBeenCalledWith('untitled');
  });

  it('a folder commit calls createFolder and opens nothing', async () => {
    const rig = makeRig();
    rig.ops.newEntry('', 'dir');
    expect(rig.view.path).toBe('untitled folder/');
    expect(rig.view.value).toBe('');
    rig.view.path = null;
    rig.ops.onRenameCommitted(renameEvent('untitled folder', 'team', true));
    await flush();
    expect(h.createFolder).toHaveBeenCalledTimes(1);
    expect(h.createFolder).toHaveBeenCalledWith({ root: '/repo', path: 'team' });
    expect(h.createFile).not.toHaveBeenCalled();
    expect(h.requestOpenFile).not.toHaveBeenCalled();
    expect(rig.selectOnly).toHaveBeenCalledWith('team/');
  });
});

describe('the whole hostile sequence, counted', () => {
  it('zero creates through every refusal, then exactly one on commit', async () => {
    const rig = makeRig();

    // Open + Escape.
    rig.ops.newEntry('', 'file');
    rig.rows.delete('untitled');
    rig.view.path = null;
    rig.ops.settle();

    // Open + invalid click-away.
    rig.ops.newEntry('', 'file');
    rig.view.path = null;
    rig.ops.onRenameRejected('refused');

    // Open + settle while still editing.
    rig.ops.newEntry('', 'file');
    rig.ops.settle();

    expect(createCalls()).toBe(0);

    // Now the one commit.
    rig.view.path = null;
    rig.ops.onRenameCommitted(renameEvent('untitled', 'real.md', false));
    await flush();
    expect(createCalls()).toBe(1);
  });
});
