#!/usr/bin/env node
/**
 * The Phase 273 VOCABULARY ablation: proof that `npm run conformance:save`
 * rules 15, 16 and 17 can still fail, which is the only thing that makes a
 * green gate evidence. A rule that cannot fail proves nothing.
 *
 * It launches no Electron, starts no tmux server, spawns no agent, makes no
 * request and touches nothing under the person's home. It reads three source
 * files into memory, breaks one clause at a time, runs the gate, and RESTORES
 * ALL THREE IN A `finally` block whatever happened — including on a signal.
 *
 * Five ablations, one clause each, and each must redden THE RULE THAT OWNS IT.
 * An ablation that passes is a hole in the gate; an ablation that reddens a
 * rule other than its own is a finding about the gate rather than the build.
 *
 *  1. Reword the `projectClosed` sentence — rule 15. Its bytes are the one
 *     thing this phase did NOT write: the sentence was right for the cause it
 *     names and only ever wrong about which word carried it.
 *  2. Put the closed-project sentence back on `outside` as well — rule 15.
 *     This is issue 25 restored under a second key, and it is the shape a
 *     later round reaches for when it wants "a helpful default".
 *  3. Make the containment catch answer `outside` for everything again — rule
 *     16. This is the parent commit's own line, and it is the defect.
 *  4. Enumerate the causes in the catch instead of reading the stamp — rule
 *     16. It is green behaviour today and rots the first time a sixth cause
 *     appears, which is why the rule refuses a literal list.
 *  5. Log the contents beside the refusal — rule 17. One extra field is all it
 *     takes to put a person's file in a log line.
 *
 * Then the files are restored and the gate must exit ZERO again.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p273-ablation]';
const say = (l) => console.log(`${TAG} ${l}`);

const SENTENCES = join(REPO, 'src/renderer/editor/save-sentences.ts');
const GUARDED_WRITE = join(REPO, 'src/main/fs/guarded-write.ts');
const FS_IPC = join(REPO, 'src/main/fs/ipc.ts');
const GATE = join(REPO, 'build/conformance-save.mjs');

/** Run the gate and answer its exit code and the rule numbers it named. */
function runGate() {
  const r = spawnSync(process.execPath, [GATE], { cwd: REPO, encoding: 'utf8' });
  // A rule that PASSED prints to stdout and a rule that FAILED prints to
  // stderr, so the failing rules are read off stderr alone rather than guessed
  // from the whole output.
  const failed = [
    ...new Set(
      [...(r.stderr ?? '').matchAll(/^\[conformance:save\] (\d+b?)\./gm)].map((m) => m[1])
    )
  ];
  return { code: r.status ?? 1, failed, text: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const originals = new Map(
  [SENTENCES, GUARDED_WRITE, FS_IPC].map((p) => [p, readFileSync(p, 'utf8')])
);

function restore() {
  for (const [path, text] of originals) writeFileSync(path, text, 'utf8');
}

// Restore on a signal too: a killed ablation must not leave the tree broken.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restore();
    process.exit(130);
  });
}

/** Apply one exact replacement to a file, refusing if the text is not there. */
function ablate(path, from, to) {
  const text = originals.get(path);
  if (!text.includes(from)) {
    throw new Error(`the shape to ablate is not in ${path}:\n${from}`);
  }
  writeFileSync(path, text.replace(from, to), 'utf8');
}

const CLOSED =
  "'Tortie did not save {name}, because its project is not open — open it again and save. Nothing was written.'";

const problems = [];

try {
  // ------------------------------------------------------------------ base
  {
    const { code } = runGate();
    if (code !== 0) problems.push(`the gate is not green before any ablation (exit ${String(code)})`);
    else say('base: the gate is green');
  }

  // ------------------------------------------------------------------- 1
  {
    ablate(
      SENTENCES,
      `  projectClosed:\n    ${CLOSED},`,
      "  projectClosed:\n    'Tortie did not save {name} because the project is closed. Nothing was written.',"
    );
    const { code, failed } = runGate();
    say(`1 (projectClosed reworded): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('1. a reworded projectClosed sentence passed the gate');
    if (!failed.includes('15')) problems.push('1. rule 15 did not go red');
    restore();
  }

  // ------------------------------------------------------------------- 2
  {
    ablate(
      SENTENCES,
      "  outside:\n    'Tortie did not save {name}, because it is not inside the project it was opened from. Nothing was written.',",
      `  outside:\n    ${CLOSED},`
    );
    const { code, failed } = runGate();
    say(`2 (the closed sentence on outside too): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('2. the closed-project sentence under a second word passed the gate');
    if (!failed.includes('15')) problems.push('2. rule 15 did not go red');
    restore();
  }

  // ------------------------------------------------------------------- 3
  {
    ablate(
      GUARDED_WRITE,
      "    const stamped = fsPathRefusalOf(err);\n    return refused(stamped ?? 'projectsUnknown', sentenceOf(err));",
      "    return refused('outside', sentenceOf(err));"
    );
    const { code, failed } = runGate();
    say(`3 (the parent's one-word catch): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push("3. the parent commit's one-word containment catch passed the gate");
    if (!failed.includes('16')) problems.push('3. rule 16 did not go red');
    restore();
  }

  // ------------------------------------------------------------------- 4
  {
    ablate(
      GUARDED_WRITE,
      "    const stamped = fsPathRefusalOf(err);\n    return refused(stamped ?? 'projectsUnknown', sentenceOf(err));",
      "    const stamped = fsPathRefusalOf(err);\n    if (stamped === 'projectClosed') return refused('projectClosed', sentenceOf(err));\n    if (stamped === 'protected') return refused('protected', sentenceOf(err));\n    if (stamped === 'unreadable') return refused('unreadable', sentenceOf(err));\n    return refused('projectsUnknown', sentenceOf(err));"
    );
    const { code, failed } = runGate();
    say(`4 (the causes enumerated in the catch): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('4. a catch enumerating the causes passed the gate');
    if (!failed.includes('16')) problems.push('4. rule 16 did not go red');
    restore();
  }

  // ------------------------------------------------------------------- 5
  {
    ablate(
      FS_IPC,
      "        why: result.why,\n        reason: result.reason,",
      "        why: result.why,\n        contents: input?.contents,\n        reason: result.reason,"
    );
    const { code, failed } = runGate();
    say(`5 (the file's bytes in the log line): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push("5. a log line carrying the file's contents passed the gate");
    if (!failed.includes('17')) problems.push('5. rule 17 did not go red');
    restore();
  }

  // ---------------------------------------------------------------- restored
  {
    const { code } = runGate();
    if (code !== 0) problems.push(`the gate is not green after the restore (exit ${String(code)})`);
    else say('restored: the gate is green again');
  }
} finally {
  restore();
}

if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`${TAG} ${p}\n`);
  process.stderr.write(`${TAG} FAILED: ${String(problems.length)} finding(s).\n`);
  process.exit(1);
}
say('OK: every ablation reddened the rule that owns it, and the gate is green again.');
process.exit(0);
