/**
 * PHASE 282, findings 4 and 5, and the key repeat the move-on made dangerous.
 * ONE PRESS AT A TIME, AND THE REWIND KEEPS THE KEYBOARD.
 *
 * A rewind is two IPC round trips and the mark does not move until its write
 * has landed, so a second chord inside that window named THE CHANGE BEING
 * REWOUND. The review drove ⌥⌫ then ⌥↩ back to back through the shipping
 * modules: the accept took the change, the rewind still landed, and the change
 * was drawn backwards with nothing said. The same shape lasts longer than the
 * write whenever `adoptWritten` refuses (the tab trailed disk), because then the
 * picture still draws the rewound change until the watcher redraws, about a
 * second later.
 *
 * THE RULE (build/p282/SPEC.md §1): from a rewind's press until the picture no
 * longer draws that change, a rewind naming the same change — by all three of
 * `off`, `del` and `ins` — and EVERY accept on the tab, per change or all, are
 * REFUSED WITH A SENTENCE and touch nothing. It is not held and replayed,
 * because a replayed press acts on a change the person never saw marked
 * (research 83 B.8a) and a per-change accept has no undo. Every accept and not
 * only the rewound change's, because an accept moves the baseline, and a moved
 * baseline moves the rewound change's `off`: the hold would stop recognising
 * it and the next ⌥↩ could take it. A rewind of a DIFFERENT change goes ahead,
 * and is safe: a rewind never moves the baseline and the guarded write refuses
 * the loser of two. The holds live in the view, and `pressRedline` and
 * `pressAccept` read them in the order they already own.
 *
 * WHEN A HOLD LETS GO. A hold whose write is still in the air lets go only when
 * the press answers something other than `wrote`. Once it has landed it lets go
 * at the first redraw that no longer draws the change byte for byte, OR whose
 * tab has read bytes that are neither what it held right after the adoption nor
 * the bytes the write replaced — the second clause is what stops an agent that
 * writes the same phrase again from blocking every accept on the tab, and the
 * `was` exception is what stops a watcher read that opened the file before the
 * rename from letting go too early.
 *
 * A KEY REPEAT IS NOT A PRESS. The move-on turned a held ⌥⌫ into "rewind every
 * change in the file, writing it once per change", and a held ⌥↩ into the
 * accept-all chord keymap.ts removed on purpose. A repeated keydown of a verb is
 * consumed and does nothing; ⌥↓ and ⌥↑ still repeat, because walking writes
 * nothing.
 *
 * What runs is the shipping press, accept, write, journal, composer and editor
 * store. Main is faked as a compare-and-swap in one synchronous step with every
 * IPC step held at a named gate, so the interleaving is chosen rather than hoped
 * for; the view's wiring, which needs a DOM this lane does not have, is read as
 * source at the end, the instrument `conformance:redline` rule 40 uses.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { gatedFs, gmuxBridge } from './p282-gated-fs';

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
/** Every step held: this lane chooses the whole interleaving by name. */
const main = gatedFs(sha, { holdEvery: true });
const disk = main.disk;
/**
 * A step this file names may not have been REACHED yet — the press that causes
 * it is still in the microtask queue — so this waits for it rather than
 * refusing at once. The two rigs that mount React let a step go inside `act`
 * instead, because there the render is what has to be flushed.
 */
async function release(label: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const step = main.take(label);
    if (step !== null) {
      step();
      await new Promise((done) => setTimeout(done, 0));
      return;
    }
    await new Promise((done) => setTimeout(done, 0));
  }
  throw new Error(`nothing is held at ${label}; held: ${main.waiting()}`);
}

vi.mock('../MonacoHost', () => ({ OpeningSkeleton: () => null }));
vi.mock('../live-text', () => ({ useLiveTabText: (_id: string, saved: string) => saved }));
vi.stubGlobal('window', {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  gmux: gmuxBridge(main, { fs: { readImage: vi.fn(), writeFile: vi.fn(), readDir: vi.fn() } })
});
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
vi.stubGlobal('document', { body: { classList: { add() {}, remove() {}, contains: () => false } } });

const { useEditor } = await import('../store');
const { landHold, pressIsHeld, pressRedline, releaseHolds } = await import('../redline-press');
const { pressAccept } = await import('../redline-accept');
const sentences = await import('../redline-sentences');
const { redlineRepeatRuns } = await import('../RedlineDocument');
const { applyRewind } = await import('../redline-write');
const { composeRedlineDocument } = await import('../redline-document');
const { changesOf } = await import('../rewind');
const { NO_BASELINE, nextBaseline, redlineBaseSide } = await import('../baseline');
const { forgetRewindJournal, lastRewind } = await import('../redline-journal');
type EditorTab = import('../store').EditorTab;
type PressedChange = import('../redline-press').PressedChange;
type RewindHold = import('../redline-press').RewindHold;

const BASE = 'The quick brown fox jumps over the lazy dog.\n';
const AGENT = 'The quick red fox leaps over the lazy dog.\n';
const ID = '/repo/notes.txt';

function seed(saved: string, onDisk: string): void {
  main.reset(onDisk);
  forgetRewindJournal(ID);
  const tab = {
    id: ID, path: ID, relPath: 'notes.txt', origRelPath: null, repoPath: '/repo', name: 'notes.txt',
    mode: 'redline', canDiff: true, commit: null, dirty: false, loading: false, truncated: false, error: null,
    preview: false, savedContents: saved, headContents: BASE,
    baseline: nextBaseline(NO_BASELINE, { kind: 'head', contents: BASE }, 1)
  } as Partial<EditorTab> as EditorTab;
  useEditor.setState({ tabs: [tab], activeId: ID, panelOpen: true });
}
const live = (): EditorTab => useEditor.getState().tabs.find((t) => t.id === ID) as EditorTab;

/** The picture the view draws now, as the identities its wrappers carry. */
function picture(): PressedChange[] {
  const t = live();
  const doc = composeRedlineDocument(redlineBaseSide(t.baseline, t.headContents), t.savedContents);
  const generation = t.baseline?.generation ?? 0;
  return changesOf(doc.runs).map((c) => ({ off: c.off, del: c.del, ins: c.ins, generation }));
}

const toasts: string[] = [];
/** The view's `press`: the shipping press with the view's holds, then the adoption and the landing. */
async function viewRewind(held: RewindHold[], pressed: PressedChange | null, kind: 'rewind' | 'undo' = 'rewind'): Promise<string> {
  const t = live();
  const result = await pressRedline(
    kind,
    { id: t.id, root: t.repoPath, path: t.path, baseline: redlineBaseSide(t.baseline, t.headContents), generation: t.baseline?.generation ?? 0, dirty: t.dirty },
    {
      focused: () => pressed,
      apply: applyRewind,
      refuse: (why: Parameters<typeof sentences.redlineRefusalSentence>[0]) => toasts.push(sentences.redlineRefusalSentence(why, t.name)),
      holds: held
    }
  );
  if (result.outcome === 'wrote') {
    useEditor.getState().adoptWritten(t.id, result.contents, result.was);
    if (kind === 'rewind') landHold(held, result.entry, live().savedContents, result.was);
  }
  return result.outcome;
}
/** The view's `accept`, per change or all. `current` is the drawn text, which is savedContents here. */
function viewAccept(held: RewindHold[], pressed: PressedChange | null, kind: 'one' | 'all' = 'one'): string {
  const t = live();
  return pressAccept(
    kind,
    { id: t.id, baseline: redlineBaseSide(t.baseline, t.headContents), generation: t.baseline?.generation ?? 0, current: t.savedContents, truncated: t.truncated },
    {
      focused: () => pressed,
      advance: (contents: string, at: number) => useEditor.getState().acceptBaseline(t.id, contents, at),
      refuse: (why: Parameters<typeof sentences.redlineAcceptRefusalSentence>[0]) => toasts.push(sentences.redlineAcceptRefusalSentence(why, t.name)),
      now: () => Date.now(),
      holds: held
    }
  ).outcome;
}
/** No change in the picture is the inverse of one the agent made: nothing is drawn backwards. */
const backwards = (): PressedChange[] => picture().filter((c) => c.del.includes('red') || c.del.includes('leaps'));

afterEach(() => {
  toasts.length = 0;
});

describe('a second chord while a rewind is being written', () => {
  it('⌥⌫ then ⌥↩ on the same change: the accept is refused and the change is never drawn backwards', async () => {
    seed(AGENT, AGENT);
    const held: RewindHold[] = [];
    const [x, y] = picture();
    const rewind = viewRewind(held, x!);
    await release('read#1');
    // The mark has not moved: the chord names X again.
    expect(pressIsHeld(held, x!)).toBe(true);
    expect(viewAccept(held, x!)).toBe('held');
    await release('write#1');
    expect(await rewind).toBe('wrote');
    expect(live().baseline?.text).toBe(BASE);
    expect(backwards()).toEqual([]);
    // The redraw that no longer draws X lets it go, and the follower is pressable.
    releaseHolds(held, picture(), live().savedContents);
    expect(held).toEqual([]);
    expect(viewAccept(held, y!)).toBe('accepted');
    expect(backwards()).toEqual([]);
  });

  it('⌥⌫ ⌥⌫ on the same change: the second reads nothing and writes nothing', async () => {
    seed(AGENT, AGENT);
    const held: RewindHold[] = [];
    const [x] = picture();
    const first = viewRewind(held, x!);
    // Raced against a short clock, so a press that DID go ahead and is now
    // waiting on a read reads as that rather than as a hung test.
    const second = await Promise.race([
      viewRewind(held, x!),
      new Promise<string>((done) => setTimeout(() => done('went ahead and is waiting on main'), 50))
    ]);
    expect(second).toBe('held');
    await release('read#1');
    await release('write#1');
    expect(await first).toBe('wrote');
    expect({ reads: main.reads, writes: main.writes }).toEqual({ reads: 1, writes: 1 });
    expect(toasts).toEqual([]);
  });

  it('accept-all while any rewind is being written is refused', async () => {
    seed(AGENT, AGENT);
    const held: RewindHold[] = [];
    const [x] = picture();
    const rewind = viewRewind(held, x!);
    expect(viewAccept(held, null, 'all')).toBe('held');
    await release('read#1');
    await release('write#1');
    expect(await rewind).toBe('wrote');
    expect(backwards()).toEqual([]);
  });

  it('an accept of a DIFFERENT change is refused too, because it would move the rewound change out from under its hold', async () => {
    seed(AGENT, AGENT);
    const held: RewindHold[] = [];
    const [x, y] = picture();
    const rewind = viewRewind(held, x!);
    expect(pressIsHeld(held, y!)).toBe(false);
    expect(viewAccept(held, y!)).toBe('held');
    await release('read#1');
    await release('write#1');
    expect(await rewind).toBe('wrote');
    expect(live().baseline?.text).toBe(BASE);
    expect(backwards()).toEqual([]);
  });

  it('a rewind of a DIFFERENT change goes ahead, and nothing is drawn backwards', async () => {
    seed(AGENT, AGENT);
    const held: RewindHold[] = [];
    const [x, y] = picture();
    const first = viewRewind(held, x!);
    const second = viewRewind(held, y!);
    await release('read#1');
    await release('read#2');
    await release('write#1');
    await release('write#2');
    // Both read the same bytes, so the guarded write takes one and refuses
    // the other with the channel's own sentence; neither is `held`.
    expect([await first, await second].sort()).toEqual(['refused', 'wrote']);
    expect(toasts).toEqual(['notes.txt changed as you pressed, so nothing was written. Look again, then rewind.']);
    expect(backwards()).toEqual([]);
  });

  it('WHILE THE PICTURE TRAILS THE WRITE (the adoption refused), the rewound change stays held until the watcher redraws', async () => {
    const onDisk = `${AGENT}An agent's next line.\n`;
    seed(AGENT, onDisk);
    const held: RewindHold[] = [];
    const [x] = picture();
    const rewind = viewRewind(held, x!);
    await release('read#1');
    await release('write#1');
    expect(await rewind).toBe('wrote');
    // The adoption refused, so the picture still draws X byte for byte.
    expect(live().savedContents).toBe(AGENT);
    releaseHolds(held, picture(), live().savedContents);
    expect(viewAccept(held, x!)).toBe('held');
    // A watcher read that opened the file BEFORE the rename answers the bytes
    // the write replaced: X is still drawn, and the hold does not let go.
    useEditor.setState({ tabs: [{ ...live(), savedContents: onDisk }] });
    releaseHolds(held, picture(), live().savedContents);
    expect(viewAccept(held, x!)).toBe('held');
    // The watcher delivers the file as the write left it; the redraw lets X go.
    useEditor.setState({ tabs: [{ ...live(), savedContents: disk.text }] });
    releaseHolds(held, picture(), live().savedContents);
    expect(held).toEqual([]);
    expect(backwards()).toEqual([]);
  });

  it('an agent that writes the SAME phrase again after the rewind does not block every accept on the tab', async () => {
    const onDisk = `${AGENT}An agent's next line.\n`;
    seed(AGENT, onDisk);
    const held: RewindHold[] = [];
    const [x] = picture();
    const rewind = viewRewind(held, x!);
    await release('read#1');
    await release('write#1');
    expect(await rewind).toBe('wrote');
    // The agent, writing from its own copy, puts X back with one more line.
    const again = `${AGENT}An agent's next line.\nAnd another.\n`;
    disk.text = again;
    useEditor.setState({ tabs: [{ ...live(), savedContents: again }] });
    // X is drawn byte for byte, from bytes read AFTER the write: it is the
    // agent's change now, and pressable.
    expect(picture().some((c) => c.off === x!.off && c.del === x!.del && c.ins === x!.ins)).toBe(true);
    releaseHolds(held, picture(), live().savedContents);
    expect(held).toEqual([]);
    expect(viewAccept(held, x!)).toBe('accepted');
  });

  it('CONTROL: a refused rewind holds nothing afterwards, and an undo neither takes nor asks a hold', async () => {
    seed(AGENT, `${AGENT}moved underneath\n`);
    const held: RewindHold[] = [];
    const [x] = picture();
    // The read sees bytes the plan resolves, then the disk moves before the write: stale.
    const rewind = viewRewind(held, x!);
    await release('read#1');
    disk.text = 'something else entirely\n';
    await release('write#1');
    expect(await rewind).toBe('refused');
    expect(held).toEqual([]);
    // Undo reads the journal and never the holds.
    seed(AGENT, AGENT);
    const first = viewRewind(held, x!);
    await release('read#1');
    await release('write#1');
    expect(await first).toBe('wrote');
    expect(lastRewind(ID)).toBeDefined();
    const undo = viewRewind(held, null, 'undo');
    await release('read#2');
    await release('write#2');
    expect(await undo).toBe('wrote');
  });
});

describe('the sentences', () => {
  it('say which verb was refused, in the words the spec fixes', () => {
    expect(sentences.redlineHeldSentence('rewind', 'notes.txt')).toBe('That change in notes.txt is already being rewound.');
    expect(sentences.redlineHeldSentence('accept', 'notes.txt')).toBe('A change in notes.txt is still being rewound, so nothing was accepted.');
  });
});

describe('a key repeat', () => {
  it('walks, and never acts', () => {
    expect(redlineRepeatRuns('next')).toBe(true);
    expect(redlineRepeatRuns('prev')).toBe(true);
    for (const verb of ['rewind', 'undo', 'accept', 'acceptAll'] as const) expect(redlineRepeatRuns(verb)).toBe(false);
  });
});

describe("the view's wiring, read as source", () => {
  const code = readFileSync(resolve(__dirname, '../RedlineDocument.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const body = (open: string): string => {
    const at = code.indexOf(open);
    if (at === -1) return '';
    const next = code.indexOf('useCallback(', at + open.length);
    return code.slice(at, next === -1 ? undefined : next);
  };

  it('both presses hand the holds to the module that owns the order, say the held sentence, and a landed rewind is marked after its adoption', () => {
    const press = body('const press = useCallback(');
    const accept = body('const accept = useCallback(');
    expect(press).toMatch(/pressRedline\([\s\S]*holds:/);
    expect(accept).toMatch(/pressAccept\([\s\S]*holds:/);
    expect(press).toContain('redlineHeldSentence(');
    expect(accept).toContain('redlineHeldSentence(');
    const adopt = press.indexOf('adoptWritten(');
    expect(adopt).toBeGreaterThan(-1);
    expect(press.indexOf('landHold(', adopt)).toBeGreaterThan(adopt);
  });

  it('a layout effect lets go of the holds after every redraw, and re-runs when the tab reads new bytes', () => {
    const effects = code
      .split('useLayoutEffect(')
      .slice(1)
      .map((rest) => rest.slice(0, rest.indexOf(']', rest.indexOf('}, [')) + 1));
    const release = effects.find((effect) => effect.includes('releaseHolds('));
    expect(release).toBeDefined();
    expect(release).toMatch(/\}, \[[^\]]*savedContents[^\]]*\]$/);
  });

  it('a repeated keydown is consumed before it can run a verb', () => {
    const handler = code.slice(code.indexOf('onKeyDown={'), code.indexOf('onFocus={'));
    const prevent = handler.indexOf('event.preventDefault()');
    const repeat = handler.indexOf('event.repeat');
    const run = handler.indexOf('runCommand(command)');
    expect(prevent).toBeGreaterThan(-1);
    expect(repeat).toBeGreaterThan(prevent);
    expect(handler).toContain('redlineRepeatRuns(');
    expect(run).toBeGreaterThan(repeat);
  });

  it('A REWIND KEEPS THE KEYBOARD: the host is focused before the tab adopts the bytes, as the accept does', () => {
    const press = body('const press = useCallback(');
    const wrote = press.indexOf("result.outcome === 'wrote'");
    const focus = press.indexOf('.focus(', wrote);
    const adopt = press.indexOf('adoptWritten(');
    expect(wrote).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(wrote);
    expect(adopt).toBeGreaterThan(focus);
  });
});
