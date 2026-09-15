#!/usr/bin/env node
/**
 * The Phase 268 ABLATION: proof that `npm run conformance:save` can still
 * fail, which is the only thing that makes a green gate evidence.
 *
 * It launches no Electron, starts no tmux server, spawns no agent, makes no
 * request and touches nothing under the person's home. It copies two source
 * files aside, breaks one clause at a time, runs the gate, and RESTORES BOTH
 * IN A `finally` block whatever happened — including on a signal.
 *
 * Four ablations, one clause each, and each must redden THE RULE THAT OWNS IT.
 * An ablation that passes is a hole in the gate; an ablation that reddens a
 * rule other than its own is a finding about the gate rather than about the
 * build.
 *
 *  1. Route auto save through the unguarded door — rules 6 and 10.
 *  2. Delete the auto guard from `save`'s body — rule 11.
 *  3. Restore the parent's `unguarded` arm, the SYMLINK HOLE — rule 11b.
 *  4. Move the toast above the membership check in `recordStop` — rule 12.
 *  5. Arm the timer BEFORE the tab is patched dirty — rule 14. This one is not
 *     hypothetical: it is the shape this phase's first build shipped, and
 *     `npm run probe:p268` caught it by typing ONE character.
 *
 * Then the files are restored and the gate must exit ZERO again.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p268-ablation]';
const say = (l) => console.log(`${TAG} ${l}`);

const AUTO_SAVE = join(REPO, 'src/renderer/editor/auto-save.ts');
const TAB_IO = join(REPO, 'src/renderer/editor/tab-io.ts');
const EDITOR_STORE = join(REPO, 'src/renderer/editor/store.ts');
const GATE = join(REPO, 'build/conformance-save.mjs');

/** Run the gate and answer its exit code and the rule numbers it named. */
function runGate() {
  const r = spawnSync(process.execPath, [GATE], { cwd: REPO, encoding: 'utf8' });
  // A rule that PASSED prints to stdout and a rule that FAILED prints to
  // stderr, so the failing rules are read off stderr alone rather than
  // guessed from the whole output.
  const failed = [
    ...new Set(
      [...(r.stderr ?? '').matchAll(/^\[conformance:save\] (\d+b?)\./gm)].map((m) => m[1])
    )
  ];
  return { code: r.status ?? 1, failed, text: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const originals = new Map([
  [AUTO_SAVE, readFileSync(AUTO_SAVE, 'utf8')],
  [TAB_IO, readFileSync(TAB_IO, 'utf8')],
  [EDITOR_STORE, readFileSync(EDITOR_STORE, 'utf8')]
]);

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

const problems = [];

try {
  // ------------------------------------------------------------------ base
  {
    const { code } = runGate();
    if (code !== 0) problems.push(`the gate is not green before any ablation (exit ${String(code)})`);
    else say('base: the gate is green');
  }

  // ------------------------------------------------------------------- 1
  // Route auto save through the unguarded door. This is issue 16 on a loop
  // and it is the refusal the whole phase is built around.
  {
    ablate(
      AUTO_SAVE,
      "      try {\n        const ok = await deps.save(id);",
      "      try {\n        await gmuxBridge().fs.writeFile('/tmp/x', 'x');\n        const ok = await deps.save(id);"
    );
    const { code, failed } = runGate();
    say(`1 (unguarded write in auto-save.ts): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('1. an unguarded write in the auto save module passed the gate');
    for (const want of ['6', '10']) {
      if (!failed.includes(want)) problems.push(`1. rule ${want} did not go red`);
    }
    restore();
  }

  // ------------------------------------------------------------------- 2
  // Delete the auto guard from `save`'s body.
  {
    ablate(
      TAB_IO,
      "    if (reason === 'auto' && !guarded) return false;\n",
      ''
    );
    const { code, failed } = runGate();
    say(`2 (no auto guard in save): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('2. a save with no auto guard passed the gate');
    if (!failed.includes('11')) problems.push('2. rule 11 did not go red');
    restore();
  }

  // ------------------------------------------------------------------- 3
  // THE SYMLINK HOLE: the parent's `unguarded` arm, falling straight through
  // to the plain door with no test of the reason.
  {
    // The arm is found from the `unguarded` line FORWARD. `overwrite` sits
    // above `saveInProject` and carries its own `stale` arm, so a search for
    // the closing marker from position zero lands ABOVE the opening one and
    // slices an empty string — which `replace('')` then happily prepends at
    // byte 0, ablating nothing at all. That is how this ablation first
    // reported a green gate on a hole that was really there.
    const whole = originals.get(TAB_IO);
    const armStart = whole.indexOf("    if (result.outcome === 'unguarded') {");
    if (armStart === -1) throw new Error('the unguarded arm is not where it was');
    const armEnd = whole.indexOf("    if (result.outcome === 'stale') {", armStart);
    if (armEnd === -1) throw new Error('the stale arm is not below the unguarded one');
    const parentArm = whole.slice(armStart, armEnd);
    ablate(
      TAB_IO,
      parentArm,
      "    if (result.outcome === 'unguarded') return saveOutsideProject(id, tab, value, tab.savedContents);\n"
    );
    const { code, failed } = runGate();
    say(`3 (the symlink hole): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('3. the symlink hole passed the gate');
    if (!failed.includes('11b')) problems.push('3. rule 11b did not go red');
    restore();
  }

  // ------------------------------------------------------------------- 4
  // The toast above the membership check: a toast a second.
  {
    ablate(
      AUTO_SAVE,
      "    if (stopped.has(id)) return;\n    stopped.set(id, why);\n    cancelTimer(id);\n    const name = deps.byId(id)?.name ?? 'this file';\n    deps.toast(autoSaveStopSentence(why, name));",
      "    const name = deps.byId(id)?.name ?? 'this file';\n    deps.toast(autoSaveStopSentence(why, name));\n    if (stopped.has(id)) return;\n    stopped.set(id, why);\n    cancelTimer(id);"
    );
    const { code, failed } = runGate();
    say(`4 (toast before the membership check): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('4. a recordStop that toasts first passed the gate');
    if (!failed.includes('12')) problems.push('4. rule 12 did not go red');
    restore();
  }

  // ------------------------------------------------------------------- 5
  // Arm before the patch. A burst still saves, because the second keystroke
  // takes the other branch and sees a dirty tab; a single character does not.
  {
    ablate(
      EDITOR_STORE,
      "      patchTab(id, patch);\n      // PHASE 268, AND THE ORDER IS THE WHOLE OF IT",
      "      autoSave.noteChanged(id);\n      patchTab(id, patch);\n      // PHASE 268, AND THE ORDER IS THE WHOLE OF IT"
    );
    // Drop the real arm so only the wrong one is left.
    const broken = readFileSync(EDITOR_STORE, 'utf8').replace(
      "      // this phase: a burst of characters saved (the second keystroke sees a\n      // dirty tab in the branch above) and a SINGLE character never did, which\n      // is the shape arm C types. `conformance:save` rule 14 holds the order.\n      autoSave.noteChanged(id);\n",
      ''
    );
    writeFileSync(EDITOR_STORE, broken, 'utf8');
    const { code, failed } = runGate();
    say(`5 (arm before the patch): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('5. arming before the patch passed the gate');
    if (!failed.includes('14')) problems.push('5. rule 14 did not go red');
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
say('PASS: 5 ablations, each red on the rule that owns it, and the tree restored.');
process.exit(0);
