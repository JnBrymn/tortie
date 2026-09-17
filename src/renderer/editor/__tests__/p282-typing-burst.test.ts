/**
 * PHASE 282, finding 1 (BLOCKING). A BURST OF TYPING IN THE REDLINE VIEW COMES
 * OUT IN THE ORDER IT WAS TYPED.
 *
 * PR 28 made ./live-text return `getWorkingModel(tabId)?.getValue()` at render.
 * `useRedlineTyping` writes the model after an await, so the render of the NEXT
 * keystroke read a model that already held the previous one while the hook's
 * own `lastLive` did not, the hook took its own write for an outside one,
 * mapped the caret through it, and the characters landed out of order.
 * `npm run probe:p237` read it in the app — the typed word was not an
 * insertion, the caret was wrong, Enter read `"rely\n lathro"` — and passed
 * again with only that one line of ./live-text put back.
 *
 * This file types the same way the probe does, one `beforeinput` per
 * character with the caret wherever the view last put it, through the REAL
 * ./live-text and the REAL ./redline-edits (./p282-typing-rig says what is
 * faked and why). It mocks ./redline-caret, which needs a DOM, and never
 * ./live-text, because a mock of ./live-text is exactly how the defect passed
 * 14,598 tests.
 *
 * Both shapes a session reaches are driven: the first keystroke of a session
 * making the working model (the chunk loads), and a model a File view already
 * made.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT, mountTypingRig } from './p282-typing-rig';

const caret = vi.hoisted(() => ({ at: 0 }));
vi.mock('../redline-caret', async (orig) => ({
  ...(await orig<typeof import('../redline-caret')>()),
  spanOfInput: () => ({ anchor: caret.at, focus: caret.at }),
  readCurrentSelection: () => ({ anchor: caret.at, focus: caret.at }),
  // The one property of a contenteditable the scramble needs: the next
  // keystroke lands where the view last put the caret back.
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

const WORD = 'swift';
const AT = AGENT.indexOf('Beta');
const WANT = `${AGENT.slice(0, AT)}${WORD}\n${AGENT.slice(AT)}`;

describe('a burst of typing in the Redline view', () => {
  for (const modelFirst of [false, true]) {
    it(`lands in the order it was typed (${modelFirst ? 'a File view made the model' : 'the first keystroke makes the model'})`, async () => {
      caret.at = AT;
      const rig = await mountTypingRig({ caret, holdChunk: false, modelFirst });
      unmount = rig.unmount;
      for (const ch of WORD) await rig.type(ch);
      await rig.enter();
      await rig.settle();
      // All three readings, because the probe failed on all three: the model
      // is what ⌘S writes, the drawn text is what the person reads, and the
      // caret is where the next character goes.
      expect({ model: rig.model(), drawn: rig.drawn(), caret: caret.at }).toEqual({
        model: WANT,
        drawn: WANT,
        caret: AT + WORD.length + 1
      });
      expect(rig.tab().dirty).toBe(true);
    });
  }
});
