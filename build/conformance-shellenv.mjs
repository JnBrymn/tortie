#!/usr/bin/env node
/**
 * `npm run conformance:shellenv` — the gate on the answer the login shell gives
 * (Phase 276).
 *
 * About 1.1 s, measured. It launches no Electron, opens no window, starts no tmux server,
 * runs no ssh, spawns no agent, spends no token, makes no request, reads
 * nothing under the person's home and writes nothing anywhere. **It does not
 * spawn a shell either**, and that is the point rather than a convenience: the
 * phase exists because `zsh -lic` costs about a second on the operator's
 * machine, so a gate that paid that once per arm would take minutes and would
 * read differently on every machine it ran on.
 *
 * ## Why it exists
 *
 * Phase 269 let a person name a shell variable and have it reach the agent
 * Tortie launches, and its promise is quotable: *"rotating a key takes effect
 * on the next session you start, with nothing to restart."* Phase 275 made one
 * name apply to EVERY agent, which meant the login-shell probe behind that
 * promise fired for every agent rather than for the one somebody had
 * configured. Measured on the operator's machine, three runs each:
 *
 *     zsh -lic 'printenv PATH >/dev/null'   1160 ms   970 ms   980 ms
 *     zsh -lc  'printenv PATH >/dev/null'     10 ms    10 ms    10 ms
 *
 * A hundredfold, and all of it is the `i`. The `i` is what reads `.zshrc`, and
 * `.zshrc` is where a person exports a provider key, so **the flag stays** and
 * the cost is paid down by asking ONCE instead of once per session.
 *
 * A cache is the easy half. The half this gate is really for is the
 * invalidation, because a cache that misses a change to a person's shell config
 * hands the next agent a STALE API KEY, and that session then fails against its
 * provider with an error that has nothing to do with Tortie. That is issue 20's
 * original symptom, re-created by our own optimisation, and it is silent. So
 * the two rules that matter most here are:
 *
 *   **A FAILED PROBE IS NEVER CACHED AS SUCCESS** (rules 17 and 18), because
 *   `probeFailed: true` is a RESOLVED value and not a rejection, so the naive
 *   `promise ??= capture()` would remember a failure for the life of the
 *   process and every session for the rest of the run would launch with no
 *   values at all.
 *
 *   **A ROTATED KEY REACHES THE NEXT SESSION** (rules 23 to 33), which is the
 *   watcher, the immediate drop, and the generation stamp that stops a probe
 *   started before a rotation from installing its pre-rotation answer after it.
 *
 * Both have their own ablation in `npm run ablation:p276`, and a green gate is
 * only evidence if it can go red.
 *
 * ## The three seams, which are the shipping modules' own
 *
 *   - `setLoginShellEnvCaptureForTests` (src/main/tmux/resolve.ts) — the gate
 *     hands a COUNTING FAKE, so the coverage relation, the projection, the
 *     widening, the in-flight join, the generation guard and the failure rule
 *     are driven for real without a shell.
 *   - `EnvWatchDeps` (src/main/env/watch.ts) — a fake watcher this file fires by
 *     hand, a fake clock it reads by hand, a fake settings listener, a fake
 *     declared cover, a fake `realpath` and a fake `env`. So the 400 ms debounce
 *     and the 5,000 ms floor are asserted as NUMBERS rather than waited out, and
 *     no directory anywhere is opened.
 *   - `shellFilesFor` (src/main/env/shell-files.ts) is pure already.
 *
 * Nothing else is faked. The modules under test are the shipping ones at their
 * real paths.
 *
 * ## The rules, numbered as `build/p276/SPEC.md` §7 numbers them
 *
 * THE CACHE, driven in `--mode=cache`:
 *
 *    2. A hit is `names.every((n) => slot.names.has(n))` and nothing else.
 *    3. A hit is PROJECTED: a fresh record and a fresh array every ask.
 *    4. The projection iterates the CALLER's list in the caller's first-seen
 *       order, deduped, so the `-e` argv order Phase 275 promised does not move.
 *    5. A miss probes for the UNION of the ask and the slot — widening, never
 *       narrowing.
 *    6. Past `ENV_SLOT_MAX_NAMES = 256` the slot is REPLACED by the caller's own
 *       names, never partially merged and never truncated.
 *    7. `envInFlight` is assigned synchronously before any await, so two callers
 *       on one tick share one capture.
 *    8. A second ask joins the in-flight promise iff its names are covered by
 *       the in-flight names; otherwise it starts its own.
 *    9. The generation moves on the line that INSTALLS and on the line that
 *       DROPS, and never rewinds.
 *   10. A probe stamped at generation G installs nothing if the generation has
 *       moved when it settles.
 *   11. The cache defaults to OFF, and while off nothing is read, written or
 *       joined.
 *   12. Disarming drops the slot.
 *   17. A failed result is returned to every waiter and NEVER installed.
 *   18. A failed settle leaves the next ask a fresh attempt, and does not
 *       disarm, drop or schedule.
 *   19. A partial answer is not a failure and IS cached.
 *
 * THE SHELL TABLE, driven in `--mode=files`:
 *
 *   20. `shellFilesFor` is pure — no `node:fs`, no spawn, absolute paths.
 *   21. Exactly the four measured rows, and an unmeasured shell returns `[]`.
 *   22. `zdotdir` is taken with `??` and never `||`, asserted BEHAVIOURALLY: an
 *       empty-string ZDOTDIR yields `/.zshenv` and not `<home>/.zshenv`.
 *
 * THE WATCH AND THE REACTION, driven in `--mode=watch`:
 *
 *   23. Every candidate gets a literal target, whether or not the file exists.
 *   24. A candidate whose realpath differs and is INSIDE the home tree gets a
 *       second target; one outside the home tree gets none.
 *   25. Targets are deduped, the callback matches ONE basename, and a null
 *       filename is "maybe ours".
 *   26. Nothing recursive, nothing outside the home, no `@parcel/watcher`.
 *   27. The whole set is re-derived on every fire, closing what is gone and
 *       opening what is new.
 *   28. A directory that cannot be watched is skipped; if NO handle opens, the
 *       cache is never armed.
 *   29. The drop is synchronous in the watch callback with NO debounce.
 *   30. The re-warm is debounced at 400 ms.
 *   31. The re-warm is floored at 5,000 ms, and the floor gates neither the drop
 *       nor any create.
 *   32. Every timer is cleared by the stop.
 *   33. The settings listener compares and does NOTHING when equal.
 *   35. `startEnvWatch()` is synchronous and arms only after a handle opened.
 *   61. The harness seed is the ONE place a harness launch may arm this
 *       cache, it decides its refusal with the shared `seedRefusal` before it
 *       opens anything, and it calls the shipped pair rather than a second
 *       implementation. The integrator's rule — see the block at the end.
 *   37. An empty declared cover spawns NOTHING.
 *   38. The warm-up asks for the cover plus HOME and ZDOTDIR and re-derives the
 *       set from the answer.
 *   39. `stopEnvWatch()` is idempotent and refuses every later start.
 *   40. The warm-up asks whether the watch is still running on both sides of its
 *       await.
 *   41. `GMUX_NO_ENV_CACHE=1` turns the whole feature off.
 *   43. The refresh drops, re-derives, bypasses the floor and awaits the warm.
 *
 * THE REFUSALS, read as text over the tree (SPEC §9):
 *
 *   13. There is no exported function, field or channel through which a VALUE
 *       leaves the cache.
 *   14. `captureLoginShellEnv` is unchanged, pinned by a sha256 of its own body
 *       with comments and whitespace normalised away.
 *   15. `create-local.ts` and `restore.ts` are the only two production call
 *       sites and both go through `loginShellEnvFor`.
 *   34. `remote-env-probe.ts` is unchanged, names no cache, and
 *       `REMOTE_ENV_ALLOWED` is still exactly two names.
 *   42. `settings:envRefresh` is `req: []`, `res: void`.
 *   47. The three strings are verbatim and none of them interpolates a value.
 *       Plus: the `-i` is still on the spawn; `src/main/env/**` names no write
 *       API; and the boot chain and the ordered disposer really call what they
 *       are supposed to.
 *
 * ## Knobs
 *
 * NONE. It reads no environment variable of its own and needs nothing on the
 * host but node and the repository install from package-lock.json. The one
 * variable it SETS is `ELECTRON_OVERRIDE_DIST_PATH` for its own child, which is
 * electron's own escape hatch and the same one vitest.config.ts sets: nothing
 * here uses electron's API, but `src/main/log` pulls in electron-log/main,
 * which requires the package, and electron's index.js would otherwise download
 * the binary lazily inside whichever process required it first. A verification
 * command must never reach the network.
 *
 * `npm run ablation:p276` is the attack beside it: thirty clauses broken one at
 * a time in a clone, each of which must redden THE RULE THAT OWNS IT.
 *
 * A COMMENT-AND-WHITESPACE-NORMALISED HASH IS NOT A COSMETIC CHOICE. Rule 16 of
 * the SPEC asks the cache builder to REWRITE two comments in `resolve.ts`, so a
 * raw byte pin would have gone red on the phase's own instruction. The pin is
 * over code tokens, which is what "unchanged" means here: the nonce marker, the
 * tail buffer, the per-name `maxOutput`, the early settle, the deadline, the
 * group kill and the deadline cleared on `close` and never on `exit`.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { functionBodyOf, stripComments } from './scan-source.mjs';
import { tsxCli } from './ts-runner.mjs';

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[p276]';

const failures = [];
/** Record one failure under the SPEC rule that owns it. */
const fail = (rule, sentence) => failures.push({ rule, sentence });
/** Assert, under the rule that owns it. */
const need = (rule, ok, sentence) => {
  if (!ok) fail(rule, sentence);
};
const show = (value) => JSON.stringify(value);

const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');
const code = (rel) => stripComments(read(rel));
/** Code with comments removed and every whitespace run collapsed. */
const normalized = (text) => text.replace(/\s+/g, ' ').trim();
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// ---------------------------------------------------------------------------
// The three driven lanes
// ---------------------------------------------------------------------------

/**
 * Each lane is its OWN process. All three modules hold module-level state — the
 * slot, the generation, the armed flag, the quit refusal — and a lane that
 * inherited another lane's would be measuring the order the lanes were written
 * in rather than the rules.
 */
function runLane(mode) {
  const probe = spawnSync(
    process.execPath,
    [
      tsxCli(),
      '--tsconfig',
      'tsconfig.node.json',
      'build/shellenv-conformance-probe.mts',
      `--mode=${mode}`
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        // electron 43 ships no install script and its index.js downloads the
        // binary LAZILY inside whichever process requires it first. Nothing in
        // this gate's module graph uses electron's API, but `src/main/log`
        // pulls in electron-log/main, which requires the package. This is
        // electron's own escape hatch and it is the same one vitest.config.ts
        // sets, for the same reason: a verification command must never reach
        // the network.
        ELECTRON_OVERRIDE_DIST_PATH: join(repoRoot, 'node_modules/electron/dist')
      }
    }
  );
  const text = `${probe.stdout ?? ''}`;
  const line = text.split('\n').find((l) => l.trim().startsWith('{')) ?? '';
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    parsed = null;
  }
  if (parsed === null) {
    fail(
      '51',
      `the ${mode} lane printed no JSON. exit ${String(probe.status)}. ` +
        `stdout: ${text.slice(0, 400)} stderr: ${(probe.stderr ?? '').slice(0, 800)}`
    );
    return null;
  }
  if (parsed.error !== undefined) {
    fail('51', `the ${mode} lane threw: ${String(parsed.error).slice(0, 900)}`);
    return null;
  }
  return parsed.readings;
}

const cache = runLane('cache');
const files = runLane('files');
const watch = runLane('watch');

// ---------------------------------------------------------------------------
// Section 1 — the cache (SPEC rules 2 to 12, 17 to 19)
// ---------------------------------------------------------------------------

if (cache !== null) {
  const r = cache;

  // R11. THE CACHE IS OFF UNTIL SOMETHING IS WATCHING IT, and this is the
  // structural property the whole Tier 3 verdict rests on: a stale key requires
  // the cache to be on, and the cache being on requires the invalidation to be
  // armed. So every way the phase can fail to build its watcher lands on
  // today's cost rather than on an uninvalidatable cache.
  need(
    '11',
    r.disarmedCaptures === 3,
    `disarmed, three asks made ${show(r.disarmedCaptures)} captures rather than 3. ` +
      'A disarmed cache is today\'s path byte for byte — no slot read, no slot ' +
      'write and no in-flight join.'
  );
  need(
    '11',
    Array.isArray(r.disarmedNamesHeld) && r.disarmedNamesHeld.length === 0,
    `disarmed, the slot held ${show(r.disarmedNamesHeld)}. It must hold nothing.`
  );
  need(
    '11',
    r.disarmedSameTickCaptures === 2,
    `disarmed, two asks on ONE tick made ${show(r.disarmedSameTickCaptures)} ` +
      'captures rather than 2. The in-flight join is refused while nothing is ' +
      'watching, deliberately: an in-flight share IS a cache with a lifetime of ' +
      'one second, and the rule is that no answer is reused while nothing is ' +
      'watching.'
  );

  // An empty ask installs nothing. `every` over an empty list is vacuously
  // true, so an empty ask would otherwise "hit" any slot at all and, on a cold
  // cache, install an empty one. `captureLoginShellEnv([])` resolves without a
  // spawn by its own contract, so the short circuit costs nothing.
  need(
    '2',
    Array.isArray(r.emptyAskNamesHeld) && r.emptyAskNamesHeld.length === 0,
    `an empty ask left ${show(r.emptyAskNamesHeld)} in the slot. It must install ` +
      'nothing: `every` over an empty list is vacuously true, so an empty ask ' +
      'would hit any slot at all.'
  );

  need(
    '2',
    r.fillCaptures === 1 && r.hitCaptures === 0,
    `the first ask made ${show(r.fillCaptures)} captures and the covered ask after ` +
      `it made ${show(r.hitCaptures)}. One probe then none is the whole feature.`
  );
  need(
    '2',
    r.hitMissing?.length === 0 && r.hitProbeFailed === false,
    `a hit answered missing ${show(r.hitMissing)} probeFailed ${show(r.hitProbeFailed)}. ` +
      'A projection of an installed slot can never be a failure, because a failed ' +
      'result is never installed.'
  );
  need(
    '3',
    r.sameValuesObject === false && r.sameMissingArray === false,
    'two asks were handed the SAME objects. `create-local.ts` does ' +
      '`resolvedEnv = envProbe.values`, which ALIASES the record it was handed, so ' +
      'one create\'s downstream would mutate the cache for every later one.'
  );
  need(
    '3',
    r.mutationLeaked === false,
    'a key written into one ask\'s answer came back in the next ask\'s answer. ' +
      'The projection must allocate.'
  );
  need(
    '4',
    show(r.callerOrder) === show(['ACMEAI_BASE_URL', 'ACMEAI_API_KEY']),
    `the projection answered in the order ${show(r.callerOrder)} for an ask of ` +
      '[ACMEAI_BASE_URL, ACMEAI_API_KEY]. Key insertion order is the ask\'s own ' +
      'row-then-per-agent-then-shared order, `paneEnvFor` spreads it and ' +
      '`createSession` emits one `-e` per key from `Object.entries`, so iterating ' +
      'the SLOT\'s set would move an argv order Phase 275 promised does not move ' +
      '(src/shared/launch-env.ts).'
  );
  need(
    '4',
    show(r.callerOrderDeduped) === show(['ACMEAI_BASE_URL', 'ACMEAI_API_KEY']),
    `a repeated name answered ${show(r.callerOrderDeduped)}. The dedupe keeps ` +
      'first-seen order.'
  );

  // R2's other half, and it is the one the whole key rests on: AN ASK NAMING A
  // NAME THE SLOT DOES NOT HOLD IS NEVER ANSWERED FROM THE SLOT. Keyed on "there
  // is a slot" the ask would hit, and the name would come back in `missing` —
  // which reads to a person as "your shell does not export that", about a
  // variable their shell does export.
  need(
    '2',
    r.missCaptures === 1,
    `an ask naming a name the slot does not hold made ${show(r.missCaptures)} ` +
      'captures rather than 1, so it was answered out of a slot that never ' +
      'mentioned it.'
  );
  need(
    '2',
    Object.keys(r.widenedValues ?? {}).length === 1,
    `that ask was answered ${show(r.widenedValues)}. The name it asked about must ` +
      'be RESOLVED rather than reported missing.'
  );

  // R5. WIDENING IS FREE, measured rather than assumed: on the calibrated slow
  // home `zsh -lic` for 1 name read 811/818/828/834/838 ms and for 52 names
  // read 918/853/850/854/839 ms. The cost is the shell start, not the printfs.
  need(
    '5',
    Array.isArray(r.missAskedFor) && r.missAskedFor.length === 3,
    `the miss probed for ${show(r.missAskedFor)}. It must probe for the UNION of ` +
      'the ask and the slot, which is what stops two agents with different ' +
      'per-agent lists from evicting each other.'
  );
  need(
    '5',
    r.capturesForOldNamesAfterWiden === 0,
    'after a widening probe the names the slot already held were probed again, so ' +
      'the widening narrowed instead.'
  );

  // R19. A STALE MISS IS SELF-ANNOUNCING AND A STALE HIT IS SILENT. A cached
  // miss produces the `env-unresolved` notice naming the variable on every
  // create, which is a sentence a person can act on; a stale hit says nothing at
  // all. That asymmetry is why the miss is cached.
  need(
    '19',
    r.partialFirstCaptures === 1 && r.partialSecondCaptures === 0,
    `a partial answer cost ${show(r.partialFirstCaptures)} then ` +
      `${show(r.partialSecondCaptures)} captures. `+
      '`probeFailed: false` with names in `missing` means the shell answered and ' +
      'has no usable value for them, which is a true statement about the shell ' +
      'and is cached.'
  );
  need(
    '19',
    r.partialProbeFailed === false &&
      show(r.partialSecondMissing) === show(r.partialMissing),
    `the cached partial answered ${show(r.partialSecondMissing)} where the probe ` +
      `answered ${show(r.partialMissing)}.`
  );

  need(
    '9',
    Array.isArray(r.epochs) &&
      r.epochs.length === 3 &&
      r.epochs[1] > r.epochs[0] &&
      r.epochs[2] > r.epochs[1],
    `the generation read ${show(r.epochs)} across a drop and a fill. It moves on ` +
      'the line that INSTALLS and on the line that DROPS, never on a settle, and ' +
      'it never rewinds — which is what makes it usable as the stamp rule 10 ' +
      'compares against.'
  );

  // R17 and R18. THE RULE THAT MATTERS MOST, half one.
  need(
    '17',
    r.failedProbeFailed === true && Object.keys(r.failedValues ?? {}).length === 0,
    'a failed probe did not answer probeFailed with no values, so the caller ' +
      'cannot post the `env-unresolved` notice that names the variable.'
  );
  need(
    '17',
    Array.isArray(r.namesHeldAfterFailure) && r.namesHeldAfterFailure.length === 0,
    `a FAILED probe installed ${show(r.namesHeldAfterFailure)} into the slot. ` +
      '`probeFailed: true` is a RESOLVED value and not a rejection, so a naive ' +
      'memo remembers a failure for the life of the process and every session for ' +
      'the rest of the app run launches with no values at all. That is Phase ' +
      '269\'s silent, provider-shaped failure re-created by our own optimisation, ' +
      'and it is the outcome the phase entry names as blocking.'
  );
  need(
    '18',
    r.secondFailedCaptures === 1 && r.secondFailedProbeFailed === true,
    `the ask after a failure made ${show(r.secondFailedCaptures)} captures. A ` +
      'failed settle clears the in-flight pointer so the next ask is a FRESH ' +
      'attempt — `installUserPath`\'s rule adapted to a function that signals ' +
      'failure by value.'
  );
  need(
    '18',
    r.recoveryCaptures === 1 &&
      Array.isArray(r.namesHeldAfterRecovery) &&
      r.namesHeldAfterRecovery.length > 0,
    'a good probe after a failure did not fill the slot, so the failure disarmed ' +
      'or dropped something it must not touch. A shell that timed out once under ' +
      'load is not a reason to throw an answer away.'
  );
  need(
    '17',
    r.sharedFailureCaptures === 1 &&
      show(r.sharedFailureFlags) === show([true, true]),
    `two waiters on one failing probe cost ${show(r.sharedFailureCaptures)} ` +
      `captures and were told ${show(r.sharedFailureFlags)}. Each of them really ` +
      'did launch a pane without the values, so each must be told so.'
  );

  need(
    '7',
    r.joinCaptures === 1,
    `two covered asks on ONE tick made ${show(r.joinCaptures)} captures rather ` +
      'than 1. The in-flight pointer is assigned synchronously before any await, ' +
      'which is `getUserPath`\'s own shape, so there is no window in which both ' +
      'callers see an empty pointer.'
  );
  need(
    '7',
    show(r.joinedAnswers) ===
      show([['ACMEAI_API_KEY', 'ACMEAI_BASE_URL'], ['ACMEAI_API_KEY']]),
    `two callers sharing one capture were answered ${show(r.joinedAnswers)}. They ` +
      'share a CAPTURE and never an ANSWER: each projects onto its own list, so ' +
      'create A never gets agent B\'s names on its `-e` line.'
  );
  need(
    '8',
    r.joinRefusedCaptures === 2,
    `an ask naming a name the in-flight probe does not mention made ` +
      `${show(r.joinRefusedCaptures)} captures rather than 2. The alternative is ` +
      'answering a caller out of a probe that never asked about the name it wanted.'
  );

  // R10. THE RULE THAT MATTERS MOST, half two. This race is one the phase
  // CREATES: `resetUserPathCache` has no production caller, so the equivalent
  // race next door has never fired. This cache has a production invalidator.
  need(
    '10',
    r.heldProbesPending === 1,
    'the late-landing arm did not hold a probe, so it measured nothing.'
  );
  need(
    '10',
    Array.isArray(r.namesHeldAfterLateLanding) &&
      r.namesHeldAfterLateLanding.length === 0,
    `a probe started BEFORE a drop installed ${show(r.namesHeldAfterLateLanding)} ` +
      'after it. That is a pre-rotation answer put back over a slot the watcher ' +
      'had just cleared — a stale key delivered silently, arriving by the back ' +
      'door. The stamp is the one line that closes it.'
  );
  need(
    '10',
    Array.isArray(r.lateAnswerValues) && r.lateAnswerValues.length === 2,
    `the late probe\'s own caller was answered ${show(r.lateAnswerValues)}. It must ` +
      'still be answered; only the INSTALL is refused.'
  );

  need(
    '6',
    r.capAskedForCount === 300 && r.capAnsweredCount === 300,
    `an ask for 300 names probed for ${show(r.capAskedForCount)} and was answered ` +
      `about ${show(r.capAnsweredCount)}. Never a silent truncation: a truncated ` +
      'ask would report a name as `missing` that the shell was never asked about.'
  );
  need(
    '6',
    r.capNamesHeldCount === 300 &&
      r.capHeldStillHasOldSmallSet === false &&
      r.capHeldCoversEveryBulkName === true,
    `past the cap the slot held ${show(r.capNamesHeldCount)} names, old set still ` +
      `present ${show(r.capHeldStillHasOldSmallSet)}. Past ENV_SLOT_MAX_NAMES the ` +
      'slot is REPLACED by the caller\'s own names — never a partial merge.'
  );

  need(
    '12',
    Array.isArray(r.namesHeldAfterDisarm) &&
      r.namesHeldAfterDisarm.length === 0 &&
      r.namesHeldBeforeDisarm?.length > 0,
    `disarming left ${show(r.namesHeldAfterDisarm)} in the slot. An answer nobody ` +
      'is watching is an answer this module will not hold.'
  );
  need(
    '11',
    r.capturesAfterDisarm === 1,
    `an ask after disarming made ${show(r.capturesAfterDisarm)} captures rather ` +
      'than 1.'
  );
}

// ---------------------------------------------------------------------------
// Section 2 — the $SHELL table (SPEC rules 20 to 22)
// ---------------------------------------------------------------------------

if (files !== null) {
  const f = files;
  const HOME = '/home/p276-fixture';
  const eq = (rule, key, expected, why) =>
    need(rule, show(f[key]) === show(expected), `${key} answered ${show(f[key])}, ` +
      `and the measured answer is ${show(expected)}. ${why}`);

  const zsh = ['.zshenv', '.zprofile', '.zshrc', '.zlogin'].map((n) => `${HOME}/${n}`);
  // ALL FOUR ZSH FILES, MEASURED. `zsh -lic` reads .zshenv .zprofile .zshrc
  // .zlogin; `zsh -lc` reads three and NOT .zshrc, which is the independent
  // confirmation that the `i` is what reads the rc.
  eq('21', 'zshBare', zsh, 'A bare name and an absolute path are the same shell.');
  eq('21', 'zshAbsolute', zsh, 'The basename decides.');
  eq('21', 'zshOddPath', zsh, 'A homebrew zsh is a zsh.');
  eq(
    '21',
    'zshWithZdotdir',
    ['.zshenv', '.zprofile', '.zshrc', '.zlogin'].map(
      (n) => `${HOME}/.config/zsh/${n}`
    ),
    'Setting ZDOTDIR moves ALL FOUR files off $HOME entirely.'
  );
  // R22. THE TRAP, and it is asserted behaviourally rather than by grepping for
  // an operator. Setting ZDOTDIR to the EMPTY STRING is SET: zsh then looks for
  // `/.zshenv` and reads nothing out of $HOME at all. `||` falls back to the
  // home directory and describes a shell that is not the one running.
  eq(
    '22',
    'zshWithEmptyZdotdir',
    ['/.zshenv', '/.zprofile', '/.zshrc', '/.zlogin'],
    'An empty ZDOTDIR is SET. `??` keeps it; `||` would fall back to $HOME and ' +
      'describe a shell that is not the one running.'
  );
  eq('22', 'zshWithUndefinedZdotdir', zsh, 'An UNSET ZDOTDIR falls back to $HOME.');
  // ALL FOUR BASH FILES, even though at most two are ever read, because WHICH is
  // read depends on which EXIST: with all four present `bash -lic` read
  // .bash_profile; with .bash_login .profile .bashrc it read .bash_login; with
  // .profile .bashrc it read .profile; with .bashrc alone it read NOTHING. So
  // creating .bash_profile changes the answer and must invalidate.
  eq(
    '21',
    'bash',
    ['.bash_profile', '.bash_login', '.profile', '.bashrc'].map((n) => `${HOME}/${n}`),
    'Which one bash reads depends on which EXIST, so creating one changes the ' +
      'answer and must invalidate.'
  );
  for (const key of ['sh', 'dash', 'ksh']) {
    eq('21', key, [`${HOME}/.profile`], 'The POSIX family reads one file.');
  }
  for (const key of ['fish', 'tcsh', 'nu', 'undefined', 'empty']) {
    eq(
      '21',
      key,
      [],
      'An unmeasured shell arms NOTHING and pays today\'s cost. `/bin/tcsh` ' +
        'rejects the probe\'s argument vector outright and in `nu` `$NAME` is not ' +
        'env access, so caching a failed probe for either would be strictly worse ' +
        'than caching nothing. fish is refused as a DECISION rather than an ' +
        'oversight: its files were reasoned from documentation and never measured.'
    );
  }
  eq(
    '21',
    'trailingSlashHome',
    ['/.zshenv', '/.zprofile', '/.zshrc', '/.zlogin'],
    'A home of `/` gives `/.zshenv` rather than `//.zshenv`.'
  );
}

// ---------------------------------------------------------------------------
// Section 3 — the watch, the reaction and the lifecycle (SPEC rules 23 to 43)
// ---------------------------------------------------------------------------

if (watch !== null) {
  const w = watch;
  const HOME = '/home/p276-fixture';

  need(
    '23',
    show(w.plainTargets) ===
      show(['.zshenv', '.zprofile', '.zshrc', '.zlogin'].map((n) => `${HOME}/${n}`)),
    `with no file on disk the watch set was ${show(w.plainTargets)}. Every ` +
      'candidate gets a literal target whether or not the file exists, because ' +
      'creating `~/.zshrc` for the FIRST time is when a key first appears and ' +
      '`fs.watch` on a path that does not exist throws ENOENT. That is why ' +
      '`credentials/watch.ts` holds its watch on the DIRECTORY, and it is the ' +
      'precedent this follows.'
  );
  need(
    '23',
    Array.isArray(w.plainWatchDirCalls) &&
      w.plainWatchDirCalls.every((d) => d === HOME),
    `the watcher was opened on ${show(w.plainWatchDirCalls)}. It watches the ` +
      'DIRECTORY, non-recursively, and filters to one basename.'
  );
  need(
    '35',
    show(w.armedOnReturn) === show([true]),
    `by the time startEnvWatch() returned the cache was armed ${show(w.armedOnReturn)}. ` +
      'It is synchronous on purpose: a quit cannot land between the check and the ' +
      'install, which is the Phase 220 shape `logins/ipc.ts` was repaired for.'
  );
  need(
    '32',
    w.closedOnStop === true && show(w.disarmedOnStop) === show([true, false]),
    `the stop closed the handles ${show(w.closedOnStop)} and left the cache ` +
      `${show(w.disarmedOnStop)}. Disarming drops the slot, so no answer outlives ` +
      'the thing that was watching it.'
  );
  need('39', w.stateAfterStop === null, 'the watch reported targets after the stop.');

  need(
    '24',
    Array.isArray(w.symlinkTargets) &&
      w.symlinkTargets.includes(`${HOME}/src/dotfiles/zshrc`),
    `a symlinked `+'`~/.zshrc`'+` gave the watch set ${show(w.symlinkTargets)}. ` +
      'NEITHER ARM IS SUFFICIENT ALONE, and this is the one the directory arm ' +
      'cannot do: with `~/.zshrc` a symlink into a dotfiles repo, a directory ' +
      'watch on $HOME saw ZERO events across three edits, because nothing in ' +
      '$HOME moves when the repo is edited.'
  );
  need(
    '24',
    Array.isArray(w.symlinkTargets) &&
      !w.symlinkTargets.some((p) => p.startsWith('/Volumes/')),
    `the watch set reached outside the home tree: ${show(w.symlinkTargets)}. The ` +
      'phase entry forbids watching a directory outside the person\'s own home, ' +
      'so a dotfiles repo on /Volumes is not watched at all and falls to the ' +
      'deliberate refresh.'
  );
  need(
    '24',
    Array.isArray(w.symlinkedHomeTargets) &&
      w.symlinkedHomeTargets.includes('/private/tmp/p276-home/dotfiles/zshrc'),
    `a home that is itself a symlink gave ${show(w.symlinkedHomeTargets)}. The ` +
      'REALPATH of the home is compared as well as the home: a scratch HOME under ' +
      '/tmp realpaths to /private/tmp on macOS, so a naive "starts with $HOME" ' +
      'test drops the dotfiles arm in every probe and every test that uses one.'
  );

  need(
    '25',
    w.dedupedRealpathTargetCount === 1,
    `two candidates resolving to ONE file gave ${show(w.dedupedRealpathTargetCount)} ` +
      'targets for it. They are deduped by (dir, basename).'
  );
  need(
    '25',
    w.firedUnrelated === true && w.dropsAfterUnrelatedFile === 0,
    `an event for somebody else's file dropped the cache ` +
      `${show(w.dropsAfterUnrelatedFile)} time(s). The callback matches the ONE ` +
      'basename its target names, so a directory watch is as narrow as a file ' +
      'watch.'
  );
  need(
    '25',
    w.dropsAfterOurFile === 1,
    `an event for the watched basename dropped the cache ` +
      `${show(w.dropsAfterOurFile)} time(s) rather than once.`
  );
  need(
    '25',
    w.dropsAfterNullFilename === 2,
    `a null filename dropped the cache ${show(w.dropsAfterNullFilename)} times in ` +
      'total rather than 2. A null filename is the platform not telling us which ' +
      'file moved, and it is treated as "maybe ours".'
  );

  // R29. THE DROP HAS NO DEBOUNCE AT ALL, and this is the single most important
  // difference from the `credentials/watch.ts` precedent, which debounces its
  // WHOLE reaction at 400 ms. Ours is two things with opposite costs: the drop
  // is one assignment and the re-warm spawns a login shell.
  need(
    '29',
    w.dropsBeforeAnyTimerFired === 1 && w.capturesBeforeAnyTimerFired === 0,
    `on the first event the cache was dropped ${show(w.dropsBeforeAnyTimerFired)} ` +
      `time(s) and ${show(w.capturesBeforeAnyTimerFired)} shell(s) were started, ` +
      'before any timer fired. Debouncing the drop would open a 400 ms window in ' +
      'which a create reads a value we already know is stale, and it would buy ' +
      'nothing, because the drop is not the expensive half.'
  );
  need(
    '30',
    show(w.firstBurstTimerMs) === show([400]) && w.debounceMs === 400,
    `the first burst scheduled ${show(w.firstBurstTimerMs)} with ` +
      `ENV_WATCH_DEBOUNCE_MS ${show(w.debounceMs)}. lastWarmAt starts a full ` +
      'interval in the past so the FIRST burst waits only the debounce.'
  );
  need(
    '30',
    w.timersForOneBurst === 1 && w.dropsForOneBurst === 3,
    `three events in one burst scheduled ${show(w.timersForOneBurst)} timer(s) and ` +
      `made ${show(w.dropsForOneBurst)} drops. One timer per burst and one drop ` +
      'per event is the whole shape: measured bursts are tiny — a vim-style ' +
      'backup-then-rename gives 2 events at 0 ms spread, `sed -i` gives 2, an ' +
      'append gives 1 — so 400 ms is generous and the exact value is not ' +
      'load-bearing.'
  );
  need(
    '30',
    w.capturesAfterDebounce === 1,
    `the debounce fired and made ${show(w.capturesAfterDebounce)} captures.`
  );
  need(
    '31',
    show(w.floorTimerMs) === show([4900]) && w.floorMs === 5000,
    `a second burst 100 ms after a warm scheduled ${show(w.floorTimerMs)} with ` +
      `ENV_WARM_MIN_INTERVAL_MS ${show(w.floorMs)}. A \`chezmoi apply\`, a \`stow\` ` +
      'or a `git checkout` in a dotfiles repo can move all four files at once, and ' +
      'without a floor that is four login shells.'
  );
  need(
    '31',
    w.dropsWhileFloorHolds === 1 && w.capturesWhileFloorHolds === 0,
    `while the floor held, the event dropped the cache ` +
      `${show(w.dropsWhileFloorHolds)} time(s) and started ` +
      `${show(w.capturesWhileFloorHolds)} shell(s). The floor gates the RE-WARM ` +
      'and never the drop — and never a create, which probes for itself at ' +
      'today\'s cost, which is the fallback the phase requires.'
  );
  need(
    '32',
    w.timersClearedByStop === true,
    'a timer survived stopEnvWatch(). Every timer is unref\'d and cleared by the ' +
      'disposer.'
  );

  // R33. `onSettingsUpdated` fires for EVERY settings write — a theme change, a
  // window bound, a hotkey. A listener that dropped on every call would spawn a
  // login shell every time a person moved a slider in Settings.
  need(
    '33',
    w.dropsAfterUnrelatedSettingsWrite === 0 &&
      w.timersAfterUnrelatedSettingsWrite === 0,
    `an unrelated settings write dropped the cache ` +
      `${show(w.dropsAfterUnrelatedSettingsWrite)} time(s) and scheduled ` +
      `${show(w.timersAfterUnrelatedSettingsWrite)} re-warm(s). The listener ` +
      'compares the declared cover sorted-and-joined and returns immediately when ' +
      'it is unchanged.'
  );
  need(
    '33',
    w.dropsAfterReorderedCover === 0,
    'the same names in a different order were treated as a change. The cover is ' +
      'compared sorted.'
  );
  need(
    '33',
    w.dropsAfterNewName === 1 && w.timersAfterNewName === 1,
    `adding a name dropped the cache ${show(w.dropsAfterNewName)} time(s) and ` +
      `scheduled ${show(w.timersAfterNewName)} re-warm(s). This buys RESIDENCY and ` +
      'WARMTH and it is NOT the correctness device: coverage already refuses to ' +
      'answer an ask naming a name the slot does not mention, with no listener, ' +
      'no event and no timer in the path.'
  );
  need(
    '32',
    w.settingsListenersAfterStop === 0,
    'the settings subscription outlived the stop.'
  );

  need(
    '28',
    w.stateWhenNoHandleOpens === null && show(w.armedWhenNoHandleOpens) === show([]),
    `with every watcher refusing to open, the watch reported ` +
      `${show(w.stateWhenNoHandleOpens)} and armed ${show(w.armedWhenNoHandleOpens)}. ` +
      'If NO handle opens the cache is never armed and every create probes. This ' +
      'is the structural property the Tier 3 verdict rests on: a stale key ' +
      'requires the cache to be on, and the cache being on requires the ' +
      'invalidation to be armed.'
  );
  need(
    '21',
    w.stateForUnmeasuredShell === null && show(w.armedForUnmeasuredShell) === show([]),
    `an unmeasured shell armed ${show(w.armedForUnmeasuredShell)} and watched ` +
      `${show(w.stateForUnmeasuredShell)}. It must arm nothing.`
  );
  need(
    '41',
    w.stateWithKnobSet === null &&
      show(w.armedWithKnobSet) === show([]) &&
      w.watchersWithKnobSet === 0 &&
      w.capturesWithKnobSet === 0,
    `GMUX_NO_ENV_CACHE=1 left targets ${show(w.stateWithKnobSet)}, armed ` +
      `${show(w.armedWithKnobSet)}, ${show(w.watchersWithKnobSet)} watcher(s) and ` +
      `${show(w.capturesWithKnobSet)} capture(s). The knob turns the WHOLE feature ` +
      'off — no watch, no warm, no cache — so the parent\'s behaviour is reachable ' +
      'at HEAD for the measurement and for an ablation.'
  );

  need(
    '37',
    w.capturesForEmptyCover === 0 && w.capturesForEmptyCoverAfterRefresh === 0,
    `an empty declared cover started ${show(w.capturesForEmptyCover)} shell(s) at ` +
      `boot and ${show(w.capturesForEmptyCoverAfterRefresh)} on a refresh. A ` +
      'person who has configured no shell variable must not start paying for a ' +
      'login shell at boot that they never paid for before. This is a rule, not ' +
      'an optimisation.'
  );
  need(
    '38',
    show(w.warmAsk) === show(['ACMEAI_API_KEY', 'ACMEAI_BASE_URL', 'HOME', 'ZDOTDIR']),
    `the warm-up asked for ${show(w.warmAsk)}. The two extra names are how the ` +
      'watch set stops being a guess and they cost nothing: ZDOTDIR is usually ' +
      'set INSIDE ~/.zshenv, so it is not in Electron\'s process.env at all, and ' +
      'both are paths this process already has rather than credentials.'
  );
  need(
    '38',
    show(w.targetsAfterWarm) ===
      show(
        ['.zshenv', '.zprofile', '.zshrc', '.zlogin'].map(
          (n) => `/home/reported-by-the-shell/.config/zsh/${n}`
        )
      ),
    `after the shell answered HOME and ZDOTDIR the watch set was ` +
      `${show(w.targetsAfterWarm)}. The REAL answer comes from the shell itself.`
  );
  need(
    '38',
    show(w.targetsWhenZdotdirMissing) ===
      show(
        ['.zshenv', '.zprofile', '.zshrc', '.zlogin'].map(
          (n) => `/home/reported-by-the-shell/${n}`
        )
      ),
    `a ZDOTDIR the shell did not report gave ${show(w.targetsWhenZdotdirMissing)}. ` +
      'It falls back to the home the shell reported. STATED LIMIT: `finish` sorts ' +
      'an empty value into `missing`, so through this channel ZDOTDIR="" and ' +
      'ZDOTDIR unset are indistinguishable and both read as unset. For that ' +
      'person the automatic invalidation is blind; the cache is still correct, ' +
      'because coverage and the refresh both work.'
  );

  need(
    '27',
    w.oldTargetClosed === true && w.newTargetOpened === true,
    `after the symlink moved, the old target closed ${show(w.oldTargetClosed)} and ` +
      `the new one opened ${show(w.newTargetOpened)}. The whole set is re-derived ` +
      'on every fire, for `credentials/watch.ts`\'s own reason: a rename can move ' +
      'the target and the first build of that watcher never looked again.'
  );
  need(
    '27',
    Array.isArray(w.targetsAfterMove) &&
      w.targetsAfterMove.includes(`${HOME}/dotfiles/two/zshrc`) &&
      !w.targetsAfterMove.includes(`${HOME}/dotfiles/one/zshrc`),
    `the target set after the move was ${show(w.targetsAfterMove)}.`
  );

  need(
    '43',
    w.refreshResolvesWith === 'undefined',
    `the refresh resolved with ${show(w.refreshResolvesWith)}. It resolves void ` +
      'whatever happened: nothing the probe learned can cross that channel ' +
      'without risking the names-only rule, and a button that returns nothing can ' +
      'never lie.'
  );
  need(
    '43',
    w.refreshDrops === 1 && w.refreshCaptures === 1,
    `the refresh made ${show(w.refreshDrops)} drop(s) and ` +
      `${show(w.refreshCaptures)} capture(s) while the five second floor was ` +
      'holding. The drop is first and immediate, and the floor is bypassed ' +
      'because a person who pressed a button asked for it.'
  );
  need(
    '43',
    w.refreshAfterStopDrops === 0,
    'a refresh after the stop still touched the cache.'
  );

  need(
    '40',
    w.heldWarmProbes === 1 &&
      w.watchersOpenedAfterQuit === 0 &&
      w.stateAfterQuitDuringWarm === null,
    `a quit landing inside the warm-up left ${show(w.watchersOpenedAfterQuit)} new ` +
      `handle(s) and the state ${show(w.stateAfterQuitDuringWarm)}. This is Phase ` +
      '220\'s shape: a quit landing inside a fire-and-forget chain ran the ' +
      'disposer against a null watcher and the chain then installed handles AFTER ' +
      'the disposer had finished with the domain. The warm-up asks whether the ' +
      'watch is still running on BOTH sides of its await.'
  );
  need(
    '39',
    w.stateAfterRestartPostQuit === null,
    'a start after a quit installed handles again. The quit refusal is permanent ' +
      'for the process, because a quit is the end of the process.'
  );
}

// ---------------------------------------------------------------------------
// Section 4 — the refusals, read as text over the tree (SPEC §9)
// ---------------------------------------------------------------------------

const resolveRaw = read('src/main/tmux/resolve.ts');
const resolveCode = stripComments(resolveRaw);

// §9.1 THE `-i` STAYS. `.zshrc` is read by interactive shells and by nothing
// else, and a provider key exported there is the whole of issue 20. Dropping it
// makes the probe fast and the feature useless, and it is the same mistake PR
// #21 made. Measured again on the calibrated slow home: `zsh -lic` is 811-918 ms
// and `zsh -lc` is 3-5 ms, and `zsh -lc` does not read `.zshrc` at all.
// THE NEEDLE IS COMPOSED RATHER THAN WRITTEN OUT, and that is not style.
// `npm run gate:background` reads every file under build/ for a call that
// starts a process, and a string literal reading `spawn(shell, [...])` in THIS
// file is indistinguishable from one. It flagged this line and named it as a
// runner nothing can ever end. Splitting the token keeps the assertion byte for
// byte and stops a gate about background processes reporting on a gate that
// starts none.
const LIC_SPAWN = `${'spawn'}(shell, ['-lic', script]`;
need(
  '9.1',
  resolveCode.includes(LIC_SPAWN),
  'the login-shell env probe no longer spawns with `-lic`. THE `i` IS ' +
    'LOAD-BEARING: `.zshrc` is read by interactive shells and by nothing else, ' +
    'and a provider key exported there is the whole of issue 20. A fast probe ' +
    'that misses a person\'s keys has fixed nothing. Any round tempted to remove ' +
    'it stops here.'
);

// R14. `captureLoginShellEnv` IS UNCHANGED. This phase WRAPS it and never edits
// it. The pin is over code tokens with comments and whitespace normalised away,
// because SPEC rule 16 asks this very module for two comment rewrites and a raw
// byte pin would go red on the phase's own instruction.
const CAPTURE_BODY_SHA =
  '3f7ad8d1a2300c3996474111955e462588e96041b3f9935d85f27daf3cb99d05';
const captureBody = functionBodyOf(resolveCode, 'captureLoginShellEnv');
need(
  '14',
  captureBody !== null,
  '`captureLoginShellEnv` is no longer a function declaration in ' +
    'src/main/tmux/resolve.ts, so rule 14 has nothing to pin. It stays exported ' +
    'and stays what a disarmed cache is.'
);
if (captureBody !== null) {
  const got = sha256(normalized(captureBody));
  need(
    '14',
    got === CAPTURE_BODY_SHA,
    `\`captureLoginShellEnv\`'s body hashes ${got} where the pin is ` +
      `${CAPTURE_BODY_SHA}. The phase WRAPS it and never edits it, byte for byte: ` +
      'the nonce marker, the tail buffer, the per-name maxOutput, the early settle ' +
      'on `usable.every`, the deadline, the group kill, and the deadline cleared ' +
      'on `close` and never on `exit`. If the change is deliberate, the commit ' +
      'that makes it moves this constant and says which lines moved and why.'
  );
}

// R13. THERE IS NO VALUE DOOR. A longer-lived answer earns a STRICTER reading
// of Phase 269's no-value rule rather than a looser one.
const namesHeldBody = functionBodyOf(resolveCode, 'loginShellEnvNamesHeld');
need(
  '13',
  namesHeldBody !== null && !/\.result\b|\bvalues\b/.test(namesHeldBody),
  `loginShellEnvNamesHeld's body is ${show(namesHeldBody)}. It answers NAMES and ` +
    'names only.'
);
const tmuxIndex = code('src/main/tmux/index.ts');
for (const name of [
  'loginShellEnvFor',
  'enableLoginShellEnvCache',
  'dropLoginShellEnvCache',
  'loginShellEnvEpoch',
  'loginShellEnvNamesHeld'
]) {
  need(
    '13',
    new RegExp(`\\b${name}\\b`).test(tmuxIndex),
    `src/main/tmux/index.ts does not re-export ${name}, so the domain's one door ` +
      'is not the one the rest of main can reach.'
  );
}
need(
  '13',
  !/loginShellEnvValues|envSlotValues|loginShellEnvHeldValues/.test(resolveCode) &&
    !/loginShellEnvValues|envSlotValues/.test(tmuxIndex),
  'the tmux domain exports something that hands VALUES out of the cache. The ' +
    'answer lives in one process-lifetime slot and nowhere else, so the cache is ' +
    'never a place a key can be read out of later.'
);

// R15. THE TWO CALL SITES. `create-local.ts:649` and `restore.ts:997` are the
// only production callers, and both go through the cached door.
for (const rel of ['src/main/sessions/create-local.ts', 'src/main/restore/restore.ts']) {
  const body = code(rel);
  need(
    '15',
    /\bloginShellEnvFor\s*\(/.test(body),
    `${rel} does not call loginShellEnvFor, so that create path still pays for a ` +
      'login shell every time.'
  );
  need(
    '15',
    !/\bcaptureLoginShellEnv\s*\(/.test(body),
    `${rel} still calls captureLoginShellEnv directly, which walks straight past ` +
      'the cache and past the invalidation with it.'
  );
}
const strayCallers = [];
{
  const walk = (dir) => {
    const entries = spawnSync(
      '/usr/bin/find',
      [join(repoRoot, dir), '-name', '*.ts', '-not', '-path', '*/__tests__/*'],
      { encoding: 'utf8' }
    );
    return (entries.stdout ?? '').split('\n').filter((l) => l.trim() !== '');
  };
  for (const abs of walk('src')) {
    const rel = abs.slice(repoRoot.length + 1);
    if (rel === 'src/main/tmux/resolve.ts' || rel === 'src/main/tmux/index.ts') continue;
    if (/\bcaptureLoginShellEnv\s*\(/.test(stripComments(readFileSync(abs, 'utf8')))) {
      strayCallers.push(rel);
    }
  }
}
need(
  '15',
  strayCallers.length === 0,
  `these files call captureLoginShellEnv directly: ${strayCallers.join(', ')}. ` +
    'Every consumer of a login-shell env answer goes through `loginShellEnvFor`, ' +
    'which is what makes the invalidation reach all of them.'
);

// R34. THE REMOTE PROBE IS A DIFFERENT PROBE AGAINST A DIFFERENT MACHINE'S
// SHELL AND IT DOES NOT CACHE. A cache keyed without the machine would hand one
// machine's values to another, which is the worst defect available in this
// phase — and the half that makes the local cache safe does not exist over
// there, because there is no `fs.watch` across ssh.
const REMOTE_PROBE_SHA =
  'f656557130a29c7f4f669e88aceb8c451aab6f50715eca9b0d289d0ec07848dd';
const remoteProbe = code('src/main/machines/remote-env-probe.ts');
need(
  '34',
  sha256(normalized(remoteProbe)) === REMOTE_PROBE_SHA,
  `src/main/machines/remote-env-probe.ts hashes ${sha256(normalized(remoteProbe))} ` +
    `where the pin is ${REMOTE_PROBE_SHA}. This phase does not touch it. Its own ` +
    'header already ruled it: "Per create, never cached per connection ... because ' +
    'rotating a value and starting a second session must pick the new one up".'
);
need(
  '34',
  !/cache/i.test(remoteProbe),
  'the remote env probe names a cache. If a later round does cache it, the key ' +
    'shape already exists next door in remote-path.ts: MACHINE IDENTITY AND ' +
    'CONNECTION GENERATION must both be in the key.'
);
{
  const remoteEnv = code('src/main/machines/remote-env.ts');
  const list = /REMOTE_ENV_ALLOWED[^=]*=\s*\[([^\]]*)\]/.exec(remoteEnv);
  const entries =
    list === null
      ? null
      : list[1].split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  need(
    '34',
    entries !== null && entries.length === 2,
    `REMOTE_ENV_ALLOWED holds ${show(entries)}. It stays at exactly two names, and ` +
      'no value is ever sent from this Mac.'
  );
}

// §9.2 NO VALUE IS PERSISTED ANYWHERE. Not in settings, not in the manifest, not
// in a log, not in an argv, not in a file this phase adds.
{
  const found = spawnSync(
    '/usr/bin/find',
    [join(repoRoot, 'src/main/env'), '-name', '*.ts', '-not', '-path', '*/__tests__/*'],
    { encoding: 'utf8' }
  );
  const envFiles = (found.stdout ?? '').split('\n').filter((l) => l.trim() !== '');
  need(
    '9.2',
    envFiles.length >= 2,
    `src/main/env holds ${String(envFiles.length)} module(s). The domain is ` +
      'shell-files.ts and watch.ts.'
  );
  const WRITES =
    /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdirSync|renameSync|copyFileSync|openSync)\b/;
  for (const abs of envFiles) {
    const rel = abs.slice(repoRoot.length + 1);
    const body = stripComments(readFileSync(abs, 'utf8'));
    need(
      '9.2',
      !WRITES.test(body),
      `${rel} names a filesystem WRITE. The answer lives in memory for the life of ` +
        'the process and is written nowhere — not the manifest, not settings, not ' +
        'a log, not an argv. That is Phase 269\'s rule and it does not move ' +
        'because the answer is now kept longer.'
    );
    need(
      '26',
      !/parcel/i.test(body),
      `${rel} reaches @parcel/watcher. Its subscribe is RECURSIVE and has no ` +
        'non-recursive mode: over the same home-shaped tree, 2,000 writes in ' +
        'Library/Caches and node_modules gave @parcel/watcher 2,001 events and ' +
        '`fs.watch` 1, and both caught the edit. Worse, every subscription it ' +
        'makes carries the FSEvents exclusion plan, whose budget is EIGHT paths ' +
        'and whose overflow mode is the silent total failure of every OTHER ' +
        'repository\'s exclusions.'
    );
    need(
      '26',
      !/recursive\s*:\s*true/.test(body),
      `${rel} opens a RECURSIVE watch. Nothing here is recursive: this is a small ` +
        'named set of files in one or two directories.'
    );
  }
}

// R20. `shellFilesFor` IS PURE, so the table is unit-testable and
// gate-assertable with zero fs and zero spawns.
{
  const raw = read('src/main/env/shell-files.ts');
  const body = stripComments(raw);
  const imports = raw.match(/^import .*$/gm) ?? [];
  need(
    '20',
    imports.every((line) => !/node:fs|child_process|electron/.test(line)),
    `src/main/env/shell-files.ts imports ${show(imports)}. It touches no ` +
      'filesystem and spawns nothing, which is what makes the table assertable ' +
      'with no I/O at all.'
  );
  need(
    '20',
    !/\bspawn\b|\bexec\b/.test(body),
    'src/main/env/shell-files.ts names a spawn.'
  );
}

// R30. The constants are DEFINED in this module and not imported from
// credentials/watch.ts. An import would put a credentials edge in this domain's
// graph to borrow a coincidence: the two debounces govern different reactions
// and only happen to agree.
{
  const raw = read('src/main/env/watch.ts');
  need(
    '30',
    /export const ENV_WATCH_DEBOUNCE_MS = 400;/.test(raw),
    'ENV_WATCH_DEBOUNCE_MS is not declared as 400 in src/main/env/watch.ts.'
  );
  need(
    '31',
    /export const ENV_WARM_MIN_INTERVAL_MS = 5_000;/.test(raw),
    'ENV_WARM_MIN_INTERVAL_MS is not declared as 5_000 in src/main/env/watch.ts.'
  );
  need(
    '30',
    /credentials\/watch\.ts/.test(raw),
    'the debounce constant no longer names credentials/watch.ts. The comment says ' +
      'the two agree and says why they are NOT the same constant, so a later round ' +
      'does not fold them together.'
  );
  need(
    '30',
    !/from '\.\.\/credentials\//.test(stripComments(raw)),
    'src/main/env/watch.ts imports from the credentials domain. The debounce ' +
      'values agree by coincidence, not by contract.'
  );
}

// R42. The channel carries nothing back.
{
  const app = read('src/shared/ipc/app.ts');
  need(
    '42',
    /'settings:envRefresh'\s*:\s*\{\s*req:\s*\[\]\s*;\s*res:\s*void\s*\}/.test(app),
    'settings:envRefresh is not declared `req: []; res: void` in ' +
      'src/shared/ipc/app.ts. It resolves void whatever happened, and that is a ' +
      'decision: if the probe failed, nothing was cached, so the next create ' +
      'probes anyway and the existing `env-unresolved` notice is the sentence that ' +
      'names the variable.'
  );
}

// R47. THE THREE STRINGS, VERBATIM, and none of them measures a value.
{
  const copy = read('src/renderer/settings/env-copy.ts');
  const strings = [
    ["ENV_REFRESH_BUTTON", "'Re-read shell'"],
    ["ENV_REFRESH_BUSY", "'Reading…'"],
    [
      'ENV_REFRESH_HINT',
      "'Ask your shell again. The next session you start gets the current values.'"
    ]
  ];
  for (const [name, literal] of strings) {
    need(
      '47',
      copy.includes(`export const ${name} =`) && copy.includes(literal),
      `${name} is not ${literal} in src/renderer/settings/env-copy.ts. The visible ` +
        'text is the accessible name and the hint is the title; a person who never ' +
        'hovers meets one two-word label.'
    );
  }
  const block = copy.slice(copy.indexOf('ENV_REFRESH_BUTTON'));
  need(
    '47',
    !/\$\{/.test(block.slice(0, block.indexOf('ENV_REFRESH_HINT') + 400)),
    'one of the refresh strings interpolates. None of them may interpolate, ' +
      'format, hint at or measure a VALUE — no age, no count, no name, no length, ' +
      'no "your key looks right".'
  );
}

// R35, R36, R39. The wiring, which is the difference between a module that
// exists and a feature that runs.
{
  const index = read('src/main/index.ts');
  need(
    '35',
    /getGmuxCore\(\)\s*\n?\s*\.then\(\(\)\s*=>\s*\{\s*\n?\s*startEnvWatch\(\);/.test(
      index
    ),
    'src/main/index.ts does not call startEnvWatch() as the first step of the ' +
      'getGmuxCore() chain. ARMING EARLY IS WHAT BUYS THE RESTORE BURST: restore ' +
      'runs right after the core is open, so with the cache armed the FIRST ' +
      'restored session\'s probe fills the slot and every session after it hits. ' +
      'Waiting the full second would have twenty restored sessions pay twenty ' +
      'login shells, which is what the parent does.'
  );
  need(
    '36',
    /BOOT_OBSERVE_DELAY_MS\)\)\s*\)\s*\n?\s*\.then\(\(\)\s*=>\s*warmEnvAtBoot\(\)\)/.test(
      index
    ),
    'src/main/index.ts does not wait BOOT_OBSERVE_DELAY_MS before warmEnvAtBoot(). ' +
      'The existing constant is reused rather than a second one added, and the ' +
      'warm waits the same second the login observe waits, for the same reason: ' +
      'the first paint and the restore burst are not made to compete with a shell ' +
      'start.'
  );
  need(
    '36',
    /void getGmuxCore\(\)/.test(index),
    'the env chain in src/main/index.ts is awaited. Nothing on the boot path may ' +
      'await either step; `window-shown` is measured at the parent and at HEAD to ' +
      'prove it.'
  );
  const caps = read('src/main/capabilities.ts');
  const stopLogins = caps.indexOf('stopLoginsWatch();');
  const stopEnv = caps.indexOf('stopEnvWatch();');
  need(
    '39',
    stopLogins >= 0 && stopEnv > stopLogins && stopEnv - stopLogins < 1200,
    'stopEnvWatch() is not called beside stopLoginsWatch() in the one ordered ' +
      'disposer. It holds fs.watch handles and a timer, and both must be released ' +
      'whatever the rest of teardown does.'
  );
}

// R61. THE HARNESS SEED, WHICH IS THE INTEGRATOR'S RULE AND NOT THE SPEC'S.
//
// The spec put `startEnvWatch()` below `dispatchHarness` and said, correctly,
// that a harness launch never reaches it. It then asked for one app run that
// drives a cold create, warm creates, a rotation and the refresh — through
// `GMUX_SHOT_SETTINGS`, which IS a harness launch. Measured rather than
// argued: the first run of `probe:p276` read ONE login shell and about 960 ms
// for every one of eighteen creates, warm and cold alike, because the cache was
// never armed. `src/main/harness/env-watch-seed.ts` closes that, and this rule
// is what stops the closing being widened.
//
// THE SEED IS THE ONE PLACE A HARNESS MAY ARM THIS CACHE, and it carries the
// same two refusals every seed in this repository carries, through the SHARED
// `seedRefusal` rather than a sixth copy of them. Without the refusals a
// `GMUX_ENV_WATCH_SEED` left in a shell profile would make a person's real app
// hold fs.watch handles on their home and spawn a login shell — which is the
// exact class section 1.6's arming rule exists to prevent.
{
  const seed = read('src/main/harness/env-watch-seed.ts');
  need(
    '61',
    /seedRefusal\('GMUX_ENV_WATCH_SEED', env, userDataDir\)/.test(seed),
    'src/main/harness/env-watch-seed.ts does not decide its refusal with the ' +
      'shared seedRefusal() naming its own variable. A seed that spells the two ' +
      'refusals itself is the sixth copy of them, and the one that gets them ' +
      'wrong.'
  );
  need(
    '61',
    /if \(refusal !== null\) throw new Error\(refusal\);/.test(seed) &&
      seed.indexOf('startEnvWatch();') > seed.indexOf('if (refusal !== null)'),
    'src/main/harness/env-watch-seed.ts arms the watch without throwing on its ' +
      'refusal first. The refusal must be decided and thrown BEFORE any handle ' +
      'opens, or a launch on a real profile is armed and then complained about.'
  );
  // ASKED ABOUT THE CODE AND NOT THE PROSE. The header argues at length about
  // fs.watch handles and about arming, so a needle read over the whole file
  // answers yes to its own explanation. Comments are stripped first.
  const seedCode = seed
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  need(
    '61',
    !/\bwatch\s*\(|\brequire\s*\(|captureLoginShellEnv\s*\(|enableLoginShellEnvCache\s*\(|dropLoginShellEnvCache\s*\(/.test(
      seedCode
    ),
    'src/main/harness/env-watch-seed.ts reaches past the shipped pair. It may ' +
      'call startEnvWatch() and warmEnvAtBoot() and nothing else: a seed that ' +
      'opened its own watcher, called the capture itself or armed the cache ' +
      'directly would be a second implementation of the thing under test.'
  );
  const harness = read('src/main/harness/index.ts');
  const shotBranch = harness.indexOf("if (shot !== undefined && shot !== '')");
  need(
    '61',
    shotBranch >= 0 &&
      harness.indexOf('await seedEnvWatch();') > shotBranch &&
      (harness.match(/seedEnvWatch\(\)/g) ?? []).length === 1,
    'seedEnvWatch() is not called exactly once, inside the GMUX_SHOT branch of ' +
      'dispatchHarness. Anywhere else and a launch that is not a photograph ' +
      'harness could arm the cache.'
  );
  need(
    '61',
    /warmEnvAtBoot\(\)/.test(read('src/main/index.ts')),
    'src/main/index.ts no longer calls warmEnvAtBoot(). The seed is an ADDITION ' +
      'for the harness and never a replacement for the boot chain.'
  );
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  process.stdout.write(`${TAG} FAIL, ${String(failures.length)}:\n`);
  for (const f of failures) {
    process.stdout.write(`  - [p276 R${f.rule}] ${f.sentence}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `${TAG} PASS. The cache, the $SHELL table, the watch set, the reaction, the ` +
    'lifecycle and the refusals, driven over the shipping modules with a fake ' +
    'capture, a fake watcher and a fake clock. A failed probe is never cached as ' +
    'success, a probe that a drop overtook installs nothing, the drop is ' +
    'immediate while the re-warm is debounced and floored, an unrelated settings ' +
    'write starts no shell, the `-i` is still on the spawn, the remote probe ' +
    'still does not cache, and no door hands a VALUE out of the slot. No ' +
    'Electron, no tmux, no ssh, no shell, nothing read under the person\'s home ' +
    'and nothing written anywhere.\n'
);
