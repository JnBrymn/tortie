/**
 * PHASE 282. THE REDLINE'S TYPING HALF, MOUNTED FOR REAL AND WITHOUT A DOM.
 *
 * Shared by `p282-typing-burst.test.ts` and `p282-keystroke-in-transit.test.ts`,
 * and deliberately not a test itself. What runs is the SHIPPING code: React
 * 19's own root, `useLiveTabText` (./live-text, NOT mocked — mocking it is how
 * the PR's scramble passed every unit suite), `useRedlineTyping`
 * (./redline-edits), ./monaco-loader's registry, the editor store, `markDirty`,
 * `adoptWritten`, `save` and the rewind's own `pressRedline` and
 * `applyRewind`. What is faked is only what a node process has no copy of:
 *
 *   - the Monaco chunk, as a model that answers `getValue`, fires its change
 *     listeners synchronously the way `textModel.js` does, and keeps offsets in
 *     one column so no line arithmetic is involved. Its import is GATED, so a
 *     test decides whether the first keystroke of a session outlasts a round
 *     trip, which is the real chunk load research 97 measured;
 *   - main, as a string on "disk" with a sha256 compare-and-swap in one
 *     synchronous step (src/main/fs/guarded-write.ts's steps 3 to 9), whose
 *     reads and writes can each be HELD at a named gate;
 *   - the caret, which the calling file mocks in ./redline-caret so that the
 *     next keystroke lands where the view last PUT the caret. That is the one
 *     property of a real contenteditable the scramble depends on: probe:p237
 *     read `"rely\n lathro"` because the view restored a caret mapped through
 *     its own write mistaken for an outside one.
 *
 * The calling file owns the `vi.mock` of ./redline-caret (mocks are hoisted per
 * file) and hands this rig the object that mock reads.
 */

import { createHash } from 'node:crypto';
import { vi } from 'vitest';

import { gatedFs, gmuxBridge } from './p282-gated-fs';

export const HEAD = 'Alpha brown fox runs. Beta line stays.\n';
/** What the agent wrote: `brown` became `red`. On disk before anything runs. */
export const AGENT = 'Alpha red fox runs. Beta line stays.\n';
export const ROOT = '/w/proj';
export const ID = `${ROOT}/doc.md`;

const hex = (t: string): string => createHash('sha256').update(t).digest('hex');

/** The caret the calling file's ./redline-caret mock reads and writes. */
export interface CaretCell {
  at: number;
}

class FakeModel {
  private text: string;
  private subs: Array<() => void> = [];
  constructor(text: string) {
    this.text = text;
  }
  getValue(): string {
    return this.text;
  }
  isDisposed(): boolean {
    return false;
  }
  dispose(): void {}
  updateOptions(): void {}
  pushStackElement(): void {}
  undo(): void {}
  redo(): void {}
  onDidChangeContent(fn: () => void): { dispose: () => void } {
    this.subs.push(fn);
    return {
      dispose: () => {
        this.subs = this.subs.filter((s) => s !== fn);
      }
    };
  }
  getPositionAt(offset: number): { lineNumber: number; column: number } {
    return { lineNumber: 1, column: offset + 1 };
  }
  pushEditOperations(
    _selections: unknown,
    ops: Array<{ range: { startColumn: number; endColumn: number }; text: string }>
  ): null {
    for (const op of ops) {
      this.text =
        this.text.slice(0, op.range.startColumn - 1) + op.text + this.text.slice(op.range.endColumn - 1);
    }
    for (const s of [...this.subs]) s();
    return null;
  }
}

export interface RigOptions {
  /** The caret cell the calling file's ./redline-caret mock reads. */
  caret: CaretCell;
  /** Hold the Monaco chunk's import until `releaseChunk()`. */
  holdChunk: boolean;
  /** Create the working model before the view mounts, as a File view would have. */
  modelFirst: boolean;
  /** The Monaco chunk's import REJECTS once it is let go, as a failed chunk load does. */
  failChunk?: boolean;
}

export async function mountTypingRig(opts: RigOptions) {
  vi.resetModules();
  let releaseChunk: () => void = () => undefined;
  const chunk = opts.holdChunk
    ? new Promise<void>((r) => {
        releaseChunk = r;
      })
    : Promise.resolve();
  vi.doMock('../monaco-impl', async () => {
    await chunk;
    if (opts.failChunk === true) throw new Error('the chunk did not load');
    return {
      monaco: {
        Uri: { from: (o: object) => o },
        editor: { getModel: () => null, createModel: (t: string) => new FakeModel(t) },
        languages: { getLanguages: () => [] }
      }
    };
  });

  // Main, shared with the phase's other two rigs (./p282-gated-fs). Only the
  // steps a test names are held, so a mount drives itself until it is attacked.
  const main = gatedFs(hex);
  main.reset(AGENT);
  const disk = main.disk;

  vi.stubGlobal('window', {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    HTMLIFrameElement: class {},
    gmux: gmuxBridge(main, {
      fs: {
        readDir: async () => ({ entries: [{ name: 'doc.md' }] }),
        // The plain door is never this domain's; conformance:save owns the rule.
        writeFile: async () => {
          throw new Error('the plain door must not be used');
        }
      },
      git: { showHead: async () => HEAD },
      rest: { machines: {} }
    })
  });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal('document', {
    body: { classList: { add() {}, remove() {}, contains: () => false } },
    addEventListener() {},
    removeEventListener() {}
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useEditor } = await import('../store');
  const { useApp } = await import('../../state/store');
  const { useSettingsStore } = await import('../../settings/settings-store');
  const { useLiveTabText } = await import('../live-text');
  const { useRedlineTyping } = await import('../redline-edits');
  const { ensureWorkingModel, getWorkingModel } = await import('../monaco-loader');
  const { pressRedline } = await import('../redline-press');
  const { applyRewind } = await import('../redline-write');
  const { composeRedlineDocument } = await import('../redline-document');
  const { changesOf } = await import('../rewind');
  const { NO_BASELINE, nextBaseline, redlineBaseSide } = await import('../baseline');
  const { redlineRefusalSentence } = await import('../redline-sentences');

  useApp.setState({
    projects: [{ id: 'p', path: ROOT, name: 'proj' }],
    activeProjectId: 'p',
    confirm: null,
    toasts: []
  } as never);
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...settings, autoSave: { mode: 'off', delayMs: 1000 } } });
  useEditor.setState({
    projectId: 'p',
    tabs: [
      {
        id: ID, path: ID, relPath: 'doc.md', origRelPath: null, repoPath: ROOT, name: 'doc.md', projectId: 'p',
        mode: 'redline', canDiff: true, markdown: true, image: false, svg: false, html: false, imageData: null,
        imageHead: null, imageRevision: 0, preview: false, commit: null, pendingSelection: null, pendingFocus: false,
        dirty: false, deleted: false, truncated: false, loading: false, error: null, savedContents: AGENT,
        headContents: HEAD, baseline: nextBaseline(NO_BASELINE, { kind: 'head', contents: HEAD }, 1),
        lastUsed: 0, contextEntry: null
      }
    ],
    activeId: ID
  } as never);

  if (opts.modelFirst) await ensureWorkingModel(ID, AGENT, ID);

  const listeners: Record<string, (e: unknown) => void> = {};
  const docEl: Record<string, unknown> = {
    addEventListener: (t: string, f: (e: unknown) => void) => {
      listeners[t] = f;
    },
    removeEventListener() {},
    contains: () => true
  };
  docEl['ownerDocument'] = { activeElement: docEl };
  let typing: { text: string | null; docProps: { ref: (el: HTMLElement | null) => void } } | null = null;
  function View(): null {
    const tab = useEditor((s) => s.tabs.find((t) => t.id === ID));
    if (tab === undefined) return null;
    const text = useLiveTabText(ID, tab.savedContents, true);
    typing = useRedlineTyping({ tab, liveText: text });
    return null;
  }
  const host = {
    nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', textContent: '',
    addEventListener() {}, removeEventListener() {}, ownerDocument: { addEventListener() {}, removeEventListener() {} }
  };
  const root = createRoot(host as never);
  await React.act(async () => {
    root.render(React.createElement(View));
  });
  await React.act(async () => {
    typing!.docProps.ref(docEl as never);
  });

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 12; i += 1) await new Promise((r) => setImmediate(r));
  };
  const tab = () => useEditor.getState().tabs.find((t) => t.id === ID)!;
  const fire = (inputType: string, data: string | null): void => {
    listeners['beforeinput']!({ inputType, data, cancelable: true, preventDefault() {}, dataTransfer: null });
  };
  const input = async (inputType: string, data: string | null): Promise<void> => {
    await React.act(async () => {
      fire(inputType, data);
    });
  };

  return {
    disk,
    /** The bytes the view draws now. */
    drawn: (): string => typing!.text ?? '',
    /** The working model's text, or null before one exists. */
    model: (): string | null => getWorkingModel(ID)?.getValue() ?? null,
    tab,
    /** One character at the caret, as a real `insertText` beforeinput. */
    type: (ch: string) => input('insertText', ch),
    /** Enter under `plaintext-only` (research 97 §3). */
    enter: () => input('insertLineBreak', null),
    /**
     * One character typed AND a held step let go inside ONE `act`, so React
     * draws the keystroke and whatever the step's continuation patches into
     * the store in the same render. That is the only shape in which the order
     * of ./redline-edits' effects is observable: the edit and the new live
     * text arrive together, and the edit was typed on the text from before.
     */
    typeReleasing: async (ch: string, label: string): Promise<void> => {
      const step = main.take(label);
      if (step === null) throw new Error(`nothing is held at ${label}; held: ${main.waiting()}`);
      await React.act(async () => {
        fire('insertText', ch);
        step();
        await settle();
      });
    },
    /** Hold the next read or write with this label (`read#2`, `write#1`). */
    hold: (label: string) => {
      main.hold(label);
    },
    /** Let a held step go, then let every continuation it unblocks run. */
    release: async (label: string): Promise<void> => {
      for (let i = 0; i < 200; i += 1) {
        const step = main.take(label);
        if (step !== null) {
          await React.act(async () => {
            step();
            await settle();
          });
          return;
        }
        await new Promise((r) => setImmediate(r));
      }
      throw new Error(`nothing is held at ${label}; held: ${main.waiting()}`);
    },
    releaseChunk: async (): Promise<void> => {
      await React.act(async () => {
        releaseChunk();
        await settle();
      });
    },
    settle: async (): Promise<void> => {
      await React.act(async () => {
        await settle();
      });
    },
    /**
     * ⌥⌫ on the agent's change, through the SHIPPING press and write, followed
     * by exactly what RedlineDocument's `press` does with a landed write: the
     * tab adopts the bytes. Answers the promise so a test can type while the
     * write is held; a test awaits it inside `release` or `settle`.
     */
    rewindAgentChange: (): Promise<{ outcome: string; toasts: string[] }> => {
      const live = tab();
      const base = redlineBaseSide(live.baseline, live.headContents);
      const change = changesOf(composeRedlineDocument(base, typing!.text ?? live.savedContents).runs).find((c) =>
        c.del.includes('brown')
      )!;
      const toasts: string[] = [];
      return pressRedline(
        'rewind',
        {
          id: live.id,
          root: live.repoPath,
          path: live.path,
          baseline: base,
          generation: live.baseline?.generation ?? 0,
          dirty: live.dirty
        },
        {
          focused: () => ({ off: change.off, del: change.del, ins: change.ins, generation: live.baseline?.generation ?? 0 }),
          apply: applyRewind,
          refuse: (why) => toasts.push(redlineRefusalSentence(why, live.name))
        }
      ).then((r) => {
        // No `act` of its own: this continuation runs inside whichever `act`
        // released the write, and two overlapping `act` scopes leave React's
        // queue unable to flush the next root this file mounts.
        if (r.outcome === 'wrote') useEditor.getState().adoptWritten(live.id, r.contents, r.was);
        return { outcome: r.outcome, toasts };
      });
    },
    /** The store's own `adoptWritten`, as RedlineDocument calls it after a landed write. */
    adopt: async (contents: string, was: string): Promise<void> => {
      await React.act(async () => {
        useEditor.getState().adoptWritten(ID, contents, was);
      });
    },
    /** Every toast's words, oldest first. */
    toasts: (): string[] => (useApp.getState() as { toasts: Array<{ text: string }> }).toasts.map((t) => t.text),
    /** Move `savedContents` with no guard at all, standing for any later path. */
    replaceSaved: (text: string): void => {
      useEditor.setState({ tabs: useEditor.getState().tabs.map((t) => (t.id === ID ? { ...t, savedContents: text } : t)) });
    },
    /** Turn auto save to this policy, as Settings does. */
    setAutoSave: (autoSave: { mode: 'off' | 'afterDelay'; delayMs: number }): void => {
      const now = useSettingsStore.getState().settings;
      useSettingsStore.setState({ settings: { ...now, autoSave } });
    },
    /** Real time passing, with every continuation it lets run drawn. */
    wait: async (ms: number): Promise<void> => {
      await React.act(async () => {
        await new Promise((r) => setTimeout(r, ms));
        await settle();
      });
    },
    /** The store's `init`, which subscribes its watcher through ./state/repo-changed. */
    init: async (): Promise<void> => {
      await React.act(async () => {
        useEditor.getState().init();
      });
    },
    /**
     * One watcher tick, through the listener the calling file captured from its
     * mock of ./state/repo-changed (mocks are hoisted per file, like the caret).
     */
    tick: async (repoPath: string, fire: (repoPath: string) => void): Promise<void> => {
      await React.act(async () => {
        fire(repoPath);
        await settle();
      });
    },
    /** ⌘S, the store's own. */
    save: async (): Promise<void> => {
      await React.act(async () => {
        await useEditor.getState().save();
        await settle();
      });
    },
    confirmTitle: (): string | null => (useApp.getState() as { confirm: { title?: string } | null }).confirm?.title ?? null,
    unmount: async (): Promise<void> => {
      await React.act(async () => {
        root.unmount();
      });
    }
  };
}
