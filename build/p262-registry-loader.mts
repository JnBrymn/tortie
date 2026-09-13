/**
 * p262-registry-loader.mts — A COMMITTED REGRESSION, not an audit artefact
 * (Phase 262). `build/conformance-runtime.mjs` runs it; it is not a file
 * somebody reads once and deletes.
 *
 * ## What it asks
 *
 * The three questions the audit's R4 finding names, of the registry the
 * control-deadline probe's own driver depends on — the module-level
 * `const remoteContexts = new Map()` in src/main/machines/context.ts:
 *
 *   direct lookup         the Map read through machineContext(), imported
 *                         directly by this file.
 *   control-plane lookup  the same registration read through
 *                         remoteContextFor() in
 *                         src/main/machines/control-plane.ts, which reaches
 *                         context.ts through its OWN import graph. This is the
 *                         reading `probe:controldeadline` leg 0 takes.
 *   registration identity whether the registration function reached by a
 *                         require() of the same specifier is the SAME object
 *                         as the one reached by import. Two objects means two
 *                         loaded module instances and two Maps, and a
 *                         registration made through one is invisible to the
 *                         other.
 *
 * ## What it measured, 2026-09-13, on every Node installed on the dev machine
 *
 *   | runtime  | direct | control-plane            | identity     | exit |
 *   | -------- | ------ | ------------------------ | ------------ | ---- |
 *   | 20.18.3  | pass   | FAIL — Tortie has not    | FAIL — two   |  1   |
 *   |          |        | signed in to p262-fixture | objects     |      |
 *   | 22.14.0  | pass   | FAIL — same refusal      | FAIL — two   |  1   |
 *   | 22.23.1  | pass   | pass                     | one object   |  0   |
 *   | 24.20.0  | pass   | pass                     | one object   |  0   |
 *   | 26.8.2   | pass   | pass                     | one object   |  0   |
 *
 * The cause is not Tortie's code and not Node's behaviour: it is tsx's own
 * `moduleRegisterHooks` feature gate, and the account of it is in the header
 * of `build/verification-checks.mjs`, beside the table the gate predicts from.
 * The prediction agreed with this fixture on 5 of 5 runtimes, which is what
 * licenses refusing a runtime rather than measuring every one.
 *
 * ## What it is not allowed to do, and all five were confirmed
 *
 * It spawns nothing, opens no ssh, writes no file, reads nothing under the
 * person's home, and registers one machine named `p262-fixture` in a process
 * that exits immediately. It prints ONE JSON line — which is what the gate
 * parses — and exits 0 when all three readings pass, 1 otherwise.
 */

import { createRequire } from 'node:module';
import {
  machineContext,
  machineGeneration,
  registerRemoteMachineContext,
  setMachineRemotePath,
  type RemoteMachineContext
} from '../src/main/machines/context';
import { remoteContextFor } from '../src/main/machines/control-plane';

const ID = 'p262-fixture';
const SEARCH_LIST = '/usr/bin:/bin';

const ctx: RemoteMachineContext = {
  kind: 'remote',
  machineId: ID,
  sshBin: '/usr/bin/ssh',
  host: 'fixture.invalid',
  user: 'nobody',
  port: 22,
  remoteTmuxPath: '/usr/bin/tmux',
  socket: 'p262',
  controlPath: '/tmp/p262-control',
  hostKeys: { tortie: null, user: null },
  acceptedTmuxVersion: null
} as RemoteMachineContext;

registerRemoteMachineContext(ctx);
setMachineRemotePath(ID, SEARCH_LIST);

// 1. direct lookup, through the module this file imported.
let direct = false;
let directDetail = '';
try {
  const seen = machineContext(ID);
  direct = seen.kind === 'remote' && seen.socket === 'p262';
  directDetail = seen.kind;
} catch (err) {
  directDetail = String(err);
}

// 2. control-plane lookup, through the graph openControlPlane itself uses.
let plane = false;
let planeDetail = '';
try {
  const seen = remoteContextFor(ID);
  plane =
    seen.remoteTmuxPath === '/usr/bin/tmux' &&
    machineGeneration(ID).remotePath === SEARCH_LIST;
  planeDetail = 'resolved';
} catch (err) {
  planeDetail = String(err);
}

// 3. registration identity across the require() path.
let identity = false;
let identityDetail = '';
try {
  const req = createRequire(import.meta.url);
  const viaRequire = req('../src/main/machines/context.ts') as {
    registerRemoteMachineContext: unknown;
  };
  identity = viaRequire.registerRemoteMachineContext === registerRemoteMachineContext;
  identityDetail = identity ? 'one object' : 'two objects';
} catch (err) {
  identityDetail = String(err);
}

const result = {
  node: process.versions.node,
  direct,
  directDetail,
  plane,
  planeDetail,
  identity,
  identityDetail
};
console.log(JSON.stringify(result));
process.exit(direct && plane && identity ? 0 : 1);
