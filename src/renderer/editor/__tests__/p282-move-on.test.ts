/**
 * PHASE 282, findings 2 and 3. A PRESS MOVES ON TO THE CHANGE THAT CAME NEXT,
 * CARRIED BY ITS IDENTITY AND NOT BY ITS INDEX.
 *
 * PR 28 carried the pressed change's INDEX across the redraw and took the
 * element at that index afterwards (`indexAfterRemoval`), on the claim that
 * both verbs remove exactly the pressed change and leave every other change in
 * order. Two things the review measured break that claim:
 *
 *   - ⌥⌫ RE-READS THE FILE. An agent's write already on disk ABOVE the pressed
 *     change adds a change in front of it, every later index moves down one,
 *     and the move lands on the change BEFORE the one that followed — a change
 *     the person had already walked past, which the next ⌥⌫ in the rhythm the
 *     PR exists for rewrites. Reproduced with the shipping modules and again by
 *     mounting the real RedlineDocument in Chromium.
 *   - A REDRAW RE-CUTS NEIGHBOURS. Accepting change 3 of 4 in a list merged two
 *     bullets and landed ABOVE the accepted change; accepting the last change
 *     could fail to come round to the first. A per-change accept has no undo.
 *
 * The rule now (build/p282/SPEC.md §2): record the FOLLOWER at the press — the
 * change drawn after the pressed one, or the first when the pressed one was
 * last and not the only one — and find it again after the redraw by `off` and
 * `del`, shifting `off` by `ins.length - del.length` for an accept whose
 * follower came after the pressed change (a rewind leaves the baseline where it
 * was). The index is the fallback only when the follower is no longer drawn.
 *
 * Every picture below is composed by the SHIPPING composer and every press is
 * planned by the SHIPPING `planAccept` and `planRewind`; only the wrappers are
 * faked, as the identities `DocumentRuns` writes onto them.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeRedlineDocument } from '../redline-document';
import { landingAfterPress, pressMoveOf } from '../redline-current';
import { changesOf, planAccept, planRewind } from '../rewind';
import type { ChangeIdentity, PressMove } from '../redline-current';

const GEN = 5;
const drawn = (base: string, shown: string, generation: number): ChangeIdentity[] =>
  changesOf(composeRedlineDocument(base, shown).runs).map((c) => ({ off: c.off, del: c.del, ins: c.ins, generation }));
const label = (c: ChangeIdentity | null | undefined): string | null =>
  c === null || c === undefined ? null : `${JSON.stringify(c.del)}->${JSON.stringify(c.ins)}`;

/**
 * One press on change `n` of the picture `base`/`shown`, through the shipping
 * plan, then the landing the view's layout effect takes. `fresh` is what the
 * disk holds when a rewind re-reads, which is where an agent's write shows up.
 */
function press(
  verb: 'accept' | 'rewind',
  base: string,
  shown: string,
  n: number,
  fresh: string = shown
): { before: (string | null)[]; after: (string | null)[]; landed: string | null } {
  const before = drawn(base, shown, GEN);
  const pressed = before[n] as ChangeIdentity;
  const armed = pressMoveOf(verb, before, pressed);
  if (armed === null) throw new Error('the press armed nothing');
  let after: ChangeIdentity[];
  if (verb === 'accept') {
    const plan = planAccept({ baseline: base, baselineGeneration: GEN, drawnGeneration: GEN, current: shown, truncated: false, pressed });
    if (plan.outcome !== 'accept') throw new Error(plan.why);
    after = drawn(plan.baseline, shown, GEN + 1);
  } else {
    const plan = planRewind({ baseline: base, baselineGeneration: GEN, drawnGeneration: GEN, fresh, truncated: false, pressed, kind: 'rewind' });
    if (plan.outcome !== 'write') throw new Error(plan.why);
    after = drawn(base, plan.contents, GEN);
  }
  const landing = landingAfterPress(after, armed);
  return {
    before: before.map(label),
    after: after.map(label),
    landed: landing === 'wait' ? 'wait' : landing === null ? null : label(after[landing])
  };
}

describe('what a press records', () => {
  const picture: ChangeIdentity[] = [
    { off: 3, del: 'a', ins: 'A', generation: GEN },
    { off: 9, del: 'b', ins: 'B', generation: GEN },
    { off: 17, del: 'c', ins: 'C', generation: GEN }
  ];

  it('the follower is the change drawn after the pressed one', () => {
    expect(pressMoveOf('rewind', picture, picture[1]!)).toEqual({
      verb: 'rewind', pressed: picture[1], at: 1, follower: picture[2], followerAfter: true
    });
  });

  it('from the last change the follower comes round to the first', () => {
    expect(pressMoveOf('accept', picture, picture[2]!)).toEqual({
      verb: 'accept', pressed: picture[2], at: 2, follower: picture[0], followerAfter: false
    });
  });

  it('the only change has no follower, and a press that named nothing records nothing', () => {
    expect(pressMoveOf('rewind', [picture[0]!], picture[0]!)).toEqual({
      verb: 'rewind', pressed: picture[0], at: 0, follower: null, followerAfter: false
    });
    expect(pressMoveOf('accept', picture, null)).toBeNull();
    expect(pressMoveOf('accept', picture, { off: 99, del: 'z', ins: 'Z', generation: GEN })).toBeNull();
  });
});

describe('the landing, over layouts the index rule got wrong', () => {
  it("AN AGENT'S WRITE ABOVE, on disk when ⌥⌫ is pressed, still lands on the change that followed", () => {
    const base = 'Line one is here.\nLine two is here.\nLine three is here.\nLine four is here.\n';
    const shown = 'Line one is here.\nLine TWO is here.\nLine THREE is here.\nLine FOUR is here.\n';
    // The agent changed line one; the watcher has not redrawn yet.
    const fresh = 'Line ONE is here.\nLine TWO is here.\nLine THREE is here.\nLine FOUR is here.\n';
    const r = press('rewind', base, shown, 1, fresh);
    expect(r.before).toEqual(['"two"->"TWO"', '"three"->"THREE"', '"four"->"FOUR"']);
    expect(r.after).toEqual(['"one"->"ONE"', '"two"->"TWO"', '"four"->"FOUR"']);
    // The index rule answered "two"->"TWO", the change the person had walked past.
    expect(r.landed).toBe('"four"->"FOUR"');
  });

  it('ACCEPTING CHANGE 3 OF 4 IN A LIST lands on change 4, not on a merged bullet above it', () => {
    const base = '- it across each\n- where agent you\n- it one left\n- a agent where\n';
    const shown = '- it across you\n- Tortie it with\n- where each you\n- it agent left\n- a agent where\n';
    const r = press('accept', base, shown, 2);
    expect(r.before).toEqual(['"each"->"you"', '""->"Tortie it with\\n- "', '"agent"->"each"', '"one"->"agent"']);
    expect(r.landed).toBe('"one"->"agent"');
  });

  it('ACCEPTING THE LAST CHANGE comes round to the first even when the accept re-cuts two neighbours into one', () => {
    const base = 'mat and mat it on\nit to dog to the to to of of to the and is sat\n';
    const shown = 'mat and cat it it\nit to dog to the to to of mat to the and is sat\n';
    const r = press('accept', base, shown, 3);
    expect(r.before).toHaveLength(4);
    expect(r.landed).toBe('"mat"->"cat"');
    expect(r.landed).toBe(r.after[0]);
  });

  it('the last of several, rewound, comes round to the first', () => {
    const base = 'alpha beta gamma delta\n';
    const shown = 'ALPHA beta GAMMA DELTA\n';
    const r = press('rewind', base, shown, r0(base, shown));
    expect(r.landed).toBe(r.after[0]);
  });

  it('the only change, accepted or rewound, leaves nothing to take', () => {
    expect(press('accept', 'hello world\n', 'hello there\n', 0).landed).toBeNull();
    expect(press('rewind', 'hello world\n', 'hello there\n', 0).landed).toBeNull();
  });
});

/** The index of the last change drawn for a pair. */
function r0(base: string, shown: string): number {
  return drawn(base, shown, GEN).length - 1;
}

describe('when to wait, and the fallback', () => {
  const pressed: ChangeIdentity = { off: 10, del: 'brown', ins: 'red', generation: GEN };
  const follower: ChangeIdentity = { off: 30, del: 'dog', ins: 'cat', generation: GEN };
  const armed: PressMove = { verb: 'rewind', pressed, at: 0, follower, followerAfter: true };

  it('WAITS while the picture still draws the pressed change byte for byte (the adoption refused and the watcher has not redrawn)', () => {
    expect(landingAfterPress([pressed, follower], armed)).toBe('wait');
  });

  it("does NOT wait on a change at the same span with different words: that is somebody's new change, and the follower is taken", () => {
    const redone: ChangeIdentity = { ...pressed, ins: 'crimson' };
    expect(landingAfterPress([redone, follower], armed)).toBe(1);
  });

  it('an ACCEPT looks for a follower that came after it at the offset the accept moved it to', () => {
    // An accept replaces `del` with `ins` in the BASELINE, so every later
    // baseline offset moves by the difference; a rewind moves none. The decoy
    // sits at the follower's OLD offset with the follower's own `del`, so only
    // the shifted lookup takes the right one.
    const grown: ChangeIdentity = { off: 4, del: 'short', ins: 'a much longer phrase', generation: GEN };
    const next: ChangeIdentity = { off: 20, del: 'two', ins: 'TWO', generation: GEN };
    const accepted: PressMove = { verb: 'accept', pressed: grown, at: 0, follower: next, followerAfter: true };
    const decoy: ChangeIdentity = { off: 20, del: 'two', ins: 'elsewhere', generation: GEN + 1 };
    const moved: ChangeIdentity = { off: 35, del: 'two', ins: 'TWO', generation: GEN + 1 };
    expect(landingAfterPress([decoy, moved], accepted)).toBe(1);
    // The same two pictures under a rewind take the unshifted one.
    expect(landingAfterPress([decoy, moved], { ...accepted, verb: 'rewind' })).toBe(0);
    // And a follower that came round from the top is never shifted.
    expect(landingAfterPress([decoy, moved], { ...accepted, followerAfter: false })).toBe(0);
  });

  /**
   * PHASE 282'S FIX ROUND. THE FOLLOWER IS FOUND BY ITS OFFSET, BECAUSE THE
   * RE-CUT MOVES ITS `del`.
   *
   * The verifier measured the fallback being reached by an ordinary shape
   * rather than by the "merged away, split, or there was none" cases the rule
   * names: accepting a change ABOVE a whole-line deletion peels the trailing
   * newline off the deletion's group, so the follower comes back at exactly
   * the offset the accept's shift computes with a `del` one `\n` shorter, and
   * `sameChange` — which asks `off` AND `del` — refused it. Quietly the
   * fallback happened to answer the same index; with an agent's line arriving
   * at the top in the same redraw it answered the AGENT's brand-new change,
   * and the next ⌥↩ in the rhythm would have accepted a change the person
   * never looked at, with no undo.
   */
  const RECUT_BASE = 'line one here\nsecond has stone in it\nthird line to delete\nfourth stays\n';
  const RECUT_SHOWN = 'line one here\nsecond has alpha beta in it\n\nfourth stays\n';
  const recutPress = (
    shownAfter: string
  ): { after: (string | null)[]; landed: string | null } => {
    const before = drawn(RECUT_BASE, RECUT_SHOWN, GEN);
    const armed = pressMoveOf('accept', before, before[0] as ChangeIdentity);
    if (armed === null) throw new Error('the press armed nothing');
    const plan = planAccept({
      baseline: RECUT_BASE,
      baselineGeneration: GEN,
      drawnGeneration: GEN,
      current: RECUT_SHOWN,
      truncated: false,
      pressed: before[0] as ChangeIdentity
    });
    if (plan.outcome !== 'accept') throw new Error(plan.why);
    const after = drawn(plan.baseline, shownAfter, GEN + 1);
    const landing = landingAfterPress(after, armed);
    return {
      after: after.map(label),
      landed: landing === 'wait' ? 'wait' : landing === null ? null : label(after[landing])
    };
  };

  it('the follower whose group LOST ITS TRAILING NEWLINE in the re-cut is still found, quietly', () => {
    expect(recutPress(RECUT_SHOWN)).toEqual({
      after: ['"third line to delete"->""'],
      landed: '"third line to delete"->""'
    });
  });

  it("and with an agent's line arriving at the top in the same redraw, the landing is still the follower and never the agent's new change", () => {
    expect(recutPress(`AGENT ADDED THIS AT THE TOP\n${RECUT_SHOWN}`)).toEqual({
      after: ['""->"AGENT ADDED THIS AT THE TOP\\n"', '"third line to delete"->""'],
      landed: '"third line to delete"->""'
    });
  });

  it('falls back to the index only when the follower is no longer drawn', () => {
    const other: ChangeIdentity = { off: 50, del: 'end', ins: 'END', generation: GEN };
    // The follower was merged away; one change remains, at the index the
    // pressed change stood at.
    expect(landingAfterPress([other], armed)).toBe(0);
    expect(landingAfterPress([], armed)).toBeNull();
  });
});

describe("the view's wiring, read as source", () => {
  // This lane has no DOM, so the layout effect cannot run here; the wiring is
  // read the way `conformance:redline` rule 40 reads it, and the app run is
  // `probe:redlinemoveon`.
  const code = readFileSync(resolve(__dirname, '../RedlineDocument.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('both presses record the follower through pressMoveOf, and the effect lands through landingAfterPress alone', () => {
    const effect = code.slice(code.lastIndexOf('useLayoutEffect(', code.indexOf('const pending = advanceAfterPress.current;')));
    const body = effect.slice(0, effect.indexOf('}, ['));
    expect(code.match(/pressMoveOf\(/g)?.length).toBe(2);
    expect(body).toContain('landingAfterPress(');
    // The index is the fallback INSIDE landingAfterPress and nowhere in the view.
    expect(body).not.toContain('indexAfterRemoval(');
  });
});
