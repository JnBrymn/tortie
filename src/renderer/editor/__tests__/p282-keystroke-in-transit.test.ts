/**
 * PHASE 282, finding 7. A KEYSTROKE STILL IN TRANSIT IS VISIBLE TO THE REWIND.
 *
 * `useRedlineTyping` (./redline-edits) marked the tab dirty only AFTER
 * `await ensureWorkingModel`, and the first keystroke of a session makes that
 * await a real Monaco chunk load. PR 28's `adoptWritten` refuses a DIRTY tab,
 * and inside that await the tab was not dirty yet, so a rewind that landed
 * there was adopted: `savedContents` moved to the rewound bytes, and then the
 * keystroke's continuation built the model from the text it had captured
 * BEFORE the await and applied the pre-rewind text plus the keystroke. ⌘S read
 * a buffer whose precondition was the adopted bytes, the guarded write had
 * nothing to refuse, and the agent's text went back over the rewind with no
 * question. Main has a narrower version of the same window (only when the
 * chunk load outlasts the watcher's round trip); the adoption widened it to the
 * rewind's own round trip.
 *
 * The fix is ./redline-edits' three clauses in build/p282/SPEC.md: the tab is
 * dirty the moment an edit is dispatched, the model is built from
 * `savedContents` read after the await, and a wanted text computed on a
 * picture that was replaced during the await is never applied.
 *
 * Everything that runs is the shipping code (./p282-typing-rig). The first two
 * arms are the two orders a person can make: a rewind already writing when the
 * key is struck, and a key already struck when the rewind is pressed. The
 * third moves `savedContents` directly. The fourth draws a keystroke and an
 * adoption in one render, which is the only shape that observes the order of
 * the hook's effects, and the fifth is the mark's own undoing when the chunk
 * never loads. The last two are the first arm's other finishers: auto save in
 * place of ⌘S, and main's own narrower window, a watcher tick over an agent's
 * write while the first keystroke waits on the chunk.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT, HEAD, ROOT, mountTypingRig } from './p282-typing-rig';

const caret = vi.hoisted(() => ({ at: 0 }));
/** The store's own watcher subscription, so a test fires the real `refreshRepo`. */
const watcher = vi.hoisted(() => ({ fire: null as null | ((repoPath: string) => void) }));
vi.mock('../../state/repo-changed', async (orig) => ({
  ...(await orig<typeof import('../../state/repo-changed')>()),
  onRepoChanged: (listener: (repoPath: string) => void) => {
    watcher.fire = listener;
    return () => undefined;
  }
}));
vi.mock('../redline-caret', async (orig) => ({
  ...(await orig<typeof import('../redline-caret')>()),
  spanOfInput: () => ({ anchor: caret.at, focus: caret.at }),
  readCurrentSelection: () => ({ anchor: caret.at, focus: caret.at }),
  restoreCurrentSelection: (_root: unknown, want: { focus: number }) => {
    caret.at = want.focus;
  },
  changeAtCaret: () => null
}));

let unmount: (() => Promise<void>) | null = null;
afterEach(async () => {
  await unmount?.();
  unmount = null;
});

/** Rewinding the agent's one change puts HEAD's word back. */
const REWOUND = HEAD;
const KEY_AT = AGENT.indexOf('Beta') + 4;

describe('a keystroke in transit before the model exists', () => {
  it('a rewind ADOPTED inside the chunk load is not undone by the next ⌘S, and the keystroke is kept', async () => {
    caret.at = KEY_AT;
    const rig = await mountTypingRig({ caret, holdChunk: true, modelFirst: false });
    unmount = rig.unmount;
    // ⌥⌫ on a clean tab, its write held in the air.
    rig.hold('write#1');
    const rewind = rig.rewindAgentChange();
    await rig.settle();
    // The first keystroke of the session, while that write is held: its
    // continuation now waits on the Monaco chunk.
    await rig.type('X');
    // The write lands and RedlineDocument's adoption runs, still inside the
    // chunk load.
    await rig.release('write#1');
    expect((await rewind).outcome).toBe('wrote');
    expect(rig.disk.text).toBe(REWOUND);
    // The chunk lands, the keystroke's continuation runs, and the person saves.
    await rig.releaseChunk();
    await rig.save();
    await rig.settle();
    const reading = {
      diskIsRewound: rig.disk.text === REWOUND || rig.disk.text === `${REWOUND.slice(0, KEY_AT)}X${REWOUND.slice(KEY_AT)}`,
      keystrokeInBuffer: (rig.model() ?? '').includes('X'),
      // Not silent: either the keystroke went down ON the rewind, or ⌘S asked.
      wroteOrAsked: rig.disk.text.includes('X') || rig.confirmTitle() !== null
    };
    expect(reading).toEqual({ diskIsRewound: true, keystrokeInBuffer: true, wroteOrAsked: true });
  });

  it('a rewind PRESSED after the keystroke, before its model exists, is refused with the dirty sentence', async () => {
    caret.at = KEY_AT;
    const rig = await mountTypingRig({ caret, holdChunk: true, modelFirst: false });
    unmount = rig.unmount;
    await rig.type('X');
    // The tab must already say what the person did: that is the whole of
    // research 83 E.6's refusal, and it cannot answer a flag set after an
    // await.
    expect(rig.tab().dirty).toBe(true);
    const pressed = rig.rewindAgentChange();
    await rig.settle();
    expect(await pressed).toEqual({
      outcome: 'refused',
      toasts: ['Save or undo your edits to doc.md first, then rewind.']
    });
    expect(rig.disk).toEqual({ text: AGENT, writes: 0 });
    await rig.releaseChunk();
    expect(rig.model()).toBe(`${AGENT.slice(0, KEY_AT)}X${AGENT.slice(KEY_AT)}`);
  });

  it('a picture REPLACED while the chunk loads is never written back over the bytes that replaced it', async () => {
    // The tripwire behind the first arm. With the tab dirty the moment the
    // key is struck, neither `adoptWritten` nor `refreshRepo` can move
    // `savedContents` inside the await, and no other path does today; this
    // arm moves it DIRECTLY, standing for whatever path a later round adds,
    // and asks the other two clauses: the model is built from the bytes the
    // tab holds after the await, and the text typed on the replaced picture
    // is not applied over them. The keystroke the replaced picture carried is
    // gone from the face by then, which is the stated cost.
    caret.at = KEY_AT;
    const rig = await mountTypingRig({ caret, holdChunk: true, modelFirst: false });
    unmount = rig.unmount;
    await rig.type('X');
    rig.disk.text = REWOUND;
    rig.replaceSaved(REWOUND);
    await rig.settle();
    await rig.releaseChunk();
    expect({ model: rig.model(), dirty: rig.tab().dirty }).toEqual({ model: REWOUND, dirty: false });
    await rig.save();
    expect(rig.disk.text).toBe(REWOUND);
  });

  // The order of the hook's effects, observed. The edit reads the picture it
  // was typed on from `lastLive`, and the outside-write effect moves
  // `lastLive`; when both arrive in one render and the outside-write effect
  // runs first, the edit is taken as typed on the ADOPTED bytes, the
  // replaced-picture clause lets the pre-rewind text plus the keystroke
  // through, and ⌘S writes it over the rewind with nothing to ask. The adoption
  // goes ahead here because the tab is still clean when it runs: the keystroke
  // is React state, not yet drawn, so nothing has marked it.
  //
  // THE FILE VIEW ARM IS A CONTROL, green at 9217ae0d and with the effect order
  // reversed. There the adoption's `resetWorkingModel` fires the hook's own
  // model listener synchronously, which queues the outside write BEHIND the
  // keystroke in the same batch, so the edit effect already reads the rewound
  // text as the one to write. It stays so the arm that discriminates is not
  // mistaken for a statement about every tab.
  for (const modelFirst of [false, true]) {
    const shape = modelFirst ? 'a File view made the model' : 'the keystroke makes the model';
    it(`a keystroke and an adoption DRAWN IN ONE RENDER apply nothing typed on the replaced picture (${shape})`, async () => {
      caret.at = KEY_AT;
      const rig = await mountTypingRig({ caret, holdChunk: !modelFirst, modelFirst });
      unmount = rig.unmount;
      rig.hold('write#1');
      const rewind = rig.rewindAgentChange();
      await rig.settle();
      await rig.typeReleasing('X', 'write#1');
      expect((await rewind).outcome).toBe('wrote');
      // The shape this arm exists for, asserted rather than assumed: the
      // adoption landed, so the keystroke and it shared a render.
      expect(rig.tab().savedContents).toBe(REWOUND);
      await rig.releaseChunk();
      await rig.save();
      await rig.settle();
      expect({ disk: rig.disk.text, model: rig.model(), dirty: rig.tab().dirty }).toEqual({
        disk: REWOUND,
        model: REWOUND,
        dirty: false
      });
    });
  }

  it('a chunk that FAILS to load withdraws the dirty mark the keystroke made, and says the edit was not kept', async () => {
    // The mark is made before the await so a rewind can see the keystroke.
    // With no chunk there is no buffer for it to be in, and a tab left dirty
    // over nothing would refuse every rewind ("save or undo your edits
    // first") with nothing a person could save or undo.
    caret.at = KEY_AT;
    const rig = await mountTypingRig({ caret, holdChunk: true, modelFirst: false, failChunk: true });
    unmount = rig.unmount;
    await rig.type('X');
    expect(rig.tab().dirty).toBe(true);
    await rig.releaseChunk();
    expect({ dirty: rig.tab().dirty, model: rig.model(), toasts: rig.toasts() }).toEqual({
      dirty: false,
      model: null,
      toasts: ['The editor failed to load, so this edit was not kept.']
    });
  });

  it('a rewind adopted-refused under a keystroke in transit is not written back by AUTO SAVE either', async () => {
    // The first arm with Phase 268's timer as the finisher. At 9217ae0d the
    // timer wrote the agent's text plus the keystroke over the rewind, with no
    // toast and no dialog. A timer is never the one to overwrite: it stops,
    // and says so.
    caret.at = KEY_AT;
    const rig = await mountTypingRig({ caret, holdChunk: true, modelFirst: false });
    unmount = rig.unmount;
    rig.setAutoSave({ mode: 'afterDelay', delayMs: 250 });
    rig.hold('write#1');
    const rewind = rig.rewindAgentChange();
    await rig.settle();
    await rig.type('X');
    await rig.release('write#1');
    expect((await rewind).outcome).toBe('wrote');
    await rig.releaseChunk();
    await rig.wait(700);
    expect({ disk: rig.disk.text, model: rig.model(), dirty: rig.tab().dirty }).toEqual({
      disk: REWOUND,
      model: `${AGENT.slice(0, KEY_AT)}X${AGENT.slice(KEY_AT)}`,
      dirty: true
    });
  });

  it("a watcher tick over an AGENT'S write while the first keystroke waits on the chunk is not saved over", async () => {
    // Main's narrower version of the first arm, named by the Phase 282 entry.
    // The tab was clean inside the chunk load, so the tick reloaded it with
    // the agent's new line, the continuation then applied the text it had
    // captured before the load, and ⌘S wrote it over the agent's line with
    // `savedContents` as its precondition. Dirty from the keystroke, the tick
    // skips the tab and ⌘S asks.
    caret.at = KEY_AT;
    const rig = await mountTypingRig({ caret, holdChunk: true, modelFirst: false });
    unmount = rig.unmount;
    await rig.init();
    await rig.type('X');
    const agentAgain = `${AGENT}Gamma, a line the agent added.\n`;
    rig.disk.text = agentAgain;
    await rig.tick(ROOT, watcher.fire!);
    expect({ saved: rig.tab().savedContents, dirty: rig.tab().dirty }).toEqual({ saved: AGENT, dirty: true });
    await rig.releaseChunk();
    await rig.save();
    expect({ disk: rig.disk.text, asked: rig.confirmTitle() !== null }).toEqual({ disk: agentAgain, asked: true });
  });
});

