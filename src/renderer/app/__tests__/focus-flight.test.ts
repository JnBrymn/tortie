/**
 * Session focus, the flight (Phase 80.1).
 *
 * What these tests hold, and why each one is here rather than in a
 * screenshot:
 *
 *  - the destination measurement leaves the shell's classes exactly as it
 *    found them, in BOTH directions. If it did not, the shell would be left
 *    in a state React never rendered;
 *  - the two refusals are the two sentences the spec wrote, and neither
 *    changes any state;
 *  - reduced motion appends nothing and flips the store in the same task;
 *  - the First Last Invert Play transform is arithmetic, so it is compared
 *    against numbers rather than described;
 *  - the keyframes name only `transform`. This is the guard on the sentence
 *    that is the whole design. A keyframe naming a layout property would
 *    resize live tmux sessions sixty times inside one gesture, and no unit
 *    test downstream of it would notice;
 *  - a full enter and a full leave put the surface's `visibility` back and
 *    take the photograph out of the document again;
 *  - the leave's arrival class goes on at the swap and comes off again after
 *    the fade. Left behind, its finished animation would hold the chrome at
 *    opacity 1 and the next enter would not fade;
 *  - a split group whose leaves are ALL waiting to be restored is refused.
 *    The DOM gate cannot see that, because TerminalRegion writes
 *    `data-surface-leaves` for every group whatever its leaves are doing;
 *  - the work's frame (Phase 284) is read at the ONE end of the flight that
 *    has one, inside the toggle the destination already pays for. A second
 *    toggle is a second forced layout inside the gesture, and the frame read
 *    at the wrong end is the whole window, which rounds nothing.
 *
 * The vitest environment is node and jsdom is not a dependency of this
 * repository, so the DOM is a hand built stub and the copy builder is mocked.
 * That is the right seam anyway. This module owns the SEQUENCE and
 * ./focus-copy.ts owns the pixels, and each is tested where it lives.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The stubs
// ---------------------------------------------------------------------------

interface FakeSession {
  id: string;
  status: string;
}

const store = {
  sessionFocus: false,
  setSessionFocus: vi.fn((on: boolean) => {
    store.sessionFocus = on;
  }),
  toast: vi.fn(),
  active: null as FakeSession | null,
  /** Every session this window knows about, as the real slice holds them. */
  sessions: [] as FakeSession[],
  /** The leaves TerminalRegion says it drew, which is what the gate reads. */
  visibleSessionIds: [] as string[],
  activeSession(): FakeSession | null {
    return store.active;
  }
};

/** Put a set of leaves on screen, in one line, for the refusal tests. */
function leaves(...rows: [string, string][]): void {
  store.sessions = rows.map(([id, status]) => ({ id, status }));
  store.visibleSessionIds = rows.map(([id]) => id);
}

vi.mock('../../state/store', () => ({
  useApp: { getState: () => store },
  effectiveStatusOf: (s: FakeSession) => s.status
}));

/** What the mocked copy builder hands back on the next call. */
const copyPlan = {
  node: null as ReturnType<typeof makeCopyNode> | null,
  throws: false
};

const buildStillCopy = vi.fn(() => {
  if (copyPlan.throws) throw new Error('no 2d context');
  return Promise.resolve(
    copyPlan.node === null ? null : { node: copyPlan.node, leaves: [] }
  );
});

vi.mock('../focus-copy', () => ({ buildStillCopy }));

function makeCopyNode(): {
  animate: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    animate: vi.fn(() => ({ finished: Promise.resolve() })),
    remove: vi.fn()
  };
}

/**
 * A `classList` that answers add, remove and contains, and nothing else. It
 * keeps a log of every write, because "one toggle" is a claim about how many
 * times the class attribute was written and not about where it ended up.
 */
function classList(initial: string[] = []): {
  add(name: string): void;
  remove(name: string): void;
  contains(name: string): boolean;
  names(): string[];
  writes(): string[];
} {
  const held = new Set(initial);
  const log: string[] = [];
  return {
    add: (name) => {
      log.push(`+${name}`);
      held.add(name);
    },
    remove: (name) => {
      log.push(`-${name}`);
      held.delete(name);
    },
    contains: (name) => held.has(name),
    names: () => [...held],
    writes: () => [...log]
  };
}

const FIRST = { left: 220, top: 74, width: 800, height: 600 };
const LAST = { left: 0, top: 38, width: 1440, height: 862 };
/**
 * `.work-area` while the chrome is drawn (Phase 284): it starts one 36px band
 * above the surface and shares its left, right and bottom edges. With either
 * focus class on the shell its gutters are gone and it is the whole window
 * under the title band, which is `LAST`.
 */
const FRAME = { left: 220, top: 38, width: 800, height: 636 };

/** Install a document whose surface answers `first` before the class flips. */
function installDom(opts: {
  surface: boolean;
  shellClasses?: string[];
  reducedMotion?: boolean;
  /**
   * Phase 284. Give the surface a `.work-area` above it and let the two frame
   * tokens be read. Off by default, which is every case written before the
   * frame existed: a surface with no `closest` and a radius of zero.
   */
  framed?: boolean;
}): {
  shell: {
    classList: ReturnType<typeof classList>;
    attrs: Record<string, string>;
  };
  surface: { style: Record<string, string> };
  frame: { reads: () => number };
  appended: unknown[];
} {
  // `attrs` is separate from `classList` on purpose, and the separation is
  // the point of the arrival marker. React owns the shell's class attribute
  // and rewrites the whole string at the swap, so a hand added class does not
  // survive the very moment the arrival needs it.
  const attrs: Record<string, string> = {};
  const shell = {
    classList: classList(opts.shellClasses ?? []),
    attrs,
    setAttribute: (name: string, value: string) => {
      attrs[name] = value;
    },
    removeAttribute: (name: string) => {
      delete attrs[name];
    }
  };
  // The surface is small while the chrome is drawn and fills the window once
  // either focus class is on the shell, which is what the real stylesheet
  // does and what makes the destination measurement meaningful here.
  const focusedNow = (): boolean =>
    shell.classList.contains('gmux-focus-measure') ||
    shell.classList.contains('session-focus');
  let frameReads = 0;
  const frame = {
    reads: (): number => frameReads,
    getBoundingClientRect: (): typeof FIRST => {
      frameReads += 1;
      return focusedNow() ? LAST : FRAME;
    }
  };
  const surface: {
    style: Record<string, string>;
    getBoundingClientRect: () => typeof FIRST;
    closest?: (sel: string) => unknown;
  } = {
    style: {} as Record<string, string>,
    getBoundingClientRect: (): typeof FIRST => (focusedNow() ? LAST : FIRST)
  };
  if (opts.framed === true) {
    surface.closest = (sel: string) => (sel === '.work-area' ? frame : null);
  }
  const appended: unknown[] = [];
  vi.stubGlobal('document', {
    documentElement: {},
    body: {
      appendChild: (node: unknown) => {
        appended.push(node);
      }
    },
    querySelector: (sel: string) => {
      if (sel === '.shell') return shell;
      if (sel === '[data-surface-leaves]') return opts.surface ? surface : null;
      return null;
    }
  });
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: opts.reducedMotion === true })
  });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => {
      if (name === '--dur-panel') return '200ms';
      if (opts.framed === true && name === '--r-frame') return ' 14px';
      if (opts.framed === true && name === '--frame-edge') return ' 1px';
      return 'cubic-bezier(0.2, 0, 0, 1)';
    }
  }));
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    setTimeout(() => {
      cb(0);
    }, 0);
    return 0;
  });
  return { shell, surface, frame, appended };
}

const {
  everyLeafNeedsRestore,
  focusRefusal,
  frameInnerRadius,
  framedEnd,
  invertTransform,
  measureFocusRect,
  measureFocusRects,
  toggleSessionFocus,
  ARRIVE_ATTR,
  NOTHING_TO_FOCUS,
  RESTORE_FIRST
} = await import('../focus-flight');

beforeEach(() => {
  store.sessionFocus = false;
  store.active = null;
  store.sessions = [];
  store.visibleSessionIds = [];
  store.setSessionFocus.mockClear();
  store.toast.mockClear();
  buildStillCopy.mockClear();
  copyPlan.node = null;
  copyPlan.throws = false;
});

// ---------------------------------------------------------------------------

describe('measureFocusRect', () => {
  it('borrows the measure class and gives it back', () => {
    const { shell, surface } = installDom({ surface: true });
    const rect = measureFocusRect(
      shell as unknown as HTMLElement,
      surface as unknown as Element,
      'focused'
    );
    expect(rect).toEqual(LAST);
    expect(shell.classList.contains('gmux-focus-measure')).toBe(false);
    expect(shell.classList.names()).toEqual([]);
  });

  it('drops the focus class and puts it back on the way out', () => {
    const { shell, surface } = installDom({
      surface: true,
      shellClasses: ['session-focus']
    });
    const rect = measureFocusRect(
      shell as unknown as HTMLElement,
      surface as unknown as Element,
      'ordinary'
    );
    // Chrome back means the surface is small again, which is the destination.
    expect(rect).toEqual(FIRST);
    expect(shell.classList.contains('session-focus')).toBe(true);
    expect(shell.classList.contains('gmux-focus-measure')).toBe(false);
  });

  it('does not invent a focus class the shell never had', () => {
    const { shell, surface } = installDom({ surface: true });
    measureFocusRect(
      shell as unknown as HTMLElement,
      surface as unknown as Element,
      'ordinary'
    );
    expect(shell.classList.names()).toEqual([]);
  });
});

// PHASE 284. A leave needs the surface's destination AND the frame's, and both
// must come out of ONE toggle: every toggle is a forced layout inside the
// gesture, and the whole design is that the gesture forces exactly one.
describe('measureFocusRects', () => {
  it('reads two elements inside ONE toggle on the way in', () => {
    const { shell, surface, frame } = installDom({ surface: true, framed: true });
    const rects = measureFocusRects(
      shell as unknown as HTMLElement,
      [surface, frame] as unknown as Element[],
      'focused'
    );
    // Both were read with the measure class ON: the frame's gutters are gone.
    expect(rects).toEqual([LAST, LAST]);
    expect(shell.classList.writes()).toEqual([
      '+gmux-focus-measure',
      '-gmux-focus-measure'
    ]);
    expect(shell.classList.names()).toEqual([]);
  });

  it('reads two elements inside ONE toggle on the way out, and restores the class', () => {
    const { shell, surface, frame } = installDom({
      surface: true,
      framed: true,
      shellClasses: ['session-focus']
    });
    const rects = measureFocusRects(
      shell as unknown as HTMLElement,
      [surface, frame] as unknown as Element[],
      'ordinary'
    );
    // Chrome back: the surface is small again and the frame has its gutters.
    expect(rects).toEqual([FIRST, FRAME]);
    expect(shell.classList.writes()).toEqual([
      '-session-focus',
      '+session-focus'
    ]);
    expect(shell.classList.names()).toEqual(['session-focus']);
  });

  it('answers in the order it was asked, and with nothing for nothing', () => {
    const { shell, surface, frame } = installDom({ surface: true, framed: true });
    expect(
      measureFocusRects(
        shell as unknown as HTMLElement,
        [frame, surface] as unknown as Element[],
        'ordinary'
      )
    ).toEqual([FRAME, FIRST]);
    expect(
      measureFocusRects(shell as unknown as HTMLElement, [], 'focused')
    ).toEqual([]);
    expect(shell.classList.names()).toEqual([]);
  });

  it('is what measureFocusRect is made of, so the two cannot disagree', () => {
    const { shell, surface } = installDom({ surface: true });
    const one = measureFocusRect(
      shell as unknown as HTMLElement,
      surface as unknown as Element,
      'focused'
    );
    const [many] = measureFocusRects(
      shell as unknown as HTMLElement,
      [surface] as unknown as Element[],
      'focused'
    );
    expect(one).toEqual(many);
  });
});

describe('the work’s frame', () => {
  it('reads the inner radius from the two tokens the frame is drawn with', () => {
    installDom({ surface: true, framed: true });
    expect(frameInnerRadius()).toBe(13);
  });

  it('answers zero where the tokens cannot be read, which is a square copy', () => {
    // The default stub answers every unknown name with the easing curve.
    installDom({ surface: true });
    expect(frameInnerRadius()).toBe(0);
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('no computed style');
    });
    expect(frameInnerRadius()).toBe(0);
  });

  it('never invents a radius from the edge alone, or a negative one', () => {
    const answer = (frame: string, edge: string): number => {
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: (name: string) =>
          name === '--r-frame' ? frame : name === '--frame-edge' ? edge : ''
      }));
      return frameInnerRadius();
    };
    installDom({ surface: true });
    expect(answer('', '1px')).toBe(0);
    expect(answer('1px', '4px')).toBe(0);
    // An unreadable edge leaves the outer radius, which is the curve of the
    // line itself and is the closest honest answer.
    expect(answer('14px', '')).toBe(14);
  });

  it('frames an enter at `first` and a leave at `last`', () => {
    expect(framedEnd('focused', FRAME, LAST, 13)).toEqual({
      frame: FRAME,
      end: 'first',
      radius: 13
    });
    expect(framedEnd('ordinary', LAST, FRAME, 13)).toEqual({
      frame: FRAME,
      end: 'last',
      radius: 13
    });
  });

  it('hands the copy nothing when there is no frame or no radius', () => {
    expect(framedEnd('focused', null, LAST, 13)).toBeUndefined();
    expect(framedEnd('ordinary', LAST, null, 13)).toBeUndefined();
    expect(framedEnd('focused', FRAME, LAST, 0)).toBeUndefined();
    expect(framedEnd('focused', FRAME, LAST, Number.NaN)).toBeUndefined();
  });
});

describe('refusing', () => {
  it('says there is no session when no surface is on screen', async () => {
    installDom({ surface: false });
    expect(focusRefusal()).toBe(NOTHING_TO_FOCUS);
    await toggleSessionFocus();
    expect(store.setSessionFocus).not.toHaveBeenCalled();
    expect(store.toast.mock.calls).toEqual([['info', NOTHING_TO_FOCUS]]);
  });

  it('names the restore when the selected session is restorable', async () => {
    installDom({ surface: false });
    store.active = { id: 's1', status: 'restorable' };
    expect(focusRefusal()).toBe(RESTORE_FIRST);
    await toggleSessionFocus();
    expect(store.setSessionFocus).not.toHaveBeenCalled();
    expect(store.toast.mock.calls).toEqual([['info', RESTORE_FIRST]]);
  });

  it('names the restore for an ended session too', () => {
    installDom({ surface: false });
    store.active = { id: 's1', status: 'exited' };
    expect(focusRefusal()).toBe(RESTORE_FIRST);
  });

  it('refuses nothing while a surface with a live leaf is drawn', () => {
    installDom({ surface: true });
    store.active = { id: 's1', status: 'restorable' };
    leaves(['s1', 'idle']);
    expect(focusRefusal()).toBeNull();
  });

  // The split-group hole. `[data-surface-leaves]` is written by TerminalRegion
  // for every group whatever its leaves are doing, so the DOM gate alone let
  // four restorable sessions fill the window with four Restore cards under an
  // empty title band. Measured live on 2026-08-18.
  it('refuses a split group whose every leaf is waiting to be restored', async () => {
    installDom({ surface: true });
    store.active = { id: 'a', status: 'restorable' };
    leaves(
      ['a', 'restorable'],
      ['b', 'restorable'],
      ['c', 'exited'],
      ['d', 'restorable']
    );
    expect(focusRefusal()).toBe(RESTORE_FIRST);
    await toggleSessionFocus();
    expect(store.setSessionFocus).not.toHaveBeenCalled();
    expect(store.toast.mock.calls).toEqual([['info', RESTORE_FIRST]]);
  });

  it('allows a split group with one live leaf among five dead ones', () => {
    installDom({ surface: true });
    leaves(
      ['a', 'restorable'],
      ['b', 'exited'],
      ['c', 'restorable'],
      ['d', 'exited'],
      ['e', 'restorable'],
      ['f', 'running']
    );
    expect(everyLeafNeedsRestore(['restorable', 'running'])).toBe(false);
    expect(focusRefusal()).toBeNull();
  });

  it('treats an unreadable leaf list as no answer rather than as a refusal', () => {
    installDom({ surface: true });
    // The attribute is on screen and the store has not caught up. Refusing
    // here would mean the mode says "restore this first" about a session it
    // cannot see, which is worse than opening.
    expect(everyLeafNeedsRestore([])).toBe(false);
    expect(focusRefusal()).toBeNull();
  });
});

describe('reduced motion', () => {
  it('flips the store in the same task and photographs nothing', () => {
    const { appended } = installDom({ surface: true, reducedMotion: true });
    void toggleSessionFocus();
    // No await between the call and this line, so the flip was synchronous.
    expect(store.setSessionFocus.mock.calls).toEqual([[true]]);
    expect(appended).toEqual([]);
    expect(buildStillCopy).not.toHaveBeenCalled();
  });
});

describe('invertTransform', () => {
  it('is the ordinary First Last Invert Play arithmetic', () => {
    expect(invertTransform(FIRST, LAST)).toBe(
      'translate(220px, 36px) scale(0.5556, 0.6961)'
    );
  });

  it('answers with an identity scale for a destination with no size', () => {
    expect(
      invertTransform(FIRST, { left: 0, top: 0, width: 0, height: 0 })
    ).toBe('translate(220px, 74px) scale(1, 1)');
  });
});

describe('the arrival marker', () => {
  it('is an attribute, because React would erase a class', () => {
    // App.tsx renders `className={`shell${sessionFocus ? ' session-focus' :
    // ''}`}`, so the swap changes that string and React writes the whole
    // class attribute. Measured on 2026-08-18 with a class: over a leave the
    // sidebar read `shell session-focus gmux-focusing` at opacity 0 and then
    // `shell` at opacity 1 in the next frame, class gone, no fade at all.
    expect(ARRIVE_ATTR.startsWith('data-')).toBe(true);
    const source = readFileSync(
      join(__dirname, '..', 'focus-flight.ts'),
      'utf8'
    );
    expect(source).toContain('setAttribute(ARRIVE_ATTR');
    expect(source).not.toContain('classList.add(ARRIVE_ATTR');
  });
});

describe('the keyframes', () => {
  /** The text of every `animate(` call in the module, parentheses balanced. */
  function animateCalls(source: string): string[] {
    const out: string[] = [];
    let at = source.indexOf('.animate(');
    while (at !== -1) {
      let depth = 0;
      let i = source.indexOf('(', at);
      const start = i;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      out.push(source.slice(start, i + 1));
      at = source.indexOf('.animate(', i);
    }
    return out;
  }

  it('names no layout property anywhere inside an animate call', () => {
    const source = readFileSync(
      join(__dirname, '..', 'focus-flight.ts'),
      'utf8'
    );
    const calls = animateCalls(source);
    expect(calls).toHaveLength(1);
    for (const call of calls) {
      for (const banned of [
        'width',
        'height',
        'left',
        'top',
        'right',
        'bottom',
        'flex',
        'inset',
        'margin',
        'padding'
      ]) {
        expect(call, `animate() must not name ${banned}`).not.toContain(banned);
      }
      expect(call).toContain('transform');
    }
  });
});

describe('a whole gesture', () => {
  it('appends the photograph, hides the surface, then puts both back', async () => {
    const { shell, surface, appended } = installDom({ surface: true });
    const node = makeCopyNode();
    copyPlan.node = node;

    await toggleSessionFocus();

    expect(appended).toEqual([node]);
    expect(node.animate).toHaveBeenCalledTimes(1);
    expect(store.setSessionFocus.mock.calls).toEqual([[true]]);
    // The chrome is fading OUT under the photograph on the way in, so the
    // arrival class must not be on the root. If it were, its `both` fill
    // would pin every region at opacity 1 and nothing would fade at all.
    expect(shell.attrs[ARRIVE_ATTR]).toBeUndefined();
    // Two frames pass between the swap and the tidy up, so the assertions
    // below wait for them the same way the module does.
    await new Promise((r) => setTimeout(r, 20));
    expect(surface.style['visibility']).toBe('');
    expect(node.remove).toHaveBeenCalledTimes(1);
  });

  it('flies back out and leaves nothing behind', async () => {
    const { shell, surface, appended } = installDom({
      surface: true,
      shellClasses: ['session-focus']
    });
    store.sessionFocus = true;
    const node = makeCopyNode();
    copyPlan.node = node;

    await toggleSessionFocus();
    await new Promise((r) => setTimeout(r, 20));

    expect(appended).toEqual([node]);
    expect(store.setSessionFocus.mock.calls).toEqual([[false]]);
    expect(surface.style['visibility']).toBe('');
    expect(node.remove).toHaveBeenCalledTimes(1);
    expect(shell.classList.contains('gmux-focusing')).toBe(false);
    // The leave's fade in. The chrome is only DRAWN at the swap, so this is
    // the first moment it can be animated, and the class carries the
    // animation that does it.
    expect(shell.attrs[ARRIVE_ATTR]).toBe('');
  });

  it('takes the arrival class off again once the fade has run', async () => {
    const { shell } = installDom({
      surface: true,
      shellClasses: ['session-focus']
    });
    store.sessionFocus = true;
    copyPlan.node = makeCopyNode();

    await toggleSessionFocus();
    await new Promise((r) => setTimeout(r, 400));

    // A class left behind would survive into the NEXT enter, where its
    // finished `both` fill would hold the chrome at opacity 1 and stop it
    // fading out.
    expect(shell.attrs[ARRIVE_ATTR]).toBeUndefined();
  });

  // PHASE 284. The copy is handed the frame at the framed end of the flight.
  /** The fifth argument of the one `buildStillCopy` call this gesture made. */
  function framedArgument(): unknown {
    expect(buildStillCopy).toHaveBeenCalledTimes(1);
    const args = buildStillCopy.mock.calls[0] as unknown as unknown[];
    // The fourth is left undefined on purpose, so the copy resolves the
    // terminal's own background exactly as it did before there was a fifth.
    expect(args[3]).toBeUndefined();
    return args[4];
  }

  it('hands the copy the frame as it is NOW on an enter, in one toggle', async () => {
    const { shell, frame } = installDom({ surface: true, framed: true });
    copyPlan.node = makeCopyNode();

    await toggleSessionFocus();

    // Read before anything toggled, so it still has its gutters and its band.
    expect(framedArgument()).toEqual({ frame: FRAME, end: 'first', radius: 13 });
    const measures = shell.classList
      .writes()
      .filter((w) => w.endsWith('gmux-focus-measure'));
    expect(measures).toEqual(['+gmux-focus-measure', '-gmux-focus-measure']);
    // Read ONCE, and outside the toggle: `first` had already forced that
    // layout, so the frame cost the enter no layout of its own.
    expect(frame.reads()).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
  });

  it('hands the copy the frame as it WILL BE on a leave, in one toggle', async () => {
    const { shell, frame } = installDom({
      surface: true,
      framed: true,
      shellClasses: ['session-focus']
    });
    store.sessionFocus = true;
    copyPlan.node = makeCopyNode();

    await toggleSessionFocus();

    // Read ONCE, inside the toggle the destination already pays for.
    expect(frame.reads()).toBe(1);
    // The mode is on, so the frame NOW is the whole window with no gutters.
    // What the copy needs is the frame at the destination.
    expect(framedArgument()).toEqual({ frame: FRAME, end: 'last', radius: 13 });
    const focusWrites = shell.classList
      .writes()
      .filter((w) => w.endsWith('session-focus'));
    expect(focusWrites).toEqual(['-session-focus', '+session-focus']);
    await new Promise((r) => setTimeout(r, 20));
  });

  it('hands the copy nothing when the surface has no frame above it', async () => {
    // Every double written before Phase 284: a plain object with no `closest`.
    const { surface, frame } = installDom({ surface: true });
    expect('closest' in surface).toBe(false);
    copyPlan.node = makeCopyNode();

    await toggleSessionFocus();

    expect(framedArgument()).toBeUndefined();
    expect(frame.reads()).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
  });

  it('goes straight to the swap when the photograph cannot be taken', async () => {
    const { appended } = installDom({ surface: true });
    copyPlan.throws = true;
    await toggleSessionFocus();
    expect(appended).toEqual([]);
    expect(store.setSessionFocus.mock.calls).toEqual([[true]]);
  });
});
