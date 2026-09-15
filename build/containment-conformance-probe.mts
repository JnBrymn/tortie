/**
 * containment-conformance-probe.mts. The runtime half of
 * `npm run conformance:containment` (Phase 273).
 *
 * Drives the SHIPPING `resolveInsideRoot`, `resolveProjectRoot` and
 * `resolveOpenProjectRoot` under node over a fixture it builds and removes in a
 * `finally`, one arm per row of the phase's escape checklist, and prints ONE
 * JSON line last.
 *
 * It launches no Electron, starts no tmux server, spawns no agent, makes no
 * request, and reads nothing under the person's home: the fixture is a
 * `mkdtemp` directory, the project root list is a function answering that
 * directory, and the only paths it names outside it are '/etc/passwd' and
 * '/nope-xyz/deep/file.txt', neither of which is opened — they are arguments to
 * a guard that must refuse them.
 *
 * The module is loaded from `P273_MODULES` (default `src/main/fs`) so the gate
 * can point the same probe at an ablated copy of the guard. The knob is not
 * `GMUX_` prefixed on purpose: the contract inventory sweeps that prefix.
 *
 * THE VERDICT VOCABULARY, one string per row, because the gate compares
 * strings:
 *
 *   OK:<rel>      the guard accepted the path and answered that `rel`
 *   OUTSIDE       refused, stamped `outside` — the containment answer
 *   INPUT         refused, stamped `input`
 *   UNREADABLE    refused, stamped `unreadable`
 *   PROTECTED     refused, stamped `protected`
 *   PROJECTCLOSED refused, stamped `projectClosed`
 *   UNSTAMPED:X   refused with something this module did not stamp, X being
 *                 the errno or payload code. It is a reading rather than an
 *                 error because the ablations that remove a stamp must show up
 *                 here rather than crashing the probe
 *   SKIPPED-ROOT  the arm needs a directory the process cannot traverse, and
 *                 uid 0 traverses everything
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULES = process.env['P273_MODULES'] ?? 'src/main/fs';

const guard = (await import(
  pathToFileURL(resolve(MODULES, 'paths.ts')).href
)) as typeof import('../src/main/fs/paths');

const { fsPathRefusalOf, resolveInsideRoot, resolveOpenProjectRoot, resolveProjectRoot } =
  guard;

/** uid 0 traverses a mode-000 directory, so two arms have nothing to measure. */
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

/** The errno or payload code an unstamped rejection carries, for the reading. */
function codeOf(err: unknown): string {
  const errno = (err as NodeJS.ErrnoException | null)?.code;
  if (typeof errno === 'string') return errno;
  try {
    const payload = JSON.parse((err as Error).message) as { code?: unknown };
    if (typeof payload.code === 'string') return payload.code;
  } catch {
    // Not one of ours and not an errno. The word below says so.
  }
  return 'none';
}

/** One row's reading: what the guard answered, in the vocabulary above. */
async function reading(
  run: () => Promise<{ abs: string; rel: string }>
): Promise<string> {
  try {
    const { rel } = await run();
    return `OK:${rel}`;
  } catch (err) {
    const word = fsPathRefusalOf(err);
    return word === null ? `UNSTAMPED:${codeOf(err)}` : word.toUpperCase();
  }
}

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'p273-containment-')));
const rows: Record<string, string> = {};

try {
  // -------------------------------------------------------------------------
  // The fixture. One real project, one alias to it, one other project, one
  // prefix-sibling decoy, and every symlink shape the checklist names.
  // -------------------------------------------------------------------------
  const proj = join(scratch, 'proj');
  const outside = join(scratch, 'outside');
  const other = join(scratch, 'other');

  mkdirSync(join(proj, 'src', 'nested'), { recursive: true });
  mkdirSync(join(proj, 'src', '   '), { recursive: true });
  mkdirSync(join(proj, '.git', 'hooks'), { recursive: true });
  mkdirSync(join(proj, 'locked', 'sub'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  mkdirSync(other, { recursive: true });
  mkdirSync(join(scratch, 'proj-evil'), { recursive: true });
  mkdirSync(join(scratch, 'lockedout', 'sub'), { recursive: true });

  writeFileSync(join(proj, 'README.md'), 'x', 'utf8');
  writeFileSync(join(proj, '..notes.md'), 'x', 'utf8');
  writeFileSync(join(proj, 'secret.txt'), 'x', 'utf8');
  writeFileSync(join(proj, 'src', 'index.ts'), 'x', 'utf8');
  writeFileSync(join(proj, 'src', '..dots.md'), 'x', 'utf8');
  writeFileSync(join(proj, '.git', 'config'), 'x', 'utf8');
  writeFileSync(join(outside, 'secret.txt'), 'x', 'utf8');
  writeFileSync(join(other, 'theirs.txt'), 'x', 'utf8');
  writeFileSync(join(scratch, 'proj-evil', 'x.txt'), 'x', 'utf8');
  writeFileSync(join(scratch, 'casefold'), 'x', 'utf8');

  symlinkSync(outside, join(proj, 'escape'));
  symlinkSync('/', join(proj, 'slash'));
  symlinkSync(other, join(proj, 'toother'));
  symlinkSync(join(proj, '.git'), join(proj, 'gitlink'));
  symlinkSync(join(outside, 'secret.txt'), join(proj, 'leaf.txt'));
  symlinkSync(join(scratch, 'nope-dangle'), join(proj, 'dangle'));
  symlinkSync(join(proj, 'loopb'), join(proj, 'loopa'));
  symlinkSync(join(proj, 'loopa'), join(proj, 'loopb'));
  // THE ALIAS. This is belucid's project: a symlink to the folder, which is
  // what `addProject` stores and what the tree concatenates onto.
  symlinkSync(proj, join(scratch, 'alias'));
  // A symlink OUTSIDE the root pointing back INTO it. Nothing in the product
  // makes one; it is here because it is the one shape a relative traversal
  // could ride the new admission with, and the arm's absolute-only bound is
  // what refuses it. The ablation that removes that bound turns this row green.
  symlinkSync(proj, join(scratch, 'backin'));
  // A second link to the alias, so the admitted class is driven through a
  // CHAIN rather than through one hop, and a link inside the project pointing
  // at the project's PARENT, which is the shape that would let an alias path
  // walk back out again if the containment check after the walk were dropped.
  symlinkSync(join(scratch, 'alias'), join(scratch, 'alias2'));
  symlinkSync(scratch, join(proj, 'up'));

  chmodSync(join(proj, 'locked'), 0o000);
  chmodSync(join(scratch, 'lockedout'), 0o000);

  const alias = join(scratch, 'alias');
  const realRoot = realpathSync(proj);
  const caseInsensitive = existsSync(join(scratch, 'CASEFOLD'));

  const inside = (input: unknown, allowRoot = false) =>
    reading(() => resolveInsideRoot(realRoot, input, { allowRoot }));

  // -------------------------------------------------------------------------
  // Rows 1 to 18: every shape that must still be refused.
  // -------------------------------------------------------------------------
  rows['r01a-relative-traversal'] = await inside('../outside/secret.txt');
  rows['r01b-relative-traversal-mid'] = await inside('src/../../outside/secret.txt');
  rows['r01c-relative-dotdot'] = await inside('..');
  rows['r02a-absolute-stranger'] = await inside('/etc/passwd');
  rows['r02b-absolute-scratch-stranger'] = await inside(join(outside, 'secret.txt'));
  rows['r03-prefix-sibling'] = await inside(join(scratch, 'proj-evil', 'x.txt'));
  rows['r04-dirlink-out-existing'] = await inside('escape/secret.txt');
  rows['r05-dirlink-out-missing'] = await inside('escape/deep/new.txt');
  rows['r06-link-to-fs-root'] = await inside('slash/etc/passwd');
  rows['r07-link-to-other-project'] = await inside('toother/theirs.txt');
  rows['r08rel-alias-prefix-traversal'] = await inside('escape/../../outside/secret.txt');
  rows['r08abs-alias-prefix-traversal'] = await inside(
    join(alias, 'escape', '..', '..', 'outside', 'secret.txt')
  );
  rows['r09-absolute-traversal-through-alias'] = await inside(
    join(alias, '..', 'outside', 'secret.txt')
  );
  rows['r10-alias-root-with-allowRoot'] = await inside(alias, true);
  rows['r11a-dotgit'] = await inside('.git/config');
  rows['r11b-dotgit-nested'] = await inside('src/.git/hooks');
  rows['r11c-dotgit-case'] = await inside('.GIT/config');
  rows['r11d-dotgit-through-link'] = await inside('gitlink/config');
  rows['r12-dotgit-through-alias'] = await inside(join(alias, '.git', 'config'));
  rows['r13-absolute-nothing-exists'] = await inside('/nope-xyz/deep/file.txt');
  rows['r14-unreadable-ancestor-inside'] = isRoot
    ? 'SKIPPED-ROOT'
    : await inside('locked/sub/x.txt');
  rows['r15-symlink-loop'] = await inside('loopa/child.txt');
  rows['r16-unreadable-ancestor-outside'] = await inside(
    join(scratch, 'lockedout', 'sub', 'x.txt')
  );
  rows['r17-nul'] = await inside('a\0b');
  rows['r18a-whitespace-only'] = await inside('   ');
  rows['r18b-space-named-directory'] = await inside('src/   /x.txt');
  rows['rBackin-relative-back-inside'] = await inside('../backin/README.md');

  // -------------------------------------------------------------------------
  // Rows 19 to 24: accepted before and accepted after. A repair that narrows
  // one of these has broken something nobody asked it to touch.
  // -------------------------------------------------------------------------
  rows['r19-traversal-landing-back-inside'] = await inside('escape/../secret.txt');
  rows['r20-leaf-link-to-dotgit'] = await inside('gitlink');
  rows['r21-leaf-link-out'] = await inside('leaf.txt');
  rows['r22-dangling-ancestor'] = await inside('dangle/evil.txt');
  rows['r24-file-as-ancestor'] = await inside('src/index.ts/deep/f.txt');

  // -------------------------------------------------------------------------
  // Rows 25 to 28: the rows this phase moves, and the bound it keeps.
  // -------------------------------------------------------------------------
  rows['r25a-two-dot-file-absolute'] = await inside(join(realRoot, '..notes.md'));
  rows['r25b-two-dot-file-relative'] = await inside('..notes.md');
  rows['r25c-two-dot-file-one-level-down'] = await inside('src/..dots.md');
  rows['r26a-alias-readme'] = await inside(join(alias, 'README.md'));
  rows['r26b-alias-nested'] = await inside(join(alias, 'src', 'index.ts'));
  rows['r26c-alias-new-file-parent-exists'] = await inside(
    join(alias, 'src', 'brand-new.ts')
  );
  rows['r27-case-variant'] = await inside(join(scratch, 'PROJ', 'src', 'index.ts'));
  // THE FIX ROUND'S ROWS. The first round bounded the second chance to a parent
  // that already exists, and these are the four readings that measured the
  // bound to be the wrong shape: the same file, in the same disk state, read
  // one way by its real spelling and another through the alias.
  rows['r28-alias-parent-missing'] = await inside(join(alias, 'gone', 'README.md'));
  rows['r29-alias-unreadable-ancestor'] = isRoot
    ? 'SKIPPED-ROOT'
    : await inside(join(alias, 'locked', 'sub', 'x.txt'));
  rows['r30-alias-symlink-loop'] = await inside(join(alias, 'loopa', 'child.txt'));
  rows['r31-alias-dangling-ancestor'] = await inside(join(alias, 'dangle', 'evil.txt'));
  // A chain of two links, so the class is a property rather than one hop.
  rows['r32-alias-of-alias'] = await inside(join(scratch, 'alias2', 'README.md'));
  // A link inside the project pointing at the project's PARENT, both spellings.
  rows['r33rel-link-to-parent'] = await inside('up/outside/secret.txt');
  rows['r33abs-link-to-parent'] = await inside(join(alias, 'up', 'outside', 'secret.txt'));
  rows['rControl-real-spelling'] = await inside(join(realRoot, 'README.md'));

  // -------------------------------------------------------------------------
  // The root guards. Same vocabulary, and the two sentences are read whole
  // because C10 keeps one of them byte for byte and writes the other.
  // -------------------------------------------------------------------------
  rows['sRootAlias'] =
    (await resolveProjectRoot(alias)) === realRoot ? 'OK:real' : 'WRONG';

  const rootSentence = async (input: unknown): Promise<string> => {
    try {
      await resolveProjectRoot(input);
      return 'ACCEPTED';
    } catch (err) {
      const word = fsPathRefusalOf(err);
      let message = '';
      try {
        message = (JSON.parse((err as Error).message) as { message: string }).message;
      } catch {
        message = '(not a payload)';
      }
      return `${word === null ? 'UNSTAMPED' : word.toUpperCase()}|${message}`;
    }
  };

  rows['sRootMissing'] = await rootSentence(join(scratch, 'nope'));
  rows['sRootRelative'] = await rootSentence('proj');
  // The LOOP rather than the mode-000 directory, so this arm reads the same
  // under uid 0 as it does under a person's account.
  rows['sRootUnreadable'] = await rootSentence(join(proj, 'loopa'));

  try {
    await resolveOpenProjectRoot(realRoot, async () => []);
    rows['sProjectClosed'] = 'ACCEPTED';
  } catch (err) {
    const word = fsPathRefusalOf(err);
    rows['sProjectClosed'] = word === null ? `UNSTAMPED:${codeOf(err)}` : word.toUpperCase();
  }

  process.stdout.write(`${JSON.stringify({ caseInsensitive, isRoot, rows })}\n`);
} finally {
  // The two mode-000 directories are put back before the removal, or the
  // removal fails and the fixture outlives the probe.
  for (const locked of [join(scratch, 'proj', 'locked'), join(scratch, 'lockedout')]) {
    try {
      chmodSync(locked, 0o755);
    } catch {
      // Already gone, or never made because the fixture threw early.
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}
