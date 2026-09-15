/**
 * PHASE 273, half two. The refusal words a save can put in front of a person,
 * and the one thing each of them may and may not say.
 *
 * The defect this pins is issue 25. `outside` carried at least six causes and
 * its sentence asserted one of them — "because its project is not open" — so
 * belucid, whose project WAS open and whose path was refused by containment,
 * read a sentence that was false twice, on every file, forever. The repair is
 * a word per remedy, and the thing a unit test can hold is that no word says
 * something it did not measure.
 *
 * It reads sentences and one pure mapping function. It opens no file, starts
 * no process and names no path on this machine.
 */

import { describe, expect, it } from 'vitest';
import type { FsGuardedWriteRefusal } from '@shared/fs-ops';
import type { SaveRefusalWord } from '../save-sentences';
import { saveRefusalSentence } from '../save-sentences';
import { rewindRefusalKey } from '../rewind';
// The channel itself, for the one assertion no sentence can make: which word
// comes back when Tortie cannot read its own list of projects. It is main-side
// code and this is a renderer test, which is deliberate — the word and the
// sentence are one promise and splitting them across two files is how they
// drift apart. Nothing is written: the refusal happens before the path is
// resolved, let alone opened.
import { writeGuarded } from '../../../main/fs/guarded-write';

/**
 * Every word the channel can answer. Written out rather than derived, because
 * a list derived from the union under test cannot notice a word going missing
 * from it — and this list going stale is a compile error at `WORDS`, below.
 */
const ALL: FsGuardedWriteRefusal[] = [
  'input',
  'outside',
  'projectClosed',
  'unreadable',
  'protected',
  'projectsUnknown',
  'missing',
  'link',
  'readOnly',
  'tooLarge',
  'notUtf8',
  'raced',
  'io'
];

/** The same list minus `link`, which takes the plain door and says nothing. */
const WORDS: SaveRefusalWord[] = ALL.filter((w): w is SaveRefusalWord => w !== 'link');

/** The sentence that shipped as `outside` and belongs to one cause only. */
const CLOSED =
  'Tortie did not save notes.txt, because its project is not open — open it again and save. Nothing was written.';

describe('the save refusal words', () => {
  it('says one whole sentence for every word, with the name filled in', () => {
    for (const why of WORDS) {
      const s = saveRefusalSentence(why, 'notes.txt');
      expect(s.length, why).toBeGreaterThan(0);
      expect(s.includes('\n'), why).toBe(false);
      expect(s.endsWith('.'), why).toBe(true);
      expect(s.includes('{name}'), why).toBe(false);
      expect(s.includes('notes.txt'), why).toBe(true);
    }
  });

  it('says the closed-project sentence under projectClosed and under nothing else', () => {
    // THE MOVE IS THE FIX. The sentence was written for a closed project and
    // is right for one; it was only ever wrong about which word carried it.
    expect(saveRefusalSentence('projectClosed', 'notes.txt')).toBe(CLOSED);
    for (const why of WORDS) {
      if (why === 'projectClosed') continue;
      expect(saveRefusalSentence(why, 'notes.txt'), why).not.toBe(CLOSED);
    }
  });

  it('claims a project is not open under no word but projectClosed', () => {
    // The stronger form of the test above: not the same string, and not the
    // same CLAIM said another way.
    for (const why of WORDS) {
      if (why === 'projectClosed') continue;
      expect(/project is not open|not in an open project/.test(saveRefusalSentence(why, 'notes.txt')), why).toBe(
        false
      );
    }
  });

  it('tells a person their file is inside a project when it is', () => {
    // A file under `.git` IS inside its project. `protected` exists because
    // the merged sentence would have been false, which is the one exception to
    // "same remedy merges".
    const s = saveRefusalSentence('protected', 'config');
    expect(s.includes('.git')).toBe(true);
    expect(s.includes('inside')).toBe(true);
  });

  it('blames Tortie, not the person, when Tortie could not read its own list', () => {
    // The only sentence in the family that does not begin "Tortie did not save
    // {name}". In all five of its causes Tortie never got as far as asking
    // whether the project is open, so saying it is not would be a lie about
    // the person's world to cover a fault in Tortie's own.
    const s = saveRefusalSentence('projectsUnknown', 'notes.txt');
    expect(s.startsWith('Tortie could not check which projects are open')).toBe(true);
    expect(s.includes('restart')).toBe(true);
  });

  it('names a remedy for every word that has one, and guesses none for the two that do not', () => {
    // `outside` and `protected` have no remedy a person can act on: the
    // renderer composed the path, and Tortie never writes in `.git`. A
    // sentence that cannot name a remedy is better than one that guesses a
    // cause, so neither of them tells a person to do anything.
    for (const why of ['projectClosed', 'unreadable', 'projectsUnknown'] as const) {
      expect(saveRefusalSentence(why, 'notes.txt').includes(' — '), why).toBe(true);
    }
    for (const why of ['outside', 'protected'] as const) {
      expect(saveRefusalSentence(why, 'notes.txt').includes(' — '), why).toBe(false);
    }
  });

  it('asserts no errno, no code and no path in any sentence', () => {
    // `unreadable` covers a folder that is gone, a disk ejected, a permission,
    // a TCC denial and a stalled mount. The errno is in the log line, where
    // somebody can act on it, and never in the sentence, where guessing is the
    // defect this phase removes.
    for (const why of WORDS) {
      const s = saveRefusalSentence(why, 'notes.txt');
      expect(/E[A-Z]{3,}/.test(s), why).toBe(false);
      expect(s.includes('/'), why).toBe(false);
    }
  });
});

describe('the redline reads the new words without repeating the lie', () => {
  const refusal = (why: FsGuardedWriteRefusal) =>
    rewindRefusalKey({ outcome: 'refused', why, reason: 'x' });

  it('keeps outsideRoot for the one cause its sentence describes', () => {
    expect(refusal('projectClosed')).toBe('outsideRoot');
  });

  it('sends the other four new words to io rather than to outsideRoot', () => {
    // `outsideRoot` says "{name} is not in an open project". Letting these
    // fall into `default:` would have been quieter and would have put this
    // phase's own lie back on the redline's surface.
    for (const why of ['outside', 'protected', 'unreadable', 'projectsUnknown'] as const) {
      expect(refusal(why), why).toBe('io');
    }
  });

  it('leaves every word it already mapped where it was', () => {
    expect(refusal('notUtf8')).toBe('decodeLoss');
    expect(refusal('tooLarge')).toBe('fileTooLarge');
    expect(refusal('readOnly')).toBe('readOnly');
    expect(refusal('raced')).toBe('raced');
    expect(refusal('missing')).toBe('io');
    expect(rewindRefusalKey({ outcome: 'stale', sha256: 'a', reason: 'x' })).toBe('stale');
    expect(rewindRefusalKey({ outcome: 'wrote', sha256: 'a', bytes: 1 })).toBe(null);
  });
});

describe('the word when Tortie cannot read its own project list', () => {
  it('answers projectsUnknown rather than a claim about the person\'s project', async () => {
    // THE DEFAULT IS THE POINT. `deps.listProjectRoots()` is a lazy dynamic
    // import plus a core boot plus two SQLite reads, and every one of those
    // failing is Tortie failing to read its OWN list. At the parent commit all
    // of them answered `outside`, which the renderer says as "its project is
    // not open" — a statement about the person's world made to cover a fault
    // in Tortie's.
    const result = await writeGuarded(
      {
        listProjectRoots: () => {
          throw new Error('the manifest could not be opened');
        }
      },
      {
        // A real directory, so the root's own realpath succeeds and the throw
        // under test is the only thing that can refuse this call.
        root: process.cwd(),
        path: 'package.json',
        expect: 'a'.repeat(64),
        contents: 'x'
      }
    );
    expect(result.outcome).toBe('refused');
    if (result.outcome !== 'refused') return;
    expect(result.why).toBe('projectsUnknown');
    // The reason the channel has always computed and never said, now on its
    // way to a log line rather than to nowhere.
    expect(result.reason).toBe('the manifest could not be opened');
    // The round trip a person actually makes: the word the channel answered,
    // through the map that turns it into a sentence. `link` is the one word
    // with no sentence, and it is not reachable from here, so this is a type
    // narrowing rather than a case.
    if (result.why === 'link') throw new Error('unreachable: link has no sentence');
    expect(saveRefusalSentence(result.why, 'package.json')).not.toContain('project is not open');
  });
});
