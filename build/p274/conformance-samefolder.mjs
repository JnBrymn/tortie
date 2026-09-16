#!/usr/bin/env node
/**
 * `npm run conformance:samefolder`, the gate on the one question this phase
 * added: DO THESE TWO PATHS NAME ONE FOLDER (Phase 274).
 *
 * About 4.4 s, measured on 2026-09-16. It launches no Electron, opens no window, starts no tmux server,
 * spawns no agent, makes no request and reads nothing under the person's home.
 * It writes under a `mkdtemp` inside `/private/tmp`, under a case-sensitive
 * APFS disk image it creates and attaches, and inside a set of ablation copies
 * beside `src/main/fs` — all three removed in a `finally` and the image
 * DETACHED and its `.dmg` deleted there too, whatever happened.
 *
 * ## Why it exists
 *
 * Issue 25, belucid, 2026-09-15. He opened
 * `/Users/sean/source/SpecStory/getspecstory/specstory-cli` while the disk says
 * `/Users/sean/Source/...`. Not a symlink — a case-insensitive APFS volume,
 * which is the default and is what this machine runs too. Phase 273 fixed the
 * SAVE over that exact spelling. This phase is what is left after it:
 * `projects.path` is UNIQUE and SQLite uniqueness is byte-exact, so one folder
 * spelled two ways became TWO PROJECT ROWS, and the sessions join at
 * `sessions-repository.ts:812` and `:847` is `WHERE project_path = ?`, so a
 * person's sessions divided between the two rows.
 *
 * THE REFUSAL THIS GATE EXISTS TO KEEP is the reporter's own recorded wrong
 * fix: he case-folded a comparison and it corrupted sessions recorded on
 * another platform. Rule 23 below is that refusal made executable, and it
 * carries the Unicode twin with it — `String.prototype.normalize()` on a path
 * re-creates the mismatch a canonicalising `realpath` just removed, because
 * that realpath answers whichever form is ON DISK.
 *
 * ## IT DRIVES BOTH KINDS OF VOLUME, AND THAT IS THE POINT
 *
 * Case sensitivity belongs to the VOLUME and not to the machine. A gate that
 * only ever sees the operator's case-insensitive boot disk cannot catch the
 * merge danger — on a case-sensitive volume `Source` and `source` really are
 * two folders, and a repair that treated them as one would merge two real
 * projects into one identity. So this gate creates a case-sensitive APFS image
 * with `hdiutil create -size 20m -fs "Case-sensitive APFS"` (no sudo, measured
 * at 1.05 s to create, 0.19 s to attach, 0.19 s to detach on 2026-09-16),
 * mounts it under `/private/tmp`, runs the whole §8 table on it, and detaches
 * and deletes it in a `finally`.
 *
 * If the image cannot be made — a host that is not macOS, an `hdiutil` that
 * refuses — the gate says so in one line naming what is therefore NOT covered,
 * and the sensitive column is reported as unproven rather than silently
 * skipped. `P274_REQUIRE_IMAGE=1` turns that degradation into a failure, which
 * is what CI should set.
 *
 * ## The rules, and where each one lives
 *
 * SPEC.md §7 numbers 25 rules. Rules 1-12 are the identity door's, 13-19 are
 * the answer spelling's, 20-25 are this gate's. They are asserted here in that
 * order. Rules that can be DRIVEN are driven through the shipped module by
 * `build/p274/samefolder-probe.mts`; rules about which mechanism a module uses
 * are read out of its source by matching braces rather than by searching a file
 * for a word, because a `realpath` somewhere else in a module answers a
 * file-wide question and says nothing about this one.
 *
 * ## The ablations
 *
 * Rule 25: one per rule, each red on the rule that owns it. An ablation that
 * moves some other reading than the one it is written for proves something
 * else, so every ablation DECLARES THE RULES IT OWNS and the run fails if one
 * of them stayed green. The copies live one level under `src/main/`, dotted so
 * no include glob and no test runner picks them up, and are swept in a
 * `finally`.
 *
 * `P274_ABLATION_DETAIL=1` prints what each ablation moved.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockAt, closeOf, functionBodyOf, stripComments } from '../scan-source.mjs';
import { tsxCli } from '../ts-runner.mjs';
import { SHAPES, UNMOUNTED_ROW, expectedFor, relaxFixturePermissions } from './fixtures.mjs';
import { withCaseSensitiveImage } from './case-sensitive-image.mjs';

const TAG = '[conformance:samefolder]';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const notes = [];
const fail = (message) => failures.push(`${TAG} ${message}`);
const say = (line) => console.log(`${TAG} ${line}`);
const DETAIL = process.env['P274_ABLATION_DETAIL'] === '1';
const REQUIRE_IMAGE = process.env['P274_REQUIRE_IMAGE'] === '1';
/**
 * `P274_SOURCE_ONLY=1` runs the rules that READ THE SHIPPING SOURCE and skips
 * everything that touches a disk: no fixture, no image, no probe, no ablated
 * copy. It exists for `build/p274/ablation.mjs`, which breaks one clause of one
 * source file at a time and needs to know which rule went red — eleven full
 * runs would cost 50 s of mounting and unmounting to read a line of text. It is
 * NOT a way to run the gate cheaply: on its own it proves nothing about what
 * the module DOES, which is why the battery entry has no knob on it.
 */
const SOURCE_ONLY = process.env['P274_SOURCE_ONLY'] === '1';

const IDENTITY_REL = 'src/main/fs/folder-identity.ts';
const IDENTITY = join(repoRoot, IDENTITY_REL);

/** A repository file's bytes. Null when it is not there. */
function rawOf(rel) {
  try {
    return readFileSync(join(repoRoot, rel), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Source of a repository file, comments stripped.
 *
 * `stripComments` blanks a comment AND a regular expression's BODY character
 * for character while leaving strings alone, so every offset still points at
 * the same line. Rule 23's regex reader is built on exactly that: in this text
 * a regex literal is a `/`, a run of spaces and a `/`, and a string that holds
 * a path is not.
 */
function codeOf(rel) {
  const raw = rawOf(rel);
  return raw === null ? null : stripComments(raw);
}

/**
 * The body of a CLASS METHOD called `name`, braces and all.
 *
 * `functionBodyOf` in ../scan-source.mjs reads a function DECLARATION and
 * `addProject` is a method on GmuxCore, so it answers null for every rule in
 * this file. The parameter list is skipped through `closeOf` rather than by
 * finding the first `{`, so a destructured parameter cannot be mistaken for the
 * body, and the prefix refuses a CALL — `this.addProject(` has a `.` before the
 * name and never matches.
 */
function memberBodyOf(code, name) {
  const re = new RegExp(
    `(?:^|[\\n;}])\\s*(?:private\\s+|public\\s+|protected\\s+|static\\s+|async\\s+|readonly\\s+)*${name}\\s*\\(`,
    'g'
  );
  let m;
  while ((m = re.exec(code)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const params = closeOf(code, openParen);
    if (params === -1) continue;
    const open = code.indexOf('{', params);
    if (open === -1) continue;
    const inner = blockAt(code, open);
    if (inner !== null) return `{${inner}}`;
  }
  return null;
}

/** Whitespace-flattened, so a reflow is not a finding and a rewrite is. */
const flat = (text) => text.replace(/\s+/g, ' ').trim();
const digest = (text) => createHash('sha256').update(flat(text)).digest('hex').slice(0, 16);

// ===========================================================================
// THE RUNTIME HALF. One probe, two volumes.
// ===========================================================================

/**
 * Run the probe once. `modules` is the directory `folder-identity.ts` is loaded
 * from — the shipped one, or an ablated copy.
 */
function runProbe({ base, modules = null, noMachine = false, unmounted = null, mount = null }) {
  const probe = spawnSync(
    process.execPath,
    [tsxCli(), '--tsconfig', 'tsconfig.node.json', 'build/p274/samefolder-probe.mts'],
    {
      encoding: 'utf8',
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        P274_BASE: base,
        ...(modules === null ? {} : { P274_MODULES: modules }),
        ...(noMachine ? { P274_NO_MACHINE: '1' } : {}),
        ...(unmounted === null ? {} : { P274_UNMOUNTED: unmounted }),
        ...(mount === null ? {} : { P274_MOUNT: mount })
      }
    }
  );
  if (probe.status !== 0) {
    return { error: `the probe did not run: ${(probe.stderr || '').slice(-800) || '(no output)'}` };
  }
  const line = probe.stdout.trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(line);
  } catch {
    return { error: `the probe printed no JSON: ${probe.stdout.slice(0, 400)}` };
  }
}

/**
 * THE VERDICT: every reading this gate compares, as one flat array in a fixed
 * order, so an ablation's effect is a diff of two arrays rather than a
 * hand-written list of what to look at.
 */
const READINGS = [
  ...SHAPES.map((s) => ['row', s.id]),
  ['row', UNMOUNTED_ROW.id],
  ['clause', 'equalMissing'],
  ['clause', 'equalPresent'],
  ['clause', 'missingBoth'],
  ['clause', 'notdir'],
  ['probe', 'base'],
  ['probe', 'missingLeaf'],
  ['probe', 'digitsOnly'],
  ['probe', 'digitsOnlyReal'],
  ['probe', 'root'],
  ['probe', 'cache-first'],
  ['probe', 'cache-second'],
  ['probe', 'cache-third'],
  ['group', 'none'],
  ['group', 'pair'],
  ['group', 'three'],
  ['group', 'removed'],
  ['group', 'empty'],
  ['group', 'single'],
  ['group', 'repeated'],
  ['canonical', 'ofRealSpelling'],
  ['canonical', 'ofFlippedSpelling'],
  ['canonical', 'firmlink'],
  ['canonical', 'firmlinkPlain'],
  ['volume', 'volume']
];

const BUCKET = { row: 'rows', clause: 'clauses', probe: 'probes', group: 'groups', canonical: 'canonical' };

function verdict(result) {
  if (result.error !== undefined) return ['error'];
  return READINGS.map(([kind, key]) => {
    const value = kind === 'volume' ? result.volume : (result[BUCKET[kind]] ?? {})[key];
    return JSON.stringify(value ?? null);
  });
}

// ---------------------------------------------------------------------------
// The two volumes.
//
// The insensitive base is a mkdtemp UNDER /private/tmp rather than under
// os.tmpdir(): §8's /tmp row needs its own twin spelling and /tmp is the same
// directory by a shorter name, so putting the base there buys the row for free.
// ---------------------------------------------------------------------------

const localBase = mkdtempSync('/private/tmp/p274-conf-');
/** A path on the image, remembered so row 20 can be asked after the detach. */
let onImage = null;

// THE IMAGE IS NOT MADE HERE. `withCaseSensitiveImage` in
// ./case-sensitive-image.mjs owns the create, the attach, the mount-point parse
// and the detach, and it runs the detach and deletes the .dmg inside a
// `finally` of its own whatever the body did. Phase 274 shipped three scripts
// that need this volume — this gate, measure-volumes.mjs and probe-p274.mjs —
// and the first two were built in parallel and each wrote its own copy of that
// block. Two copies of a teardown is how one of them ends up without the
// `finally`, which is the machine-discipline rule this repository wrote after
// the 2026-08-22 crash.

let local = { error: 'not run' };
let sensitive = null;
let sensitiveSkip = null;
let ablationsRed = 0;
let ablationsTotal = 0;

// ===========================================================================
// RULE 20's assertion, shared by both volumes.
// ===========================================================================

function assertTable(rule, result, base) {
  const wrong = [];
  for (const shape of SHAPES) {
    const want = expectedFor(shape, result.volume);
    const got = result.rows[shape.id];
    if (got === want) continue;
    if (typeof got === 'string' && got.startsWith('skipped:')) {
      notes.push(`${rule}. ${shape.id} was skipped: ${got.slice('skipped:'.length)} — ${shape.title}`);
      continue;
    }
    wrong.push(`${shape.id}: expected ${String(want)}, read ${String(got)} — ${shape.title}`);
  }
  // The four shapes `path.resolve` already collapses are credited to `resolve`
  // and not to `sameFolder`, so the gate reads the resolve fact too.
  for (const shape of SHAPES.filter((s) => s.resolveCollapses === true)) {
    if (result.resolveEqual[shape.id] !== true) {
      wrong.push(`${shape.id}: path.resolve did NOT collapse the two spellings, so §8's "1 row" column is wrong`);
    }
  }
  if (wrong.length > 0) for (const line of wrong) fail(`${rule}. ${line}`);
  else {
    const asked = SHAPES.filter((s) => !String(result.rows[s.id] ?? '').startsWith('skipped:')).length;
    say(`${rule}. ${String(asked)} shapes on a volume that ${String(result.volume)} case, every one as §8 says (${base})`);
  }
}

// ===========================================================================
// RULES 2.2 / 2.3 — the clauses no §8 row reaches.
// ===========================================================================

function assertClauses(result) {
  if (result.error !== undefined) return;
  const want = {
    // RULE 5 and §2.2 clause 1. A path that does not exist, asked against
    // itself, can only be answered by the byte-equality fast path. Anything
    // that stats first answers 'different' here.
    equalMissing: 'same',
    equalPresent: 'same',
    // §2.2 clause 3. A path that names nothing is not the same folder as one
    // that names something, and the certainty is the point.
    missingBoth: 'different',
    notdir: 'different'
  };
  const wrong = Object.entries(want)
    .filter(([k, v]) => result.clauses[k] !== v)
    .map(([k, v]) => `${k}: expected ${v}, read ${String(result.clauses[k])}`);
  if (wrong.length > 0) for (const line of wrong) fail(`5. ${line}`);
  else say('5. the byte-equality fast path answers without a syscall, and absence is certain rather than unknown');

  // RULE 7. `unknown` and never `different` when a stat fails for a reason that
  // is not absence. The EACCES row is where it is measured.
  const eacces = result.rows['f21-unreadable'];
  if (eacces === 'unknown') say('7. an unreadable folder reads unknown, never different — no merge on a guess');
  else if (typeof eacces === 'string' && eacces.startsWith('skipped:')) {
    notes.push('7. the EACCES row was skipped, because uid 0 traverses every directory');
  } else fail(`7. the EACCES row read ${String(eacces)}; an unreadable folder must read unknown`);

  // RULE 9. The probe walks up past a missing component and past one with no
  // case to flip, stops at '/', and answers rather than throwing.
  const p = result.probes;
  const same = p.base === p.missingLeaf && p.base === p.digitsOnly && p.base === p.digitsOnlyReal;
  if (!same) {
    fail(
      `9. volumeFoldsCase answered ${String(p.base)} on the base, ${String(p.missingLeaf)} on a leaf that does not ` +
        `exist, ${String(p.digitsOnly)} on a name of digits and ${String(p.digitsOnlyReal)} on a real one; ` +
        'case folding belongs to the volume, so every directory on it must answer the same'
    );
  } else if (p.root !== 'unknown') {
    // FIX ROUND: 'unknown' EXACTLY, and it is the only answer '/' can have.
    // `basename('/')` is the empty string, there is no cased letter in it to
    // flip, and there is nowhere left to climb — so the walk reaches the root
    // and gives up, by construction, on every machine. The clause used to
    // accept 'folds', 'separates' OR 'unknown' and print whichever it got,
    // which asserted nothing at all: the probe asked '/' LAST, and with the old
    // per-device cache, on a machine where '/' and '/private/tmp' share a
    // device — measured, both 16777231 — it was reading a cache hit taken on a
    // different directory. The probe now asks '/' first and there is no cache.
    fail(
      `9. volumeFoldsCase('/') read ${String(p.root)}; the walk must stop at '/' and answer 'unknown'. ` +
        "basename('/') is empty, so there is no component to flip and nowhere to climb."
    );
  } else {
    say("9. the walk climbs past a missing leaf and past a name with no case to flip, and '/' answers unknown");
  }

  // §2.5. Three directories on ONE volume must agree, because case folding is a
  // property of the volume. FIX ROUND: this used to be read as the cache's own
  // clause. There is no cache — macOS hands a freshly attached image the `dev`
  // a detached one had, measured three times in a row at 16777241, so a
  // dev-keyed answer outlives the volume it was taken from — and the reading is
  // stronger without one: the filesystem is asked three times and says the same
  // thing three times.
  if (p['cache-first'] === p['cache-second'] && p['cache-first'] === p['cache-third']) {
    const t = result.timings ?? {};
    say(
      `9. three directories on one volume agree (${String(p['cache-first'])}), each asked of the ` +
        `filesystem rather than of a cache, at ` +
        `${[t.first, t.second, t.third].map((x) => `${Math.round(Number(x ?? 0))}us`).join(', ')}`
    );
  } else {
    fail(
      `9. three directories on ONE volume answered ${String(p['cache-first'])}, ${String(p['cache-second'])} and ` +
        `${String(p['cache-third'])}; the answer is a property of the volume and cannot differ between them`
    );
  }
}

// ===========================================================================
// RULE 21 — duplicateFolderGroups over planted fixtures.
// ===========================================================================

function assertGroups(result) {
  if (result.error !== undefined) return;
  const g = result.groups;
  const size = (name) => (Array.isArray(g[name]) ? g[name].length : -1);
  const members = (name) => (Array.isArray(g[name]) && g[name][0] ? g[name][0].length : -1);
  const wrong = [];
  if (size('none') !== 0) wrong.push(`two genuinely different folders were grouped: ${JSON.stringify(g['none'])}`);
  if (size('pair') !== 1 || members('pair') !== 2) {
    wrong.push(`a real folder and a symlink to it must make ONE group of 2, read ${JSON.stringify(g['pair'])}`);
  }
  if (size('three') !== 1 || members('three') !== 3) {
    wrong.push(`three spellings of one folder must make ONE group of 3, read ${JSON.stringify(g['three'])}`);
  }
  // A group whose folder has been removed MID-RUN: both spellings stat ENOENT,
  // so the answer is no group rather than a group of nothing or a throw.
  if (size('removed') !== 0) {
    wrong.push(`a folder removed before the question must make no group, read ${JSON.stringify(g['removed'])}`);
  }
  if (size('empty') !== 0) wrong.push('an empty input must make no group');
  if (size('single') !== 0) wrong.push('one path is not a duplicate of itself');
  // ONE SPELLING GIVEN TWICE IS A GROUP OF TWO, and that is declared rather
  // than fixed. The only caller is the duplicate log, whose input is
  // `listProjects()` mapped to `path`, and `projects.path` is UNIQUE, so the
  // input can never hold a repeat. A detector that deduplicated its own input
  // would be answering a question nobody asks.
  const repeated = Array.isArray(g['repeated']) ? g['repeated'][0] ?? [] : [];
  if (repeated.length !== 2 || repeated[0] !== repeated[1]) {
    wrong.push(
      `a spelling given twice must come back as that one spelling twice — the declared limit, safe because the ` +
        `caller's input is listProjects() over a UNIQUE column — and it read ${JSON.stringify(g['repeated'])}`
    );
  }
  if (wrong.length > 0) for (const line of wrong) fail(`21. ${line}`);
  else say('21. duplicateFolderGroups: a pair, a group of three, a removed folder, a repeat and two controls, all as written');
}

// ===========================================================================
// LAYER 3 — the realpath that actually canonicalises.
// ===========================================================================

function assertCanonical(result) {
  if (result.error !== undefined) return;
  const c = result.canonical;
  const wrong = [];
  // A path typed in the wrong case comes back in the DISK's case. This is the
  // whole of layer 3: `fs.realpathSync` is Node's own JS walk, it lstats each
  // component and rewrites only the ones that are symlinks, so it hands back
  // the case it was given. `fs.realpathSync.native` goes through libuv to
  // realpath(3) and does not.
  if (result.volume === 'folds') {
    if (c.ofFlippedSpelling !== c.ofRealSpelling) {
      wrong.push(
        `canonicalPathSync answered '${String(c.ofFlippedSpelling)}' for the flipped spelling and ` +
          `'${String(c.ofRealSpelling)}' for the disk one; on a folding volume they are one folder and ` +
          'the canonical answer is the disk spelling. A realpath that does nothing is layer 3.'
      );
    }
    if (typeof c.ofRealSpelling === 'string' && !c.ofRealSpelling.endsWith('/RealName')) {
      wrong.push(`canonicalPathSync did not restore the disk's case: ${String(c.ofRealSpelling)}`);
    }
  }
  // The firmlink: ONE folder, TWO canonical strings. This is why §2.2 chose
  // dev+ino and not realpath, and it is driven rather than quoted.
  if (c.firmlink !== 'n/a') {
    if (c.firmlink === c.firmlinkPlain) {
      wrong.push(
        `canonicalPathSync collapsed the APFS firmlink (${String(c.firmlink)}); §2.2's argument for dev+ino ` +
          'rests on it NOT collapsing, so either the machine changed or the reading is wrong'
      );
    } else {
      say(
        `11. the firmlink is one folder with two canonical strings — ${String(c.firmlinkPlain)} and ` +
          `${String(c.firmlink)} — which is the row realpath alone would fail and dev+ino answers`
      );
    }
  }
  if (wrong.length > 0) for (const line of wrong) fail(`11. ${line}`);
  else say('11. canonicalPathSync restores the case that is on disk, which fs.realpathSync does not');
}

// ===========================================================================
// RULE 12 — the overview reader's isUnder, driven.
// ===========================================================================

function assertOverview(result) {
  if (result.error !== undefined) return;
  const o = result.overview ?? {};
  if (o.error !== undefined) {
    fail(`12. the overview reader could not be driven: ${String(o.error)}`);
    return;
  }
  const one = (name) => (Array.isArray(o[name]) && o[name].length === 1 ? o[name][0] : null);
  const through = one('insideThroughLink');
  const plain = one('insidePlain');
  const outside = one('reallyOutside');
  const wrong = [];
  if (through === null || through.inside !== true || through.path !== 'src/index.ts') {
    wrong.push(
      `a token spelled under the project's CANONICAL root read ${JSON.stringify(through)}; it must be recorded ` +
        "project-relative as 'src/index.ts'. An agent writes the canonical spelling because it was launched " +
        'with sessions.cwd, so a reader that only knows the stored spelling records every path as outside.'
    );
  }
  if (plain === null || plain.inside !== true || plain.path !== 'src/index.ts') {
    wrong.push(`the plain spelling read ${JSON.stringify(plain)}; it has always worked and must keep working`);
  }
  if (outside === null || outside.inside !== false) {
    wrong.push(`a token that really is outside read ${JSON.stringify(outside)}; it must stay outside and absolute`);
  }
  if (wrong.length > 0) for (const line of wrong) fail(`12. ${line}`);
  else say("12. isUnder answers for the stored root AND its canonical form, and a stranger is still a stranger");
}

// ===========================================================================
// RULES 1 TO 11 — the identity door, read out of the source.
// ===========================================================================

/**
 * THE PINS. Rule 4 and rule 19 are promises that a file does NOT change, and a
 * promise like that is only checkable against the bytes it was made about.
 * These digests were taken at `30f4bd8d`, over the file with comments stripped
 * and whitespace flattened — so a new comment is allowed, exactly as the rules
 * say, and a moved line of code is not.
 */
const PINS = {
  'src/main/manifest/projects-repository.ts': '35dd59649da1815e',
  'src/shared/workspace-target.ts': '0ce6edc2675b36f7'
};

/** The three texts rule 4 names, flattened, so a reflow is not a finding. */
const REPOSITORY_TEXTS = [
  'INSERT INTO projects (id, path, name) VALUES (@id, @path, @name) ON CONFLICT(path) DO UPDATE SET name = excluded.name',
  "getProjectByPath(path: string): Project | undefined {",
  "'SELECT * FROM projects WHERE path = ?'"
];

function assertIdentityDoor() {
  const identity = codeOf(IDENTITY_REL);
  const core = codeOf('src/main/sessions/core.ts');

  // ------------------------------------------------------------------ RULE 5
  if (identity === null) {
    fail(`5. there is no ${IDENTITY_REL}; the module every other rule is about is missing`);
  } else {
    const dev = /\bdev\b\s*===/.test(identity) || /\.dev\b/.test(identity);
    const ino = /\bino\b\s*===/.test(identity) || /\.ino\b/.test(identity);
    if (!dev || !ino) fail('5. folder-identity.ts does not compare st.dev and st.ino, which is the only definition in this phase');
    else say('5. folder-identity.ts answers by st.dev and st.ino');
  }

  // ----------------------------------------------------------------- RULE 10
  // Its only syscalls are READS. Read from the import list rather than from a
  // search for a word, because a module that imports a write API has the
  // capability whether it uses it today or not.
  //
  // FIX ROUND: `stat`, the callback form, joins the allowlist. It is the same
  // syscall `statSync` already is, handed to libuv's thread pool instead of
  // taken on the main thread, and `duplicateFolderGroupsAsync` needs it because
  // the product's one caller runs at app open and a `statSync` against a
  // disconnected network mount blocks the event loop until that mount times
  // out. The rule's REASON is unchanged and is what decides the list: nothing
  // here may write. `node:fs/promises` is still refused, because the module may
  // name `node:fs` and `node:path` and nothing else.
  if (identity !== null) {
    const fsImports = [...identity.matchAll(/import\s*\{([^}]*)\}\s*from\s*'node:fs'/g)]
      .flatMap((m) => m[1].split(','))
      .map((s) => s.replace(/\btype\b/, '').trim())
      .filter((s) => s !== '');
    const allowed = new Set(['stat', 'statSync', 'realpathSync', 'Stats']);
    const extra = fsImports.filter((n) => !allowed.has(n));
    const modules = [...identity.matchAll(/from\s*'([^']+)'/g)].map((m) => m[1]);
    const foreign = modules.filter((m) => m !== 'node:fs' && m !== 'node:path');
    if (extra.length > 0) {
      fail(`10. ${IDENTITY_REL} imports ${extra.join(', ')} from node:fs; its only syscalls may be statSync and realpathSync.native`);
    } else if (foreign.length > 0) {
      fail(`10. ${IDENTITY_REL} imports ${foreign.join(', ')}; it may name node:fs and node:path and nothing else`);
    } else if (/\brealpathSync\s*\(/.test(identity)) {
      fail(`10. ${IDENTITY_REL} calls bare realpathSync(, which is Node's JS walk and does not canonicalise case`);
    } else if (!/realpathSync\s*\.\s*native\s*\(/.test(identity)) {
      fail(`10. ${IDENTITY_REL} never calls realpathSync.native, so canonicalPathSync cannot be canonicalising`);
    } else {
      say('10. folder-identity.ts names node:fs and node:path only, imports reads only (stat, statSync, realpathSync), and calls realpathSync.native');
    }
  }

  // ------------------------------------------------------------ RULES 1, 2, 3
  if (core === null) {
    fail('1. src/main/sessions/core.ts could not be read');
  } else {
    const body = memberBodyOf(core, 'addProject');
    if (body === null) {
      fail('1. src/main/sessions/core.ts declares no addProject method that this reader can find');
    } else {
      assertIdentityLookup(core, body);
      assertFoundRowWritesNothing(body);
      // RULE 6. A remote target never reaches sameFolder.
      const remote = memberBodyOf(core, 'addRemoteProject');
      if (remote === null) {
        fail('6. src/main/sessions/core.ts declares no addRemoteProject, so the remote half of this rule read nothing');
      } else if (remote.includes('sameFolder')) {
        fail('6. addRemoteProject names sameFolder; a path on another machine cannot be stat-ed here and must stay byte-exact');
      } else {
        say('6. the remote add path does not name sameFolder');
      }
      // RULE 8. One log line per duplicate group, and nothing when there are none.
      assertDuplicateLog(core);
    }
  }

  // ------------------------------------------------------------------ RULE 4
  assertPin('4', 'src/main/manifest/projects-repository.ts');
  const repo = codeOf('src/main/manifest/projects-repository.ts');
  if (repo !== null) {
    const missing = REPOSITORY_TEXTS.filter((t) => !flat(repo).includes(flat(t)));
    if (missing.length > 0) {
      fail(`4. projects-repository.ts no longer holds ${missing.map((m) => JSON.stringify(m.slice(0, 60))).join(', ')}; the identity question is asked ABOVE the SQL and never inside it`);
    } else if (/sameFolder|folder-identity/.test(repo)) {
      fail('4. projects-repository.ts names the identity module; the question is asked above it, in addProject');
    } else {
      say('4. upsertProject, getProjectByPath and the ON CONFLICT(path) clause are unchanged, and the SQL knows nothing about folders');
    }
  }

  // ----------------------------------------------------------------- RULE 11
  assertOneCanonicalDoor();
}

/**
 * RULES 1, 2 AND 6. The identity lookup, wherever `addProject` keeps it.
 *
 * It is a FREE FUNCTION in the tree rather than a line of `addProject`, because
 * `addProject`'s body is borrowed off the prototype by a unit test that hands it
 * a small host object, and a second method on `this` breaks that at run time.
 * So this reader finds the lookup by what it DOES — the one function in the file
 * that calls `sameFolder(` — rather than by a name a later round may change, and
 * then asserts that `addProject` reaches it.
 *
 * Exactly one such function is the rule, not an accident of the reader: a second
 * place that asks whether two paths are one folder is a second answer to
 * maintain, and rule 5 says there is one.
 */
function assertIdentityLookup(core, addBody) {
  const callers = [];
  for (const m of core.matchAll(/(?:^|[\n;}])\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const bodyText = functionBodyOf(core, m[1]) ?? memberBodyOf(core, m[1]);
    if (bodyText !== null && bodyText.includes('sameFolder(')) callers.push([m[1], bodyText]);
  }
  if (callers.length === 0) {
    fail('1. nothing in src/main/sessions/core.ts calls sameFolder, so a second spelling still mints a second row');
    return;
  }
  if (callers.length > 1) {
    fail(`1. ${String(callers.length)} functions in core.ts call sameFolder (${callers.map(([n]) => n).join(', ')}); there is one identity question and it has one answer`);
    return;
  }
  const [name, bodyText] = callers[0];
  const lookup = flat(bodyText);
  if (!addBody.includes(`${name}(`)) {
    fail(`1. addProject does not call ${name}, the one function that asks whether a row already names this folder`);
    return;
  }
  if (!lookup.includes('getProjectByPath(')) {
    fail(`1. ${name} does not ask getProjectByPath, so the common add pays for a walk it does not need`);
  } else if (lookup.indexOf('getProjectByPath(') > lookup.indexOf('sameFolder(')) {
    fail(`2. ${name} calls sameFolder before the byte-exact lookup; the fast path is one SELECT and zero syscalls and it goes first`);
  } else if (!lookup.includes('listProjects(')) {
    fail(`2. ${name} does not walk listProjects(), so "the first row that answers same" has no order to be first in`);
  } else if (!/return\s+row\b|return\s+[A-Za-z_$][\w$]*;/.test(lookup.slice(lookup.indexOf('sameFolder(')))) {
    fail(`2. ${name} does not RETURN the first row that answers 'same'; a walk that keeps going has no deterministic winner`);
  } else if (!lookup.includes('isLocalTarget(')) {
    fail(
      `6. ${name} walks every row without asking isLocalTarget. sameFolder stats a path on THIS Mac and a remote ` +
        "row's path is on another machine — there is no stat to take, so there is no dev+ino to compare, and " +
        'byte-exact is the conservative answer rather than the lazy one because a far side may be Linux.'
    );
  } else {
    say(`1/2/6. ${name} asks getProjectByPath first, then walks local rows only, and returns the first that answers same`);
  }
}

/**
 * RULE 3. On the found path `addProject` writes nothing, re-spells nothing and
 * deletes nothing. It clears the tab tombstone for the FOUND ROW'S OWN spelling
 * and returns.
 *
 * The argument is read rather than the name pinned: the rule is that the
 * tombstone cleared is the found row's, and `{ path: abs }` — the spelling the
 * person typed — is the one thing it may not be, because a person who typed the
 * second spelling would then clear a tombstone belonging to no row.
 */
function assertFoundRowWritesNothing(body) {
  const calls = [];
  let at = body.indexOf('clearProjectTabClosed(');
  while (at !== -1) {
    const open = body.indexOf('(', at);
    const close = closeOf(body, open);
    calls.push(flat(body.slice(open + 1, close === -1 ? open + 1 : close)));
    at = body.indexOf('clearProjectTabClosed(', at + 1);
  }
  if (calls.length === 0) {
    fail('3. addProject never clears the tab tombstone, so a folder that has a tab again is still recorded as closed');
    return;
  }
  const foundRow = calls.filter((a) => !/\babs\b/.test(a));
  if (foundRow.length === 0) {
    fail(
      `3. every clearProjectTabClosed in addProject is passed the spelling that was TYPED (${calls.join(' | ')}); ` +
        "on the found path it must clear the FOUND row's own spelling, or a person who typed the second spelling clears a tombstone belonging to no row"
    );
    return;
  }
  // It may not WRITE on the found path. A `return` that comes before any
  // upsert is what makes that true, and reading the ORDER is the only way to
  // say it: an upsert after the return is the insert this rule leaves alone.
  const returnAt = body.indexOf('return', body.indexOf(foundRow[0] === undefined ? 'clearProjectTabClosed(' : 'clearProjectTabClosed('));
  const upsertAt = body.indexOf('upsertProject(');
  if (returnAt === -1) {
    fail('3. the found path does not return, so it falls through into the insert');
  } else if (upsertAt !== -1 && upsertAt < returnAt) {
    fail('3. addProject upserts BEFORE the found path returns, so finding a row still writes one');
  } else {
    say("3. the found path clears the found row's own tombstone and returns before any write");
  }
}

/**
 * RULE 8. The line is written per GROUP, inside the loop over the groups, so a
 * manifest with no duplicates writes nothing at all. Read by matching braces:
 * a log call somewhere else in the file would answer a file-wide question.
 */
function assertDuplicateLog(core) {
  const at = core.indexOf('duplicateFolderGroupsAsync(');
  if (at === -1) {
    fail('8. src/main/sessions/core.ts never calls duplicateFolderGroupsAsync, so a person with two rows is never told');
    return;
  }
  // THE ASYNC DETECTOR AND NEVER THE SYNCHRONOUS ONE, added by the fix round.
  // The first build ran the synchronous walk — one `statSync` per local project
  // row — on the main process's boot path, before the control client started.
  // `statSync` against a disconnected SMB or NFS mount does not throw; it blocks
  // in the kernel until that mount times out, and the try/catch around it caught
  // a throw and could not catch a block. The population this diagnostic serves
  // was measured at ZERO, so the trade was an unbounded stall at app open for a
  // line nobody's manifest produces. `../recents/store.ts` asks the identical
  // question about the same kind of row and is asynchronous for the same reason.
  if (/\bduplicateFolderGroups\s*\(/.test(core)) {
    fail(
      '8. src/main/sessions/core.ts calls the SYNCHRONOUS duplicateFolderGroups. A statSync per project row on ' +
        'the main process blocks the event loop for as long as a dead network mount takes to time out, and a ' +
        'diagnostic for a population of zero may not do that at app open.'
    );
    return;
  }
  // THE LOG CALL MUST BE INSIDE AN ITERATION OVER THE GROUPS. That is what
  // makes "nothing at all when there are no duplicates" true by construction
  // rather than by a guard somebody can delete: an empty list iterates zero
  // times. Three spellings are admitted because all three are ordinary here —
  // `for (const g of groups)`, `groups.forEach(` and `groups.map(`.
  const after = core.slice(at);
  const opener = /for\s*\(|\.forEach\s*\(|\.map\s*\(/.exec(after);
  if (opener === null) {
    fail('8. the duplicate log does not iterate the groups, so it cannot be one line per group and nothing for none');
    return;
  }
  const headerOpen = after.indexOf('(', opener.index);
  const headerClose = closeOf(after, headerOpen);
  const braceAt = after.indexOf('{', headerClose === -1 ? headerOpen : headerClose);
  const block = braceAt === -1 ? null : blockAt(after, braceAt);
  if (block === null) {
    fail("8. the block that writes the duplicate line could not be read by matching braces");
    return;
  }
  if (!/\bwarn\b|\binfo\b|\berror\b/.test(block)) {
    fail('8. no log call sits inside the iteration over the duplicate groups, so the line is not per group');
    return;
  }
  if (!block.includes('volumeFoldsCase')) {
    fail(
      "8. the duplicate line does not name volumeFoldsCase's answer. \"These two strings are one folder\" is " +
        'an unfalsifiable claim in a log, and the volume\'s answer is what tells a reader whether they are looking ' +
        'at a folding volume or at a symlink.'
    );
    return;
  }
  say("8. one log line per duplicate group, inside the iteration, naming the volume's own answer");
}

/**
 * RULE 11. One door for synchronous canonicalisation, and the sites that want
 * the canonical answer go through it.
 */
const CANONICAL_CALLERS = [
  'src/main/manifest/harvest/watch.ts',
  'src/main/manifest/harvest/stores.ts',
  'src/main/manifest/reconstruct.ts',
  'src/main/watcher/repo-watcher.ts',
  'src/main/shell/arrival.ts',
  'src/main/overview/reader/resolve.ts'
];

function assertOneCanonicalDoor() {
  const missing = [];
  for (const rel of CANONICAL_CALLERS) {
    const code = codeOf(rel);
    if (code === null) {
      missing.push(`${rel} could not be read`);
      continue;
    }
    // THE IMPORT, not the NAME. An earlier version of this rule asked whether
    // the file named `canonicalPathSync` anywhere, and `build/p274/ablation.mjs`
    // walked straight through it: replacing the import with a local
    // `const canonicalPathSync = (p) => p` left the name in the file and the
    // rule green while the site canonicalised nothing. A door is the module the
    // name comes FROM.
    const imported = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']*folder-identity)'/g)].some((m) =>
      m[1].split(',').some((name) => name.trim() === 'canonicalPathSync')
    );
    if (!imported) {
      missing.push(
        `${rel} does not import canonicalPathSync from the identity module. ` +
          "Node has two functions spelled realpath and only one canonicalises: fs.realpathSync is Node's own " +
          'JS walk and hands back the case it was given, and this is the site that wanted the other one.'
      );
    } else if (!/canonicalPathSync\s*\(/.test(code)) {
      missing.push(`${rel} imports canonicalPathSync and never calls it`);
    }
  }
  if (missing.length > 0) for (const line of missing) fail(`11. ${line}`);
  else say(`11. all ${String(CANONICAL_CALLERS.length)} sites that want the canonical spelling import it from the one door and call it`);
}

function assertPin(rule, rel) {
  const code = codeOf(rel);
  if (code === null) {
    fail(`${rule}. ${rel} could not be read`);
    return false;
  }
  const got = digest(code);
  if (got !== PINS[rel]) {
    fail(
      `${rule}. ${rel} changed: its code digest is ${got} and the pin taken at 30f4bd8d is ${PINS[rel]}. ` +
        'This rule is a promise that the file does not change; a COMMENT is allowed and is stripped before the digest, so this is a code move.'
    );
    return false;
  }
  return true;
}

// ===========================================================================
// RULES 13 TO 19 — the answer spelling.
// ===========================================================================

function assertAnswerSpelling() {
  const ops = codeOf('src/main/fs/file-ops.ts');
  if (ops === null) {
    fail('13. src/main/fs/file-ops.ts could not be read');
  } else {
    assertEntryComposition(ops);
    assertContainmentUnchanged(ops);
  }

  // ----------------------------------------------------------------- RULE 19
  // `src/shared/workspace-target.ts` gains ONE COMMENT and no code. The digest
  // is over the comment-stripped file, so the comment is invisible to it and a
  // line of code is not.
  if (assertPin('19', 'src/shared/workspace-target.ts')) {
    const raw = readFileSync(join(repoRoot, 'src/shared/workspace-target.ts'), 'utf8');
    if (!/274/.test(raw)) {
      fail('19. workspace-target.ts records no ruling for this phase; sameTarget and targetKey are correct once one folder has one row, and the reason a later round must not "finish" them belongs beside them');
    } else {
      say('19. workspace-target.ts is unchanged in code and records why sameTarget and targetKey are correct as written');
    }
  }

  // -------------------------------------------------------------- RULES 16-18
  assertPathDoorField();
}

/**
 * RULES 13 AND 14. `entry()` composes `path` from the root the CALLER named and
 * `relPath` from `realRoot`, and every call site passes both.
 *
 * The caller-root parameter's NAME is derived from the declaration rather than
 * pinned, because the name is the builder's to choose and the composition is
 * not.
 */
function assertEntryComposition(ops) {
  const decl = ops.indexOf('function entry(');
  if (decl === -1) {
    fail('13. src/main/fs/file-ops.ts declares no function entry(');
    return;
  }
  const open = ops.indexOf('(', decl);
  const close = closeOf(ops, open);
  const params = ops
    .slice(open + 1, close)
    .split(',')
    .map((p) => p.split(':')[0].trim())
    .filter((p) => p !== '');
  const body = blockAt(ops, ops.indexOf('{', close));
  if (body === null) {
    fail("13. entry()'s body could not be read by matching braces");
    return;
  }
  const rootParam = params[0];
  const flatBody = flat(body);
  // relPath is measured from the REAL root, and it is the half that was already
  // right: measured `sub/new.md` on the mis-spelled root before this phase.
  const relOk = /relPath\s*:\s*relative\(\s*(realRoot|[A-Za-z_$][\w$]*\.real)\b/.test(flatBody);
  // `path` is composed under the caller's own root, and the one thing it may
  // not be is bare `abs` — that is the parent commit, where the tree asked for
  // a file at one spelling and was handed it at another.
  const pathExpr = /path\s*:\s*([^,]+),/.exec(flatBody);
  const pathOk = pathExpr !== null && pathExpr[1].trim() !== 'abs' && pathExpr[1].includes(rootParam);
  if (!relOk) {
    fail('13. entry() does not measure relPath from the REAL root; the relative path is a fact about the tree and it was already right');
  } else if (!pathOk) {
    fail(
      `13. entry() answers path: ${pathExpr === null ? '(unreadable)' : pathExpr[1].trim()} rather than composing it ` +
        `under ${String(rootParam)}. The tree asks for a file at one spelling and is handed it at another, and every ` +
        '===, every startsWith and every entriesByDir key in the renderer then disagrees with itself.'
    );
  } else {
    say(`13. entry() composes path under the caller's own root (${String(rootParam)}) and relPath from the real one`);
  }

  // RULE 14. Every call site passes the PAIR, and none composes an FsOpEntry by
  // hand. A site that passed the resolved root alone would compile and would
  // answer the resolved spelling, which is the defect wearing the new signature.
  const sites = [];
  let at = ops.indexOf('entry(', close);
  while (at !== -1) {
    const before = ops[at - 1] ?? ' ';
    if (!/[A-Za-z0-9_$.]/.test(before)) sites.push(at);
    at = ops.indexOf('entry(', at + 1);
  }
  const wrongArity = sites.filter((site) => argumentCount(ops, ops.indexOf('(', site)) !== params.length);
  const resolvedRoot = sites.filter((site) => {
    const argOpen = ops.indexOf('(', site);
    const argClose = closeOf(ops, argOpen);
    const first = ops.slice(argOpen + 1, argClose === -1 ? argOpen + 1 : argClose).split(',')[0].trim();
    return first === 'realRoot' || first.endsWith('.real');
  });
  // An FsOpEntry is `path` AND `relPath` AND `kind` in one object literal, and
  // entry()'s own return is the one that is allowed to be one. A first version
  // of this counter asked for `path` and `relPath` alone and reported 2, the
  // second being the FsTrashFailure at file-ops.ts:715 — which carries `errno`
  // and `message` and no `kind`, is not an entry, and is answered per item
  // because a trash cannot be rolled back.
  const bodyStart = ops.indexOf('{', close);
  const bodyEnd = bodyStart + (body?.length ?? 0) + 2;
  const handmade = [...ops.matchAll(/\{[^{}]*\bpath\s*:[^{}]*\brelPath\s*:[^{}]*\bkind\b/g)].filter(
    (m) => m.index < bodyStart || m.index > bodyEnd
  ).length;
  if (wrongArity.length > 0) {
    fail(`14. ${String(wrongArity.length)} of ${String(sites.length)} entry() call sites pass a different number of arguments than the ${String(params.length)} entry() declares`);
  } else if (resolvedRoot.length > 0) {
    fail(`14. ${String(resolvedRoot.length)} entry() call site(s) are handed the RESOLVED root; entry() must be handed the pair so it can compose under the caller's own`);
  } else if (sites.length < 15) {
    fail(`14. only ${String(sites.length)} entry() call sites were found and the tree had 15 at 30f4bd8d; a hand-built FsOpEntry is how the spelling splits again`);
  } else if (handmade > 0) {
    fail(`14. ${String(handmade)} FsOpEntry object(s) are composed by hand in file-ops.ts rather than through entry()`);
  } else {
    say(`14. all ${String(sites.length)} entry() call sites are handed the root pair, and nothing composes an FsOpEntry by hand`);
  }
}

/** Arguments at the top level of the call whose '(' is at `open`. */
function argumentCount(code, open) {
  let depth = 0;
  let count = 1;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return count;
    } else if (ch === ',' && depth === 1) count++;
  }
  return -1;
}

/**
 * RULE 15. Containment is unchanged. `resolveOpenProjectRoot` is still asked
 * once, `resolveInsideRoot` is still asked with `realRoot` first every time,
 * and `realRoot` is still what every guard is asked about.
 */
function assertContainmentUnchanged(ops) {
  const opens = [...ops.matchAll(/resolveOpenProjectRoot\(/g)].length;
  const roots = [...ops.matchAll(/await root\(input\.root\)/g)].length;
  const inside = [...ops.matchAll(/resolveInsideRoot\(\s*realRoot\b/g)].length;
  const insideAll = [...ops.matchAll(/\bresolveInsideRoot\(/g)].length;
  const gate = /resolveOpenProjectRoot\(\s*input\s*,\s*\(\)\s*=>\s*deps\.listProjectRoots\(\)\s*\)/.test(flat(ops));
  if (opens !== 1) {
    fail(`15. resolveOpenProjectRoot is called ${String(opens)} times in file-ops.ts; it was one at 30f4bd8d and the door does not multiply`);
  } else if (!gate) {
    fail('15. the one resolveOpenProjectRoot call is no longer resolveOpenProjectRoot(input, () => deps.listProjectRoots()); the gate call must be byte for byte the one that already shipped');
  } else if (roots !== 6) {
    fail(`15. 'await root(input.root)' appears ${String(roots)} times and it was 6 at 30f4bd8d; each verb resolves its root exactly once`);
  } else if (inside !== insideAll) {
    fail(`15. ${String(insideAll - inside)} of ${String(insideAll)} resolveInsideRoot calls are asked about something other than realRoot; the REAL root is what every guard is asked about`);
  } else {
    say(`15. containment is unchanged: one resolveOpenProjectRoot with its own arguments, six root resolutions, ${String(insideAll)} resolveInsideRoot calls all asked about realRoot`);
  }
}

/**
 * RULES 16, 17 AND 18. The path door's answer gains ONE optional additive
 * field and `path` keeps its value, so every `conformance:pathdoors` ruling
 * stays true. That gate owns the door's behaviour; this one owns the shape of
 * the addition, because an additive field that quietly replaced `path` would
 * pass there and break every ruling here.
 */
function assertPathDoorField() {
  const doors = codeOf('src/shared/path-doors.ts');
  if (doors === null) {
    fail('16. src/shared/path-doors.ts could not be read');
    return;
  }
  const at = doors.indexOf('export type PathDoorAnswer');
  if (at === -1) {
    fail('16. src/shared/path-doors.ts declares no PathDoorAnswer');
    return;
  }
  // The declaration ends at the first `;` OUTSIDE the braces. `{ door:
  // PathDoor; path: string }` holds one of its own, and slicing to it read half
  // the type and made the rule pass by seeing nothing.
  let depth = 0;
  let end = doors.length;
  for (let i = at; i < doors.length; i++) {
    const ch = doors[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (ch === ';' && depth === 0) {
      end = i;
      break;
    }
  }
  const decl = flat(doors.slice(at, end));
  const optional = [...decl.matchAll(/([A-Za-z_$][\w$]*)\?\s*:/g)].map((m) => m[1]);
  if (!/door:\s*PathDoor;\s*path:\s*string/.test(decl)) {
    fail(`16. PathDoorAnswer's accepting arm no longer reads { door: PathDoor; path: string ... }: ${decl.slice(0, 160)}`);
  } else if (optional.length !== 1) {
    fail(
      `16. PathDoorAnswer declares ${String(optional.length)} optional field(s) (${optional.join(', ') || 'none'}); ` +
        'rule 16 is ONE optional additive field carrying the answer re-spelled under the caller\'s literal base'
    );
  } else {
    const field = optional[0];
    const links = codeOf('src/renderer/terminal/path-links.ts');
    const door = codeOf('src/main/fs/path-door.ts');
    if (links === null || !links.includes(field)) {
      fail(`17. src/renderer/terminal/path-links.ts never reads ${field}, so the re-spelled answer is computed and thrown away`);
    } else if (door === null || !door.includes(field)) {
      fail(`17. src/main/fs/path-door.ts never sets ${field}, so the field is declared and never populated`);
    } else {
      say(`16/17. PathDoorAnswer gains one optional field (${field}), main populates it and the terminal opens it`);
    }
  }

  assertRelPathRefused();
}

/**
 * RULE 18. An absolute path never reaches a tab wearing `relPath`'s name.
 *
 * THE INTEGRATOR REWROTE THIS RULE, AND WHY IT HAD TO BE REWRITTEN IS THE
 * WHOLE ARGUMENT FOR ABLATING A GATE. Its first version asked whether the file
 * anywhere matched `/relPath\s*[:=]\s*(abs|absolute|full)/i`. That reads for a
 * VARIABLE NAME somebody might have used, and the defect never used one: at
 * `30f4bd8d` the shipped expression was
 *
 *   relPath: path.startsWith(`${repoPath}/`) ? path.slice(repoPath.length + 1) : path,
 *
 * whose miss arm is the parameter `path`, spelled `path`. The regex was
 * measured against the parent file and answered `false`, so rule 18 was GREEN
 * AT THE PARENT and asserted nothing at all. A rule that cannot be made to fail
 * is a rule that has stopped asking.
 *
 * It now asks the two things the repair actually is, both inside `openFileAt`'s
 * own body read by matching braces rather than over the whole file:
 *
 *  1. The miss is REFUSED BY NAME. The module declares a refusal word and
 *     `openFileAt` composes `relPath` from the answer that carries it, so the
 *     two reasons a prefix test misses — the file really is outside the
 *     project, and the file is inside it and the two strings merely spell the
 *     folder differently — stop being the same silent value.
 *  2. The miss arm is NOT the absolute path. The parent's own arithmetic on the
 *     `path` parameter is named and refused, because that is the shape measured
 *     failing, and the empty string is what this renderer already means by
 *     "this tab has no repo-relative path" (`use-editor-menu.ts:265` gates the
 *     History row on it, and `tab-menu.ts` leaves Copy Relative Path off).
 *
 * It does NOT assert that the open is refused. The phase settled that reading:
 * a Context detail tab on a global `~/.claude/CLAUDE.md` is a shipped
 * capability that `tab-io.ts:1367-1372` and `p268-auto-save-drive.ts:141` both
 * name, and refusal 0.3 forbids changing what a person sees. What is refused is
 * the relative SPELLING.
 */
function assertRelPathRefused() {
  const rel = 'src/renderer/context/open-detail.ts';
  const detail = codeOf(rel);
  if (detail === null) {
    fail(`18. ${rel} could not be read`);
    return;
  }
  const body = functionBodyOf(detail, 'openFileAt');
  if (body === null) {
    fail(`18. ${rel} declares no openFileAt(, so the one composer of relPath could not be read`);
    return;
  }
  const flatBody = flat(body);
  const expr = /relPath\s*:\s*([^,]+),/.exec(flatBody);
  if (expr === null) {
    fail('18. openFileAt no longer composes a relPath field, so the request carries whatever the caller passed');
    return;
  }
  const composed = expr[1].trim();
  // The refusal has to be a WORD the module declares, not a comment about one.
  const refusal = /'([a-z][a-z-]*)'/.exec(
    /(?:type|interface)[^=;]*Refusal[^=]*=\s*([^;]+);/.exec(detail)?.[1] ?? ''
  );
  const helper = /\b([A-Za-z_$][\w$]*)\s*\(\s*repoPath\s*,\s*path\s*\)/.exec(flatBody);
  // `path.slice(` and `path.startsWith(` ARE the parent commit, byte for byte.
  const parentShape = /\bpath\.(slice|startsWith)\s*\(/.test(composed) || composed === 'path';
  if (refusal === null) {
    fail(`18. ${rel} declares no refusal word, so a missed prefix test has no named reason and the two reasons it misses stay indistinguishable`);
  } else if (helper === null) {
    fail(`18. openFileAt composes relPath as ${composed} without asking one helper about (repoPath, path); the rule is one prefix test with one answer, stated once`);
  } else if (parentShape) {
    fail(
      `18. openFileAt still answers relPath: ${composed}. That is the parent commit: the miss arm is the ABSOLUTE path in a field ` +
        'documented as "Path relative to repoPath", which pasted an absolute path out of a row labelled Relative and offered the History row for a file git has never heard of'
    );
  } else if (!/''|""|`` /.test(`${composed} `)) {
    fail(`18. openFileAt answers relPath: ${composed}, which has no empty miss arm; '' is the value this renderer already means "no repo-relative path" by`);
  } else {
    say(
      `18. openFileAt asks ${String(helper[1])}(repoPath, path) and answers relPath: ${composed}, ` +
        `so a miss is refused by the word '${String(refusal[1])}' and never carried onto a tab as an absolute path`
    );
  }
}

// ===========================================================================
// RULE 23 — NEVER CASE-FOLD A COMPARISON, AND NEVER NORMALISE A PATH.
// ===========================================================================

/**
 * The domain, and it is DERIVED. Every `.ts` under these six directories that
 * is not a test. The floor is what stops the domain being shrunk to make the
 * gate green: adding a file can never turn this rule red, so a floor left
 * behind would let a file be moved out of the domain in silence.
 *
 * FLOOR taken at 30f4bd8d over the tree this phase started from. A deliberate
 * deletion lowers it in the same commit and names the file in the commit body.
 */
const FOLD_DOMAIN = [
  'src/main/fs',
  'src/main/manifest',
  'src/main/sessions',
  'src/main/watcher',
  'src/main/shell',
  'src/main/overview'
];
const FOLD_FLOOR = 100;

/**
 * THE NAMED EXCEPTIONS, each with the reason it is not a path comparison.
 *
 * Every one was read at 30f4bd8d. An occurrence that is not on this list is a
 * finding, and a list entry that matches nothing is a finding too — a table
 * that can rot is a table that stops meaning anything. The rule is about
 * comparing two PATHS; a display sort, a uuid key, an extension classifier and
 * a sentence are different questions, and saying so here is what keeps the
 * refusal precise instead of superstitious.
 */
const FOLD_EXCEPTIONS = [
  {
    file: 'src/main/fs/open-with.ts',
    holds: 'extname(absPath).toLowerCase()',
    why: 'a cache key for the EXTENSION handler map. It classifies a file; it never decides whether two paths are one file'
  },
  {
    file: 'src/main/fs/open-with.ts',
    holds: 'a.name.localeCompare(b.name',
    why: "the DISPLAY NAME of an application, sorted for a menu. Not a path, and not an identity"
  },
  {
    file: 'src/main/manifest/harvest/derived.ts',
    holds: 'parent.toLowerCase() !== own.toLowerCase()',
    why: "two conversation IDS from an agent's own log, which some providers spell in mixed case"
  },
  {
    file: 'src/main/manifest/harvest/derived.ts',
    holds: 'new Set<string>([start.toLowerCase()])',
    why: 'the cycle set for a walk over conversation ids, not paths'
  },
  {
    file: 'src/main/manifest/harvest/derived.ts',
    holds: 'visited.has(parent.toLowerCase())',
    why: 'the same cycle set, read'
  },
  {
    file: 'src/main/manifest/harvest/derived.ts',
    holds: 'visited.add(parent.toLowerCase())',
    why: 'the same cycle set, written'
  },
  {
    file: 'src/main/manifest/harvest/remote.ts',
    holds: 'FACT_NAMES[line.slice(0, cut).toLowerCase()]',
    why: "a FACT NAME from the frozen dir-list script's output, looked up in a table of names"
  },
  {
    file: 'src/main/sessions/codex-repair.ts',
    holds: 'const key = id.toLowerCase();',
    why: 'a codex rollout uuid, which codex writes in either case. Two caches, one shape'
  },
  {
    file: 'src/main/sessions/codex-repair.ts',
    holds: '!found.has(uuid.toLowerCase())',
    why: 'the same uuid index, read and written on one line'
  },
  {
    file: 'src/main/watcher/repo-watcher.ts',
    holds: 'isRescanRequired',
    why: 'an ERROR MESSAGE from the file event stream, matched case-insensitively because the wording is not ours'
  },
  {
    file: 'src/main/overview/fold/spawn.ts',
    holds: "(subtype ?? '').toLowerCase()",
    why: "an error SUBTYPE word from an agent's own JSON, matched against a table of words"
  },
  {
    file: 'src/main/overview/fold/validate.ts',
    holds: 'const a = text.replace',
    why: "the quote test over a model's sentence and its source. Prose, not a path"
  },
  {
    file: 'src/main/overview/fold/validate.ts',
    holds: 'const b = source.replace',
    why: 'the other half of the same quote test'
  },
  {
    file: 'src/main/overview/fold/validate.ts',
    holds: 'GIT_MARK_PHRASE_RE',
    why: 'a phrase a model might have written about a commit. Prose'
  },
  {
    file: 'src/main/overview/fold/validate.ts',
    holds: 'FILE_NAME_RE',
    why: "the refusal that stops a model's sentence NAMING a file. It classifies a sentence and never compares two paths, and it is deliberately case-insensitive because the sentence is the model's"
  },
  {
    file: 'src/main/overview/fold/validate.ts',
    holds: 'STATUS_WAIT_RE',
    why: 'a status sentence a model might have written. Prose'
  },
  {
    file: 'src/main/overview/fold/validate.ts',
    holds: 'STATUS_STATE_RE',
    why: 'the other status sentence. Prose'
  },
  {
    file: 'src/main/overview/reader/paths.ts',
    holds: 'const lower = token.toLowerCase();',
    why: 'hasPathExtension: does this token END in a known source extension. A classifier, and rule 12 is the identity question in the same file'
  },
  {
    file: 'src/main/overview/redact.ts',
    holds: "name: 'assignment', re:",
    why: 'the secret-shaped ASSIGNMENT redactor. It reads a key word, not a path'
  }
];

const FOLD_TOKENS = [/\btoLowerCase\s*\(/g, /\btoUpperCase\s*\(/g, /\blocaleCompare\s*\(/g];
const NORMALIZE_TOKEN = /\.normalize\s*\(/g;

/**
 * Every regular expression literal in `code` that carries the `i` flag.
 *
 * IT READS THE STRIPPED TEXT, and that is the whole trick. `stripComments`
 * blanks a regex literal's BODY character for character and leaves strings
 * alone, so in this text a regex is a `/`, a run of spaces and a `/`, while
 * `'/usr/bin'` still has its letters. A first version of this reader scanned
 * for `/…/[a-z]*` and found 45 "case-insensitive regexes" in the domain, of
 * which 43 were import paths and file names whose following letters happened to
 * contain an `i` — `'/usr/bin'`, `'../config'`. Requiring an all-blank body is
 * what tells a regex from a string, and it costs one predicate.
 *
 * `raw` is the same file unstripped, so the finding can quote what a person
 * actually wrote rather than a run of spaces.
 */
function caseInsensitiveRegexes(code, raw) {
  const found = [];
  for (const m of code.matchAll(/\/( +)\/([a-z]*)/g)) {
    if (!m[2].includes('i')) continue;
    const at = m.index;
    found.push({ at, text: raw.slice(at, at + m[0].length) });
  }
  return found;
}

function domainFiles() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(full);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts')) {
        out.push(relative(repoRoot, full));
      }
    }
  };
  for (const d of FOLD_DOMAIN) walk(join(repoRoot, d));
  return out.sort();
}

function assertNoFolding() {
  const files = domainFiles();
  if (files.length < FOLD_FLOOR) {
    fail(
      `23. the domain holds ${String(files.length)} files and the floor taken at 30f4bd8d is ${String(FOLD_FLOOR)}. ` +
        'A domain that can shrink is a rule that can be made green by moving a file out of it. Lower the floor in the same commit as a deliberate deletion and name the file.'
    );
  }
  const unmatched = new Set(FOLD_EXCEPTIONS.map((e, i) => i));
  const findings = [];
  for (const rel of files) {
    const code = codeOf(rel);
    if (code === null) continue;
    const occurrences = [];
    for (const token of FOLD_TOKENS) {
      for (const m of code.matchAll(token)) occurrences.push({ at: m.index, kind: 'fold' });
    }
    for (const hit of caseInsensitiveRegexes(code, rawOf(rel) ?? code)) {
      occurrences.push({ at: hit.at, kind: 'regex', text: hit.text });
    }
    for (const m of code.matchAll(NORMALIZE_TOKEN)) occurrences.push({ at: m.index, kind: 'normalize' });
    for (const o of occurrences) {
      const window = flat(code.slice(Math.max(0, o.at - 90), o.at + 90));
      const hit = FOLD_EXCEPTIONS.findIndex((e) => e.file === rel && window.includes(flat(e.holds)));
      if (hit === -1) {
        findings.push(
          `${rel}: ${o.kind === 'normalize' ? '.normalize(' : o.kind === 'regex' ? o.text : 'a case fold'} at ` +
            `"…${window.slice(Math.max(0, window.length / 2 - 60))}…" is not a named exception. ` +
            'NEVER CASE-FOLD A COMPARISON and NEVER normalize() a path: both corrupt what was recorded on another volume. Ask the filesystem.'
        );
      } else {
        unmatched.delete(hit);
      }
    }
    // The other half of rule 23: no BARE realpathSync(, which is Node's JS walk
    // and hands back the case it was given. `realpathSync.native(` does not
    // match this, and neither does an import.
    for (const _ of code.matchAll(/\brealpathSync\s*\(/g)) {
      if (rel === IDENTITY_REL) continue;
      findings.push(
        `${rel}: a bare realpathSync( call. It is Node's own JS walk: it lstats each component and rewrites only ` +
          'the ones that are symlinks, so it hands back the case it was given. The canonical answer is ' +
          `canonicalPathSync in ${IDENTITY_REL}.`
      );
    }
  }
  const stale = [...unmatched].map((i) => `${FOLD_EXCEPTIONS[i].file} :: ${FOLD_EXCEPTIONS[i].holds}`);
  if (stale.length > 0) {
    fail(`23. ${String(stale.length)} named exception(s) match nothing any more and would let a real one hide behind them: ${stale.join('; ')}`);
  }
  if (findings.length > 0) for (const line of findings) fail(`23. ${line}`);
  else {
    say(
      `23. ${String(files.length)} files in the domain (floor ${String(FOLD_FLOOR)}): 0 bare realpathSync(, 0 unexplained ` +
        `case folds, 0 .normalize( on a path, ${String(FOLD_EXCEPTIONS.length)} named exceptions all still real`
    );
  }
}

// ===========================================================================
// RULE 9, THE VOLUME BOUNDARY — driven only where a boundary exists, which is
// on the mounted image, with its own ablation beside it.
// ===========================================================================

/**
 * THE DEFECT THIS CLAUSE EXISTS FOR, measured by the Phase 274 fix round.
 *
 * A directory's NAME is an entry in its PARENT's directory, so flipping the
 * name asks the volume the PARENT is on. At a mount point the parent is a
 * different volume. On a real case-sensitive APFS image mounted under
 * `/private/tmp`, which folds, the shipped probe read:
 *
 *   a deep path on the image                separates   (correct)
 *   the mount point itself                  folds       (WRONG)
 *   an all-digit chain that climbs to it    folds       (WRONG)
 *
 * and the old per-device cache then handed that wrong answer to every later
 * question about that volume in the same process. The module's header called
 * the climb crossing a mount a declared limit; the climb was never the problem.
 *
 * WHY THIS ABLATION IS HERE AND NOT IN THE RULE 25 TABLE. Those ablations are
 * driven on the local base, and on this machine the boot volume has no device
 * boundary anywhere on it — `/`, `/System/Volumes/Data`, `/Users`, `/private`
 * and `/Volumes` all read dev 16777231, because an APFS firmlink shares the
 * device. A boundary reading can only be taken where a volume is mounted, so
 * the ablation runs here, inside the image's own block, and the image is still
 * detached by `withCaseSensitiveImage`'s `finally` whatever this does.
 */
function assertMountBoundary(base, mount, shipped) {
  const got = shipped.probes?.mountPoint;
  if (got !== 'unknown') {
    fail(
      `9. volumeFoldsCase(<mount point of the case-sensitive image>) read '${String(got)}'; the walk must stop ` +
        "at a volume boundary and answer 'unknown'. The mount point's own NAME lives in the PARENT volume's " +
        'directory, so flipping it asks the parent — and the parent folds case, so it answered folds for a ' +
        'volume that separates.'
    );
    return;
  }
  const dir = join(mainDir, `${ABLATION_PREFIX}boundary`);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, 'folder-identity.ts');
  cpSync(IDENTITY, target);
  const before = readFileSync(target, 'utf8');
  const find = "if (String(above.dev) !== String(here.dev)) return 'unknown';";
  const after = before.split(find).join('');
  if (after === before) {
    fail('9. the boundary ablation found no device comparison to remove in folder-identity.ts, so the clause proves nothing');
    return;
  }
  writeFileSync(target, after);
  const broken = runProbe({ base, noMachine: true, mount, modules: dir });
  if (broken.error !== undefined) {
    fail(`9. the boundary ablation stopped the probe running instead of moving a reading: ${String(broken.error)}`);
    return;
  }
  if (broken.probes?.mountPoint !== 'folds') {
    fail(
      `9. removing the device comparison left volumeFoldsCase(<mount point>) reading ` +
        `'${String(broken.probes?.mountPoint)}'; the guard cannot be the thing that makes it 'unknown', so the ` +
        'clause above is green for some other reason'
    );
    return;
  }
  say(
    "9. the walk stops at a volume boundary: the mount point of a case-sensitive image reads 'unknown', and " +
      "removing the one device comparison makes it read 'folds' — the parent volume's answer for a volume that separates"
  );
}

// ===========================================================================
// RULE 25 — one ablation per rule, red on the rule it owns.
// ===========================================================================

/**
 * THE COPIES LIVE ONE LEVEL UNDER `src/main/`, and the depth is exact, for the
 * same reason Phase 273's gate gives: a copy at another depth fails to IMPORT
 * rather than fail the rule it removed, and a probe red for the wrong reason
 * proves nothing. `folder-identity.ts` names node:fs and node:path only today,
 * but rule 10 is what keeps that true and an ablation must not depend on it.
 */
const ABLATION_PREFIX = `.p274-ablation-${process.pid.toString(36)}-`;
const mainDir = join(repoRoot, 'src/main');

function sweepAblations() {
  let entries = [];
  try {
    entries = readdirSync(mainDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith('.p274-ablation-')) rmSync(join(mainDir, name), { recursive: true, force: true });
  }
}

/**
 * Each ablation removes ONE clause of `folder-identity.ts` and declares the
 * readings it must move. `edits` are applied to a COPY; the shipped file is
 * never touched.
 */
const ABLATIONS = [
  {
    rule: 5,
    name: 'identity is decided by comparing the two strings rather than by asking the filesystem',
    owns: ['row:f01-case-both-real', 'row:f12-symlinked-ancestor', 'row:f14-firmlink'],
    edits: [
      {
        find: "return identityOf(left) === identityOf(right) ? 'same' : 'different';",
        to: "return a === b ? 'same' : 'different';"
      }
    ]
  },
  {
    rule: 5,
    name: 'the inode is dropped and only the device is compared, so every folder on one volume is one folder',
    owns: ['group:none'],
    edits: [{ find: 'return `${String(st.dev)}:${String(st.ino)}`;', to: 'return String(st.dev);' }]
  },
  {
    rule: 5,
    name: 'the byte-equality fast path is removed, so a path that does not exist stops being itself',
    owns: ['clause:equalMissing'],
    edits: [{ find: "if (a === b) return 'same';", to: '' }]
  },
  {
    rule: 7,
    name: "a stat that failed for ANY reason at all is read as a proven absence",
    owns: ['row:f21-unreadable'],
    edits: [{ find: "return code === 'ENOENT' || code === 'ENOTDIR';", to: 'return true;' }]
  },
  {
    rule: 7,
    name: 'an unreadable LEFT side answers different instead of asking the right side and then giving up',
    owns: ['row:f21-unreadable'],
    edits: [{ find: "return isProvenAbsent(err) ? 'different' : probeOther(b, statAt);", to: "return 'different';" }]
  },
  {
    rule: 9,
    name: 'the volume probe stops climbing, so a leaf that does not exist yet cannot be asked about',
    owns: ['probe:missingLeaf', 'probe:digitsOnly'],
    edits: [{ find: "if (!isProvenAbsent(err)) return 'unknown';", to: "return 'unknown';" }]
  },
  {
    rule: 11,
    name: "canonicalPathSync uses Node's own JS realpath, which does not restore case",
    // The FLIPPED spelling is the reading that moves. The disk spelling is
    // already canonical, so a realpath that does nothing hands it back
    // unchanged and looks correct — which is exactly how layer 3 hid.
    owns: ['canonical:ofFlippedSpelling'],
    edits: [{ find: 'realpathSync.native(path)', to: 'realpathSync(path)' }]
  },
  {
    rule: 21,
    name: 'duplicateFolderGroups keeps a group of one, so every path looks like a duplicate',
    owns: ['group:none', 'group:single'],
    edits: [{ find: '.filter((group) => group.length > 1)', to: '' }]
  },
  {
    rule: 21,
    name: 'a path that cannot be stat-ed is kept in a group under an invented identity',
    owns: ['group:removed'],
    edits: [
      {
        find: '    } catch {\n      continue;\n    }',
        to: '    } catch {\n      st = { dev: 0, ino: 0 };\n    }'
      }
    ]
  }
];

function runAblations(base) {
  const was = verdict(local);
  if (was[0] === 'error') {
    fail('25. the shipping module could not be driven, so no ablation could be compared against it');
    return { red: 0, total: ABLATIONS.length };
  }
  const index = new Map(READINGS.map(([kind, key], at) => [`${kind}:${key}`, at]));
  let red = 0;
  for (const [i, ablation] of ABLATIONS.entries()) {
    const dir = join(mainDir, `${ABLATION_PREFIX}${String(i)}`);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, 'folder-identity.ts');
    if (!existsSync(IDENTITY)) {
      fail(`25. there is no ${IDENTITY_REL} to ablate`);
      return { red: 0, total: ABLATIONS.length };
    }
    cpSync(IDENTITY, target);
    let applied = true;
    for (const edit of ablation.edits) {
      const before = readFileSync(target, 'utf8');
      const after = before.split(edit.find).join(edit.to);
      if (after === before) {
        fail(`25. the ablation "${ablation.name}" (rule ${String(ablation.rule)}) found nothing to edit in folder-identity.ts`);
        applied = false;
        break;
      }
      writeFileSync(target, after);
    }
    if (!applied) continue;
    const got = verdict(runProbe({ base, modules: dir }));
    if (got[0] === 'error') {
      // A PROBE THAT CANNOT RUN IS NOT AN ABLATION THAT WENT RED.
      fail(`25. the ablation "${ablation.name}" stopped the probe running instead of moving a reading, so it proves nothing`);
      continue;
    }
    const moved = READINGS.map(([kind, key], at) => (got[at] !== was[at] ? `${kind}:${key}` : null)).filter(Boolean);
    const stuck = ablation.owns.filter((key) => {
      const at = index.get(key);
      return at === undefined || got[at] === was[at];
    });
    if (stuck.length > 0) {
      fail(
        `25. the ablation "${ablation.name}" (rule ${String(ablation.rule)}) did not move ${stuck.join(', ')}, the reading(s) it is written for` +
          (moved.length > 0 ? ` (it moved ${moved.join(', ')} instead)` : ', and it moved nothing at all')
      );
      continue;
    }
    red += 1;
    if (DETAIL) say(`   ablation rule ${String(ablation.rule)} "${ablation.name}" -> ${moved.join(', ')}`);
  }
  say(`25. ${String(red)} of ${String(ABLATIONS.length)} ablations went red on the readings they own, one clause each`);
  return { red, total: ABLATIONS.length };
}

// ===========================================================================
// THE RUN. It is at the BOTTOM because every rule above it is a `const` or a
// `function`, and a `const` read from a `try` that ran first is a TDZ error
// rather than a finding. Running last is also the honest order: the fixture is
// built, both volumes are asked, the source is read and the ablations are
// driven, and only then is anything printed.
// ===========================================================================

try {
  if (SOURCE_ONLY) {
    assertIdentityDoor();
    assertAnswerSpelling();
    assertNoFolding();
    say('(P274_SOURCE_ONLY: the source rules only — no fixture, no image, no probe, no ablation)');
  } else {
  // ------------------------------------------------------------------- RULE 20
  // The §8 table on THIS volume, in the column `volumeFoldsCase` names.
  // ------------------------------------------------------------------------
  local = runProbe({ base: localBase });
  if (local.error !== undefined) {
    fail(`20. the shipping module could not be driven on ${localBase}: ${local.error}`);
  } else {
    assertTable('20', local, localBase);
  }

  // -------------------------------------------------------- RULE 20, VOLUME 2
  // A case-sensitive APFS image, mounted for exactly this block and detached
  // and deleted by the door's own `finally` whatever happens inside it.
  await withCaseSensitiveImage((mount, note, detachNow) => {
    if (mount === null) {
      sensitiveSkip = note;
      return;
    }
    const base = join(mount, 'work');
    mkdirSync(base, { recursive: true });
    onImage = join(base, 'f01', 'RealName');
    sensitive = runProbe({ base, noMachine: true, mount });
    if (sensitive.error !== undefined) {
      fail(`20. the shipping module could not be driven on the case-sensitive image: ${sensitive.error}`);
    } else {
      assertTable('20', sensitive, base);
      if (sensitive.volume !== 'separates') {
        fail(
          `20. the image at ${base} was created case-sensitive and volumeFoldsCase answered ` +
            `'${String(sensitive.volume)}', so either the probe is wrong or the image is not what it claims`
        );
      }
      // The two columns must actually DISAGREE somewhere, or the sensitive arm
      // proved nothing. Rows 1 and 4 are §8's own named pair.
      const f1 = sensitive.rows['f01-case-both-real'];
      const f4 = sensitive.rows['f04-nfc-made-nfd-asked'];
      if (f1 === 'different' && f4 === 'same') {
        say(
          '20. the two columns disagree where §8 says they must: on the case-sensitive image ' +
            'RealName vs realname reads different and NFC vs NFD reads same, from one volume in one run'
        );
      } else {
        fail(
          `20. on the case-sensitive image row 1 read '${String(f1)}' and row 4 read '${String(f4)}'; ` +
            'the pair that proves case folding and normalisation folding are independent did not read different/same'
        );
      }
      assertMountBoundary(base, mount, sensitive);
    }

    // --------------------------------------------------------------- ROW 20/§8
    // A stored row on an UNMOUNTED volume. It can only be asked once the volume
    // has gone, which is the one reason the door hands the body a `detachNow`.
    detachNow();
    const after = runProbe({ base: localBase, unmounted: onImage });
    const got = after.error !== undefined ? `error:${after.error}` : after.rows[UNMOUNTED_ROW.id];
    if (got === UNMOUNTED_ROW.expect) {
      say(`20. ${UNMOUNTED_ROW.title}: ${got}, unchanged and stated as the accepted limit`);
    } else {
      fail(`20. ${UNMOUNTED_ROW.title}: expected ${UNMOUNTED_ROW.expect}, read ${String(got)}`);
    }
  });

  if (sensitiveSkip !== null) {
    const line =
      `20. THE CASE-SENSITIVE COLUMN IS NOT COVERED IN THIS RUN — ${sensitiveSkip}. ` +
      'Not covered: that RealName and realname are two different folders where the volume separates them, ' +
      'that a separating volume still folds NFC against NFD, and that volumeFoldsCase can answer separates at all.';
    if (REQUIRE_IMAGE) fail(line);
    else notes.push(line);
  }

  assertClauses(local);
  assertGroups(local);
  assertCanonical(local);
  assertOverview(local);

  // ------------------------------------------------------- RULES 1 TO 19
  assertIdentityDoor();
  assertAnswerSpelling();
  assertNoFolding();

  // ------------------------------------------------------- RULE 25
  ({ red: ablationsRed, total: ablationsTotal } = runAblations(localBase));
  }
} finally {
  relaxFixturePermissions(localBase);
  rmSync(localBase, { recursive: true, force: true });
  sweepAblations();
}

for (const note of notes) say(note);
if (failures.length > 0) {
  for (const f of failures) process.stderr.write(`${f}\n`);
  process.stderr.write(`${TAG} FAILED: ${String(failures.length)} finding(s).\n`);
  process.exit(1);
}
say(
  SOURCE_ONLY
    ? 'OK: every source rule passed (P274_SOURCE_ONLY, so nothing was driven).'
    : `OK: §8 on ${sensitive === null ? 'one volume' : 'both kinds of volume'}, ` +
      `${String(ablationsRed)} of ${String(ablationsTotal)} ablations red, every rule passed.`
);
process.exit(0);
