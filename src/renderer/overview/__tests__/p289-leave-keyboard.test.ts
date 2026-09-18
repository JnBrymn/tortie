/**
 * Phase 289: the page gives the keyboard back.
 *
 * The recorded defect (Phase 286's attack verifier, arm D, identical at HEAD
 * and at the parent): after ⇧⌘U and Escape `document.activeElement` was
 * `body`, and what a person typed arrived in no session. The leave closed the
 * page, which is a store write, and asked the terminal to take the keyboard
 * in the same task. React had not yet taken `overview-open` off the shell,
 * ../overview.css keeps `.shell.overview-open .work-area` at `display: none`,
 * and an element inside a box that is not drawn refuses the keyboard.
 *
 * What is held here, and the first case is the one that is red at the parent:
 *  - with `overview-open` still on the shell when the leave runs, the
 *    terminal's textarea holds the keyboard once the class is gone;
 *  - in a split it is the OUTLINED pane's textarea, through the real
 *    `focusTerminal()`, so this phase's two halves are held together;
 *  - a write to the class attribute that leaves `overview-open` on, being the
 *    flight's own class by hand, does not end the wait;
 *  - the page opened again before the class goes cancels the return, under
 *    reduced motion (where the class never goes at all, so the wait would
 *    otherwise hang) and with the flight;
 *  - a keyboard the person put somewhere else in between is left alone;
 *  - a project with no session focuses nothing and does not throw;
 *  - a shell that does not carry the class is answered in the same task, as
 *    it always was, and nothing is left waiting;
 *  - there is no timer with a number in it, and the jump out is untouched.
 *
 * THE FIX ROUND, from the attack verifier's A1. The first build sent every
 * leave to the terminal. With the keyboard in an open file the verifier
 * pressed ⇧⌘U and then Escape and carried on typing, and the line and its
 * Enter went to the outlined session, whose shell ran it; the parent had sent
 * them nowhere. So the opening gesture records what held the keyboard and the
 * leave gives it back to THAT:
 *  - an open file, a session row and a terminal each get the keyboard back,
 *    the very element, and no terminal is asked to take it in their place;
 *  - a place that has left the document, or is there and not drawn, sends the
 *    keyboard to the session, and so does a gesture made with it on nothing
 *    or on the layer, neither of which is a place;
 *  - the page reopened while a leave still owes the keyboard keeps the place
 *    it is owed to, because the document says `body` or the layer by then;
 *  - the record is spent once it is paid, so a later page opened by a door
 *    that records nothing does not send the keyboard to a stale place;
 *  - a second leave over a wait that is still armed leaves ONE observer.
 *
 * The vitest environment is node and jsdom is not a dependency of this
 * repository, so the DOM is the hand built shape p183-flight-latch.test.ts
 * and focus-flight.test.ts use. The doubles model the two browser rules the
 * defect is made of. A `focus()` on the terminal's textarea is REFUSED while
 * the shell carries `overview-open`, and the focused layer falling out of the
 * document drops the keyboard to `body`. `reactCommits()` is React's flush of
 * the store write: it rewrites the shell's class attribute, takes the layer
 * out or lets it take the keyboard (OverviewLayer's own effect), and delivers
 * the mutation to whoever is observing. `place()` is anything outside the
 * layer that can hold the keyboard. ../../app/focus-mode.css un-draws every
 * one of them under the same class, so each refuses exactly as the terminal
 * does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The store and the seams open-overview.ts already has
// ---------------------------------------------------------------------------

interface FakeOverview {
  level: string;
  projectPath: string;
  openedFromProject: boolean;
}

const store = {
  overview: null as FakeOverview | null,
  visibleSessionIds: [] as string[],
  toast: vi.fn(),
  activeProject: () => ({ path: '/p289' }),
  activeSession: () => null,
  loadOverview: vi.fn(() => Promise.resolve()),
  openOverview: vi.fn((req: FakeOverview) => {
    store.overview = req;
    return 1;
  }),
  closeOverview: vi.fn(() => {
    store.overview = null;
  })
};

vi.mock('../../state/store', () => ({
  useApp: { getState: () => store },
  effectiveStatusOf: () => 'running'
}));
vi.mock('../../state/overview-slice', () => ({ nextOverviewToken: () => 1 }));
vi.mock('../../app/focus-copy', () => ({
  buildStillCopy: vi.fn(() => Promise.resolve(null))
}));
vi.mock('../../app/fill-chord', () => ({ activeFillRegion: () => null }));
vi.mock('../../app/shell-actions', () => ({ focusedSessionRowId: () => null }));
vi.mock('../../settings/settings-store', () => ({
  useSettingsStore: { getState: () => ({ settings: { hotkeys: {} } }) }
}));

// ---------------------------------------------------------------------------
// The DOM doubles
// ---------------------------------------------------------------------------

/** The two selectors the real `focusTerminal()` asks, in its own order. */
const OUTLINED_PANE_TEXTAREA =
  '.split-pane.focused .xterm-helper-textarea, ' +
  '.surface-single .xterm-helper-textarea';
const FIRST_TEXTAREA = '.gmux-terminal-mount textarea';

interface Holder {
  name: string;
  /** How many `focus()` calls were made, whatever came of them. */
  asked: number;
  /** How many of them actually took the keyboard. */
  took: number;
  /** What each `focus()` call was handed. */
  options: unknown[];
  /** False once the element has left the document. */
  isConnected: boolean;
  /** False for an element that is in the document and not drawn. */
  drawn: boolean;
  focus(options?: unknown): void;
  closest(sel: string): unknown;
}

interface FakeObserver {
  connected: boolean;
  deliver(): void;
}

interface Dom {
  shell: {
    classList: { contains(name: string): boolean };
    /** A write by hand, the way the flight adds and removes its class. */
    write(next: string[]): void;
  };
  body: Holder;
  layer: Holder;
  first: Holder | null;
  outlined: Holder | null;
  observers: FakeObserver[];
  active(): Holder;
  /** Something outside the layer that can hold the keyboard. */
  place(name: string): Holder;
  /** The person puts the keyboard somewhere else. */
  personFocuses(el: Holder): void;
  /** React's flush of the store write. */
  reactCommits(): void;
}

function installDom(opts: {
  /** The shell's classes when the leave runs. */
  shellClasses: string[];
  /** `split` draws two panes with the SECOND one outlined. */
  surface: 'split' | 'none';
  reducedMotion?: boolean;
}): Dom {
  let classes = new Set(opts.shellClasses);
  let active: Holder;
  const observers: FakeObserver[] = [];
  const attrs: Record<string, string> = {};

  const workAreaDrawn = (): boolean => !classes.has('overview-open');

  const holder = (name: string, kind: 'terminal' | 'plain' | 'layer'): Holder => {
    const el: Holder = {
      name,
      asked: 0,
      took: 0,
      options: [],
      isConnected: true,
      drawn: true,
      focus: (options?: unknown) => {
        el.asked += 1;
        el.options.push(options);
        // The rule the defect is made of. The work area is `display: none`
        // while the shell carries the class, and nothing inside a box that
        // is not drawn can take the keyboard.
        if (kind === 'terminal' && !workAreaDrawn()) return;
        if (!el.drawn || !el.isConnected) return;
        el.took += 1;
        active = el;
      },
      closest: (sel) => (kind === 'layer' && sel === '.overview-layer' ? el : null)
    };
    return el;
  };

  const body = holder('body', 'plain');
  const layer = holder('overview-layer', 'layer');
  const first = opts.surface === 'split' ? holder('first-pane', 'terminal') : null;
  const outlined =
    opts.surface === 'split' ? holder('outlined-pane', 'terminal') : null;
  // The page took the keyboard when it opened, which OverviewLayer's own
  // effect does, so that is where it is when the leave runs.
  active = classes.has('overview-open') ? layer : body;

  const notify = (): void => {
    for (const o of [...observers]) o.deliver();
  };

  const shell = {
    // `add` and `remove` are the flight's own writes by hand, and each one is
    // a write to the class attribute, so an observer hears it.
    classList: {
      contains: (name: string): boolean => classes.has(name),
      add: (name: string): void => {
        if (classes.has(name)) return;
        classes = new Set([...classes, name]);
        notify();
      },
      remove: (name: string): void => {
        if (!classes.has(name)) return;
        classes = new Set([...classes].filter((c) => c !== name));
        notify();
      }
    },
    write: (next: string[]): void => {
      classes = new Set(next);
      notify();
    },
    setAttribute: (name: string, value: string): void => {
      attrs[name] = value;
    },
    removeAttribute: (name: string): void => {
      delete attrs[name];
    },
    hasAttribute: (name: string): boolean => name in attrs
  };

  class Observer {
    private readonly entry: FakeObserver;
    constructor(private readonly callback: () => void) {
      this.entry = {
        connected: false,
        deliver: () => {
          if (this.entry.connected) this.callback();
        }
      };
      observers.push(this.entry);
    }
    observe(target: unknown, init: { attributeFilter?: string[] }): void {
      expect(target, 'the shell is what is observed').toBe(shell);
      expect(init.attributeFilter).toEqual(['class']);
      this.entry.connected = true;
    }
    disconnect(): void {
      this.entry.connected = false;
    }
  }

  vi.stubGlobal('MutationObserver', Observer);
  vi.stubGlobal('document', {
    documentElement: {},
    body,
    get activeElement(): Holder {
      return active;
    },
    querySelector: (sel: string): unknown => {
      if (sel === '.shell') return shell;
      if (sel === OUTLINED_PANE_TEXTAREA) return outlined;
      if (sel === FIRST_TEXTAREA) return first;
      return null;
    }
  });
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: opts.reducedMotion === true })
  });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) =>
      name === '--dur-panel' ? '200ms' : 'cubic-bezier(0.2, 0, 0, 1)'
  }));
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    setTimeout(() => {
      cb(0);
    }, 0);
    return 0;
  });

  return {
    shell,
    body,
    layer,
    first,
    outlined,
    observers,
    active: () => active,
    // The sidebar, the session list and the editor are un-drawn under the
    // same class as the work area, so a place refuses as a terminal does.
    place: (name) => holder(name, 'terminal'),
    personFocuses: (el) => {
      active = el;
    },
    reactCommits: () => {
      // App.tsx renders the class from the store, and OverviewLayer renders
      // null while `overview` is null. One commit does both.
      const open = store.overview !== null;
      if (!open && active === layer) active = body;
      // OverviewLayer's own effect: the page takes the keyboard as it opens.
      if (open) active = layer;
      const next = new Set(classes);
      if (open) next.add('overview-open');
      else next.delete('overview-open');
      const changed = next.size !== classes.size;
      classes = next;
      // React writes the attribute only when the string moved, so a close
      // and an open inside one task deliver no mutation at all.
      if (changed) notify();
    }
  };
}

const OPEN: FakeOverview = {
  level: 'project',
  projectPath: '/p289',
  openedFromProject: false
};

/** A fresh module per test, because the waiting return is module state. */
async function loadGestures(): Promise<typeof import('../open-overview')> {
  vi.resetModules();
  return await import('../open-overview');
}

beforeEach(() => {
  vi.useFakeTimers();
  store.overview = { ...OPEN };
  store.toast.mockClear();
  store.loadOverview.mockClear();
  store.openOverview.mockClear();
  store.closeOverview.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('leaving Catch Me Up gives the keyboard back (Phase 289)', () => {
  it('puts the keyboard in the terminal once the class is gone', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();

    // The same task. The store says closed, the DOM does not yet, and the
    // terminal cannot take the keyboard. This is the measured `body`.
    expect(store.overview).toBeNull();
    expect(dom.shell.classList.contains('overview-open')).toBe(true);
    expect(dom.outlined?.took).toBe(0);

    dom.reactCommits();

    expect(dom.shell.classList.contains('overview-open')).toBe(false);
    expect(
      dom.active().name,
      'after the close reached the DOM the keyboard is in the session'
    ).toBe('outlined-pane');
    expect(dom.first?.took, 'never the first pane in document order').toBe(0);
  });

  it('is one shot: the observer is disconnected once it has answered', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();
    dom.reactCommits();

    expect(dom.observers.length).toBe(1);
    expect(dom.observers[0]?.connected).toBe(false);

    // A later write to the class takes nothing from wherever the keyboard
    // has gone since.
    const elsewhere: Holder = {
      name: 'an-open-file',
      asked: 0,
      took: 0,
      options: [],
      isConnected: true,
      drawn: true,
      focus: () => undefined,
      closest: () => null
    };
    dom.personFocuses(elsewhere);
    dom.shell.write(['shell', 'session-focus']);
    expect(dom.active().name).toBe('an-open-file');
    expect(dom.outlined?.took).toBe(1);
  });

  it('keeps waiting through a class write that leaves overview-open on', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();
    dom.shell.write(['shell', 'overview-open', 'gmux-focusing']);

    expect(dom.outlined?.took).toBe(0);
    expect(dom.observers[0]?.connected).toBe(true);

    dom.reactCommits();
    expect(dom.active().name).toBe('outlined-pane');
  });

  it('is answered in the same task when the shell does not carry the class', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();

    expect(dom.active().name).toBe('outlined-pane');
    expect(
      dom.observers.filter((o) => o.connected),
      'nothing is left waiting'
    ).toEqual([]);
  });

  it('focuses nothing when the project has no session', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'none'
    });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();
    expect(() => {
      dom.reactCommits();
    }).not.toThrow();

    expect(dom.active().name).toBe('body');
    expect(dom.body.asked, 'body is never asked to take it either').toBe(0);
    expect(store.toast).not.toHaveBeenCalled();
    expect(dom.observers.filter((o) => o.connected)).toEqual([]);
  });
});

describe('the return is dropped when it is no longer wanted (Phase 289)', () => {
  it('reopened under reduced motion: the class never goes, and nothing is left waiting', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split',
      reducedMotion: true
    });
    const { backOrLeaveOverview, toggleOverview } = await loadGestures();

    await backOrLeaveOverview();
    // The same task, before React has flushed the close. Reduced motion
    // commits the open at once, so React renders the class it already drew
    // and no mutation is ever delivered.
    await toggleOverview('chord');
    expect(store.overview).not.toBeNull();
    dom.reactCommits();

    expect(dom.shell.classList.contains('overview-open')).toBe(true);
    expect(
      dom.observers.filter((o) => o.connected),
      'a wait that can never end must not be left armed'
    ).toEqual([]);

    // The NEXT close is the jump's, which owns its own keyboard. A return
    // left over from this leave must not answer it.
    store.overview = null;
    dom.reactCommits();
    expect(dom.outlined?.took).toBe(0);
    expect(dom.first?.took).toBe(0);
  });

  it('reopened with the flight: the close commits and nothing is focused', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview, toggleOverview } = await loadGestures();

    await backOrLeaveOverview();
    // The gesture is what cancels, not the commit 200 ms after it. The
    // person has asked for the page, so the keyboard is the page's.
    const flight = toggleOverview('chord');
    dom.reactCommits();

    expect(dom.shell.classList.contains('overview-open')).toBe(false);
    expect(dom.outlined?.took).toBe(0);
    expect(dom.first?.took).toBe(0);
    expect(dom.active().name).toBe('body');

    await vi.advanceTimersByTimeAsync(400);
    await flight;
    expect(store.overview).not.toBeNull();
  });

  it('reopened from a session’s own menu row: the same cancel, at the gesture', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview, openOverviewForSession } = await loadGestures();

    await backOrLeaveOverview();
    const flight = openOverviewForSession('s1', '/p289');
    dom.reactCommits();

    expect(dom.outlined?.took).toBe(0);
    expect(dom.first?.took).toBe(0);
    expect(dom.observers.filter((o) => o.connected)).toEqual([]);

    await vi.advanceTimersByTimeAsync(400);
    await flight;
    expect(store.overview?.level).toBe('session');
  });

  it('reopened by a door that does not come through here: the store is asked', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();
    // A class write that takes the class off while the store says open is
    // not a state React draws. It is here so the store check is held on its
    // own and not by the cancel above it.
    store.overview = { ...OPEN };
    dom.shell.write(['shell']);

    expect(dom.outlined?.took).toBe(0);
    expect(dom.first?.took).toBe(0);
  });

  it('leaves a keyboard the person moved in between where they put it', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview } = await loadGestures();
    const elsewhere: Holder = {
      name: 'a-field-the-person-clicked',
      asked: 0,
      took: 0,
      options: [],
      isConnected: true,
      drawn: true,
      focus: () => undefined,
      closest: () => null
    };

    await backOrLeaveOverview();
    dom.personFocuses(elsewhere);
    dom.reactCommits();

    expect(dom.active().name).toBe('a-field-the-person-clicked');
    expect(dom.outlined?.took).toBe(0);
    expect(dom.first?.took).toBe(0);
  });

  it('takes it from the layer itself, which is the page’s and not the person’s', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();
    // The class goes while the layer still holds the keyboard. React does
    // both in one commit, so this is the guard read on its own.
    dom.shell.write(['shell']);

    expect(dom.active().name).toBe('outlined-pane');
  });
});

/**
 * The opening gesture as a person makes it: ⇧⌘U over a closed page, the
 * 200 ms flight, and React's commit, after which the layer has the keyboard.
 */
async function openWithTheChord(
  dom: Dom,
  gestures: typeof import('../open-overview')
): Promise<void> {
  store.overview = null;
  const flight = gestures.toggleOverview('chord');
  await vi.advanceTimersByTimeAsync(400);
  await flight;
  dom.reactCommits();
  expect(dom.shell.classList.contains('overview-open')).toBe(true);
  expect(dom.active().name).toBe('overview-layer');
}

describe('the keyboard goes back where it was (Phase 289, the fix round)', () => {
  it('an open file that held it gets it back, and no session is asked to take it', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const gestures = await loadGestures();
    const file = dom.place('an-open-file');
    dom.personFocuses(file);

    await openWithTheChord(dom, gestures);
    await gestures.backOrLeaveOverview();

    // The same task: everything the page hid still refuses.
    expect(file.took).toBe(0);
    dom.reactCommits();

    expect(
      dom.active().name,
      'what a person types next goes on into the file, and into no session'
    ).toBe('an-open-file');
    expect(dom.outlined?.took).toBe(0);
    expect(dom.first?.took).toBe(0);
    expect(file.options.at(-1), 'a return moves the keyboard and nothing else').toEqual({
      preventScroll: true
    });
    expect(dom.observers.filter((o) => o.connected)).toEqual([]);
  });

  it('the terminal that held it gets it back, the very element', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const gestures = await loadGestures();
    // The first pane, which is NOT the outlined one in this double, so the
    // answer cannot be the helper's.
    if (dom.first === null) throw new Error('the split draws a first pane');
    dom.personFocuses(dom.first);

    await openWithTheChord(dom, gestures);
    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(dom.active().name).toBe('first-pane');
    expect(dom.outlined?.took).toBe(0);
  });

  it('a session row that held it gets it back, from the row’s own menu too', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const gestures = await loadGestures();
    const row = dom.place('a-session-row');
    dom.personFocuses(row);

    store.overview = null;
    const flight = gestures.openOverviewForSession('s1', '/p289');
    await vi.advanceTimersByTimeAsync(400);
    await flight;
    dom.reactCommits();
    // The same row asked again over the open page records nothing new: the
    // keyboard is the layer's by now, and the layer is not a place.
    await gestures.openOverviewForSession('s2', '/p289');

    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(dom.active().name).toBe('a-session-row');
    expect(dom.outlined?.took).toBe(0);
  });

  it('a place that has left the document sends the keyboard to the session', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const gestures = await loadGestures();
    const file = dom.place('a-closed-file');
    dom.personFocuses(file);

    await openWithTheChord(dom, gestures);
    file.isConnected = false;
    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(file.asked, 'an element outside the document is not asked').toBe(0);
    expect(dom.active().name).toBe('outlined-pane');
  });

  it('a place that is there and not drawn sends the keyboard to the session', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const gestures = await loadGestures();
    const view = dom.place('a-sidebar-view-since-hidden');
    dom.personFocuses(view);

    await openWithTheChord(dom, gestures);
    view.drawn = false;
    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(view.asked).toBeGreaterThan(0);
    expect(view.took).toBe(0);
    expect(dom.active().name).toBe('outlined-pane');
  });

  it('a gesture made with the keyboard on nothing sends it to the session', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const gestures = await loadGestures();
    expect(dom.active().name).toBe('body');

    await openWithTheChord(dom, gestures);
    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(dom.active().name).toBe('outlined-pane');
    expect(dom.body.asked, 'body is not a place, and is never asked').toBe(0);
  });

  it('the layer is never recorded as a place', async () => {
    // The jump out closes the page without coming through the leave, so
    // nothing is owed, and until React flushes that close the layer still
    // holds the keyboard. A chord in that gap must not record the layer.
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split',
      reducedMotion: true
    });
    const gestures = await loadGestures();
    store.overview = null;
    expect(dom.active().name).toBe('overview-layer');

    await gestures.toggleOverview('chord');
    dom.reactCommits();
    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(dom.layer.asked, 'the layer is not where a leave returns the keyboard').toBe(0);
    expect(dom.active().name).toBe('outlined-pane');
  });

  it('reopened while the keyboard is still owed: the place it is owed to is kept', async () => {
    const dom = installDom({
      shellClasses: ['shell'],
      surface: 'split',
      reducedMotion: true
    });
    const gestures = await loadGestures();
    const file = dom.place('an-open-file');
    dom.personFocuses(file);

    await openWithTheChord(dom, gestures);
    await gestures.backOrLeaveOverview();
    // The same task. The document says the layer, which is not a place, and
    // the file has not been given the keyboard back yet.
    expect(dom.active().name).toBe('overview-layer');
    await gestures.toggleOverview('chord');
    dom.reactCommits();
    expect(dom.shell.classList.contains('overview-open')).toBe(true);

    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(dom.active().name).toBe('an-open-file');
    expect(dom.outlined?.took).toBe(0);
  });

  it('the record is spent once it is paid', async () => {
    const dom = installDom({ shellClasses: ['shell'], surface: 'split' });
    const gestures = await loadGestures();
    const file = dom.place('an-open-file');
    dom.personFocuses(file);

    await openWithTheChord(dom, gestures);
    await gestures.backOrLeaveOverview();
    dom.reactCommits();
    expect(dom.active().name).toBe('an-open-file');
    expect(file.took).toBe(1);

    // A door that records nothing opens the page, the way the harness does.
    dom.personFocuses(dom.body);
    store.overview = { ...OPEN };
    dom.reactCommits();
    await gestures.backOrLeaveOverview();
    dom.reactCommits();

    expect(file.took, 'a stale place is not where the keyboard goes').toBe(1);
    expect(dom.active().name).toBe('outlined-pane');
  });

  it('a second leave over a wait that is still armed leaves one observer', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { backOrLeaveOverview } = await loadGestures();

    await backOrLeaveOverview();
    // Reopened by a door that does not come through open-overview.ts, before
    // React flushed the close, and then left again.
    store.overview = { ...OPEN };
    await backOrLeaveOverview();

    expect(dom.observers.filter((o) => o.connected).length).toBe(1);
    dom.reactCommits();
    expect(dom.outlined?.took, 'and the keyboard is handed over once').toBe(1);
    expect(dom.observers.filter((o) => o.connected)).toEqual([]);
  });
});

describe('the second chord press leaves the same way (Phase 289)', () => {
  it('⇧⌘U on an open page returns the keyboard once the class is gone', async () => {
    const dom = installDom({
      shellClasses: ['shell', 'overview-open'],
      surface: 'split'
    });
    const { toggleOverview } = await loadGestures();

    await toggleOverview('chord');
    expect(store.closeOverview).toHaveBeenCalledTimes(1);
    dom.reactCommits();

    expect(dom.active().name).toBe('outlined-pane');
  });
});

describe('how it waits, read as text (Phase 289)', () => {
  const dir = join(__dirname, '..');
  /** Comments first, so the prose may say what the rule is. */
  const strip = (text: string): string =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const gestures = strip(readFileSync(join(dir, 'open-overview.ts'), 'utf8'));
  const flight = strip(readFileSync(join(dir, 'overview-flight.ts'), 'utf8'));
  const layer = readFileSync(join(dir, 'OverviewLayer.tsx'), 'utf8');
  const app = readFileSync(join(dir, '..', 'app', 'App.tsx'), 'utf8');

  it('never on a timer, and never on a frame', () => {
    expect(gestures).not.toContain('setTimeout');
    expect(gestures).not.toContain('requestAnimationFrame');
    expect(gestures).not.toContain('nextFrame');
    const at = flight.indexOf('export function afterOverviewLeavesTheDom');
    expect(at, 'the wait lives beside the flight').toBeGreaterThan(-1);
    const body = flight.slice(at, flight.indexOf('\n}\n', at));
    expect(body).toContain('new MutationObserver');
    expect(body).not.toContain('setTimeout');
    expect(body).not.toContain('requestAnimationFrame');
    expect(body).not.toMatch(/\bwait\(|frameWithin\(|nextFrame\(/);
  });

  it('names the class App.tsx writes and the layer OverviewLayer.tsx draws', () => {
    expect(app).toContain("${overviewOpen ? ' overview-open' : ''}");
    expect(flight).toContain("'overview-open'");
    expect(layer).toContain('className="overview-layer"');
    expect(gestures).toContain("'.overview-layer'");
  });

  it('leaves the jump out exactly as it was', () => {
    const at = gestures.indexOf('export async function leaveOverviewAndJump');
    expect(at).toBeGreaterThan(-1);
    const body = gestures.slice(at, gestures.indexOf('\n}\n', at));
    expect(body.replace(/\s+/g, ' ')).toBe(
      'export async function leaveOverviewAndJump(sessionId: string): Promise<void> { ' +
        'if (useApp.getState().overview === null) return; ' +
        'leaveOverviewFlight(() => { useApp.getState().closeOverview(); }); ' +
        'await jumpToSession(sessionId);'
    );
  });
});
