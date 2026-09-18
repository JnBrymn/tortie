#!/usr/bin/env node
/**
 * probe-p288.mjs. THE PHASE 288 APP RUN: the meters keep the foot of an empty
 * session list.
 *
 * ONE Electron on a scratch profile, a scratch HOME and the tmux socket
 * build/harness-socket.mjs hands it, over one git project it builds inside its
 * own scratch directory. It opens the project with NO session, which is the
 * state the operator photographed, puts the sessions on the right, turns the
 * usage meters on through the settings door, and reads RECTANGLES over the
 * DevTools protocol. It takes no photograph and judges no pixel: every reading
 * is a `getBoundingClientRect` printed as a number, so a run at the parent and
 * a run at HEAD are two columns of the same table.
 *
 * ## The meters draw from a FILE, and the probe refuses to run without it
 *
 * The launch carries `GMUX_USAGE_FIXTURE` exactly as build/probe-p202-logins.mjs
 * does: src/main/harness/usage-fixture.ts accepts the knob under `GMUX_PROBES=1`
 * when the profile sits under `GMUX_HARNESS_DIR`, replaces the usage transport
 * with the file and refuses the keychain outright. The fixture is keyed by the
 * bearer the credential reader finds, so this file writes one SYNTHETIC
 * credential per vendor into a directory of its own (`CLAUDE_CONFIG_DIR` and
 * `CODEX_HOME` point there, and `HOME` is scratch besides), each carrying a
 * sentinel word that is not a token of anybody's. The fixture answers both
 * with numbers, so each row draws a bar, which is the row in the photograph.
 * The probe waits for main to say `usage fixture installed` and REFUSES to
 * turn a meter on until it has, because a meter armed before that line would
 * ask the person's own keychain. No request leaves the machine.
 *
 * Which branch of src/renderer/app/UsageMeter.tsx draws: the rail's `mini`
 * branch (one `.usage-mini-row` per provider whose state is not `off`, a bar
 * with numbers or a `sev-none` bar without) and the expanded list's `full`
 * branch (one `.usage-row` per provider). Both draw a row for ANY state but
 * `off`, so a fixture is not needed for a row to exist; it is needed so the
 * row is the numbered one a person sees and so the keychain is refused.
 *
 * ## The arms, each one able to run alone (P288_ARMS)
 *
 *   a  the rail (dock collapsed to 48px), no session, both providers on:
 *      gap = rail-footer.top - usage-mini.bottom, want 0 within 1px; and
 *      rail-footer.bottom = dock.bottom. At the parent the gap is about half
 *      the rail's free height, because two `margin-top: auto` items share it
 *   b  the expanded list, no session, both providers on: dock.bottom -
 *      usage-full.bottom, want 0 within 1px and EQUAL to the same reading with
 *      one session (arm e); .dock-stub's top directly under the band
 *   c  both densities, both providers OFF: no .usage-meter drawn and the
 *      footer at the dock's foot
 *   d  one provider on (claude only): a and b hold with one row
 *   e  one shell session created through the harness drive: every rectangle
 *      of .usage-mini, .usage-full, .rail-footer, .rail-list, .dock-list, the
 *      band and the dock, printed in both densities and written to the
 *      readings file, so a run at the parent and at HEAD can be compared. With
 *      `P288_COMPARE=<the other run's readings json>` the comparison is made
 *      here and a rectangle that moved is a finding. The foot readings of a
 *      and b are graded again here, which both builds pass: that is the
 *      populated case the phase must not move
 *   f  the window at the rail's width floor (PROJECT_RAIL_MIN_WINDOW_W) with
 *      the dock collapsed, then the expanded list at its DOCK_MIN floor,
 *      reached by putting the keyboard on the dock's own resizer and pressing
 *      Home: a and b still hold
 *   g  NOT DRIVEN, and said so in the report rather than passed. Focus mode
 *      cannot be entered with no session: `focusRefusal()` in
 *      src/renderer/app/focus-flight.ts answers NOTHING_TO_FOCUS when no
 *      surface is drawn, and the chord is routed by where the keyboard is
 *      (src/renderer/app/fill-chord.ts), which with no session is nowhere. So
 *      there is no cheap way to enter and leave the mode around a, and with a
 *      session the mode hides the dock, so no meter geometry exists inside it
 *
 * ## The parent
 *
 * `P288_PARENT_CHECKOUT=<a BUILT worktree at the parent commit>` points THIS
 * run at that checkout's `out/` (its cwd and its build), one Electron, never
 * beside a HEAD run: the two are two invocations. The parent is expected to
 * FAIL a and b with the numbers printed, and the report says so in as many
 * words. The exit code is the same rule either way: 0 with no finding, 1 with
 * findings, 2 on a refusal.
 *
 * ## What it refuses
 *
 *   - No `GMUX_TMUX_SOCKET`: it does not guess one, it says how to run it.
 *   - The socket `gmux` and the socket `default`, by name.
 *   - No `GMUX_HARNESS_DIR`, because the fixture is refused without it.
 *   - `out/main/index.js` missing in the checkout it is pointed at.
 *   - A STALE `out/` in that checkout: any of the five sources the geometry
 *     here depends on (the two sheets, app.css, SessionDock.tsx and
 *     UsageMeter.tsx) newer than the newest bundle vite wrote under
 *     out/renderer/assets. "out/ is older than the stylesheets; build first",
 *     exit 2, before anything is launched. The fix round added this: the
 *     script deliberately carries no `npm run build &&`, and a missing-file
 *     check says nothing about a build that is merely old, which reports on
 *     rules nobody is looking at.
 *   - A launch whose main never says the fixture is installed.
 *   - Any byte outside `GMUX_HARNESS_DIR` and the readings directory.
 *
 * ## Environment
 *
 *   GMUX_TMUX_SOCKET       The scratch socket. build/harness-socket.mjs sets it.
 *   GMUX_HARNESS_DIR       The scratch directory. Set by the same wrapper.
 *   P288_PARENT_CHECKOUT   A BUILT worktree at the parent commit. Optional.
 *   P288_ARMS              A comma separated subset of a,b,c,d,e,f. All by
 *                          default. Arms put the app in the state they need
 *                          themselves, so any subset runs.
 *   P288_COMPARE           A readings json from the other build, for arm e.
 *   P288_OUT_DIR           Where the readings file goes. Default `out/p288`.
 *                          `out/` is gitignored and electron-builder packs
 *                          `out/**`, so remove the directory before a package.
 *
 * ## Usage, from the worktree root. BUILD FIRST.
 *
 *   npm run build && npm run probe:p288                    HEAD, all arms
 *   P288_PARENT_CHECKOUT=/path/to/parent npm run -s probe:p288
 *                                                          the parent, built
 *   P288_ARMS=a,b npm run -s probe:p288                    two arms
 *   node build/p288/probe-p288.mjs --self-test             graders alone,
 *                                                          launches nothing
 *
 * The script does not build for you, on purpose: a verifier re-running it
 * over a build it has just made should not wait 33 s for a second one. It
 * measures `out/`, so `out/` must be newer than the sources, and a stale one
 * is refused rather than measured.
 *
 * ## SAFETY
 *
 * The one Electron is started through build/electron-run.mjs's `withElectron`,
 * which ends the tree it started in a `finally` block whatever happened, and
 * ends the scratch tmux server it was handed in that same block. Every other
 * process this script starts is a synchronous `git` that has exited before the
 * call returns. It spawns no agent, spends no token, runs no `security`, and
 * prints no bearer, synthetic or otherwise.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withElectron, withoutDevRenderer } from '../electron-run.mjs';
import { cdpEval, wsConnect } from '../cdp-client.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p288]';
const t0 = Date.now();
const say = (l) => console.log(`${TAG} ${((Date.now() - t0) / 1000).toFixed(1)}s ${l}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (v) => JSON.stringify(v);

// ---------------------------------------------------------------------------
// The numbers this run holds the rendering against.
//
// BY VALUE, and on purpose: a build script cannot import TypeScript, and a
// probe that read the constants out of chrome-geometry.ts would agree with a
// wrong one. DOCK_MIN is `src/renderer/state/chrome-geometry.ts:131`, and
// PROJECT_RAIL_MIN_WINDOW_W is that file's derivation at its line 239,
// 48 + 200 + 220 + 320 + 240 + 16, being the activity bar, the project rail,
// the sidebar's floor, the dock's ceiling, the terminal's floor and both
// gutters of the work's frame. `chrome-geometry.test.ts` holds the CSS and the
// constants to one number; this file holds the PAINTED WINDOW to the same one,
// and arm f reads DOCK_MIN back off the dock the moment Home is pressed.
// ---------------------------------------------------------------------------
const DOCK_MIN = 160;
const DOCK_RAIL_W = 48;
const PROJECT_RAIL_MIN_WINDOW_W = 1044;
/** A rectangle edge is judged within this many CSS px. */
const TOL = 1;
const ALL_ARMS = ['a', 'b', 'c', 'd', 'e', 'f'];
const ARMS = [...ALL_ARMS, 'g', 'RUN'];

// ---------------------------------------------------------------------------
// The graders. Pure, exported, and proved both ways under --self-test.
// ---------------------------------------------------------------------------
const near = (a, b, tol = TOL) =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
const r2 = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

/**
 * The rail's spare height with no list: the dock less the band, the meter and
 * the footer. Flexbox hands it to the auto margins in the column, and how it
 * is shared is the whole phase.
 */
export function railFree(r) {
  if (!r.dock || !r.toolbar || !r.footer) return null;
  return r.dock.height - r.toolbar.height - (r.mini ? r.mini.height : 0) - r.footer.height;
}

/**
 * Arm a. `r` is one reading of the collapsed rail with no session and the
 * meters on. The gap is read as a number and printed by the caller; here it
 * must be 0.
 */
export function railFindings(state, r, wantRows) {
  if (!r.dock) return [`${state} no session list is drawn`];
  if (!r.collapsed) return [`${state} the session list is not collapsed to its rail`];
  const out = [];
  if (r.railList) out.push(`${state} a .rail-list is drawn, so this is not the empty state`);
  if (!r.footer) out.push(`${state} no .rail-footer is drawn`);
  if (!r.mini) out.push(`${state} no .usage-mini is drawn with the meters on`);
  if (r.mini && r.miniRows !== wantRows) {
    out.push(`${state} the rail meter draws ${String(r.miniRows)} row(s), want ${String(wantRows)}`);
  }
  if (!r.footer || !r.mini) return out;
  const gap = r.footer.top - r.mini.bottom;
  const free = railFree(r);
  if (!near(gap, 0)) {
    const share = free !== null && free > 0 ? ` (${String(Math.round((gap / free) * 100))}% of the ${String(r2(free))}px free height)` : '';
    out.push(`${state} the meter floats: ${String(r2(gap))}px between usage-mini and rail-footer, want 0${share}`);
  }
  if (!near(r.footer.bottom, r.dock.bottom)) {
    out.push(`${state} rail-footer ends ${String(r2(r.dock.bottom - r.footer.bottom))}px above the dock's foot, want 0`);
  }
  if (r.dock.width !== DOCK_RAIL_W) out.push(`${state} the rail is ${String(r2(r.dock.width))}px wide, want ${String(DOCK_RAIL_W)}`);
  return out;
}

/**
 * Arm b. `r` is one reading of the expanded list with no session and the
 * meters on. `populatedFoot`, when the caller has it, is the same reading
 * taken with one session, and the two must agree.
 */
export function expandedFindings(state, r, wantRows, populatedFoot = null) {
  if (!r.dock) return [`${state} no session list is drawn`];
  if (r.collapsed) return [`${state} the session list is collapsed, not expanded`];
  const out = [];
  if (r.dockList) out.push(`${state} a .dock-list is drawn, so this is not the empty state`);
  if (!r.stub) out.push(`${state} no .dock-stub ("No sessions yet") is drawn`);
  if (!r.toolbar) out.push(`${state} no .dock-toolbar band is drawn`);
  if (!r.full) out.push(`${state} no .usage-full is drawn with the meters on`);
  if (r.full && r.fullRows !== wantRows) {
    out.push(`${state} the list meter draws ${String(r.fullRows)} row(s), want ${String(wantRows)}`);
  }
  if (!r.full || !r.stub || !r.toolbar) return out;
  const foot = r.dock.bottom - r.full.bottom;
  if (!near(foot, 0)) {
    const under = near(r.full.top, r.stub.bottom) ? ', directly under the stub' : '';
    out.push(`${state} the meter is not at the foot: usage-full ends ${String(r2(foot))}px above the dock's bottom, want 0${under}`);
  }
  if (populatedFoot !== null && !near(foot, populatedFoot, 0.5)) {
    out.push(`${state} the foot reading with no session is ${String(r2(foot))}px and with one session ${String(r2(populatedFoot))}px, want the same`);
  }
  if (!near(r.stub.top, r.toolbar.bottom)) {
    out.push(`${state} the stub starts ${String(r2(r.stub.top - r.toolbar.bottom))}px under the band, want 0`);
  }
  return out;
}

/** Arm c. Both providers off: no meter at all, and the footer at the foot. */
export function offFindings(state, r) {
  if (!r.dock) return [`${state} no session list is drawn`];
  const out = [];
  if (r.meters !== 0) out.push(`${state} ${String(r.meters)} .usage-meter drawn with both providers off, want 0`);
  if (r.collapsed) {
    if (!r.footer) out.push(`${state} no .rail-footer is drawn`);
    else if (!near(r.footer.bottom, r.dock.bottom)) {
      out.push(`${state} rail-footer ends ${String(r2(r.dock.bottom - r.footer.bottom))}px above the dock's foot, want 0`);
    }
  } else if (r.stub && r.toolbar && !near(r.stub.top, r.toolbar.bottom)) {
    out.push(`${state} the stub starts ${String(r2(r.stub.top - r.toolbar.bottom))}px under the band, want 0`);
  }
  return out;
}

/**
 * Arm e. One session, both densities. The list is what takes the space now,
 * so the meter sits on the footer at both builds; this is the reading the
 * phase must not move, and the cross-build byte comparison is `rectDiffs`.
 */
export function populatedFindings(state, r, wantRows) {
  if (!r.dock) return [`${state} no session list is drawn`];
  const out = [];
  if (r.collapsed) {
    if (!r.railList) out.push(`${state} no .rail-list is drawn with one session`);
    if (r.railItems !== 1) out.push(`${state} ${String(r.railItems)} rail item(s), want 1`);
    if (!r.mini || !r.footer) return [...out, `${state} the rail meter or the footer is not drawn`];
    if (r.miniRows !== wantRows) out.push(`${state} the rail meter draws ${String(r.miniRows)} row(s), want ${String(wantRows)}`);
    if (!near(r.footer.top - r.mini.bottom, 0)) out.push(`${state} ${String(r2(r.footer.top - r.mini.bottom))}px between usage-mini and rail-footer with one session, want 0`);
    if (!near(r.footer.bottom, r.dock.bottom)) out.push(`${state} rail-footer ends ${String(r2(r.dock.bottom - r.footer.bottom))}px above the dock's foot, want 0`);
    if (r.railList && !near(r.mini.top, r.railList.bottom)) out.push(`${state} ${String(r2(r.mini.top - r.railList.bottom))}px between the list and the meter, want 0`);
  } else {
    if (!r.dockList) out.push(`${state} no .dock-list is drawn with one session`);
    if (r.dockRows !== 1) out.push(`${state} ${String(r.dockRows)} list row(s), want 1`);
    if (!r.full) return [...out, `${state} no .usage-full is drawn`];
    if (r.fullRows !== wantRows) out.push(`${state} the list meter draws ${String(r.fullRows)} row(s), want ${String(wantRows)}`);
    if (!near(r.dock.bottom - r.full.bottom, 0)) out.push(`${state} usage-full ends ${String(r2(r.dock.bottom - r.full.bottom))}px above the dock's foot with one session, want 0`);
    if (r.dockList && !near(r.full.top, r.dockList.bottom)) out.push(`${state} ${String(r2(r.full.top - r.dockList.bottom))}px between the list and the meter, want 0`);
  }
  return out;
}

/** The rectangles arm e prints and compares, in a fixed order. */
export const RECT_KEYS = ['dock', 'toolbar', 'mini', 'full', 'footer', 'railList', 'dockList', 'stub'];
const EDGE_KEYS = ['left', 'top', 'right', 'bottom', 'width', 'height'];

/**
 * Arm e across builds. Every rectangle of the populated case at one build
 * against the other's, byte for byte on each edge. `mine` and `theirs` are
 * `{ collapsed: reading, expanded: reading }`.
 */
export function rectDiffs(mine, theirs) {
  const out = [];
  for (const density of ['collapsed', 'expanded']) {
    const a = mine?.[density];
    const b = theirs?.[density];
    if (!a || !b) {
      out.push(`e ${density}: the other run has no ${density} reading to compare`);
      continue;
    }
    for (const key of RECT_KEYS) {
      const x = a[key] ?? null;
      const y = b[key] ?? null;
      if (x === null && y === null) continue;
      if (x === null || y === null) {
        out.push(`e ${density} ${key}: drawn in one build and not the other`);
        continue;
      }
      for (const edge of EDGE_KEYS) {
        if (x[edge] !== y[edge]) out.push(`e ${density} ${key}.${edge}: ${String(x[edge])} here, ${String(y[edge])} in the other run`);
      }
    }
  }
  return out;
}

/**
 * The sources the geometry this probe reads is made of. A change to any of
 * them that `out/` has not seen makes every rectangle below a reading of the
 * previous build.
 */
export const GEOMETRY_SOURCES = [
  'src/renderer/app/session-rail.css',
  'src/renderer/app/usage-meter.css',
  'src/renderer/styles/app.css',
  'src/renderer/app/SessionDock.tsx',
  'src/renderer/app/UsageMeter.tsx'
];

/**
 * The staleness grader. `sources` is `[path, mtimeMs]` per geometry source and
 * `bundle` is `[path, mtimeMs]` of the newest bundle vite wrote, or null when
 * out/renderer/assets holds none. Answers the refusal sentence, or null when
 * the build is at least as new as everything it was built from. A `touch`
 * with no byte change is stale too, and a build is the answer to that as well.
 */
export function staleSentence(sources, bundle) {
  if (bundle === null) return 'out/renderer/assets holds no index-*.css or index-*.js; build first.';
  const newer = sources
    .filter(([, mtime]) => mtime > bundle[1])
    .map(([path, mtime]) => `${path} is ${((mtime - bundle[1]) / 1000).toFixed(1)} s newer than ${bundle[0]}`);
  if (newer.length === 0) return null;
  return `out/ is older than the stylesheets; build first (${newer.join('; ')}).`;
}

/** The mtimes the grader is asked about, read from one checkout. */
function readStaleness(checkoutDir) {
  const sources = GEOMETRY_SOURCES.map((rel) => {
    const path = join(checkoutDir, rel);
    return [rel, existsSync(path) ? statSync(path).mtimeMs : 0];
  });
  const assets = join(checkoutDir, 'out', 'renderer', 'assets');
  let bundle = null;
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      if (!/^index-[^.]+\.(?:css|js)$/.test(name)) continue;
      const mtime = statSync(join(assets, name)).mtimeMs;
      if (bundle === null || mtime > bundle[1]) bundle = [join('out', 'renderer', 'assets', name), mtime];
    }
  }
  return staleSentence(sources, bundle);
}

/** The P288_ARMS subset, or every arm; an unknown name is a refusal. */
export function chooseArms(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { arms: [...ALL_ARMS], bad: [] };
  const names = text.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '');
  const bad = names.filter((n) => !ALL_ARMS.includes(n));
  return { arms: ALL_ARMS.filter((a) => names.includes(a)), bad };
}

// ---------------------------------------------------------------------------
// --self-test. Every grader on a HEAD shaped fixture and a parent shaped one.
// The numbers are a 900px viewport with a 38px titlebar: the dock runs from
// y 38 to 900, the band is 36px, the mini meter 2 rows is 44px, the footer
// 36px, the stub 30px and the full meter 68px.
// ---------------------------------------------------------------------------
function selfTest() {
  const box = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  const dockC = box(1392, 38, 1440, 900);
  const dockE = box(1240, 38, 1440, 900);
  const bandC = box(1392, 38, 1440, 74);
  const bandE = box(1240, 38, 1440, 74);
  const footer = (top) => box(1392, top, 1440, top + 36);
  const mini = (top) => box(1392, top, 1440, top + 44);
  const full = (top) => box(1252, top, 1428, top + 68);
  const base = { viewport: { width: 1440, height: 900 }, meters: 1, miniRows: 2, fullRows: 2, railItems: 0, dockRows: 0, railList: null, dockList: null, stub: null, mini: null, full: null };
  // HEAD's rail: the meter on the footer, the footer at the foot.
  const railHead = { ...base, collapsed: true, dock: dockC, toolbar: bandC, mini: mini(820), footer: footer(864) };
  // The parent's rail: free = 862 - 36 - 44 - 36 = 746, shared 373 and 373.
  const railParent = { ...base, collapsed: true, dock: dockC, toolbar: bandC, mini: mini(447), footer: footer(864) };
  const stub = box(1240, 74, 1440, 104);
  const expHead = { ...base, collapsed: false, dock: dockE, toolbar: bandE, stub, full: full(832) };
  const expParent = { ...base, collapsed: false, dock: dockE, toolbar: bandE, stub, full: full(104) };
  const offC = { ...base, collapsed: true, meters: 0, miniRows: 0, fullRows: 0, dock: dockC, toolbar: bandC, footer: footer(864) };
  const offE = { ...base, collapsed: false, meters: 0, miniRows: 0, fullRows: 0, dock: dockE, toolbar: bandE, stub };
  const popC = { ...base, collapsed: true, dock: dockC, toolbar: bandC, railList: box(1392, 74, 1440, 820), railItems: 1, mini: mini(820), footer: footer(864) };
  const popE = { ...base, collapsed: false, dock: dockE, toolbar: bandE, dockList: box(1240, 74, 1440, 832), dockRows: 1, full: full(832) };
  const count = (l) => l.length;
  const fixtures = [
    ['a HEAD: the meter sits on the footer, no findings', () => railFindings('a', railHead, 2), []],
    ['a the parent: the gap is half the free height, named as a share', () => railFindings('a', railParent, 2), ['a the meter floats: 373px between usage-mini and rail-footer, want 0 (50% of the 746px free height)']],
    ['a the free height is the dock less band, meter and footer', () => railFree(railParent), 746],
    ['a a gap of 1px is within tolerance and 2px is not', () => [count(railFindings('a', { ...railHead, mini: mini(819) }, 2)), count(railFindings('a', { ...railHead, mini: mini(818) }, 2))], [0, 1]],
    ['a a footer off the foot is caught', () => count(railFindings('a', { ...railHead, mini: mini(800), footer: footer(844) }, 2)), 1],
    ['a one row when two are wanted is caught', () => count(railFindings('a', { ...railHead, miniRows: 1 }, 2)), 1],
    ['a a list drawn is not the empty state', () => count(railFindings('a', { ...railHead, railList: box(1392, 74, 1440, 820) }, 2)), 1],
    ['a no meter drawn is a finding, not a pass', () => count(railFindings('a', { ...railHead, mini: null }, 2)), 1],
    ['a an expanded list is refused by the rail grader', () => count(railFindings('a', { ...railHead, collapsed: false }, 2)), 1],
    ['b HEAD: the meter at the foot, the stub under the band', () => expandedFindings('b', expHead, 2), []],
    ['b the parent: the meter directly under the stub, 728px up', () => expandedFindings('b', expParent, 2), ['b the meter is not at the foot: usage-full ends 728px above the dock\'s bottom, want 0, directly under the stub']],
    ['b HEAD agrees with the populated foot', () => expandedFindings('b', expHead, 2, 0), []],
    ['b a foot that differs from the populated one is caught', () => count(expandedFindings('b', expHead, 2, 4)), 1],
    ['b a stub not under the band is caught', () => count(expandedFindings('b', { ...expHead, stub: box(1240, 80, 1440, 110) }, 2)), 1],
    ['b a list drawn is not the empty state', () => count(expandedFindings('b', { ...expHead, dockList: box(1240, 74, 1440, 832) }, 2)), 1],
    ['b no meter drawn is a finding, not a pass', () => count(expandedFindings('b', { ...expHead, full: null }, 2)), 1],
    ['b a collapsed rail is refused by the list grader', () => count(expandedFindings('b', { ...expHead, collapsed: true }, 2)), 1],
    ['c both off, rail: no findings', () => offFindings('c', offC), []],
    ['c both off, list: no findings', () => offFindings('c', offE), []],
    ['c a meter drawn with both off is caught', () => count(offFindings('c', { ...offC, meters: 1 })), 1],
    ['c the footer off the foot with no meter is caught', () => count(offFindings('c', { ...offC, footer: footer(844) })), 1],
    ['d one provider: one row passes and two is caught', () => [count(railFindings('d', { ...railHead, miniRows: 1 }, 1)), count(railFindings('d', railHead, 1))], [0, 1]],
    ['e the populated rail passes', () => populatedFindings('e', popC, 2), []],
    ['e the populated list passes', () => populatedFindings('e', popE, 2), []],
    ['e a populated rail with no list is caught', () => count(populatedFindings('e', { ...popC, railList: null, railItems: 0 }, 2)), 2],
    ['e a populated list whose meter left the foot is caught', () => count(populatedFindings('e', { ...popE, full: full(800) }, 2)), 2],
    ['e two identical runs differ nowhere', () => rectDiffs({ collapsed: popC, expanded: popE }, { collapsed: popC, expanded: popE }), []],
    ['e a rectangle that moved by a pixel is named with both numbers', () => rectDiffs({ collapsed: popC, expanded: popE }, { collapsed: popC, expanded: { ...popE, full: full(831) } }), ['e expanded full.top: 832 here, 831 in the other run', 'e expanded full.bottom: 900 here, 899 in the other run']],
    ['e a rectangle drawn in one build only is named', () => count(rectDiffs({ collapsed: popC, expanded: popE }, { collapsed: { ...popC, railList: null }, expanded: popE })), 1],
    ['e a missing other reading is a finding, not a pass', () => count(rectDiffs({ collapsed: popC, expanded: popE }, {})), 2],
    ['the arms: empty means all', () => chooseArms(''), { arms: ALL_ARMS, bad: [] }],
    ['the arms: a subset keeps the file\'s order', () => chooseArms('b, a'), { arms: ['a', 'b'], bad: [] }],
    ['the arms: an unknown name is named', () => chooseArms('a,z'), { arms: ['a'], bad: ['z'] }],
    // The staleness grader: a build newer than every source is measured, a
    // source newer than the build is refused and NAMED, and no bundle at all
    // is a refusal rather than a pass.
    ['stale: a build newer than every source is not stale', () => staleSentence([['a.css', 1000], ['b.tsx', 2000]], ['out/renderer/assets/index-x.css', 2000]), null],
    ['stale: a source newer than the build is refused and named', () => staleSentence([['a.css', 3500], ['b.tsx', 2000]], ['out/renderer/assets/index-x.css', 2000]), 'out/ is older than the stylesheets; build first (a.css is 1.5 s newer than out/renderer/assets/index-x.css).'],
    ['stale: no bundle at all is a refusal, not a pass', () => staleSentence([['a.css', 1000]], null), 'out/renderer/assets holds no index-*.css or index-*.js; build first.']
  ];
  let ok = true;
  for (const [label, run, want] of fixtures) {
    let got;
    try {
      got = run();
    } catch (err) {
      got = `THREW ${err instanceof Error ? err.message : String(err)}`;
    }
    const good = J(got) === J(want);
    ok = ok && good;
    say(`${good ? 'ok  ' : 'BAD '} ${label}: ${J(got)} want ${J(want)}`);
  }
  say(ok ? `self-test PASS: ${String(fixtures.length)} fixtures behaved` : 'self-test FAIL');
  return ok;
}
if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

// ---------------------------------------------------------------------------
// The refusals, in the order they are asked.
// ---------------------------------------------------------------------------
const refuse = (why) => {
  console.error(`${TAG} REFUSED. ${why}`);
  process.exit(2);
};
const socket = (process.env['GMUX_TMUX_SOCKET'] ?? '').trim();
if (socket === '') refuse('no GMUX_TMUX_SOCKET. Run `npm run probe:p288`, which wraps this file in build/harness-socket.mjs.');
if (socket === 'gmux' || socket === 'default') refuse(`"${socket}" is not a harness socket.`);
const harnessDir = (process.env['GMUX_HARNESS_DIR'] ?? '').trim();
if (harnessDir === '') refuse('no GMUX_HARNESS_DIR, and the usage fixture is refused without one.');
const parentCheckout = (process.env['P288_PARENT_CHECKOUT'] ?? '').trim();
const checkout = parentCheckout !== '' ? resolve(parentCheckout) : REPO;
const tag = parentCheckout !== '' ? 'parent' : 'head';
if (!existsSync(join(checkout, 'out', 'main', 'index.js'))) {
  refuse(`${join(checkout, 'out', 'main', 'index.js')} is missing. Build that checkout first.`);
}
// THE BUILD IS THE THING MEASURED. The line above refuses a build that is
// absent and says nothing about one that is merely old, and this script
// carries no `npm run build &&` on purpose, so a stale out/ would be measured
// in silence and report on the previous stylesheet. Read in the checkout being
// measured, HEAD's or the parent's, before anything is launched.
{
  const stale = readStaleness(checkout);
  if (stale !== null) refuse(`${tag}: ${stale}`);
}
const { arms: chosen, bad: badArms } = chooseArms(process.env['P288_ARMS']);
if (badArms.length > 0) refuse(`P288_ARMS names ${badArms.join(', ')}; the arms are ${ALL_ARMS.join(', ')}.`);
if (chosen.length === 0) refuse('P288_ARMS chose nothing.');
const comparePath = (process.env['P288_COMPARE'] ?? '').trim();
if (comparePath !== '' && !existsSync(comparePath)) refuse(`P288_COMPARE ${comparePath} does not exist.`);
const outDir = resolve(REPO, (process.env['P288_OUT_DIR'] ?? '').trim() || join('out', 'p288'));
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// The scratch world: one git project, one HOME, one profile, two synthetic
// vendor directories and the fixture that answers for them.
// ---------------------------------------------------------------------------
mkdirSync(join(harnessDir, 'p288'), { recursive: true });
const root = realpathSync(join(harnessDir, 'p288'));
const home = join(root, 'h');
const project = join(root, 'alpha');
const profile = join(root, `p-${tag}`);
const claudeDir = join(root, 'claude-config');
const codexDir = join(root, 'codex-home');
for (const d of [home, project, profile, claudeDir, codexDir]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}
// A scratch HOME with no .zshrc makes zsh open its new-user questionnaire in
// the pane instead of a prompt, which arm e's shell session would sit in.
writeFileSync(join(home, '.zshrc'), "PS1='p288 %# '\n");
writeFileSync(join(home, '.hushlogin'), '');
writeFileSync(join(project, 'README.md'), '# Phase 288\n');
const git = (...a) => {
  const r = spawnSync('git', ['-C', project, ...a], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
};
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'p288@example.invalid');
git('config', 'user.name', 'p288');
git('config', 'commit.gpgsign', 'false');
git('add', '.');
git('commit', '-q', '-m', 'first');

// The two synthetic bearers. Sentinel words, never printed, never anybody's.
// The fixture keys on the bearer the credential reader finds, so the vendor
// directory decides which row answers, exactly as build/probe-p202-logins.mjs
// arranges it.
const stamp = randomBytes(4).toString('hex').toUpperCase();
const BEARER = { claude: `P288SENTINELCLAUDE${stamp}`, codex: `P288SENTINELCODEX${stamp}` };
writeFileSync(
  join(claudeDir, '.credentials.json'),
  J({ claudeAiOauth: { accessToken: BEARER.claude, subscriptionType: 'p288plan', expiresAt: Date.now() + 3_600_000 } }),
  { encoding: 'utf8', mode: 0o600 }
);
writeFileSync(
  join(codexDir, 'auth.json'),
  J({ OPENAI_API_KEY: null, tokens: { access_token: BEARER.codex, account_id: `acct-${stamp}` } }),
  { encoding: 'utf8', mode: 0o600 }
);
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const fixturePath = join(root, 'usage-fixture.json');
writeFileSync(
  fixturePath,
  J({
    [BEARER.claude]: { status: 200, body: { five_hour: { utilization: 37, resets_at: iso(3 * 3600_000) }, seven_day: { utilization: 12, resets_at: iso(4 * 86_400_000) } } },
    [BEARER.codex]: {
      status: 200,
      body: {
        plan_type: 'p288codex',
        rate_limit: {
          primary_window: { limit_window_seconds: 604_800, used_percent: 9, reset_after_seconds: 86_400 },
          secondary_window: { limit_window_seconds: 18_000, used_percent: 41, reset_after_seconds: 3_600 }
        }
      }
    }
  }),
  'utf8'
);

// ---------------------------------------------------------------------------
// The page kit. One expression, evaluated once, that puts this probe's readers
// on window.__p288. It is the same text at HEAD and at the parent, which is
// what makes the two columns one measurement. No product file gains a hook.
// ---------------------------------------------------------------------------
const PAGE_KIT = String.raw`
(() => {
  const q = (s) => document.querySelector(s);
  const all = (s) => Array.from(document.querySelectorAll(s));
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return null;
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  };
  const kit = {};
  kit.read = () => {
    const dock = q('[data-slot="session-dock"]');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      collapsed: !!(dock && dock.classList.contains('collapsed')),
      dock: box(dock),
      toolbar: box(q('[data-slot="session-dock"] > .dock-toolbar')),
      mini: box(q('[data-slot="session-dock"] > .usage-mini')),
      full: box(q('[data-slot="session-dock"] > .usage-full')),
      meters: all('[data-slot="session-dock"] .usage-meter').length,
      miniRows: all('[data-slot="session-dock"] .usage-mini-row').length,
      fullRows: all('[data-slot="session-dock"] .usage-full .usage-row').length,
      footer: box(q('[data-slot="session-dock"] > .rail-footer')),
      railList: box(q('[data-slot="session-dock"] .rail-list')),
      railItems: all('[data-slot="session-dock"] .rail-item').length,
      dockList: box(q('[data-slot="session-dock"] > .dock-list')),
      dockRows: all('[data-slot="session-dock"] .dock-list .srow').length,
      stub: box(q('[data-slot="session-dock"] > .dock-stub')),
      resizerMin: (() => { const r = q('[data-slot="session-dock"] > .dock-resizer'); return r ? Number(r.getAttribute('aria-valuemin')) : null; })()
    };
  };
  kit.click = (sel) => { const el = q(sel); if (!el) return false; el.click(); return true; };
  kit.focus = (sel) => { const el = q(sel); if (!el) return false; el.focus(); return document.activeElement === el; };
  kit.blur = () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); return true; };
  window.__p288 = kit;
  return true;
})()
`;

// ---------------------------------------------------------------------------
// The DevTools side: finding the window, forcing frames, real keys.
// ---------------------------------------------------------------------------
async function cdpForAppWindow(profileDir, timeoutMs) {
  const started = Date.now();
  for (;;) {
    let port = 0;
    try {
      port = Number(readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim());
    } catch {
      port = 0;
    }
    if (port > 0) {
      let list = [];
      try {
        list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      } catch {
        list = [];
      }
      for (const t of list) {
        if (t.type !== 'page' || !t.webSocketDebuggerUrl) continue;
        let cdp = null;
        try {
          cdp = await wsConnect(t.webSocketDebuggerUrl);
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
              /* already closed */
            }
          }
        }
      }
    }
    if (Date.now() - started > timeoutMs) throw new Error('no app window');
    await sleep(200);
  }
}

/**
 * FORCE A FRAME, DO NOT JUST SLEEP. The window is never in front during a probe
 * run and Electron throttles it; a screenshot request makes the compositor
 * produce a frame whatever the window's state (build/probe-p1811-strip-fit.mjs
 * measured a whole width ladder coming back from a window that had stopped
 * rendering). The image is discarded: this probe judges no pixel.
 */
async function forceFrame(cdp) {
  await cdp.call('Page.captureScreenshot', { format: 'png' }, 30_000).catch(() => undefined);
}
/** Read with a frame forced before each try, and keep a reading two agree on. */
async function settled(cdp, expression, tries = 6) {
  let previous = null;
  let seen = null;
  for (let i = 0; i < tries; i += 1) {
    await forceFrame(cdp);
    seen = await cdpEval(cdp, expression, 60_000);
    const key = J(seen);
    if (previous === key) return seen;
    previous = key;
    await sleep(150);
  }
  return seen;
}
async function setViewport(cdp, width, height) {
  await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
}
const KEYS = { Home: 36, ArrowLeft: 37, ArrowRight: 39 };
/** CDP's modifier bit for Shift. */
const SHIFT = 8;
/** A REAL key, down and up, delivered to whatever holds the keyboard. */
async function pressKey(cdp, key, modifiers = 0) {
  const base = { key, code: key, windowsVirtualKeyCode: KEYS[key], nativeVirtualKeyCode: KEYS[key], modifiers };
  await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(120);
}

const drive = (cdp, spec) => cdpEval(cdp, `window.__gmuxShotDrive(${J(spec)}).then(() => true)`, 180_000);
const kit = (cdp, call) => cdpEval(cdp, `window.__p288.${call}`, 60_000);
const read = (cdp) => settled(cdp, 'window.__p288.read()');
/** The state word per provider, and whether a window holds a number. No token. */
const USAGE_ROWS = `window.gmux.usage.read().then((s) => (s.providers || []).map((p) => ({ provider: p.provider, state: p.state, numbers: p.fiveHour !== null || p.sevenDay !== null })))`;
const SETTLED_STATES = new Set(['ok', 'stale', 'signed-out', 'expired', 'api-key', 'no-windows', 'unavailable', 'off']);

class Refusal extends Error {}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------
const arms = Object.fromEntries(ARMS.map((a) => [a, []]));
const readings = { tag, checkout, arms: chosen, states: {}, usage: {}, notes: [] };
const note = (l) => {
  readings.notes.push(l);
  say(`note: ${l}`);
};
const fmt = (b) => (b ? `${String(r2(b.left))},${String(r2(b.top))} ${String(r2(b.width))}x${String(r2(b.height))} (bottom ${String(r2(b.bottom))})` : 'ABSENT');
/** Print one reading's rectangles as numbers, the way both columns are compared. */
function print(state, r) {
  readings.states[state] = r;
  say(`${state}: dock ${r.collapsed ? 'COLLAPSED' : 'expanded'} ${fmt(r.dock)}; band ${fmt(r.toolbar)}`);
  say(`${state}:   usage-mini ${fmt(r.mini)} rows ${String(r.miniRows)}; usage-full ${fmt(r.full)} rows ${String(r.fullRows)}; meters ${String(r.meters)}`);
  say(`${state}:   rail-footer ${fmt(r.footer)}; rail-list ${fmt(r.railList)} items ${String(r.railItems)}; dock-list ${fmt(r.dockList)} rows ${String(r.dockRows)}; stub ${fmt(r.stub)}`);
  if (r.collapsed && r.mini && r.footer) {
    const gap = r.footer.top - r.mini.bottom;
    const free = railFree(r);
    say(`${state}:   GAP usage-mini.bottom to rail-footer.top = ${String(r2(gap))}px; free height ${String(r2(free))}px; footer to dock foot ${String(r2(r.dock.bottom - r.footer.bottom))}px`);
  }
  if (!r.collapsed && r.full) {
    say(`${state}:   FOOT dock.bottom - usage-full.bottom = ${String(r2(r.dock.bottom - r.full.bottom))}px${r.stub ? `; usage-full.top - stub.bottom = ${String(r2(r.full.top - r.stub.bottom))}px; stub.top - band.bottom = ${String(r2(r.stub.top - r.toolbar.bottom))}px` : ''}`);
  }
}
if (!chosen.includes('e') && chosen.includes('b')) note('arm e is not chosen, so b is graded against 0 alone and not against the populated foot');
arms.g.push('g NOT DRIVEN: focus mode refuses with no session (focus-flight.ts focusRefusal) and hides the dock with one, so a and b cannot be read around it. Stated limit, never a pass.');

let refused = null;
try {
  await withElectron(
    {
      label: `p288-${tag}`,
      userDataDir: profile,
      tmuxSocket: socket,
      cwd: checkout,
      args: [
        '--remote-debugging-port=0',
        '--use-mock-keychain',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling'
      ],
      env: withoutDevRenderer({
        HOME: home,
        GMUX_TMUX_SOCKET: socket,
        GMUX_PROBES: '1',
        GMUX_USAGE_FIXTURE: fixturePath,
        CLAUDE_CONFIG_DIR: claudeDir,
        CODEX_HOME: codexDir
      }),
      graceMs: 10_000,
      ceilingMs: 4 * 60 * 1000
    },
    async (handle) => {
      // THE INTERLOCK, from build/probe-p202-logins.mjs. Nothing turns a meter
      // on until main has said the vendor is a file, because a meter armed
      // before that would ask the person's own keychain, and a probe cannot
      // tell that apart from a fixture that answered nothing.
      try {
        await handle.waitForLine(/usage fixture installed/, 60_000);
      } catch {
        throw new Refusal('main never said "usage fixture installed", so no meter may be turned on');
      }
      say(`${tag}: the usage fixture is installed; the vendor is a file`);
      const { cdp, url } = await cdpForAppWindow(profile, 90_000);
      say(`${tag}: app window at ${url}, pid ${String(handle.appPid())}`);
      let stage = 'launch';

      /** Flip the switches and wait until the meter has drawn what they say. */
      const usage = async (want) => {
        await cdpEval(cdp, `window.gmux.settingsSet({ usage: ${J(want)} }).then(() => true)`, 30_000);
        const wantRows = Number(want.claude) + Number(want.codex);
        const started = Date.now();
        let rows = [];
        let r = null;
        for (;;) {
          rows = await cdpEval(cdp, USAGE_ROWS, 30_000);
          r = await kit(cdp, 'read()');
          const drawnRows = r.collapsed ? r.miniRows : r.fullRows;
          const onRows = rows.filter((p) => want[p.provider] === true);
          const allSettled = onRows.every((p) => SETTLED_STATES.has(p.state) && p.state !== 'off');
          const allOff = rows.filter((p) => want[p.provider] !== true).every((p) => p.state === 'off');
          if (allSettled && allOff && drawnRows === wantRows && (wantRows > 0 ? r.meters === 1 : r.meters === 0)) break;
          if (Date.now() - started > 20_000) {
            arms.RUN.push(`the meter did not settle on ${J(want)} in 20 s: states ${J(rows)}, ${String(drawnRows)} row(s) drawn`);
            break;
          }
          await sleep(250);
        }
        readings.usage[J(want)] = rows;
        say(`meters ${J(want)}: ${rows.map((p) => `${p.provider} ${p.state}${p.numbers ? ' with numbers' : ''}`).join(', ')}`);
        await sleep(300);
        return wantRows;
      };
      /** Collapse or expand the list through its own button. */
      const collapsed = async (want) => {
        const r = await kit(cdp, 'read()');
        if (r.collapsed === want) return;
        const sel = want ? 'button[aria-label="Collapse session list"]' : 'button[aria-label="Show session names"]';
        if (!(await kit(cdp, `click(${J(sel)})`))) throw new Error(`no ${sel} to press`);
        await sleep(700);
        const after = await kit(cdp, 'read()');
        if (after.collapsed !== want) throw new Error(`the list did not ${want ? 'collapse' : 'expand'}`);
      };
      const railArm = async (state) => {
        await collapsed(true);
        const r = await read(cdp);
        print(state, r);
        return r;
      };
      const listArm = async (state) => {
        await collapsed(false);
        const r = await read(cdp);
        print(state, r);
        return r;
      };

      try {
        await cdp.call('Runtime.enable');
        // The window is never in front during a probe run, and a page Chromium
        // believes is unfocused hands the keyboard to nothing; arm f's Home key
        // needs the resizer to hold it.
        await cdp.call('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined);
        for (;;) {
          if ((await cdpEval(cdp, `performance.getEntriesByType('navigation')[0].loadEventEnd`)) > 0) break;
          await sleep(50);
        }
        await setViewport(cdp, 1440, 900);
        stage = 'open';
        await drive(cdp, { projectPath: project, orientation: 'right' });
        await sleep(800);
        await cdpEval(cdp, PAGE_KIT);
        const opened = await kit(cdp, 'read()');
        if (!opened.dock) throw new Error('no session list is drawn after the project opened');
        if (opened.railList || opened.dockList) throw new Error('the fresh project already has a session, so the empty state cannot be read');

        // ------------------------------------------------------------- a
        if (chosen.includes('a')) {
          stage = 'a';
          const rows = await usage({ claude: true, codex: true });
          arms.a.push(...railFindings('a', await railArm('a'), rows));
        }
        // ------------------------------------------------------------- b
        let bReading = null;
        if (chosen.includes('b')) {
          stage = 'b';
          const rows = await usage({ claude: true, codex: true });
          bReading = { r: await listArm('b'), rows };
        }
        // ------------------------------------------------------------- c
        if (chosen.includes('c')) {
          stage = 'c';
          await usage({ claude: false, codex: false });
          arms.c.push(...offFindings('c rail', await railArm('c rail')));
          arms.c.push(...offFindings('c list', await listArm('c list')));
        }
        // ------------------------------------------------------------- d
        if (chosen.includes('d')) {
          stage = 'd';
          const rows = await usage({ claude: true, codex: false });
          arms.d.push(...railFindings('d rail', await railArm('d rail'), rows));
          arms.d.push(...expandedFindings('d list', await listArm('d list'), rows));
        }
        // ------------------------------------------------------------- f
        if (chosen.includes('f')) {
          stage = 'f';
          const rows = await usage({ claude: true, codex: true });
          await setViewport(cdp, PROJECT_RAIL_MIN_WINDOW_W, 900);
          const fr = await railArm(`f rail at ${String(PROJECT_RAIL_MIN_WINDOW_W)}px`);
          if (fr.viewport.width !== PROJECT_RAIL_MIN_WINDOW_W) arms.f.push(`f the viewport is ${String(fr.viewport.width)}px wide, want ${String(PROJECT_RAIL_MIN_WINDOW_W)}`);
          arms.f.push(...railFindings('f rail', fr, rows));
          await collapsed(false);
          // The list's floor, through the dock's own resizer: Home on a
          // focused separator is `min`, which is DOCK_MIN while expanded
          // (src/renderer/controls/resizer.ts onKeyDown).
          const widthBefore = (await kit(cdp, 'read()')).dock?.width ?? null;
          if (!(await kit(cdp, `focus('[data-slot="session-dock"] > .dock-resizer')`))) arms.f.push('f the dock resizer could not take the keyboard');
          await pressKey(cdp, 'Home');
          await sleep(500);
          const fl = await listArm('f list at DOCK_MIN');
          if (fl.resizerMin !== DOCK_MIN) arms.f.push(`f the resizer's own minimum is ${String(fl.resizerMin)}, want DOCK_MIN ${String(DOCK_MIN)}`);
          if (!near(fl.dock?.width, DOCK_MIN, 0.5)) arms.f.push(`f the list is ${String(r2(fl.dock?.width))}px wide after Home, want DOCK_MIN ${String(DOCK_MIN)}`);
          arms.f.push(...expandedFindings('f list', fl, rows));
          // Back to the width the run started with: two 16px steps and eight
          // 1px steps (Shift), so arm e reads the same geometry at both builds.
          if (typeof widthBefore === 'number' && widthBefore > DOCK_MIN) {
            let width = DOCK_MIN;
            for (let guard = 0; guard < 40 && width < widthBefore; guard += 1) {
              await pressKey(cdp, 'ArrowLeft', widthBefore - width >= 16 ? 0 : SHIFT);
              width = (await kit(cdp, 'read()')).dock?.width ?? width;
            }
            if (!near(width, widthBefore, 0.5)) note(`f the list came back to ${String(r2(width))}px and not ${String(r2(widthBefore))}px`);
          }
          await kit(cdp, 'blur()');
          await setViewport(cdp, 1440, 900);
        }
        // ------------------------------------------------------------- e
        let populatedFoot = null;
        if (chosen.includes('e')) {
          stage = 'e';
          const rows = await usage({ claude: true, codex: true });
          await collapsed(false);
          await drive(cdp, { projectPath: project, session: { agent: 'shell', name: 'p288-e' } });
          await sleep(800);
          const ec = await railArm('e rail');
          const ee = await listArm('e list');
          arms.e.push(...populatedFindings('e rail', ec, rows));
          arms.e.push(...populatedFindings('e list', ee, rows));
          if (ee.full) populatedFoot = ee.dock.bottom - ee.full.bottom;
          readings.populated = { collapsed: ec, expanded: ee };
          if (comparePath !== '') {
            let theirs = null;
            try {
              theirs = JSON.parse(readFileSync(comparePath, 'utf8')).readings?.populated ?? null;
              if (theirs === null) arms.e.push(`e P288_COMPARE ${comparePath} holds no populated reading (its run did not include arm e)`);
            } catch (err) {
              arms.e.push(`e P288_COMPARE could not be read: ${err instanceof Error ? err.message : String(err)}`);
            }
            if (theirs !== null) {
              const diffs = rectDiffs(readings.populated, theirs);
              arms.e.push(...diffs);
              say(`e against ${comparePath}: ${diffs.length === 0 ? 'every rectangle of the populated case is byte-identical' : `${String(diffs.length)} edge(s) differ`}`);
            }
          }
        }
        if (bReading !== null) {
          arms.b.push(...expandedFindings('b', bReading.r, bReading.rows, populatedFoot));
        }
        stage = 'done';
      } catch (err) {
        // A stage that threw is a finding of THIS run, named by its stage; the
        // finally below still kills the session the drive made and the helper
        // still ends the tree. A Refusal is the one thing that propagates.
        if (err instanceof Refusal) throw err;
        arms.RUN.push(`the run stopped during ${stage}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        try {
          await cdpEval(cdp, `window.__gmuxShotCleanup ? window.__gmuxShotCleanup().then(() => true) : true`, 30_000);
        } catch {
          /* best effort; withElectron ends the tree anyway */
        }
        cdp.close();
      }
    }
  );
} catch (err) {
  if (err instanceof Refusal) refused = err.message;
  else arms.RUN.push(`the launch did not complete: ${err instanceof Error ? err.message : String(err)}`);
}
// The helper's finally has run by here, so the Electron and the scratch tmux
// server are gone before the refusal is said.
if (refused !== null) refuse(refused);

// -- the report -------------------------------------------------------------
const readingsPath = join(outDir, `readings-${tag}.json`);
writeFileSync(readingsPath, `${J({ arms, readings })}\n`);
say('');
say(`arm   ${tag.toUpperCase()}`);
for (const arm of ARMS) {
  const n = arms[arm].length;
  const chosenHere = arm === 'RUN' || arm === 'g' || chosen.includes(arm);
  say(`${arm.padEnd(5)} ${!chosenHere ? 'not run' : arm === 'g' ? 'NOT DRIVEN' : n === 0 ? 'PASS' : `FAIL ${String(n)}`}`);
}
const failures = [];
// Every finding already begins with the state that read it, and the state
// begins with its arm's letter, so the arm is not repeated here.
for (const arm of ARMS) {
  if (arm === 'g') continue;
  for (const f of arms[arm]) failures.push(`${tag.toUpperCase()} ${f}`);
}
say('');
say(`readings: ${readingsPath}${tag === 'head' ? ' (hand it to the parent run as P288_COMPARE, or the other way round)' : ''}`);
if (tag === 'parent') {
  const aFailed = arms.a.length > 0;
  const bFailed = arms.b.length > 0;
  say(`the PARENT is expected to fail a and b: a ${chosen.includes('a') ? (aFailed ? 'failed as expected' : 'ALSO PASSES, so that arm asserts nothing') : 'not run'}, b ${chosen.includes('b') ? (bFailed ? 'failed as expected' : 'ALSO PASSES, so that arm asserts nothing') : 'not run'}`);
}
if (failures.length > 0) {
  for (const f of failures) process.stderr.write(`${TAG}   ${f}\n`);
  process.stderr.write(`${TAG} ${tag === 'parent' ? 'the parent FAILED' : 'FAILED'}: ${String(failures.length)} finding(s).\n`);
  process.exit(1);
}
say(`PASS: ${tag} has 0 findings on ${chosen.join(', ')}.${arms.g.length > 0 ? ' g was not driven.' : ''}`);
process.exit(0);
