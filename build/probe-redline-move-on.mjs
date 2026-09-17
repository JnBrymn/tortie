#!/usr/bin/env node
/**
 * probe-redline-move-on.mjs — PR 28's author's asks of 2026-09-16, in the app.
 *
 * John Berryman (JnBrymn, PR 28's author) asked for three things over two
 * sittings, quoted verbatim:
 *
 *   1. "I want it to automatically forward to the next edit so I can do just
 *      keep doing option return if I want to keep approving... right now after
 *      I do option return I have to push option down to get the next edit."
 *   2. "when I press option delete, it should still go to the next available
 *      edit point, not just option return."
 *   3. "If I keep going past the end... I want it to flip over and go to the
 *      first edit point at the top of the document... And in reverse... to the
 *      last edit point so that it forms a loop instead of just hitting the
 *      end."
 *
 * So: a landed accept and a landed rewind both leave the person on the change
 * that was drawn AFTER the one they pressed, and both arrows loop — ⌥↓ past
 * the last change lands on the first, and ⌥↑ before the first lands on the
 * last.
 *
 * WHAT THIS RUN READS, all off the live DOM and the real disk, in ONE Electron:
 *
 *   H. THE HEAD SHAPE. One ⌥↓ marks the first change; ⌥↑ from there comes
 *      round to the LAST change and ⌥↓ from there comes back to the first. An
 *      accept then drops the picture by one, writes no byte of the file, and
 *      leaves the change that followed current with the keyboard on it and the
 *      chip drawn; a SECOND accept with no ⌥↓ between takes the next one; a
 *      rewind then WRITES the file, drops the picture by one, and leaves the
 *      change that followed current; the arrows still loop after a press; and
 *      accepting forward from there empties the document, after which every
 *      chord is a no-op and the keyboard is still in the view.
 *
 *   P. THE PARENT SHAPE, and it is why this probe takes a mode. PR 28's
 *      author reported the missing moves against the build before PR 28, so
 *      the defect is SHOWN rather than asserted:
 *      `ACCEPT_ADVANCE_PARENT=1 node build/probe-redline-move-on.mjs` grades
 *      the same fixture the other way round — ⌥↑ at the first change stays
 *      there and ⌥↓ at the last stays there, an accept leaves nothing current
 *      with the keyboard back on the scroller, a second ⌥↩ with no ⌥↓ accepts
 *      nothing, and the rewind that follows leaves nothing current either.
 *
 * PHASE 282's FIVE ARMS run after H in the same Electron, each over changes it
 * writes itself, so none depends on where the arm before it left the keyboard
 * (docs/BACKLOG.md `## Phase 282`, build/p282/SPEC.md §7). They are what the
 * review of 2026-09-17 found PR 28's battery could not see:
 *
 *   O. AN OUTSIDE WRITE ABOVE THE CURRENT CHANGE, on disk the moment before
 *      ⌥⌫ and before the watcher can redraw. The rewind re-reads the file, so
 *      the write adds a change in front of the pressed one; the move must land
 *      on the change that FOLLOWED the pressed one, found by its identity, and
 *      never on the one before it that the index rule answered (SPEC §2).
 *   L. ⌥⌫ ON THE ONLY REMAINING CHANGE, then ⌥⇧⌫ with no click between. The
 *      wrapper that held the keyboard is gone, so the keyboard must still be in
 *      the view and the undo the face names must bring the change back, file
 *      digest and all (SPEC §1.7).
 *   C. ⌥⌫ AND ⌥↩ BACK TO BACK, with no redraw awaited between. No change is
 *      ever drawn backwards, the file holds the rewind, and an accept that is
 *      refused says the one-press rule's sentence (SPEC §1.1 to §1.3).
 *   R. A HELD ⌥⌫: one keyDown and then six with `autoRepeat` at 40 ms, inside
 *      the 30 to 50 ms a held key repeats at. The picture drops by exactly one
 *      and the file moves in exactly one paragraph (SPEC §1.6).
 *   T. A TYPING BURST, a word and Enter at 30 ms per key into the Redline
 *      document, then ⌘S. The document draws the word as an insertion at the
 *      caret in order, and the file is exactly what was typed (SPEC §3.1).
 *
 * THE THIRD MODE. `ACCEPT_ADVANCE_PARENT=282` is PR 28's head with main merged
 * (`9217ae0d`), the build Phase 282 fixes. There the move-on is already in, so
 * H is graded as it is at HEAD, and O, L, C, R and T are graded the other way
 * round: the move lands on the change before, the keyboard drops, the change is
 * drawn backwards, the repeat rewinds more than one, and the typing is
 * scrambled. `ACCEPT_ADVANCE_PARENT=1` runs P alone and none of the five: T's
 * scramble and R's runaway repeat do not exist before PR 28, so grading them
 * there would assert a shape nobody measured.
 *
 * ## SAFETY
 *
 * One Electron, through build/electron-run.mjs, which ends the tree it started
 * in a `finally`. A scratch profile, a scratch HOME and this script's own tmux
 * socket, ended and unlinked by build/harness-socket.mjs; `gmux` and `default`
 * are refused by name, and the -L gmux sessions of the machine that runs this
 * probe are counted before and after, read only. No agent, no token, no
 * keychain, no request, no ssh, no machine. Every file written is under
 * GMUX_HARNESS_DIR. The edits the redline draws are a plain /bin/sh running
 * cat, exactly as an agent's write looks here, with ONE exception: arm O's
 * outside write is this node process's own synchronous `writeFileSync`,
 * because that arm measures the gap between the write and the key, and a
 * process start would sit inside it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withElectron, withoutDevRenderer } from './electron-run.mjs';
import { cdpEval, wsConnect } from './cdp-client.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[move-on]';
const say = (l) => console.log(`${TAG} ${l}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * THE MODE. Unset is HEAD. `1` is the build before PR 28, `282` is PR 28's
 * head before Phase 282 (see the header). Any other value is refused rather
 * than read as HEAD, so a mistyped parent run can never report a feature as
 * the defect it was asked to show.
 */
const PARENT_MODE = process.env['ACCEPT_ADVANCE_PARENT'] ?? '';
if (PARENT_MODE !== '' && PARENT_MODE !== '1' && PARENT_MODE !== '282') {
  console.error(`${TAG} ACCEPT_ADVANCE_PARENT is ${JSON.stringify(PARENT_MODE)}; it is unset, 1 or 282`);
  process.exit(2);
}
const PARENT = PARENT_MODE === '1';
const PR28_HEAD = PARENT_MODE === '282';

const failures = [];
const rows = [];
function check(step, claim, pass, detail) {
  rows.push({ step, claim, pass, detail: detail ?? '' });
  if (!pass) failures.push(`${step}. ${claim} — ${detail ?? ''}`);
  say(`${pass ? 'pass' : 'FAIL'}  ${step}. ${claim}${detail ? ' — ' + detail : ''}`);
}
function note(step, claim, detail) {
  rows.push({ step, claim, pass: null, detail: detail ?? '' });
  say(`note  ${step}. ${claim}${detail ? ' — ' + detail : ''}`);
}

/**
 * What the parent's app is expected to do, graded as findings so a run at the
 * parent is a PASS when the defect reproduces. The head grader is its mirror:
 * the same readings, the other way round.
 */
function grade(reading, mode) {
  const bad = [];
  const f = (name) => reading[name] ?? {};
  if (reading.startChanges !== 8) bad.push(`the fixture drew ${String(reading.startChanges)} changes and not 8`);
  if (f('a1').currentIndex !== 0 || f('a1').currentCount !== 1) {
    bad.push('the first ⌥↓ did not mark the first change');
  }
  const dels = reading.startDels ?? [];
  if (mode === 'head') {
    if (f('loopUp').currentIndex !== 7) {
      bad.push(`⌥↑ from the first change landed on ${String(f('loopUp').currentIndex)} rather than looping to the last`);
    }
    if (f('loopDown').currentIndex !== 0) {
      bad.push(`⌥↓ from the last change landed on ${String(f('loopDown').currentIndex)} rather than looping to the first`);
    }
    const b = f('accept1');
    if (b.changes !== 7) bad.push(`the first accept left ${String(b.changes)} changes where the picture held 8`);
    if (reading.acceptsMovedFile === true) bad.push('an accept moved a byte of the file');
    if (b.currentCount !== 1 || b.dels?.[b.currentIndex] !== dels[1]) {
      bad.push('the accept did not leave the change that followed it current');
    }
    if (b.activeIsChange !== true || b.activeIndex !== b.currentIndex) {
      bad.push('the keyboard is not on the change the accept moved to');
    }
    if (b.chipDrawn !== true) bad.push('the controls did not come with the accepted change’s neighbour');
    const c = f('accept2');
    if (c.changes !== 6) bad.push(`a second ⌥↩ with no ⌥↓ accepted nothing (${String(c.changes)} changes remain)`);
    if (c.dels?.[c.currentIndex] !== dels[2]) bad.push('the second ⌥↩ did not land on the change after the one it accepted');
    const r = f('rewind');
    if (r.changes !== 5) bad.push(`the rewind left ${String(r.changes)} changes where the picture held 6`);
    if (reading.rewindMovedFile !== true) bad.push('the rewind did not write the file, so it was not a rewind');
    if (r.currentCount !== 1 || r.dels?.[r.currentIndex] !== dels[3]) {
      bad.push('the rewind did not leave the change that followed it current');
    }
    if (
      typeof reading.rewindWaitMs !== 'number' ||
      typeof reading.acceptWaitMs !== 'number' ||
      reading.rewindWaitMs < 0 ||
      reading.rewindWaitMs > reading.acceptWaitMs + 500
    ) {
      bad.push(
        `THE TWO VERBS FEEL DIFFERENT: the accept redrew in ${String(reading.acceptWaitMs)} ms and the rewind in ${String(reading.rewindWaitMs)} ms, which is PR 28's author's complaint`
      );
    }
    if (r.activeIsChange !== true || r.activeIndex !== r.currentIndex) {
      bad.push('the keyboard is not on the change the rewind moved to');
    }
    if (f('loopUp2').currentIndex !== 4) {
      bad.push(`⌥↑ after the rewind landed on ${String(f('loopUp2').currentIndex)} rather than looping to the last remaining change`);
    }
    if (f('loopDown2').currentIndex !== 0) {
      bad.push(`⌥↓ from the last remaining change landed on ${String(f('loopDown2').currentIndex)} rather than looping to the first`);
    }
    if (f('end').changes !== 0) bad.push(`accepting forward left ${String(f('end').changes)} changes`);
    if (reading.acceptsAfterRewindMovedFile === true) bad.push('a later accept moved a byte of the file');
    if (f('emptyAccept').changes !== 0) bad.push('a ⌥↩ past the last change drew another change, so it was not a no-op');
    if (f('emptyStep').changes !== 0 || f('emptyStep').currentCount !== 0) {
      bad.push('the arrows marked something on an empty redline');
    }
    if (f('emptyAccept').activeInView !== true) bad.push('the keyboard left the view when the last change was accepted');
  } else {
    if (f('loopUp').currentIndex !== 0) {
      bad.push('THE LOOP DID NOT REPRODUCE: ⌥↑ at the first change moved instead of staying');
    }
    if (f('loopDown').currentIndex !== 7) {
      bad.push(`THE LOOP DID NOT REPRODUCE: nine ⌥↓ presses from the first change ended at ${String(f('loopDown').currentIndex)} rather than clamped on the last`);
    }
    const b = f('accept1');
    if (b.changes !== 7) bad.push(`the first accept left ${String(b.changes)} changes where the picture held 8`);
    if (b.currentCount !== 0) {
      bad.push('the parent marked a change after the accept, which is the feature this run measures');
    }
    if (f('accept2').changes !== 7) {
      bad.push('THE DEFECT DID NOT REPRODUCE: a second ⌥↩ with no ⌥↓ accepted something');
    }
    const r = f('rewind');
    if (reading.rewindMovedFile !== true) bad.push('the rewind did not write the file, so this arm measured nothing');
    if (r.changes !== 6) bad.push(`the rewind left ${String(r.changes)} changes where the picture held 7`);
    if (r.currentCount !== 0) {
      bad.push('the parent marked a change after the rewind, which is the feature this run measures');
    }
  }
  return bad;
}

/**
 * THE ONE-PRESS RULE'S ACCEPT SENTENCE, verbatim from build/p282/SPEC.md §1.3
 * with the fixture's name in it. It is spelled here rather than imported
 * because this script is plain node and `redlineHeldSentence` is TypeScript in
 * the renderer; a change to the words fails arm C at HEAD, which is the
 * reading that says the two disagree.
 */
const NOTES = 'notes.txt';
const HELD_ACCEPT = `A change in ${NOTES} is still being rewound, so nothing was accepted.`;

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
/** Eight paragraphs, each with one marker word that differs between versions. */
const version = (n) =>
  WORDS.map(
    (_, i) =>
      `Paragraph ${String(i + 1)} of the draft, whose marker word is ${WORDS[(i + n) % WORDS.length]} and whose body carries enough sentences to make the document worth scrolling through when somebody reads it.\n`
  ).join('\n');

/** `version` joins its paragraphs with a blank line, so this splits them back. */
const paragraphsOf = (text) => text.split('\n\n');
/** Paragraph `n`'s marker word, counting from 1, or null. */
const markerOf = (text, n) => /marker word is (\S+) and/.exec(paragraphsOf(text)[n - 1] ?? '')?.[1] ?? null;
/** The text with paragraph `n`'s marker word set, for each `[n, word]`. */
function withMarkers(text, pairs) {
  const ps = paragraphsOf(text);
  for (const [n, word] of pairs) ps[n - 1] = ps[n - 1].replace(/marker word is \S+ and/, `marker word is ${word} and`);
  return ps.join('\n\n');
}
/** How many paragraphs differ between two texts, or -1 when the count moved. */
function paragraphsMoved(a, b) {
  const pa = paragraphsOf(a);
  const pb = paragraphsOf(b);
  return pa.length !== pb.length ? -1 : pa.filter((p, i) => p !== pb[i]).length;
}

/**
 * PHASE 282's ARMS, graded per arm. `head` is the build that fixes them; `pr28`
 * is PR 28's head before the fix, where each arm's finding is the defect NOT
 * reproducing. The fixture findings are asked in both modes first, because an
 * arm whose own fixture did not draw measured nothing either way.
 */
function gradeArms(reading, mode) {
  const out = { o: [], l: [], c: [], r: [], t: [] };
  const head = mode === 'head';

  const o = reading.o;
  if (o === undefined) out.o.push('arm O did not run');
  else {
    if (o.drawn !== true) out.o.push('the O fixture did not draw its four changes');
    if (o.marked !== true) out.o.push('arm O could not mark the change it presses');
    if (o.agentDrawnAtPress !== false) {
      out.o.push(
        `the watcher had already drawn the outside write when ⌥⌫ was read (${String(o.writeToKeyMs)} ms after it), so the arm measured a picture that had caught up`
      );
    }
    if (o.fileAsExpected !== true) out.o.push('the file does not hold the outside write and the rewind together');
    if (head) {
      if (o.landedOn !== o.followerIns) {
        out.o.push(
          `the move landed on ${JSON.stringify(o.landedOn)} rather than ${JSON.stringify(o.followerIns)}, the change that followed${o.landedOn === o.beforeIns ? ', which is the change BEFORE the one it rewound' : ''}`
        );
      }
      if (o.activeOnCurrent !== true) out.o.push('the keyboard is not on the change the move landed on');
    } else if (o.landedOn !== o.beforeIns) {
      out.o.push(
        `THE WRONG LANDING DID NOT REPRODUCE: the move landed on ${JSON.stringify(o.landedOn)} and not on ${JSON.stringify(o.beforeIns)}, the change before`
      );
    }
  }

  const l = reading.l;
  if (l === undefined) out.l.push('arm L did not run');
  else {
    if (l.remaining !== 1) out.l.push(`arm L got down to ${String(l.remaining)} changes and not one`);
    if (l.keyboardOnChange !== true) {
      out.l.push('the keyboard was not on the change when ⌥⌫ was pressed, so there was no wrapper for the rewind to take it from');
    }
    if (l.rewound !== true) out.l.push('the rewind of the only change did not write the file and empty the picture');
    if (head) {
      if (l.activeInView !== true) {
        out.l.push(`the keyboard left the view when the only change was rewound (on ${JSON.stringify(l.activeClass)})`);
      }
      if (l.undoChanges !== 1 || l.undoIns !== l.pressedIns) out.l.push('⌥⇧⌫ did not bring the rewound change back');
      if (l.digestBack !== true) out.l.push('the file did not come back to what it held before the rewind');
    } else if (!(l.activeInView === false && l.undoChanges === 0)) {
      out.l.push(
        `THE DROPPED KEYBOARD DID NOT REPRODUCE: keyboard in the view ${String(l.activeInView)}, ${String(l.undoChanges)} changes after ⌥⇧⌫`
      );
    }
  }

  const c = reading.c;
  if (c === undefined) out.c.push('arm C did not run');
  else {
    if (c.drawn !== true) out.c.push('the C fixture did not draw its three changes');
    if (c.marked !== true) out.c.push('arm C could not mark the change it presses');
    if (typeof c.gapMs !== 'number' || c.gapMs > 150) {
      out.c.push(`the two chords went out ${String(c.gapMs)} ms apart, so they were not back to back`);
    }
    if (c.fileHoldsRewind !== true) out.c.push('the file does not hold the rewind');
    if (head) {
      if (c.backwards !== false) out.c.push('THE CHANGE WAS DRAWN BACKWARDS: ⌥↩ accepted the change ⌥⌫ was rewinding');
      if (c.heldSentence === true) {
        if (c.after !== c.before - 1) {
          out.c.push(`the accept was refused with the sentence, yet the picture went from ${String(c.before)} to ${String(c.after)} changes`);
        }
      } else if (c.after !== c.before - 2) {
        out.c.push(
          `the accept neither acted nor said why: ${String(c.before)} -> ${String(c.after)} changes and no "${HELD_ACCEPT}"`
        );
      }
    } else if (c.backwards !== true) {
      out.c.push('THE BACKWARDS CHANGE DID NOT REPRODUCE: no change was drawn with the rewound change’s words swapped');
    }
  }

  const r = reading.r;
  if (r === undefined) out.r.push('arm R did not run');
  else {
    if (r.drawn !== true) out.r.push('the R fixture did not draw its three changes');
    if (r.marked !== true) out.r.push('arm R could not mark the change it presses');
    if (r.firstNotRepeat !== true || r.repeatsSeen !== r.repeats) {
      out.r.push(
        `the page saw ${String(r.repeatsSeen)} repeated ⌥⌫ keydowns of ${String(r.repeats)} sent, first a press ${String(r.firstNotRepeat)}, so the arm did not hold the key`
      );
    }
    if (head) {
      if (r.after !== r.before - 1) {
        out.r.push(`a held ⌥⌫ took the picture from ${String(r.before)} to ${String(r.after)} changes, so a repeat rewound`);
      }
      if (r.oneRewind !== true) {
        out.r.push(`the file is not the one rewind it should be (${String(r.paragraphsMoved)} paragraphs moved)`);
      }
      if (r.unsaved !== false) out.r.push('a repeat reached the document as an edit');
    } else if (r.after === r.before - 1 && r.paragraphsMoved === 1) {
      out.r.push('THE RUNAWAY REPEAT DID NOT REPRODUCE: the held ⌥⌫ rewound exactly one change');
    }
  }

  const t = reading.t;
  if (t === undefined) out.t.push('arm T did not run');
  else {
    if (t.precondition !== true) out.t.push('the document did not draw the file before typing, so there was no known text to type into');
    if (head) {
      if (t.typedCurrent !== true) out.t.push('the word and Enter are not in the document in order at the caret');
      if (t.caret !== true) out.t.push('the caret is not after what was typed');
      if (t.insertion !== true) out.t.push('the typed word is not drawn as an insertion');
      if (t.savedExact !== true) out.t.push('⌘S did not put exactly what was typed on disk');
    } else if (t.typedCurrent === true && t.savedExact === true) {
      out.t.push('THE SCRAMBLE DID NOT REPRODUCE: the burst reached the file in order');
    }
  }
  return out;
}
const armFindings = (graded) => [...graded.o, ...graded.l, ...graded.c, ...graded.r, ...graded.t];

if (process.argv.includes('--self-test')) {
  const head = {
    mode: 'head',
    startChanges: 8,
    acceptWaitMs: 20,
    rewindWaitMs: 25,
    startDels: ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'],
    acceptsMovedFile: false,
    rewindMovedFile: true,
    acceptsAfterRewindMovedFile: false,
    a1: { currentIndex: 0, currentCount: 1 },
    loopUp: { currentIndex: 7 },
    loopDown: { currentIndex: 0 },
    accept1: { changes: 7, currentIndex: 0, currentCount: 1, activeIndex: 0, activeIsChange: true, chipDrawn: true, dels: ['bravo', 'charlie', 'delta'] },
    accept2: { changes: 6, currentIndex: 0, dels: ['charlie', 'delta'] },
    rewind: { changes: 5, currentIndex: 0, currentCount: 1, activeIndex: 0, activeIsChange: true, dels: ['delta', 'echo'] },
    loopUp2: { currentIndex: 4 },
    loopDown2: { currentIndex: 0 },
    end: { changes: 0 },
    emptyAccept: { changes: 0, activeInView: true },
    emptyStep: { changes: 0, currentCount: 0 }
  };
  const parent = {
    mode: 'parent',
    startChanges: 8,
    acceptsMovedFile: false,
    rewindMovedFile: true,
    acceptWaitMs: 20,
    rewindWaitMs: 20,
    a1: { currentIndex: 0, currentCount: 1 },
    loopUp: { currentIndex: 0 },
    loopDown: { currentIndex: 7 },
    accept1: { changes: 7, currentCount: 0, activeIsChange: false },
    accept2: { changes: 7 },
    rewind: { changes: 6, currentCount: 0, activeIsChange: false }
  };
  const cases = [
    ['the shipping shape at HEAD', grade(head, 'head'), 0],
    ['the loop did not happen, which is the parent', grade({ ...head, loopUp: { currentIndex: 0 } }, 'head'), 1],
    ['the second ⌥↩ accepted nothing, which is the parent', grade({ ...head, accept2: { changes: 7, dels: ['charlie'] } }, 'head'), 2],
    ['the accept landed on the wrong change', grade({ ...head, accept1: { ...head.accept1, dels: ['delta'] } }, 'head'), 1],
    ['the rewind did not move on', grade({ ...head, rewind: { ...head.rewind, currentCount: 0, currentIndex: -1 } }, 'head'), 2],
    ['the rewind did not write the file', grade({ ...head, rewindMovedFile: false }, 'head'), 1],
    ['the rewind is much slower than the accept, which is the complaint', grade({ ...head, rewindWaitMs: 700 }, 'head'), 1],
    ['an accept wrote the file', grade({ ...head, acceptsMovedFile: true }, 'head'), 1],
    ['the arrows stopped marking something on an empty redline', grade({ ...head, emptyStep: { changes: 0, currentCount: 1 } }, 'head'), 1],
    ['the parent shape, graded as the parent', grade(parent, 'parent'), 0],
    ['the parent shape graded as HEAD, which is the defect', grade(parent, 'head'), 15],
    ['the parent looped, which is the feature', grade({ ...parent, loopUp: { currentIndex: 7 }, loopDown: { currentIndex: 1 } }, 'parent'), 2]
  ];

  // PHASE 282's ARMS. `armsHead` is what the fixed build reads and `armsPr28`
  // is what PR 28's head read in the review of 2026-09-17: the move one change
  // early, the keyboard on the body, the accepted-then-rewound change drawn
  // backwards, a held ⌥⌫ taking all three changes, and a scrambled save.
  const armsHead = {
    o: {
      drawn: true,
      marked: true,
      writeToKeyMs: 2,
      agentDrawnAtPress: false,
      pressedIns: 'lima',
      followerIns: 'mike',
      beforeIns: 'kilo',
      landedOn: 'mike',
      activeOnCurrent: true,
      fileAsExpected: true
    },
    l: { remaining: 1, keyboardOnChange: true, pressedIns: 'kilo', rewound: true, activeInView: true, activeClass: 'ed-redline-scroll', undoChanges: 1, undoIns: 'kilo', digestBack: true },
    c: { drawn: true, marked: true, gapMs: 6, before: 4, after: 3, backwards: false, heldSentence: true, fileHoldsRewind: true },
    r: { drawn: true, marked: true, repeats: 6, firstNotRepeat: true, repeatsSeen: 6, before: 3, after: 2, paragraphsMoved: 1, oneRewind: true, unsaved: false },
    t: { precondition: true, typedCurrent: true, caret: true, insertion: true, savedExact: true }
  };
  const armsPr28 = {
    o: { ...armsHead.o, landedOn: 'kilo' },
    l: { ...armsHead.l, activeInView: false, activeClass: 'BODY', undoChanges: 0, undoIns: null, digestBack: false },
    c: { ...armsHead.c, before: 3, after: 3, backwards: true, heldSentence: false },
    r: { ...armsHead.r, after: 0, paragraphsMoved: 3, oneRewind: false },
    t: { ...armsHead.t, typedCurrent: false, caret: false, savedExact: false }
  };
  const arm = (fixture, mode) => armFindings(gradeArms(fixture, mode));
  cases.push(
    ['PHASE 282: the five arms at HEAD, graded as HEAD', arm(armsHead, 'head'), 0],
    ['PHASE 282: the five arms at PR 28’s head, graded as PR 28’s head', arm(armsPr28, 'pr28'), 0],
    ['PHASE 282: HEAD graded as PR 28’s head, so no defect reproduced', arm(armsHead, 'pr28'), 5],
    ['PHASE 282: PR 28’s head graded as HEAD, which is every defect', arm(armsPr28, 'head'), 11],
    ['PHASE 282: no arm ran', arm({}, 'head'), 5],
    ['O: the move landed on the change before, which is the index rule', arm({ ...armsHead, o: armsPr28.o }, 'head'), 1],
    ['O: the watcher had drawn the write before the key, so the arm measured nothing', arm({ ...armsHead, o: { ...armsHead.o, agentDrawnAtPress: true } }, 'head'), 1],
    ['O: the keyboard did not follow the move', arm({ ...armsHead, o: { ...armsHead.o, activeOnCurrent: false } }, 'head'), 1],
    ['L: the keyboard dropped, and the undo it names did nothing', arm({ ...armsHead, l: armsPr28.l }, 'head'), 3],
    ['L: the keyboard stayed but the undo did not bring the change back', arm({ ...armsHead, l: { ...armsHead.l, undoChanges: 0, digestBack: false } }, 'head'), 2],
    ['C: the change was drawn backwards', arm({ ...armsHead, c: { ...armsHead.c, backwards: true } }, 'head'), 1],
    ['C: the accept was dropped with no sentence', arm({ ...armsHead, c: { ...armsHead.c, heldSentence: false } }, 'head'), 1],
    ['C: the write beat the accept, which then took the change that followed', arm({ ...armsHead, c: { ...armsHead.c, heldSentence: false, after: 2 } }, 'head'), 0],
    ['C: the chords were not back to back', arm({ ...armsHead, c: { ...armsHead.c, gapMs: 400 } }, 'head'), 1],
    ['C: at PR 28’s head the race did not reproduce', arm({ ...armsPr28, c: armsHead.c }, 'pr28'), 1],
    ['R: a repeat rewound a second change', arm({ ...armsHead, r: { ...armsHead.r, after: 1, paragraphsMoved: 2, oneRewind: false } }, 'head'), 2],
    ['R: a consumed repeat reached the document as an edit', arm({ ...armsHead, r: { ...armsHead.r, unsaved: true } }, 'head'), 1],
    ['R: the page never saw a repeated keydown, so the key was not held', arm({ ...armsHead, r: { ...armsHead.r, repeatsSeen: 0 } }, 'head'), 1],
    ['T: the save wrote something other than what was typed', arm({ ...armsHead, t: { ...armsHead.t, savedExact: false } }, 'head'), 1],
    ['T: the document never drew the file, so nothing was measured', arm({ ...armsHead, t: { ...armsHead.t, precondition: false } }, 'head'), 1]
  );
  // THE FIXTURE TEXTS the arms write, proved here rather than in the app: the
  // paragraph walk that every arm's expected file is computed with round trips,
  // sets exactly the marker it was given, and counts exactly the paragraphs
  // that moved. An arm's whole claim about the file rests on these three.
  const base = version(1);
  const one = withMarkers(base, [[4, 'lima']]);
  const two = withMarkers(one, [[1, 'kilo'], [8, 'mike']]);
  cases.push(
    ['the paragraph walk round trips the fixture', [paragraphsOf(base).join('\n\n') === base ? null : 'it did not'].filter((x) => x !== null), 0],
    ['eight paragraphs, and the marker of each is read back', [paragraphsOf(base).length === 8 && markerOf(base, 1) === 'bravo' && markerOf(base, 8) === 'alpha' ? null : 'it did not'].filter((x) => x !== null), 0],
    ['one marker set moves exactly one paragraph', [paragraphsMoved(base, one) === 1 && markerOf(one, 4) === 'lima' ? null : `moved ${String(paragraphsMoved(base, one))}`].filter((x) => x !== null), 0],
    ['two more markers move exactly two', [paragraphsMoved(one, two) === 2 && paragraphsMoved(base, two) === 3 ? null : `moved ${String(paragraphsMoved(one, two))}`].filter((x) => x !== null), 0],
    ['a text with a paragraph added is not compared paragraph by paragraph', [paragraphsMoved(base, `${base}\n\nParagraph 9.\n`) === -1 ? null : 'it was'].filter((x) => x !== null), 0]
  );

  let bad = 0;
  for (const [name, found, want] of cases) {
    const ok = found.length === want;
    if (!ok) bad += 1;
    say(`${ok ? 'pass' : 'FAIL'}  self-test: ${name} -> ${String(found.length)} finding(s), wanted ${String(want)}`);
  }
  say(`${String(cases.length - bad)} of ${String(cases.length)} grader fixtures behaved`);
  process.exit(bad === 0 ? 0 : 1);
}

const socket = process.env['GMUX_TMUX_SOCKET'] ?? '';
if (socket === '') {
  say('no GMUX_TMUX_SOCKET; wrapping in build/harness-socket.mjs');
  const w = spawnSync(
    process.execPath,
    [join(REPO, 'build', 'harness-socket.mjs'), '--fresh', 'gmux-redlinemoveon', `node ${process.argv[1]}`],
    { cwd: REPO, stdio: 'inherit' }
  );
  process.exit(w.status ?? 1);
}
if (socket === 'gmux' || socket === 'default') {
  console.error(`${TAG} refusing socket ${socket}`);
  process.exit(2);
}
const harnessDir = process.env['GMUX_HARNESS_DIR'] ?? '';
if (harnessDir === '') {
  console.error(`${TAG} no GMUX_HARNESS_DIR`);
  process.exit(2);
}
if (!existsSync(join(REPO, 'out', 'main', 'index.js'))) {
  console.error(`${TAG} out/main/index.js is missing. Run npm run build.`);
  process.exit(2);
}

/**
 * The -L gmux sessions of the machine that runs this probe, read only. It is
 * the operator's machine when the main session runs it and a contributor's when
 * PR 28's author did, so the count is named for the machine and not the person.
 */
const machineSessionCount = () =>
  (spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], { encoding: 'utf8' }).stdout ?? '')
    .split('\n')
    .filter((l) => l.trim() !== '').length;
const sessionsBefore = machineSessionCount();
say(`-L gmux sessions on this machine before: ${String(sessionsBefore)}`);

mkdirSync(join(harnessDir, 'moveon'), { recursive: true });
const root = realpathSync(join(harnessDir, 'moveon'));
const home = join(root, 'home');
const profile = join(root, 'profile');
const project = join(root, 'project');
const readingsFile = join(root, 'move-on-readings.json');
for (const d of [home, profile, project]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}

const git = (...a) => {
  const r = spawnSync('git', a, {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
/** The write from outside, which is what an agent's write looks like here. */
const shellWrite = (rel, text) => {
  const r = spawnSync('/bin/sh', ['-c', 'cat > "$1"', 'sh', join(project, rel)], {
    input: text,
    encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error('shell write failed');
};
const digest = (rel) =>
  createHash('sha256').update(readFileSync(join(project, rel))).digest('hex').slice(0, 16);

writeFileSync(join(project, NOTES), version(0));
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'moveon@example.invalid');
git('config', 'user.name', 'moveon');
git('add', '--', NOTES);
git('commit', '-q', '-m', 'the committed draft');

// ---------------------------------------------------------------------------
// The reads, all off the LIVE DOM. `dels` is the whole picture's deleted text
// in document order, which is how an arm of H says WHICH change a press landed
// on: nothing writes the file between H's presses, so a change that left the
// picture leaves the rest in order and the change that followed the pressed one
// is the next one in this list. Phase 282's arms do not lean on that — arm O
// exists because an outside write breaks it — and name every change by the
// word it INSERTS, which each arm chose itself and used nowhere else.
// ---------------------------------------------------------------------------
const FACE = `(() => {
  const doc = document.querySelector('.ed-redline-doc');
  const view = document.querySelector('.ed-redline-view');
  const wraps = doc === null ? [] : Array.from(doc.querySelectorAll('.ed-redline-change'));
  const currentIndex = wraps.findIndex((w) => w.hasAttribute('data-current'));
  const active = document.activeElement;
  const activeWrap = active !== null && typeof active.closest === 'function' ? active.closest('.ed-redline-change') : null;
  return {
    mounted: doc !== null,
    changes: wraps.length,
    dels: wraps.map((w) => w.dataset.changeDel ?? ''),
    inss: wraps.map((w) => w.dataset.changeIns ?? ''),
    currentIndex,
    currentCount: wraps.filter((w) => w.hasAttribute('data-current')).length,
    activeIndex: activeWrap === null ? -1 : wraps.indexOf(activeWrap),
    activeIsChange: activeWrap !== null,
    activeInView: active !== null && view !== null && view.contains(active),
    activeClass: active === null ? null : (active.className || active.tagName),
    chipDrawn: document.querySelector('.ed-redline-chip') !== null,
    unsaved: (document.querySelector('.ed-redline-since .banner-text')?.textContent ?? '').includes('unsaved'),
    toasts: Array.from(document.querySelectorAll('.toasts .toast-text')).map((t) => t.textContent ?? '')
  };
})()`;

const clickMode = (label) =>
  `(() => { const b = document.querySelector('.ed-mode[role="radiogroup"] [aria-label="${label}"]'); if (!b || b.disabled) return false; b.click(); return true; })()`;
const docSettled = `(() => document.querySelector('.ed-redline-doc') !== null && document.querySelector('.ed-redline-view .ed-skeleton') === null)()`;
const hasChanges = (n) =>
  `(() => { const d = document.querySelector('.ed-redline-doc'); return d !== null && d.querySelectorAll('.ed-redline-change').length === ${String(n)}; })()`;

async function cdpForAppWindow(timeoutMs) {
  const started = Date.now();
  for (;;) {
    let port = 0;
    try {
      port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim());
    } catch {
      port = 0;
    }
    if (port > 0) {
      let list = [];
      try {
        list = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json();
      } catch {
        list = [];
      }
      for (const t of list) {
        if (t.type !== 'page' || !t.webSocketDebuggerUrl) continue;
        let cdp = null;
        try {
          cdp = await wsConnect(t.webSocketDebuggerUrl, { collect: [] });
          const a = await cdpEval(
            cdp,
            `typeof window.gmux === 'object' && typeof window.__gmuxShotDrive === 'function' ? location.href : null`,
            5000
          );
          if (typeof a === 'string') return { cdp, url: a };
          cdp.close();
        } catch {
          if (cdp) {
            try {
              cdp.close();
            } catch {
              /* closed */
            }
          }
        }
      }
    }
    if (Date.now() - started > timeoutMs) throw new Error('no app window');
    await sleep(200);
  }
}

const until = async (cdp, expr, ms) => {
  const s = Date.now();
  for (;;) {
    let v = null;
    try {
      v = await cdpEval(cdp, expr, 10000);
    } catch {
      v = null;
    }
    if (v === true) return true;
    if (Date.now() - s > ms) return false;
    await sleep(120);
  }
};

/**
 * HOW LONG THE REDRAW TOOK, in milliseconds, polled at roughly one CDP round
 * trip. This is PR 28's author's own complaint of 2026-09-16: "when I option
 * delete instead of option return, the delete takes a little bit of time...
 * option return is instantaneous". The two verbs are timed the same way here
 * so the claim is a pair of numbers rather than an impression, and the head
 * grader holds them against each other.
 */
async function msUntil(cdp, n, capMs, from) {
  const t0 = from ?? Date.now();
  for (;;) {
    let ok = false;
    try {
      ok = (await cdpEval(cdp, hasChanges(n), 10000)) === true;
    } catch {
      ok = false;
    }
    if (ok) return Date.now() - t0;
    if (Date.now() - t0 > capMs) return -1;
    await sleep(20);
  }
}

/**
 * A chord dispatched WITHOUT the trailing sleep `press` takes, so a stopwatch
 * can be started at the keydown rather than 300 ms after it. Returns the
 * moment the keydown went out.
 */
async function pressTimed(cdp, { key, code, vk, modifiers }) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  const t0 = Date.now();
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  return t0;
}
const drive = (cdp, spec) =>
  cdpEval(cdp, `window.__gmuxShotDrive(${JSON.stringify(spec)}).then(() => true)`, 90000);
const face = (cdp) => cdpEval(cdp, FACE, 20000);

// CDP modifier bits: Alt 1, Ctrl 2, Meta 4, Shift 8.
const CHORD = {
  next: { key: 'ArrowDown', code: 'ArrowDown', vk: 40, modifiers: 1 },
  prev: { key: 'ArrowUp', code: 'ArrowUp', vk: 38, modifiers: 1 },
  accept: { key: 'Enter', code: 'Enter', vk: 13, modifiers: 1 },
  rewind: { key: 'Backspace', code: 'Backspace', vk: 8, modifiers: 1 },
  // PHASE 282's arms. ⌥⇧⌫ is the undo the face names; Enter carries its own
  // text, or Chromium makes no editing command of it and the page sees no
  // `beforeinput` (build/probe-p237-typing.mjs measured it).
  undo: { key: 'Backspace', code: 'Backspace', vk: 8, modifiers: 1 | 8 },
  save: { key: 's', code: 'KeyS', vk: 83, modifiers: 4 },
  enter: { key: 'Enter', code: 'Enter', vk: 13, modifiers: 0, text: '\r' }
};
async function press(cdp, { key, code, vk, modifiers }) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(300);
}

/** Open the fixture file in Redline, for keeps. */
async function openRedline(cdp, rel) {
  await drive(cdp, { projectPath: project, openRel: rel, mode: 'file' });
  await sleep(700);
  await cdpEval(cdp, clickMode('Redline'));
  await until(cdp, docSettled, 20000);
  await sleep(500);
  return face(cdp);
}

const readings = { mode: PARENT ? 'parent' : PR28_HEAD ? 'pr28' : 'head' };

/**
 * THE HEAD DRIVE: what this round ships, claim by claim. Every arm reads the
 * live DOM, and the two digests split the file's movement by verb so an accept
 * that wrote and a rewind that did not are both visible.
 */
async function driveHead(cdp) {
  const start = await face(cdp);
  readings.startChanges = start.changes;
  readings.startDels = start.dels;
  check('H0', 'the redline drew the eight edits against the committed draft', start.changes === 8, `${String(start.changes)} changes`);

  await press(cdp, CHORD.next);
  readings.a1 = await face(cdp);
  check(
    'H1',
    'one ⌥↓ marks the first change and puts the keyboard on it',
    readings.a1.currentIndex === 0 && readings.a1.currentCount === 1 && readings.a1.activeIndex === 0,
    `current ${String(readings.a1.currentIndex)}, keyboard ${JSON.stringify(readings.a1.activeClass)}`
  );

  // THE LOOP, both ways, from the ends.
  await press(cdp, CHORD.prev);
  readings.loopUp = await face(cdp);
  check(
    'H2',
    'THE LOOP: ⌥↑ from the first change comes round to the last',
    readings.loopUp.currentIndex === 7 && readings.loopUp.currentCount === 1,
    `current ${String(readings.loopUp.currentIndex)} of ${String(readings.loopUp.changes)}`
  );
  await press(cdp, CHORD.next);
  readings.loopDown = await face(cdp);
  check(
    'H3',
    'and ⌥↓ from the last comes round to the first',
    readings.loopDown.currentIndex === 0,
    `current ${String(readings.loopDown.currentIndex)}`
  );

  // THE ACCEPT, and the point of the round: a second one with no ⌥↓ between.
  const before = await face(cdp);
  const fileBefore = digest(NOTES);
  readings.acceptWaitMs = await msUntil(cdp, 7, 5000, await pressTimed(cdp, CHORD.accept));
  await until(cdp, hasChanges(7), 20000);
  readings.accept1 = await face(cdp);
  const afterAccept = digest(NOTES);
  readings.acceptsMovedFile = afterAccept !== fileBefore;
  check('H4', 'the accept dropped the change it was pressed on', readings.accept1.changes === 7, `${String(before.changes)} -> ${String(readings.accept1.changes)} changes`);
  check('H5', 'and moved not one byte of the file', readings.acceptsMovedFile === false, `digest ${fileBefore} -> ${afterAccept}`);
  check(
    'H6',
    'the change that followed the accepted one is now current, with the keyboard on it and the controls drawn',
    readings.accept1.currentCount === 1 &&
      readings.accept1.dels[readings.accept1.currentIndex] === before.dels[1] &&
      readings.accept1.activeIndex === readings.accept1.currentIndex &&
      readings.accept1.chipDrawn === true,
    `current "${String(readings.accept1.dels[readings.accept1.currentIndex]).slice(0, 30)}", keyboard on ${JSON.stringify(readings.accept1.activeClass)}, chip ${String(readings.accept1.chipDrawn)}`
  );

  await press(cdp, CHORD.accept);
  await until(cdp, hasChanges(6), 20000);
  readings.accept2 = await face(cdp);
  check(
    'H7',
    'THE POINT: ⌥↩ again, with no ⌥↓ in between, accepted the next change',
    readings.accept2.changes === 6 && readings.accept2.dels[readings.accept2.currentIndex] === before.dels[2],
    `${String(readings.accept1.changes)} -> ${String(readings.accept2.changes)} changes`
  );

  // THE REWIND, PR 28's author's second ask: it writes the file AND moves on.
  // The keyboard is already on the change that followed the accept, so this is
  // the chord path PR 28's author uses, with no pointer touched anywhere.
  const beforeRewind = await face(cdp);
  const digestBeforeRewind = digest(NOTES);
  readings.rewindWaitMs = await msUntil(cdp, 5, 20000, await pressTimed(cdp, CHORD.rewind));
  await until(cdp, hasChanges(5), 20000);
  await until(cdp, `document.querySelector('.ed-redline-change[data-current]') !== null`, 8000);
  readings.rewind = await face(cdp);
  const digestAfterRewind = digest(NOTES);
  readings.rewindMovedFile = digestAfterRewind !== digestBeforeRewind;
  check('H8', 'the rewind wrote the file', readings.rewindMovedFile === true, `digest ${digestBeforeRewind} -> ${digestAfterRewind}`);
  note(
    'H8b',
    'HOW LONG EACH VERB TOOK TO REDRAW, from the key to the picture',
    `accept ${String(readings.acceptWaitMs)} ms, rewind ${String(readings.rewindWaitMs)} ms`
  );
  check(
    'H9',
    'THE SECOND ASK: the rewind left the change that followed it current, with the keyboard on it',
    readings.rewind.changes === 5 &&
      readings.rewind.currentCount === 1 &&
      readings.rewind.dels[readings.rewind.currentIndex] === beforeRewind.dels[1] &&
      readings.rewind.activeIndex === readings.rewind.currentIndex,
    `current "${String(readings.rewind.dels[readings.rewind.currentIndex]).slice(0, 30)}", keyboard on ${JSON.stringify(readings.rewind.activeClass)}`
  );

  // And the arrows still loop after a press.
  await press(cdp, CHORD.prev);
  readings.loopUp2 = await face(cdp);
  check(
    'H10',
    'the loop survives a press: ⌥↑ comes round to the last remaining change',
    readings.loopUp2.currentIndex === 4,
    `current ${String(readings.loopUp2.currentIndex)} of ${String(readings.loopUp2.changes)}`
  );
  await press(cdp, CHORD.next);
  readings.loopDown2 = await face(cdp);
  check(
    'H11',
    'and ⌥↓ comes back round to the first',
    readings.loopDown2.currentIndex === 0,
    `current ${String(readings.loopDown2.currentIndex)}`
  );

  // The end: accepts forward until the picture is empty, then every chord is a
  // no-op and the keyboard is still in the view.
  let last = readings.loopDown2;
  for (let i = 0; i < 12 && last.changes > 0; i += 1) {
    await press(cdp, CHORD.accept);
    await until(cdp, hasChanges(last.changes - 1), 20000);
    last = await face(cdp);
  }
  readings.end = last;
  readings.acceptsAfterRewindMovedFile = digest(NOTES) !== digestAfterRewind;
  check('H12', 'accepting forward empties the redline', last.changes === 0, `${String(last.changes)} changes remain`);
  check('H13', 'and no later accept moved a byte of the file', readings.acceptsAfterRewindMovedFile === false, `digest ${digestAfterRewind} -> ${digest(NOTES)}`);
  await press(cdp, CHORD.accept);
  readings.emptyAccept = await face(cdp);
  check('H14', 'a ⌥↩ past the last change is a no-op rather than a wrap to the top', readings.emptyAccept.changes === 0, `${String(readings.emptyAccept.changes)} changes`);
  check('H15', 'and the keyboard is still in the view', readings.emptyAccept.activeInView === true, `keyboard on ${JSON.stringify(readings.emptyAccept.activeClass)}`);
  await press(cdp, CHORD.next);
  await press(cdp, CHORD.prev);
  readings.emptyStep = await face(cdp);
  check(
    'H16',
    'the arrows on an empty redline mark nothing and draw nothing',
    readings.emptyStep.changes === 0 && readings.emptyStep.currentCount === 0,
    `${String(readings.emptyStep.changes)} changes, ${String(readings.emptyStep.currentCount)} marked`
  );
}

/**
 * THE PARENT DRIVE: the build PR 28's author reported against, graded the other
 * way round. It is shorter on purpose — the point is the defect, and every
 * move this round ships is a reading that the parent cannot make.
 */
async function driveParent(cdp) {
  const start = await face(cdp);
  readings.startChanges = start.changes;
  readings.startDels = start.dels;
  check('P0', 'the redline drew the eight edits against the committed draft', start.changes === 8, `${String(start.changes)} changes`);

  await press(cdp, CHORD.next);
  readings.a1 = await face(cdp);
  check('P1', 'one ⌥↓ marks the first change', readings.a1.currentIndex === 0, `current ${String(readings.a1.currentIndex)}`);

  // THE ENDS, read from the two ends. The top is one ⌥↑ away; the bottom is
  // eight ⌥↓ presses (seven steps to the last change, one more that either
  // clamps or loops).
  await press(cdp, CHORD.prev);
  readings.loopUp = await face(cdp);
  for (let i = 0; i < 8; i += 1) await press(cdp, CHORD.next);
  readings.loopDown = await face(cdp);
  note(
    'P2',
    'THE ENDS AT THE PARENT: ⌥↑ at the first change and ⌥↓ at the last',
    `loopUp current ${String(readings.loopUp.currentIndex)} (HEAD loops to 7), loopDown current ${String(readings.loopDown.currentIndex)} (HEAD loops to 1)`
  );

  // THE ACCEPT, chord in and chord out, which is the shape PR 28's author
  // reported: the change at the bottom of the document is the one under the
  // keyboard when the press is made.
  await press(cdp, CHORD.accept);
  await until(cdp, hasChanges(7), 20000);
  readings.accept1 = await face(cdp);
  readings.acceptsMovedFile = false;
  note(
    'P3',
    'the first accept at the parent',
    `changes ${String(readings.accept1.changes)}, current ${String(readings.accept1.currentIndex)}, keyboard on ${JSON.stringify(readings.accept1.activeClass)}, chip ${String(readings.accept1.chipDrawn)}`
  );

  await press(cdp, CHORD.accept);
  await sleep(700);
  readings.accept2 = await face(cdp);
  check(
    'P4',
    'THE DEFECT: a second ⌥↩ with no ⌥↓ accepts nothing',
    readings.accept2.changes === 7,
    `${String(readings.accept1.changes)} -> ${String(readings.accept2.changes)} changes`
  );

  // THE REWIND, chord in as well: one ⌥↓ from nowhere marks the first change.
  await press(cdp, CHORD.next);
  const digestBeforeRewind = digest(NOTES);
  await press(cdp, CHORD.rewind);
  await until(cdp, hasChanges(6), 20000);
  readings.rewind = await face(cdp);
  readings.rewindMovedFile = digest(NOTES) !== digestBeforeRewind;
  note(
    'P5',
    'the rewind at the parent: it writes the file and leaves nothing current',
    `digest moved ${String(readings.rewindMovedFile)}, changes ${String(readings.rewind.changes)}, current ${String(readings.rewind.currentIndex)}, keyboard on ${JSON.stringify(readings.rewind.activeClass)}`
  );
}

// ---------------------------------------------------------------------------
// PHASE 282's ARMS. Each writes its own changes into the scratch file, marks
// the change it presses by the word that change INSERTS, and reads the live DOM
// and the real disk afterwards. Every wait is bounded, so a build that does not
// do what an arm expects still reaches its grade rather than the ceiling.
// ---------------------------------------------------------------------------

const readNotes = () => readFileSync(join(project, NOTES), 'utf8');

/** A person's click on the scroller: the keyboard back in the view, the current change kept. */
const focusHost = `(() => { const s = document.querySelector('.ed-redline-scroll'); if (s === null) return false; s.focus(); return s.contains(document.activeElement); })()`;

async function faceUntil(cdp, test, ms) {
  const started = Date.now();
  let f = await face(cdp);
  while (!test(f) && Date.now() - started < ms) {
    await sleep(60);
    f = await face(cdp);
  }
  return f;
}
/** ⌥↓ until the change inserting `word` is current, at most one lap and a step. */
async function markInserting(cdp, word) {
  let f = await face(cdp);
  for (let i = 0; i <= f.changes + 1 && f.inss[f.currentIndex] !== word; i += 1) {
    await press(cdp, CHORD.next);
    f = await face(cdp);
  }
  return f;
}
/** ⌥↩ forward until `keep` changes remain. Accepts write nothing to the file. */
async function acceptDownTo(cdp, keep) {
  let f = await face(cdp);
  for (let i = 0; i < 16 && f.changes > keep; i += 1) {
    if (f.currentCount === 0) await press(cdp, CHORD.next);
    const n = f.changes;
    await press(cdp, CHORD.accept);
    f = await faceUntil(cdp, (g) => g.changes === n - 1, 8000);
  }
  return f;
}
/** A key down and up with no trailing sleep, carrying its text when it has one. */
async function keyNow(cdp, { key, code, vk, modifiers, text }) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  if (text !== undefined) {
    base.text = text;
    base.unmodifiedText = text;
  }
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
/** One printable character, as the char event a page's `beforeinput` sees (build/probe-p237-typing.mjs). */
async function typeChar(cdp, ch) {
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
}

/**
 * Arm T's reads, installed in the page. The CURRENT side is every text leaf of
 * the document outside a deletion, which is the file when the tab is clean;
 * the caret is counted on that side through a Range, so a caret parked on an
 * element boundary after Enter is still an offset rather than the end.
 */
const TYPING_READS = `(() => {
  const doc = () => document.querySelector('.ed-redline-doc');
  const leaves = () => {
    const out = [];
    const walk = document.createTreeWalker(doc(), NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n !== null; n = walk.nextNode()) {
      if (n.parentElement === null || n.parentElement.closest('[data-redline-del]') === null) out.push(n);
    }
    return out;
  };
  const at = () => {
    const s = getSelection();
    if (s === null || s.rangeCount === 0 || s.focusNode === null || !doc().contains(s.focusNode)) return -1;
    const r = document.createRange();
    r.setStart(doc(), 0);
    r.setEnd(s.focusNode, s.focusOffset);
    let total = 0;
    for (const n of leaves()) {
      if (n === s.focusNode) return total + s.focusOffset;
      if (r.comparePoint(n, n.length) !== 0) break;
      total += n.length;
    }
    return total;
  };
  window.__moveOn = {
    current: () => leaves().map((n) => n.nodeValue).join(''),
    put: (offset) => {
      let total = 0;
      for (const n of leaves()) {
        if (offset <= total + n.length) {
          const r = document.createRange();
          r.setStart(n, offset - total);
          r.collapse(true);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
          doc().focus();
          return true;
        }
        total += n.length;
      }
      return false;
    },
    read: () => ({
      current: leaves().map((n) => n.nodeValue).join(''),
      caret: at(),
      insTexts: Array.from(doc().querySelectorAll('[data-redline-ins]')).map((e) => e.textContent ?? '')
    })
  };
  return true;
})()`;

/** A held key repeats every 30 to 50 ms (build/p282/SPEC.md §1.6); six repeats at 40 ms. */
const REPEATS = 6;
const TYPED = 'swiftly ';
const ARM_MODE = PR28_HEAD ? 'pr28' : 'head';

/** One `check` row for one arm, graded on its own in this run's mode. */
function armCheck(step, key, claimHead, claimPr28, detail) {
  const found = gradeArms(readings, ARM_MODE)[key];
  check(step, PR28_HEAD ? claimPr28 : claimHead, found.length === 0, found.length === 0 ? detail : `${found.join('; ')} (${detail})`);
}

async function driveArms(cdp) {
  // O. AN OUTSIDE WRITE ABOVE THE CURRENT CHANGE, the moment before ⌥⌫. The
  // four changes sit in paragraphs 2, 4, 6 and 8; ⌥⌫ is pressed on paragraph
  // 4's, and the outside write adds a change in paragraph 1, above both it and
  // the change before it, so the index rule and the identity rule land on
  // different changes. The write is this process's own synchronous
  // writeFileSync, on disk before the keyDown leaves, and `agentDrawnAtPress`
  // proves the watcher had not drawn it when the key was read.
  await cdpEval(cdp, focusHost);
  const baseO = readNotes();
  const fileO = withMarkers(baseO, [[2, 'kilo'], [4, 'lima'], [6, 'mike'], [8, 'november']]);
  shellWrite(NOTES, fileO);
  const drawnO = await faceUntil(cdp, (f) => ['kilo', 'lima', 'mike', 'november'].every((w) => f.inss.includes(w)), 20000);
  await cdpEval(cdp, focusHost);
  const markedO = await markInserting(cdp, 'lima');
  const atO = markedO.currentIndex;
  const agentText = paragraphsOf(fileO)
    .map((p, i) => (i === 0 ? p.replace('body carries', 'body holds') : p))
    .join('\n\n');
  writeFileSync(join(project, NOTES), agentText);
  const wroteAt = Date.now();
  const keyAt = await pressTimed(cdp, CHORD.rewind);
  const atPress = await face(cdp);
  const landedO = await faceUntil(
    cdp,
    (f) => f.inss.includes('holds') && !f.inss.includes('lima') && f.currentCount === 1,
    10000
  );
  readings.o = {
    drawn: drawnO.changes === 4 && ['kilo', 'lima', 'mike', 'november'].every((w) => drawnO.inss.includes(w)),
    marked: atO >= 0 && markedO.inss[atO] === 'lima',
    writeToKeyMs: keyAt - wroteAt,
    agentDrawnAtPress: atPress.inss.includes('holds'),
    pressedIns: 'lima',
    followerIns: markedO.inss[atO + 1] ?? null,
    beforeIns: atO > 0 ? (markedO.inss[atO - 1] ?? null) : null,
    landedOn: landedO.currentCount === 1 ? (landedO.inss[landedO.currentIndex] ?? null) : null,
    activeOnCurrent: landedO.currentIndex >= 0 && landedO.activeIndex === landedO.currentIndex,
    changesAfter: landedO.changes,
    fileAsExpected: readNotes() === withMarkers(agentText, [[4, markerOf(baseO, 4)]])
  };
  armCheck(
    'O',
    'o',
    'O. AN OUTSIDE WRITE ABOVE, then ⌥⌫: the move lands on the change that followed, found by its words',
    'O at PR 28’s head: after an outside write above, the move lands on the change BEFORE the one that followed',
    `pressed "lima", follower ${JSON.stringify(readings.o.followerIns)}, before ${JSON.stringify(readings.o.beforeIns)}, landed ${JSON.stringify(readings.o.landedOn)}, write to key ${String(readings.o.writeToKeyMs)} ms`
  );

  // L. ⌥⌫ ON THE ONLY REMAINING CHANGE. The accepts write nothing, so the file
  // still holds every word O left. One ⌥↓ with a single change comes round to
  // it and puts the keyboard ON its wrapper, which is the element the rewind
  // removes; the undo is pressed with no click, wherever the keyboard was left.
  await cdpEval(cdp, focusHost);
  await acceptDownTo(cdp, 1);
  await press(cdp, CHORD.next);
  const lastOne = await face(cdp);
  const digestL = digest(NOTES);
  await pressTimed(cdp, CHORD.rewind);
  const goneL = await faceUntil(cdp, (f) => f.changes === 0, 10000);
  await sleep(400);
  const restL = await face(cdp);
  const rewoundDigestL = digest(NOTES);
  await press(cdp, CHORD.undo);
  const backL = await faceUntil(cdp, (f) => f.changes === 1, 6000);
  readings.l = {
    remaining: lastOne.changes,
    keyboardOnChange: lastOne.activeIsChange,
    pressedIns: lastOne.inss[lastOne.currentIndex] ?? null,
    rewound: goneL.changes === 0 && rewoundDigestL !== digestL,
    activeInView: restL.activeInView,
    activeClass: restL.activeClass,
    undoChanges: backL.changes,
    undoIns: backL.inss[0] ?? null,
    digestBack: digest(NOTES) === digestL
  };
  armCheck(
    'L',
    'l',
    'L. ⌥⌫ on the only change keeps the keyboard in the view, and ⌥⇧⌫ brings the change back',
    'L at PR 28’s head: the keyboard drops with the last change, and ⌥⇧⌫ does nothing',
    `keyboard on ${JSON.stringify(readings.l.activeClass)}, ${String(readings.l.undoChanges)} change(s) after ⌥⇧⌫, digest back ${String(readings.l.digestBack)}`
  );

  // C. ⌥⌫ AND ⌥↩ BACK TO BACK on paragraph 5's change, with no redraw awaited.
  // Paragraphs 3, 5 and 7 are ones no arm before this touched, so the file's
  // words there are the baseline's. A change drawn with `papa` DELETED is the
  // accept having taken it and the rewind having landed on top: drawn
  // backwards. The toasts are collected for 2.5 s, because an info toast
  // leaves after five.
  await cdpEval(cdp, focusHost);
  const baseC = readNotes();
  const fileC = withMarkers(baseC, [[3, 'oscar'], [5, 'papa'], [7, 'quebec']]);
  shellWrite(NOTES, fileC);
  const drawnC = await faceUntil(cdp, (f) => ['oscar', 'papa', 'quebec'].every((w) => f.inss.includes(w)), 20000);
  await cdpEval(cdp, focusHost);
  const markedC = await markInserting(cdp, 'papa');
  const rewindAt = await pressTimed(cdp, CHORD.rewind);
  const acceptAt = await pressTimed(cdp, CHORD.accept);
  const seen = new Set();
  let afterC = await face(cdp);
  for (const stop = Date.now() + 2500; Date.now() < stop; ) {
    for (const t of afterC.toasts) seen.add(t);
    await sleep(50);
    afterC = await face(cdp);
  }
  for (const t of afterC.toasts) seen.add(t);
  readings.c = {
    drawn: ['oscar', 'papa', 'quebec'].every((w) => drawnC.inss.includes(w)),
    marked: markedC.inss[markedC.currentIndex] === 'papa',
    gapMs: acceptAt - rewindAt,
    before: markedC.changes,
    after: afterC.changes,
    backwards: afterC.dels.includes('papa'),
    heldSentence: seen.has(HELD_ACCEPT),
    toasts: [...seen],
    fileHoldsRewind: readNotes() === withMarkers(fileC, [[5, markerOf(baseC, 5)]])
  };
  armCheck(
    'C',
    'c',
    'C. ⌥⌫ ⌥↩ back to back: nothing is drawn backwards, the file holds the rewind, and a refused accept says the one-press sentence',
    'C at PR 28’s head: ⌥↩ accepts the change ⌥⌫ is rewinding, and it is drawn backwards',
    `${String(readings.c.before)} -> ${String(readings.c.after)} changes, chords ${String(readings.c.gapMs)} ms apart, held sentence ${String(readings.c.heldSentence)}, toasts ${JSON.stringify(readings.c.toasts)}`
  );

  // R. A HELD ⌥⌫. Everything is accepted first so the three new changes are
  // the whole picture, and the file after is compared with the one rewind of
  // paragraph 2 that a single press makes, paragraph by paragraph.
  await cdpEval(cdp, focusHost);
  await acceptDownTo(cdp, 0);
  const baseR = readNotes();
  const fileR = withMarkers(baseR, [[2, 'romeo'], [4, 'sierra'], [6, 'tango']]);
  shellWrite(NOTES, fileR);
  const drawnR = await faceUntil(
    cdp,
    (f) => f.changes === 3 && ['romeo', 'sierra', 'tango'].every((w) => f.inss.includes(w)),
    20000
  );
  await cdpEval(cdp, focusHost);
  const markedR = await markInserting(cdp, 'romeo');
  // What the PAGE saw, read by a capture listener of this probe's own, so a
  // runtime that dropped CDP's `autoRepeat` shows up as the arm not holding
  // the key rather than as the view running every repeat.
  await cdpEval(
    cdp,
    `(() => { window.__moveOnRepeats = []; if (window.__moveOnListening !== true) { window.__moveOnListening = true; window.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && e.altKey && Array.isArray(window.__moveOnRepeats)) window.__moveOnRepeats.push(e.repeat); }, { capture: true }); } return true; })()`
  );
  const held = { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, modifiers: 1 };
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...held });
  for (let i = 0; i < REPEATS; i += 1) {
    await sleep(40);
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...held, autoRepeat: true });
  }
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...held });
  const repeatFlags = (await cdpEval(cdp, 'window.__moveOnRepeats')) ?? [];
  await faceUntil(cdp, (f) => !f.inss.includes('romeo'), 8000);
  await sleep(1500);
  const afterR = await face(cdp);
  const fileAfterR = readNotes();
  readings.r = {
    drawn: drawnR.changes === 3,
    marked: markedR.inss[markedR.currentIndex] === 'romeo',
    repeats: REPEATS,
    firstNotRepeat: repeatFlags[0] === false,
    repeatsSeen: repeatFlags.filter((f) => f === true).length,
    before: markedR.changes,
    after: afterR.changes,
    paragraphsMoved: paragraphsMoved(fileR, fileAfterR),
    oneRewind: fileAfterR === withMarkers(fileR, [[2, markerOf(baseR, 2)]]),
    unsaved: afterR.unsaved
  };
  armCheck(
    'R',
    'r',
    'R. a held ⌥⌫ rewinds one change and moves one paragraph of the file',
    'R at PR 28’s head: a held ⌥⌫ rewinds more than one change',
    `${String(readings.r.before)} -> ${String(readings.r.after)} changes, ${String(readings.r.paragraphsMoved)} paragraph(s) moved, ${String(REPEATS)} repeats`
  );

  // T. A TYPING BURST in paragraph 7, which R left unchanged, at 30 ms a key,
  // Enter included, then ⌘S. The expected file is computed here from the bytes
  // on disk before the first key, never read back from the app.
  await cdpEval(cdp, TYPING_READS);
  const baseT = readNotes();
  const typeAt = baseT.indexOf('enough sentences', baseT.indexOf('Paragraph 7 of'));
  const drawnT = await cdpEval(cdp, 'window.__moveOn.current()');
  await cdpEval(cdp, `window.__moveOn.put(${String(typeAt)})`);
  await sleep(200);
  for (const ch of TYPED) {
    await typeChar(cdp, ch);
    await sleep(30);
  }
  await keyNow(cdp, CHORD.enter);
  await sleep(600);
  const typed = await cdpEval(cdp, 'window.__moveOn.read()');
  const expectedT = `${baseT.slice(0, typeAt)}${TYPED}\n${baseT.slice(typeAt)}`;
  await press(cdp, CHORD.save);
  let onDisk = readNotes();
  for (const stop = Date.now() + 15000; onDisk === baseT && Date.now() < stop; ) {
    await sleep(100);
    onDisk = readNotes();
  }
  await sleep(300);
  onDisk = readNotes();
  readings.t = {
    precondition: typeAt > 0 && drawnT === baseT,
    typedCurrent: typed.current === expectedT,
    caret: typed.caret === typeAt + TYPED.length + 1,
    insertion: typed.insTexts.some((s) => s.includes(TYPED.trim())),
    savedExact: onDisk === expectedT,
    savedNear: onDisk.slice(Math.max(0, typeAt - 12), typeAt + TYPED.length + 12)
  };
  armCheck(
    'T',
    't',
    'T. a word and Enter at 30 ms a key, then ⌘S: drawn as an insertion at the caret, and the file is exactly what was typed',
    'T at PR 28’s head: the burst is scrambled and ⌘S saves the scramble',
    `on disk near the caret ${JSON.stringify(readings.t.savedNear)}, caret ${String(typed.caret)} of ${String(typeAt + TYPED.length + 1)}`
  );
}

await withElectron(
  {
    label: 'moveon',
    userDataDir: profile,
    tmuxSocket: null,
    cwd: REPO,
    args: ['--remote-debugging-port=0', '--use-mock-keychain'],
    env: withoutDevRenderer({ HOME: home, GMUX_TMUX_SOCKET: socket, GMUX_PROBES: '1' }),
    ceilingMs: 15 * 60 * 1000
  },
  async (handle) => {
    const { cdp, url } = await cdpForAppWindow(90000);
    say(`app window at ${url}, pid ${String(handle.appPid())}`);
    try {
      await cdp.call('Runtime.enable');
      await cdp.call('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
      });
      for (;;) {
        if ((await cdpEval(cdp, `performance.getEntriesByType('navigation')[0].loadEventEnd`)) > 0) break;
        await sleep(50);
      }
      await drive(cdp, { projectPath: project, editorWidth: 1000, sidebarWidth: 300 });
      await sleep(1500);

      // The agent's write: the committed draft against eight moved words.
      shellWrite(NOTES, version(1));
      await openRedline(cdp, NOTES);
      await until(cdp, hasChanges(8), 30000);

      if (PARENT) await driveParent(cdp);
      else await driveHead(cdp);

      // PR 28's head has the move-on, so H is graded there exactly as at HEAD.
      const bad = grade(readings, PARENT ? 'parent' : 'head');
      check(
        'G1',
        PARENT
          ? 'THE PARENT: the arrows stop at the ends, an accept leaves nothing current, the second ⌥↩ accepts nothing, and the rewind leaves nothing current'
          : 'THE WHOLE ROUND: both verbs move on, the arrows loop, the file moves only when a rewind writes it, and the end of the document is quiet',
        bad.length === 0,
        bad.length === 0 ? 'every arm above agrees' : bad.join('; ')
      );

      if (PARENT) {
        note('G2', 'PHASE 282’s arms O, L, C, R and T were not run', 'they are graded against PR 28’s head: ACCEPT_ADVANCE_PARENT=282');
      } else {
        await driveArms(cdp);
        const graded = gradeArms(readings, PR28_HEAD ? 'pr28' : 'head');
        const armBad = armFindings(graded);
        check(
          'G2',
          PR28_HEAD
            ? 'PR 28’S HEAD: the move lands one change early after an outside write, the keyboard drops with the last change, ⌥⌫ ⌥↩ draws a change backwards, a held ⌥⌫ rewinds more than one, and a typing burst is saved scrambled'
            : 'PHASE 282: the move follows the change that came next, the keyboard stays, one press is one press, and a typing burst is saved whole',
          armBad.length === 0,
          armBad.length === 0 ? 'every Phase 282 arm agrees' : armBad.join('; ')
        );
      }
    } finally {
      writeFileSync(readingsFile, JSON.stringify(readings, null, 2));
      cdp.close();
    }
  }
);

const sessionsAfter = machineSessionCount();
check(
  'X1',
  '-L gmux sessions on this machine unmoved',
  sessionsBefore === sessionsAfter,
  `${String(sessionsBefore)} -> ${String(sessionsAfter)}`
);
say('');
say(`${String(rows.filter((r) => r.pass === true).length)} passed, ${String(failures.length)} failed, ${String(rows.filter((r) => r.pass === null).length)} notes`);
say(`readings at ${readingsFile}`);
if (failures.length > 0) {
  for (const f of failures) say(`FAILURE: ${f}`);
  process.exit(1);
}
process.exit(0);
