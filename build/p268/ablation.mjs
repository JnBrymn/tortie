#!/usr/bin/env node
/**
 * The Phase 268 ABLATION: proof that `npm run conformance:save` can still
 * fail, which is the only thing that makes a green gate evidence.
 *
 * It launches no Electron, starts no tmux server, spawns no agent, makes no
 * request and touches nothing under the person's home. It copies the source
 * files it breaks aside, breaks one clause at a time, runs the gate, and
 * RESTORES EVERY ONE IN A `finally` block whatever happened — including on a
 * signal. Since Phase 282 the restore is PROVED rather than asserted: the
 * sha256 of every file it rewrites is taken before the first ablation and
 * compared after the `finally`, so a restore that wrote the wrong bytes is a
 * finding rather than a phase's source quietly altered by its own proof.
 *
 * Every ablation is ONE CLAUSE, and each must redden THE RULE THAT OWNS IT.
 * An ablation that passes is a hole in the gate; an ablation that reddens a
 * rule other than its own is a finding about the gate rather than about the
 * build. The count lives in the PASS line at the bottom and nowhere else: this
 * header opened "Four ablations" and was still saying it at eighteen.
 *
 *  1. Route auto save through the unguarded door — rules 6 and 10.
 *  2. Delete the auto guard from `save`'s body — rule 11.
 *  3. Restore the parent's `unguarded` arm, the SYMLINK HOLE — rule 11b.
 *  4. Move the toast above the membership check in `recordStop` — rule 12.
 *  5. Arm the timer BEFORE the tab is patched dirty — rule 14. This one is not
 *     hypothetical: it is the shape this phase's first build shipped, and
 *     `npm run probe:p268` caught it by typing ONE character.
 *  6. PHASE 277. Give `save` a door of its own, outside `saveOnce` and outside
 *     the one-save-per-tab slot — rule 1c. Rules 1 and 11 read `saveOnce` since
 *     Phase 277 moved the door choice there, so without 1c this shape passes:
 *     every refusal lives in a function the new route never calls.
 *  7-9. PHASE 277 FIX ROUND. The three shapes that walked past rule 1c while
 *     it was a substring test: a `'withSaveSlot'` string literal beside a bare
 *     `saveOnce`, an 'auto' handed to a helper that names the plain door, and an
 *     early auto return in front of the slot — rule 1c.
 *  10. A timer queued in the slot — rule 18.
 *  11-12. A follow-up that skips the lifetime check, or runs as the stored
 *     reason — rule 19.
 *  13. The close prompt closing on a save's true without re-reading dirty —
 *     rule 20.
 *  14. A timer the slot refused, dropped instead of re-armed — rule 21.
 *  15. refreshRepo replacing a buffer off a snapshot taken before its read —
 *     rule 22.
 *  16-17. A literal clean patch in tab-io, and a door that does not end in
 *     completeSave — rule 23.
 *  18. The auditor fixture edited to pass — rule 24.
 *  19-21. PHASE 282. `adoptWritten` adopting over a dirty tab, over a moved
 *     baseline, and refusing only after it has already patched — rule 25. The
 *     review of 2026-09-17 took each clause out at PR 28's head and found this
 *     gate and conformance:redline both green.
 *  22-23. `refreshRepo` reloading a clean tab over a baseline that moved under
 *     its read, and the same clause taken from the wrong instant so that it
 *     compares a value with itself — rule 26.
 *  24-25. The redline's typing path leaving a keystroke invisible until the
 *     chunk is in, and the same window written so that it looks closed — rule
 *     27.
 *  26. The model built from a string captured before the await — rule 27b.
 *  27. A text typed on a picture the view has since replaced, applied anyway —
 *     rule 27c.
 *
 * Then the files are restored and the gate must exit ZERO again.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p268-ablation]';
const say = (l) => console.log(`${TAG} ${l}`);

const AUTO_SAVE = join(REPO, 'src/renderer/editor/auto-save.ts');
const TAB_IO = join(REPO, 'src/renderer/editor/tab-io.ts');
const EDITOR_STORE = join(REPO, 'src/renderer/editor/store.ts');
// PHASE 282. The Redline view's typing hook, which arms 24 to 27 break.
const REDLINE_EDITS = join(REPO, 'src/renderer/editor/redline-edits.ts');
const GATE = join(REPO, 'build/conformance-save.mjs');
const AUDIT_TEST = join(REPO, 'src/renderer/editor/__tests__/audit-0914-auto-save.test.ts');

/** Run the gate and answer its exit code and the rule numbers it named. */
function runGate() {
  const r = spawnSync(process.execPath, [GATE], { cwd: REPO, encoding: 'utf8' });
  // A rule that PASSED prints to stdout and a rule that FAILED prints to
  // stderr, so the failing rules are read off stderr alone rather than
  // guessed from the whole output.
  const failed = [
    ...new Set(
      [...(r.stderr ?? '').matchAll(/^\[conformance:save\] (\d+[a-z]?)\./gm)].map((m) => m[1])
    )
  ];
  return { code: r.status ?? 1, failed, text: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const originals = new Map([
  [AUTO_SAVE, readFileSync(AUTO_SAVE, 'utf8')],
  [TAB_IO, readFileSync(TAB_IO, 'utf8')],
  [EDITOR_STORE, readFileSync(EDITOR_STORE, 'utf8')],
  [REDLINE_EDITS, readFileSync(REDLINE_EDITS, 'utf8')],
  [AUDIT_TEST, readFileSync(AUDIT_TEST, 'utf8')]
]);

function restore() {
  for (const [path, text] of originals) writeFileSync(path, text, 'utf8');
}

/**
 * The digest of every file this script rewrites, taken before the first
 * ablation and compared with the tree it gives back.
 *
 * PHASE 282. The `finally` is what makes this script safe to run, and until
 * now nothing checked that it worked: a `restore()` that wrote the wrong bytes
 * would leave a phase's own source altered by its proof, and the next thing to
 * read the tree would be reading the ablation rather than the build. The
 * comparison is at the end, after the `finally`, so it answers for the tree as
 * a person finds it.
 */
const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const digestsBefore = new Map([...originals.keys()].map((path) => [path, digestOf(path)]));

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
      // PHASE 277 rewrote `run`: the in-flight set is gone and the save is one
      // un-awaited call, so the anchor is that call rather than the old try.
      "    void (async () => {\n      if (await deps.save(id)) wrote.add(id);",
      "    void (async () => {\n      await gmuxBridge().fs.writeFile('/tmp/x', 'x');\n      if (await deps.save(id)) wrote.add(id);"
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
    // PHASE 277 GAVE `overwrite` AN `unguarded` ARM OF ITS OWN, above
    // `saveInProject`, which is the same trap the paragraph above describes one
    // arm further up. Searching from byte zero found OVERWRITE's arm, planted
    // the hole there, and rule 11b — which reads saveInProject — stayed green on
    // a hole it never looked at. The search starts at saveInProject now.
    const fnStart = whole.indexOf('  const saveInProject = ');
    if (fnStart === -1) throw new Error('saveInProject is not where it was');
    const armStart = whole.indexOf("    if (result.outcome === 'unguarded') {", fnStart);
    if (armStart === -1) throw new Error('the unguarded arm is not where it was');
    const armEnd = whole.indexOf("    if (result.outcome === 'stale') {", armStart);
    if (armEnd === -1) throw new Error('the stale arm is not below the unguarded one');
    const parentArm = whole.slice(armStart, armEnd);
    ablate(
      TAB_IO,
      parentArm,
      "    if (result.outcome === 'unguarded') return saveOutsideProject(id, tab, model, value, tab.savedContents);\n"
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

  // ------------------------------------------------------------------- 6
  // PHASE 277. A save that picks the plain door itself, skipping saveOnce's
  // refusals and the per-tab slot. Rules 1 and 11 read saveOnce and stay green,
  // which is exactly why rule 1c exists.
  {
    ablate(
      TAB_IO,
      "    return withSaveSlot(id, reason, () => saveOnce(id, reason));\n",
      "    const tab = deps.byId(id);\n    if (tab !== undefined && reason === 'auto') return saveOutsideProject(id, tab, null, '', tab.savedContents);\n    return withSaveSlot(id, reason, () => saveOnce(id, reason));\n"
    );
    const { code, failed } = runGate();
    say(`6 (save picks a door itself): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('6. a save with its own door passed the gate');
    if (!failed.includes('1c')) problems.push('6. rule 1c did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 7
  {
    ablate(TAB_IO, "    return withSaveSlot(id, reason, () => saveOnce(id, reason));\n", "    const _slot = 'withSaveSlot';\n    return saveOnce(id, reason);\n");
    const { code, failed } = runGate();
    say(`7 (a string literal beside a bare saveOnce): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('7. a string literal beside a bare saveOnce passed the gate');
    if (!failed.includes('1c')) problems.push('7. rule 1c did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 8
  {
    ablate(TAB_IO, "    return withSaveSlot(id, reason, () => saveOnce(id, reason));\n", "    if (reason === 'auto') return viaHelper(id);\n    return withSaveSlot(id, reason, () => saveOnce(id, reason));\n");
    const { code, failed } = runGate();
    say(`8 (auto handed to a helper that names the plain door): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('8. auto handed to a helper that names the plain door passed the gate');
    if (!failed.includes('1c')) problems.push('8. rule 1c did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 9
  {
    ablate(TAB_IO, "    return withSaveSlot(id, reason, () => saveOnce(id, reason));\n", "    if (reason === 'auto') return saveOnce(id, reason);\n    return withSaveSlot(id, reason, () => saveOnce(id, reason));\n");
    const { code, failed } = runGate();
    say(`9 (an early auto return in front of the slot): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('9. an early auto return in front of the slot passed the gate');
    if (!failed.includes('1c')) problems.push('9. rule 1c did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 10
  {
    ablate(TAB_IO, "    if (reason === 'auto') return false;\n", "");
    const { code, failed } = runGate();
    say(`10 (a timer queued in the slot): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('10. a timer queued in the slot passed the gate');
    if (!failed.includes('18')) problems.push('10. rule 18 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 11
  {
    ablate(TAB_IO, "    if (slots.has(id) || getWorkingModel(id) !== slot.model) {\n", "    if (slots.has(id)) {\n");
    const { code, failed } = runGate();
    say(`11 (a follow-up that skips the lifetime check): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('11. a follow-up that skips the lifetime check passed the gate');
    if (!failed.includes('19')) problems.push('11. rule 19 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 12
  {
    ablate(TAB_IO, "saveOnce(id, 'explicit')).then(", "saveOnce(id, 'auto')).then(");
    const { code, failed } = runGate();
    say(`12 (a follow-up run as a timer): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('12. a follow-up run as a timer passed the gate');
    if (!failed.includes('19')) problems.push('12. rule 19 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 13
  {
    ablate(EDITOR_STORE, "          if (live.dirty) {\n            promptDirtyClose(live, next);\n            return;\n          }\n", "");
    const { code, failed } = runGate();
    say(`13 (the close prompt closing on true): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('13. the close prompt closing on true passed the gate');
    if (!failed.includes('20')) problems.push('13. rule 20 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 14
  {
    ablate(AUTO_SAVE, "      if (trigger === 'delay' && epoch === disposals && !timers.has(id)) arm(id);\n", "");
    const { code, failed } = runGate();
    say(`14 (a refused timer dropped): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('14. a refused timer dropped passed the gate');
    if (!failed.includes('21')) problems.push('14. rule 21 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 15
  {
    ablate(TAB_IO, "          const live = deps.byId(tab.id);\n", "          const live = before;\n");
    const { code, failed } = runGate();
    say(`15 (refreshRepo off a stale snapshot): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('15. refreshRepo off a stale snapshot passed the gate');
    if (!failed.includes('22')) problems.push('15. rule 22 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 16
  {
    ablate(TAB_IO, "return completeSave(id, model, value);", "deps.patch(id, { dirty: false }); return true;");
    const { code, failed } = runGate();
    say(`16 (a literal clean patch in a door): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('16. a literal clean patch in a door passed the gate');
    if (!failed.includes('23')) problems.push('16. rule 23 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 17
  {
    ablate(TAB_IO, "return completeSave(id, model, value);", "return true;");
    const { code, failed } = runGate();
    say(`17 (a door that does not end in completeSave): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('17. a door that does not end in completeSave passed the gate');
    if (!failed.includes('23')) problems.push('17. rule 23 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 18
  {
    ablate(AUDIT_TEST, "import { beforeEach, expect, it, vi } from 'vitest';", "import { beforeEach, expect, it, vi } from 'vitest';\n// bent to pass");
    const { code, failed } = runGate();
    say(`18 (the auditor fixture edited to pass): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('18. the auditor fixture edited to pass passed the gate');
    if (!failed.includes('24')) problems.push('18. rule 24 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 19
  // PHASE 282. `adoptWritten` with its dirty refusal taken out. The review of
  // 2026-09-17 removed each of these clauses at the PR's head and found this
  // gate and conformance:redline both green; only PR 28's own vitest, which
  // feeds `dirty` in as a literal, went red. That is the hole rule 25 fills.
  {
    ablate(
      TAB_IO,
      'if (tab.dirty || tab.savedContents !== was) return;',
      'if (tab.savedContents !== was) return;'
    );
    const { code, failed } = runGate();
    say(`19 (adoptWritten adopts over a dirty tab): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('19. an adoption over a dirty tab passed the gate');
    if (!failed.includes('25')) problems.push('19. rule 25 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 20
  // The other clause: an adoption that never asks whether the baseline is
  // still the one the write was planned against.
  {
    ablate(
      TAB_IO,
      'if (tab.dirty || tab.savedContents !== was) return;',
      'if (tab.dirty) return;'
    );
    const { code, failed } = runGate();
    say(`20 (adoptWritten adopts over a moved baseline): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('20. an adoption over a moved baseline passed the gate');
    if (!failed.includes('25')) problems.push('20. rule 25 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 21
  // Both clauses kept and read too late. The refusal is still in the source,
  // which is what makes this the shape a reader skims past.
  {
    ablate(
      TAB_IO,
      '    if (tab.dirty || tab.savedContents !== was) return;\n    deps.patch(id, { savedContents: contents });\n',
      '    deps.patch(id, { savedContents: contents });\n    if (tab.dirty || tab.savedContents !== was) return;\n'
    );
    const { code, failed } = runGate();
    say(`21 (adoptWritten refuses after it patches): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('21. an adoption that refuses after it patches passed the gate');
    if (!failed.includes('25')) problems.push('21. rule 25 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 22
  // PHASE 282. The parent's clean reload: a tab that is clean and holds the
  // same model is reloaded whatever moved its baseline while the read was out.
  // 37 of 500 interleavings over the real main handlers rolled a rewind back.
  {
    ablate(TAB_IO, '            live.savedContents === savedBefore &&\n', '');
    const { code, failed } = runGate();
    say(`22 (refreshRepo reloads over a moved baseline): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('22. a reload over a moved baseline passed the gate');
    if (!failed.includes('26')) problems.push('22. rule 26 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 23
  // The clause kept and taken from the wrong instant. It compares the value
  // with itself, so it reads like the fix and refuses nothing at all.
  {
    ablate(
      TAB_IO,
      '        const savedBefore = before.savedContents;\n        try {\n          const result = await gmux.fs.readFile(tab.path);\n          const live = deps.byId(tab.id);\n',
      '        try {\n          const result = await gmux.fs.readFile(tab.path);\n          const live = deps.byId(tab.id);\n          const savedBefore = live?.savedContents;\n'
    );
    const { code, failed } = runGate();
    say(`23 (the baseline recorded after the read): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('23. a baseline recorded after the read passed the gate');
    if (!failed.includes('26')) problems.push('23. rule 26 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 24
  // PHASE 282. The parent's typing path: the tab is marked dirty only after
  // the chunk load, so a rewind landing inside it meets a tab that reads clean
  // and the next ⌘S writes the agent's text back over it.
  {
    ablate(
      REDLINE_EDITS,
      '    if (live !== undefined && !live.dirty) useEditor.getState().markDirty(tabId, true);\n',
      ''
    );
    const { code, failed } = runGate();
    say(`24 (the keystroke invisible until the chunk is in): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('24. a typing path with no synchronous dirty mark passed the gate');
    if (!failed.includes('27')) problems.push('24. rule 27 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 25
  // The same window, written so that it looks closed: the mark is there and it
  // is made after the await, which is the instant it was needed before.
  {
    ablate(
      REDLINE_EDITS,
      '    if (live !== undefined && !live.dirty) useEditor.getState().markDirty(tabId, true);\n    void (async () => {\n',
      '    void (async () => {\n      if (live !== undefined && !live.dirty) useEditor.getState().markDirty(tabId, true);\n'
    );
    const { code, failed } = runGate();
    say(`25 (the dirty mark moved inside the continuation): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('25. a dirty mark inside the continuation passed the gate');
    if (!failed.includes('27')) problems.push('25. rule 27 did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 26
  // The model built from a string captured before the await — the parent's
  // shape, and a chunk load can outlast a whole rewind.
  {
    ablate(
      REDLINE_EDITS,
      '        () => useEditor.getState().tabs.find((t) => t.id === tabId)?.savedContents ?? typedOn,\n',
      '        live?.savedContents ?? typedOn,\n'
    );
    const { code, failed } = runGate();
    say(`26 (the model built from a captured string): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('26. a model built from a captured string passed the gate');
    if (!failed.includes('27b')) problems.push('26. rule 27b did not go red');
    restore();
  }

  // ------------------------------------------------------------------ 27
  // The text typed on a picture the view has since replaced, applied anyway.
  {
    ablate(
      REDLINE_EDITS,
      '      if (!had && now.savedContents !== typedOn) {\n        useEditor.getState().markDirty(tabId, model.getValue() !== now.savedContents);\n        return;\n      }\n',
      ''
    );
    const { code, failed } = runGate();
    say(`27 (a text typed on a replaced picture, applied): exit ${String(code)}, rules ${failed.join(', ') || 'none'}`);
    if (code === 0) problems.push('27. applying a text typed on a replaced picture passed the gate');
    if (!failed.includes('27c')) problems.push('27. rule 27c did not go red');
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

// The tree this script borrowed is the tree it gives back, compared by sha256
// rather than asserted. This runs after the `finally`, so it answers for the
// files as the next reader finds them.
for (const [path, digest] of digestsBefore) {
  const now = digestOf(path);
  if (now !== digest) {
    problems.push(
      `${relative(REPO, path)} was not restored: sha256 ${digest.slice(0, 12)} became ${now.slice(0, 12)}`
    );
  }
}

if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`${TAG} ${p}\n`);
  process.stderr.write(`${TAG} FAILED: ${String(problems.length)} finding(s).\n`);
  process.exit(1);
}
say(
  'PASS: 27 ablations, each red on the rule that owns it, and the tree restored byte for byte by sha256.'
);
process.exit(0);
