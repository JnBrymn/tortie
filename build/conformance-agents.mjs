/**
 * `npm run conformance:agents` — the cheap gate that keeps a FOURTEENTH agent
 * executable rather than asserted (Phase 23, C1/C2).
 *
 * WHAT IT IS FOR. Phase 23 lets a user describe an agent Tortie never compiled
 * in, in `<userData>/gmux/config/agents.json`. The claim that comes with that
 * is large: the new row launches, resumes and survives a quit and a restore
 * exactly the way the thirteen compiled rows do. A claim like that decays. This
 * gate is the executable half of it, and it costs about a second.
 *
 * It is the third gate of its shape. `conformance:resume` proves the resume
 * argv against real agent processes and costs about sixteen seconds. That one
 * is the truth. `conformance:context` prints the substrate matrix. This one
 * sits between them: no process, no tmux server, no Electron, no manifest, no
 * file under the user's home, no write anywhere. Safe on a machine with live
 * sessions on it.
 *
 * WHAT IT CHECKS, in seven sections, and each one is a way a user-added agent
 * could go missing, a session could be lost, or a secret could be written down.
 *
 * SECTION 1 — the create path. For every launchable agent, the launch argv
 *   starts with the ABSOLUTE binary it was handed, keeps the user's extra
 *   flags, and names a real id-capture mode. The recovery contract comes back
 *   with no undefined field and the SAME KEY SET as every other agent's. That
 *   last one is research 31's clause (d) made executable: a session created by
 *   a config row and a session created by a compiled row are the same shape in
 *   the manifest, and restore cannot tell them apart.
 *
 * SECTION 2 — the restore path, and this is the sharp edge. The contract is
 *   serialized, parsed back, and then a resume argv is composed FROM THE
 *   PARSED ROW ALONE, with no registry lookup at all. It must equal the argv
 *   the registry composes, byte for byte. When those two agree, deleting
 *   `agents.json` cannot change how an existing session restores, which is the
 *   whole reason a user may add an agent without risking their work. The same
 *   section checks that `requiresOriginalCwd` is a real boolean on the row, so
 *   `originalCwdRule` answers with basis 'row' and never falls through to the
 *   live registry.
 *
 * SECTION 3 — the renderer. The pre-scan seed in `src/renderer/state/agents.ts`
 *   is a hand-written list that nothing type-checks. Its ids, its order and its
 *   `unverified` column must agree with the registry, and before Phase 23 two
 *   of those facts had drifted: the seed marked pi unverified and left droid
 *   unmarked, which is backwards. The section then hands the renderer a scan
 *   carrying a fourteenth agent and requires a chip for it, with its own name
 *   and icon, with no edit to the renderer.
 *
 * SECTION 4 — the overlay loader. A file with three rows goes in: an agent this
 *   build has never heard of, a row whose resume template lost its
 *   `<sessionId>` slot, and a patch that renames a compiled agent. Out must
 *   come the new agent complete, the broken row dropped WHOLE with its field
 *   named, and the rename applied with nothing a process would run touched.
 *   `AGENT_REGISTRY` itself must be the same thirteen rows afterwards, because
 *   that is the array the restore path reads.
 *
 *   The same section proves the confirm gate's binding on the hash alone.
 *   Changing the binary, the launch argv, the environment, the resume template,
 *   the id capture or the version probe must all produce a different hash, so a
 *   person is asked again. Changing the display name, the icon or the notes must
 *   produce the same hash, or Tortie would ask a person to re-approve a rename
 *   and the gate would train them to click through it.
 *
 *   When the loader has not landed the probe reports `seam: absent`, this
 *   section is SKIPPED OUT LOUD, and sections 1 to 3 still decide the verdict.
 *   It never silently passes.
 *
 * SECTION 5 — env passthrough (Phase 33). `launch.envPassthrough` is a list of
 *   environment variable NAMES. Tortie reads their values from the login shell
 *   at each launch and each restore, hands them to that pane, and writes them
 *   nowhere. Five assertions keep that sentence true.
 *
 *   1. The confirm hash moves when the name SET changes and only then. Adding a
 *      name moves it, removing that name moves it back, reordering the list
 *      leaves it byte equal, and a display name change leaves it byte equal.
 *   2. The manifest row carries names and never values. The record is composed
 *      from a spec carrying the names, the pane environment is composed
 *      separately from a resolved map carrying a sentinel value, and the
 *      sentinel must appear in the second and in no byte of the first. The same
 *      assertion holds the stamps-stay-last rule: a resolved map that tries to
 *      set `GMUX_SESSION_ID` loses to the session's own id.
 *   3. The resume argv rebuilt from the passthrough row's manifest contract
 *      alone is byte equal to the registry's, so the new field changed nothing
 *      about how a session comes back.
 *   4. The confirm sheet prints one line per name and no value.
 *   5. The refused names are refused. A row naming `PI_CODING_AGENT_DIR` is
 *      dropped whole with the field named, and so is a `"schema": 1` file that
 *      carries the field at all.
 *
 *   The login shell probe itself is NOT run here. It spawns a process, and this
 *   gate spawns none. Its 3 second deadline and its group kill are proven by the
 *   unit tests beside it and by the Tier 3 verifier driving the real app.
 *
 * WHAT IT DOES NOT PROVE, stated so nobody reads more into a pass. The confirm
 * record is sealed through `safeStorage`, which needs an Electron process, so
 * this gate never watches a confirmed row start a process or an unconfirmed one
 * refuse to. It also does not prove that the create path resolves a configured
 * id at all, because that wiring lives outside the pure modules it can import.
 * Both belong to the Tier 3 verifier driving the real app. What is proven here
 * is that the data is complete and the hash is bound correctly.
 */

import { spawnSync } from 'node:child_process';
import { tsxCli } from './ts-runner.mjs';

const probe = spawnSync(
  process.execPath,
  [tsxCli(), '--tsconfig', 'tsconfig.node.json', 'build/agents-conformance-probe.mts'],
  { encoding: 'utf8', cwd: process.cwd() }
);

if (probe.status !== 0) {
  process.stderr.write(probe.stderr || 'the probe did not run\n');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(probe.stdout);
} catch {
  process.stderr.write(`the probe did not print JSON:\n${probe.stdout}\n`);
  process.exit(1);
}

const failures = [];
const skipped = [];
const fail = (message) => failures.push(message);

// ---------------------------------------------------------------------------
// Section 1 — the create path
// ---------------------------------------------------------------------------

const claude = data.agents.find((a) => a.id === 'claude') ?? null;
if (claude === null) {
  fail('claude is no longer a launchable agent, so there is no shape to compare against.');
}
const referenceKeys = claude === null ? [] : claude.contractKeys;

for (const agent of data.agents) {
  if (agent.launchArgv0 !== data.absBin) {
    fail(
      `${agent.id}: the launch argv starts with ${agent.launchArgv0}, not the absolute binary it was handed. ` +
        'The manifest stores absolute paths so a restore survives PATH drift.'
    );
  }
  if (!agent.launchKeepsExtras) {
    fail(`${agent.id}: the user's extra flags did not survive into the launch argv.`);
  }
  if (agent.idCapture.length === 0) {
    fail(`${agent.id}: the launch spec has no id-capture mode.`);
  }
  if (agent.contractUndefined.length > 0) {
    fail(
      `${agent.id}: the recovery contract came back with undefined fields: ` +
        `${agent.contractUndefined.join(', ')}.`
    );
  }
  if (agent.contractKeys.join('|') !== referenceKeys.join('|')) {
    const missing = referenceKeys.filter((k) => !agent.contractKeys.includes(k));
    const extra = agent.contractKeys.filter((k) => !referenceKeys.includes(k));
    fail(
      `${agent.id}: its recovery contract is a different shape from claude's. ` +
        `Missing ${missing.join(', ') || 'nothing'}; extra ${extra.join(', ') || 'nothing'}. ` +
        'A config row and a compiled row must be indistinguishable in the manifest.'
    );
  }
  if (agent.sessionStore.length === 0) {
    fail(
      `${agent.id}: the contract names no session store, so a drift warning has nothing ` +
        'actionable to tell the user.'
    );
  }
  if (agent.resumeExtrasPosition !== 'leading' && agent.resumeExtrasPosition !== 'trailing') {
    fail(`${agent.id}: resumeExtrasPosition is "${agent.resumeExtrasPosition}".`);
  }
}

// ---------------------------------------------------------------------------
// Section 2 — the restore path
// ---------------------------------------------------------------------------

for (const agent of data.agents) {
  if (!agent.contractRoundTrips) {
    fail(
      `${agent.id}: the recovery contract did not survive serialize and parse unchanged. ` +
        'That round trip is the exact path restore reads.'
    );
  }
  if (!agent.cwdBasisIsRow) {
    fail(
      `${agent.id}: requiresOriginalCwd is not a boolean on the parsed row, so originalCwdRule ` +
        'would fall through to the live registry instead of answering from the row.'
    );
  }
  if (!agent.resumeAgrees) {
    fail(
      `${agent.id}: the resume argv composed from the manifest row differs from the one the ` +
        `registry composes.\n      row      ${JSON.stringify(agent.contractResume)}` +
        `\n      registry ${JSON.stringify(agent.registryResume)}`
    );
  }
  if (!agent.noUnfilledSlot) {
    fail(`${agent.id}: the composed resume argv still contains ${data.slot}.`);
  }
  if (!agent.refusesEmptyId) {
    fail(
      `${agent.id}: a resume argv built from an EMPTY id came back non-empty. A bare resume ` +
        'attaches to the most recent conversation instead of failing.'
    );
  }
  if (agent.resumeStrategy === 'flag-uuid' && agent.registryResume.length === 0) {
    fail(`${agent.id}: strategy is flag-uuid but no resume argv could be composed.`);
  }
}

// ---------------------------------------------------------------------------
// Section 3 — the renderer
// ---------------------------------------------------------------------------

const r = data.renderer;

const seedIds = r.seed.map((s) => s.id);
if (seedIds.join('|') !== r.launchableIds.join('|')) {
  fail(
    'the renderer seed no longer offers exactly the registry\'s launchable agents in order.\n' +
      `      seed     ${seedIds.join(', ')}\n      registry ${r.launchableIds.join(', ')}`
  );
}
for (const seeded of r.seed) {
  const truth = r.registrySeed.find((e) => e.id === seeded.id) ?? null;
  if (truth === null) continue;
  if (seeded.unverified !== truth.unverified) {
    fail(
      `the renderer seed says ${seeded.id} unverified=${seeded.unverified}; the registry says ` +
        `${truth.unverified}. The picker would label the wrong agent "early".`
    );
  }
}
if (!r.overlayIsOffered) {
  fail(
    'a launchable agent that arrived only in the scan did not become a picker chip. ' +
      'A user-added agent must appear with no edit to the renderer.'
  );
}
if (r.overlayLabel !== 'Tortie Conformance Agent') {
  fail(`the overlay agent's chip label is "${r.overlayLabel}", not its display name.`);
}
if (r.overlayIconKey !== 'terminal') {
  fail(`the overlay agent's icon key is "${r.overlayIconKey}", not the one main reported.`);
}
if (r.labelBefore !== data.synthId) {
  fail(
    `agentShortLabel invented a name for an unknown agent before any scan: "${r.labelBefore}". ` +
      'An unknown id must read as itself.'
  );
}
if (r.labelAfter !== 'Tortie Conformance Agent') {
  fail(
    `agentShortLabel still reads "${r.labelAfter}" for the overlay agent after a scan carried ` +
      'its display name. It would show a bare id in Context rows and resume copy.'
  );
}
if (r.compiledLabelSurvives !== 'Cursor') {
  fail(
    `a scan overwrote the chosen chip copy for a compiled agent: cursor now reads ` +
      `"${r.compiledLabelSurvives}" rather than "Cursor".`
  );
}
if (r.lastOption !== 'shell') {
  fail(`Shell is no longer the last picker option; it is "${r.lastOption}".`);
}
for (const ideOnly of ['cursoride', 'copilotide']) {
  if (r.offeredIds.includes(ideOnly)) {
    fail(`the capture-only IDE row ${ideOnly} is being offered for launch.`);
  }
}

// ---------------------------------------------------------------------------
// Section 4 — the overlay loader
// ---------------------------------------------------------------------------

const seam = data.seam;
const BROKEN_ID = 'tortie-conf-broken';

if (seam.state === 'absent') {
  skipped.push(
    `the overlay loader (${seam.specifier}) has not landed, so the merge, the drop-whole rule ` +
      'and the confirm hash binding were NOT checked.'
  );
} else if (seam.state === 'incomplete') {
  fail(
    `${seam.specifier} exists but does not export ${seam.missing.join(', ')}. ` +
      `It exports: ${seam.exports.join(', ') || 'nothing'}. ` +
      'See the seam contract in build/agents-conformance-probe.mts.'
  );
} else if (seam.state === 'broken') {
  fail(
    `${seam.specifier} imported, then threw when it was used: ${seam.error}. ` +
      'Nothing about the overlay was checked.'
  );
} else {
  // 4a. The compiled array is untouched, and the compiled rows still lead.
  if (seam.compiledAfter !== seam.compiledBefore) {
    fail(
      `merging an overlay changed AGENT_REGISTRY itself, from ${seam.compiledBefore} rows to ` +
        `${seam.compiledAfter}. The restore path reads that array, so it must never grow.`
    );
  }
  if (!seam.mergedHeadMatchesRegistry) {
    fail(
      'the merged table no longer starts with the compiled rows in registry order, so a ' +
        'configured agent can displace a compiled one in a picker.'
    );
  }

  // 4b. The broken row is dropped WHOLE, and it is named.
  if (seam.parsedIds.includes(BROKEN_ID) && seam.mergedIds.includes(BROKEN_ID)) {
    fail(
      `the row whose resume template lost its ${data.slot} slot was merged anyway. An argv that ` +
        'loses its id attaches to the wrong conversation instead of failing.'
    );
  }
  const named = [...seam.parseProblems, ...seam.mergeProblems].filter(
    (p) => p.id === BROKEN_ID && p.field.length > 0 && p.message.length > 0
  );
  if (named.length === 0) {
    fail(
      'dropping the broken row produced no problem naming the field and the reason. A silent drop ' +
        'is the failure mode this rule exists to prevent.'
    );
  }
  if (!seam.parsedIds.includes(data.synthId)) {
    fail('the valid row did not survive a file that also contained a broken row.');
  }

  // 4c. The new agent is complete enough to launch, resume and restore.
  const n = seam.newEntry;
  if (n === null) {
    fail('the merge produced no row for an agent the file created.');
  } else {
    if (n.source !== 'config') {
      fail(`the configured agent's row says source "${n.source}", not "config".`);
    }
    if (n.unverified !== true) {
      fail(
        'the configured agent came back verified. Tortie has measured nothing about it, and ' +
          'unverified is the registry\'s existing word for that.'
      );
    }
    if (n.launchArgv.length === 0 || n.launchArgv[0] !== n.binaries[0]) {
      fail(
        `the configured agent's launch.argv[0] is ${JSON.stringify(n.launchArgv[0])} and its ` +
          `binaries[0] is ${JSON.stringify(n.binaries[0])}. Tortie resolves the second and tmux ` +
          'runs the first, so they must be the same name.'
      );
    }
    if (n.slotCount !== 1) {
      fail(
        `the configured agent's resume template carries ${n.slotCount} ${data.slot} slots. ` +
          'Exactly one is the only number that composes a correct resume.'
      );
    }
    if (n.sessionStore.length === 0) {
      fail(
        'the configured agent names no session store, so a drift warning has nothing actionable ' +
          'to tell the user.'
      );
    }
    if (!['pre-assign', 'pre-assign-cmd', 'none'].includes(n.idCaptureMode)) {
      fail(`the configured agent's idCapture mode is "${n.idCaptureMode}", outside the closed set.`);
    }
    if (!n.requiresOriginalCwd || !n.bareResumeIsDangerous) {
      fail(
        'a configured agent that said nothing about requiresOriginalCwd or bareResumeIsDangerous ' +
          'did not default to true. Both defaults must be the refusing direction, because ' +
          'substituting a directory can open an empty session that looks resumed.'
      );
    }
  }

  // 4d. Its manifest row is the same shape as a compiled agent's.
  const o = seam.report;
  if (o === null) {
    if (seam.newEntry !== null) fail('the configured agent produced no recovery contract.');
  } else {
    if (o.contractKeys.join('|') !== referenceKeys.join('|')) {
      const missing = referenceKeys.filter((k) => !o.contractKeys.includes(k));
      const extra = o.contractKeys.filter((k) => !referenceKeys.includes(k));
      fail(
        "the configured agent's recovery contract is a different shape from claude's. " +
          `Missing ${missing.join(', ') || 'nothing'}; extra ${extra.join(', ') || 'nothing'}. ` +
          'A config row and a compiled row must be indistinguishable in the manifest.'
      );
    }
    if (!o.contractRoundTrips) {
      fail("the configured agent's contract did not survive serialize and parse unchanged.");
    }
    if (!o.cwdBasisIsRow) {
      fail(
        "the configured agent's requiresOriginalCwd is not a boolean on the parsed row, so " +
          'originalCwdRule would ask the live registry for an agent it does not have.'
      );
    }
    if (o.contractResume.length === 0 || !o.noUnfilledSlot) {
      fail(
        'the configured agent cannot compose a resume argv from its manifest row alone, so ' +
          'deleting agents.json would change how its sessions restore.'
      );
    }
    if (!o.refusesEmptyId) {
      fail(
        "the configured agent's resume argv came back non-empty for an EMPTY id. A bare resume " +
          'attaches to the most recent conversation instead of failing.'
      );
    }
  }

  // 4e. A patch that renames a compiled agent changes nothing that runs.
  const p = seam.patched;
  if (p === null) {
    fail('the merge lost the compiled claude row while applying a patch to it.');
  } else {
    if (p.source !== 'patched') {
      fail(`a patched compiled row says source "${p.source}", not "patched".`);
    }
    if (p.displayName !== 'Claude' || p.iconKey !== 'terminal') {
      fail(
        `the presentation patch did not apply: claude reads "${p.displayName}" with icon ` +
          `"${p.iconKey}".`
      );
    }
    if (!p.launchUnchanged || !p.resumeUnchanged) {
      fail(
        'a patch that only changed a name and an icon altered the compiled launch or resume. ' +
          'A present key replaces its own field and nothing else.'
      );
    }
  }

  // 4f. The confirm gate's binding, on the hash alone.
  const h = seam.hash;
  if (typeof h.base !== 'string' || h.base.length !== 64) {
    fail(
      `a row naming a binary, an argv, an environment and a resume template hashed to ` +
        `${JSON.stringify(h.base)}. There is nothing for a confirmation to bind to.`
    );
  }
  if (h.sameAgain !== h.base) {
    fail('hashing the same row twice gave two answers. A confirmation would never hold.');
  }
  const mustNotMove = [
    ['iconKey', h.afterIconChange],
    ['displayName', h.afterDisplayNameChange],
    ['notes', h.afterNotesChange],
    ['storeDirs', h.afterStoreDirsChange],
    ['resume.sessionStore', h.afterSessionStoreChange]
  ];
  for (const [field, value] of mustNotMove) {
    if (value !== h.base) {
      fail(
        `changing ${field} re-armed the confirm gate. It cannot change what runs, and asking a ` +
          'person to re-approve it trains them to click through the sheet that matters.'
      );
    }
  }
  const mustMove = [
    ['binaries', h.afterBinaryChange],
    ['extraProbeDirs', h.afterProbeDirChange],
    ['launch.argv', h.afterArgvChange],
    ['launch.env', h.afterEnvChange],
    ['resume.template', h.afterTemplateChange],
    ['resume.extrasPosition', h.afterExtrasPositionChange],
    ['resume.idCapture', h.afterIdCaptureChange],
    ['versionProbe', h.afterVersionProbeChange]
  ];
  for (const [field, value] of mustMove) {
    if (value === h.base) {
      fail(
        `changing ${field} left the confirm hash unchanged, so an edit that changes what runs ` +
          'would inherit a confirmation given for something else.'
      );
    }
    if (value === null) {
      fail(`the variation of ${field} did not survive validation, so its hash was not compared.`);
    }
  }
  if (h.compiledClaude === null || h.renamedClaude === null) {
    fail('claude could not be hashed through the merge, so the rename comparison did not run.');
  } else if (h.compiledClaude !== h.renamedClaude) {
    fail(
      'renaming a compiled agent changed its confirm hash. A patch that only supplies a display ' +
        'name and an icon must leave the compiled command line, and therefore its hash, alone.'
    );
  }
}

// ---------------------------------------------------------------------------
// Section 5 — env passthrough (Phase 33)
// ---------------------------------------------------------------------------
//
// Each of the five assertions gets a row in its own table, so a person reads
// which one broke rather than a paragraph. `note` is what the row says when it
// is not a plain pass.

const p33 = data.p33 ?? { state: 'absent', missing: ['the probe printed no p33 section'] };
const p33Rows = [];

/** Record one assertion. `ok` decides the verdict; `note` is for the table. */
const p33Assert = (name, ok, note, why) => {
  p33Rows.push({ name, ok, note: note ?? '' });
  if (!ok) fail(`env passthrough, ${name}: ${why}`);
};

if (p33.state === 'absent') {
  skipped.push(
    'env passthrough (Phase 33) has not landed, so the confirm hash, the names-only ' +
      `manifest row, the resume argv, the sheet and the refusals were NOT checked. Missing: ${(
        p33.missing ?? []
      ).join(', ')}.`
  );
} else if (p33.state === 'broken') {
  fail(
    `the env passthrough section threw when it was used: ${p33.error}. Nothing about ` +
      'launch.envPassthrough was checked.'
  );
} else {
  const h = p33.hash;
  const everyHash = [h.base, h.sameAgain, h.afterAdd, h.afterRemove, h.afterReorder, h.afterDisplayName];
  const hashed = everyHash.every((v) => typeof v === 'string' && v.length === 64);

  // 1. The hash moves on the name SET and on nothing else.
  p33Assert(
    'hash moves on add and remove, not on reorder',
    hashed &&
      h.sameAgain === h.base &&
      h.afterAdd !== h.base &&
      h.afterRemove === h.base &&
      h.afterReorder === h.base &&
      h.afterDisplayName === h.base,
    hashed ? '' : 'a variation did not survive validation',
    !hashed
      ? 'at least one variation of the row did not hash, so its hash was never compared. ' +
          `base ${JSON.stringify(h.base)}, add ${JSON.stringify(h.afterAdd)}, ` +
          `reorder ${JSON.stringify(h.afterReorder)}.`
      : h.afterAdd === h.base
        ? 'adding a name left the confirm hash unchanged, so a row could widen the set of ' +
          'variables reaching a pane on a confirmation given for a narrower set.'
        : h.afterRemove !== h.base
          ? 'removing the added name did not return the hash to where it started, so the hash ' +
            'depends on something other than the set of names.'
          : h.afterReorder !== h.base
            ? 'reordering the names moved the confirm hash. Order does not change which ' +
              'variables reach the pane, and asking a person to re-approve a reorder trains ' +
              'them to click through the sheet that matters.'
            : h.afterDisplayName !== h.base
              ? 'changing the display name moved the confirm hash of a passthrough row.'
              : 'hashing the same row twice gave two answers.'
  );

  // 2. The row carries names. The value is in the pane and nowhere else.
  const rec = p33.record;
  const namesOnRecord = Array.isArray(rec.envPassthrough)
    ? [...rec.envPassthrough].sort().join(',')
    : null;
  const wantNames = [...p33.names].sort().join(',');
  p33Assert(
    'manifest row carries names, never values',
    namesOnRecord === wantNames && !rec.recordJsonHasSentinel && rec.paneEnvCarriesValue,
    namesOnRecord === null ? 'the record carries no envPassthrough' : '',
    rec.recordJsonHasSentinel
      ? 'a resolved VALUE was found in the manifest record. Option B in research 41 is the ' +
          'design this phase rejected, and its whole failure is a secret written into the ' +
          'session database in plain text.'
      : !rec.paneEnvCarriesValue
        ? 'the resolved value did not reach the pane environment, so the feature does nothing.'
        : `the record's envPassthrough is ${JSON.stringify(rec.envPassthrough)} rather than the ` +
          `configured ${JSON.stringify(p33.names)}. Restore reads the row, not the registry, so ` +
          'a row that lost its names restores a pane without them.'
  );
  p33Assert(
    'the pane stamps stay last',
    rec.stampSurvives === true,
    '',
    'a resolved value overwrote GMUX_SESSION_ID. That stamp is the second identity source ' +
      'Tortie reads sessions back by, and a pane carrying another session\'s stamp is the one ' +
      'thing the durability layer cannot survive.'
  );

  // 3. The resume argv is untouched by the new field.
  const rep = p33.report;
  p33Assert(
    'resume argv stays byte equal',
    rep !== null && rep.resumeAgrees && rep.contractRoundTrips && rep.noUnfilledSlot,
    rep === null ? 'the passthrough row produced no recovery contract' : '',
    rep === null
      ? 'the passthrough row produced no recovery contract, so nothing about its restore was ' +
          'checked.'
      : !rep.contractRoundTrips
        ? 'the passthrough row\'s recovery contract did not survive serialize and parse ' +
            'unchanged, which is the exact path restore reads.'
        : `the resume argv composed from the passthrough row's manifest contract differs from ` +
            `the registry's.\n      row      ${JSON.stringify(rep.contractResume)}` +
            `\n      registry ${JSON.stringify(rep.registryResume)}`
  );

  // 4. The sheet prints the names and no value.
  const sheet = p33.sheet;
  const printed =
    sheet === null
      ? []
      : sheet.passthroughLines.map((line) => line.slice(p33.sheetPrefix.length));
  p33Assert(
    'the sheet prints names and no value',
    sheet !== null &&
      !sheet.valueLeak &&
      printed.join(',') === [...p33.names].sort().join(','),
    sheet === null ? 'no sheet was built' : printed.join(' '),
    sheet === null
      ? 'the confirm sheet could not be built for the passthrough row.'
      : sheet.valueLeak
        ? 'a resolved VALUE appeared on the confirm sheet. The sheet is what the person reads ' +
            'before they agree, and it carries names only.'
        : `the sheet printed ${JSON.stringify(printed)} rather than the sorted configured names ` +
            `${JSON.stringify([...p33.names].sort())}. A person who cannot see every name on the ` +
            'sheet is confirming a set they were not shown.'
  );

  // 5. The refusals refuse, and each one names the field.
  const namesField = (r) => typeof r.field === 'string' && r.field.includes('envPassthrough');
  p33Assert(
    'PI_CODING_AGENT_DIR is refused',
    p33.refusePiDir.dropped && namesField(p33.refusePiDir),
    p33.refusePiDir.field ?? 'no problem named the field',
    !p33.refusePiDir.dropped
      ? 'a row naming PI_CODING_AGENT_DIR was merged. That name moves where the agent keeps ' +
          'its sessions, and Tortie would keep looking in the old place and lose the conversation.'
      : 'the row was dropped with no problem naming launch.envPassthrough. A silent drop is the ' +
          'failure mode the drop-whole rule exists to prevent.'
  );
  p33Assert(
    'a "schema": 1 file may not carry the field',
    p33.refuseSchema1.dropped &&
      namesField(p33.refuseSchema1) &&
      typeof p33.refuseSchema1.message === 'string' &&
      p33.refuseSchema1.message.includes('2'),
    p33.refuseSchema1.field ?? 'no problem named the field',
    !p33.refuseSchema1.dropped
      ? 'a file that says "schema": 1 carried launch.envPassthrough and the row was merged ' +
          'anyway. A new field arrives as schema 2 with a converter, never as a block bolted ' +
          'onto version 1.'
      : 'the row was dropped without an error naming the field and the schema number to move ' +
          'to. The person cannot fix a file when the error does not say what to change.'
  );
}

// ---------------------------------------------------------------------------
// Section 7 — the settings route to a shell variable name (Phase 269)
// ---------------------------------------------------------------------------
//
// Phase 33, in section 5 above, built the mechanism and left it unreachable:
// no compiled row sets `launch.envPassthrough` and the only route to it was an
// `agents.json` file most people do not have. Phase 269 added the second
// route, being Settings then Launch defaults. This section holds the SHAPE
// half of it, which is everything a node process can reach: the refusal, the
// sanitizer the settings store calls, the union the launch path reads, and the
// promise that no compiled row has quietly started naming a variable.
//
// The seal itself needs `safeStorage` and therefore an Electron process, so it
// belongs to `src/main/settings/__tests__/p269-env-seal.test.ts` and to
// `probe:p269`, exactly as the confirm gate belongs to the Tier 3 verifier.
//
// Every denylist row is DERIVED from the exported arrays, so a name added to a
// denylist later is covered here with no edit to this file.

const p269 = data.p269 ?? {
  state: 'absent',
  missing: 'the probe printed no p269 section'
};
const p269Rows = [];

const p269Assert = (name, ok, note, why) => {
  p269Rows.push({ name, ok, note: note ?? '' });
  if (!ok) fail(`the settings route, ${name}: ${why}`);
};

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (p269.state !== 'present') {
  skipped.push(
    'the settings route to a shell variable name (Phase 269) has not landed, so the ' +
      'refusal, the sanitizer, the union and the "no compiled row names one" promise ' +
      `were NOT checked. ${p269.missing ?? ''}`
  );
} else {
  // 1. Every denied name earns a sentence, derived from the three arrays.
  const unsentenced = p269.denied.filter(
    (row) => typeof row.sentence !== 'string' || row.sentence.length === 0
  );
  p269Assert(
    'every denylisted name is refused with a sentence',
    unsentenced.length === 0,
    `${p269.denied.length} names probed`,
    `${unsentenced.map((r) => r.name).join(', ')} passed the refusal, so a name on a ` +
      'denylist could be added through Settings. The rows are derived from ' +
      'ENV_REFUSED_EXACT, ENV_REFUSED_PATTERNS and ENV_PASSTHROUGH_REFUSED, so a new ' +
      'entry is covered here without an edit.'
  );

  // 2. A usable name is accepted and a malformed one is not.
  const wronglyRefused = p269.accepted.filter((r) => r.sentence !== null);
  const wronglyAccepted = p269.malformed.filter((r) => r.sentence === null);
  p269Assert(
    'a usable name passes and a malformed one does not',
    wronglyRefused.length === 0 && wronglyAccepted.length === 0,
    `${p269.accepted.length} accepted, ${p269.malformed.length} refused`,
    wronglyRefused.length > 0
      ? `${wronglyRefused.map((r) => r.name).join(', ')} was refused, and a person whose ` +
          'own shell exports it would have no way to name it. A lower case name is a ' +
          'usable one: the pattern both routes read has always admitted it.'
      : `${wronglyAccepted.map((r) => JSON.stringify(r.name)).join(', ')} was accepted, ` +
          'and a name that is not a name reaches a shell script interpolation.'
  );

  // 3. The cap, driven exactly at its edge.
  p269Assert(
    'the sixteenth name is accepted and the seventeenth is not',
    p269.cap.limit === 16 &&
      p269.cap.sixteenth.sentence === null &&
      typeof p269.cap.seventeenth.sentence === 'string',
    `cap ${p269.cap.limit}`,
    p269.cap.limit !== 16
      ? `the cap moved to ${p269.cap.limit}, and the sentence a person reads still says ` +
          'sixteen.'
      : p269.cap.sixteenth.sentence !== null
        ? 'the sixteenth name was refused, so the cap bites one name early.'
        : 'the seventeenth name was accepted, so the cap does not bite at all.'
  );

  // 4. A duplicate, and the agent's OWN compiled variable. The cursor row is
  // asserted non-empty first, so this cannot go vacuous if that row ever loses
  // its `launch.env`.
  p269Assert(
    "a duplicate and the agent's own compiled variable are refused",
    p269.own.cursorEnvKeys.length > 0 &&
      typeof p269.own.duplicate.sentence === 'string' &&
      typeof p269.own.ownKey.sentence === 'string' &&
      p269.own.ownKeyOnAnotherAgent.sentence === null,
    `cursor sets ${p269.own.cursorEnvKeys.join(', ') || 'nothing'}`,
    p269.own.cursorEnvKeys.length === 0
      ? 'the cursor row sets no launch.env, so this assertion would have passed without ' +
          'checking anything. Point it at a row that does.'
      : p269.own.duplicate.sentence === null
        ? 'a name already on the list was accepted a second time.'
        : p269.own.ownKey.sentence === null
          ? 'a name the agent already sets itself was accepted, so an env-unresolved ' +
              'notice could say a pane started WITHOUT a variable the pane has.'
          : "the same name was refused for an agent that does NOT set it, so the check is " +
              'reading a global list rather than this agent.'
  );

  // 5. The sanitizer the settings store calls.
  const sz = p269.sanitized;
  const sanitizerOk =
    sameList(sz.unknownId, {}) &&
    sameList(sz.notAnArray, {}) &&
    sameList(sz.notAnObject, {}) &&
    sameList(sz.nullish, {}) &&
    sameList(sz.nonStringEntry, { claude: ['P269_A'] }) &&
    sameList(sz.refusedNames, { claude: ['P269_A', 'P269_B'] }) &&
    sameList(sz.ownKey, {}) &&
    sameList(sz.order, { claude: ['P269_Z', 'P269_A', 'P269_M'] }) &&
    Array.isArray(sz.overCap.claude) &&
    sz.overCap.claude.length === 16;
  p269Assert(
    'the sanitizer drops the bad and keeps the good, in order',
    sanitizerOk,
    `over-cap list kept ${Array.isArray(sz.overCap.claude) ? sz.overCap.claude.length : '?'}`,
    'sanitizeEnvPassthrough is what stands between a hand-edited settings.json and the ' +
      'shape the seal is then asked about. It must drop an unknown id, a non array, a ' +
      'non string entry and every refused name, keep the rest IN ORDER, stop at sixteen, ' +
      `and never throw. It answered ${JSON.stringify(sz)}.`
  );

  // 6. The union the launch path reads.
  const u = p269.union;
  const unionOk =
    u.bothEmpty === null &&
    u.bothEmptyLists === null &&
    sameList(u.rowOnly, ['P269_ROW_A', 'P269_ROW_B']) &&
    sameList(u.settingsOnly, ['P269_ROW_B', 'P269_SET_A']) &&
    sameList(u.merged, ['P269_ROW_A', 'P269_ROW_B', 'P269_SET_A']) &&
    u.rowUnchanged &&
    u.settingsUnchanged;
  p269Assert(
    'the two routes union, row first, deduped, undefined for neither',
    unionOk,
    u.merged === null ? 'no union' : u.merged.join(' '),
    u.bothEmpty !== null || u.bothEmptyLists !== null
      ? 'two empty routes answered a list rather than undefined, so an agent nobody has ' +
          'configured would spawn a probe and write a record field it did not before.'
      : !u.rowUnchanged || !u.settingsUnchanged
        ? 'the union edited one of its inputs, which are the stored settings and the ' +
            'merged agent row.'
        : `the union came back ${JSON.stringify(u.merged)}. It must be the row's names ` +
            "first, then the person's, with a name both name appearing once."
  );

  // 7. No compiled row names a variable. The Phase 33 promise, held over the
  // whole table so it survives the arrival of a second route.
  p269Assert(
    'no compiled registry row sets launch.envPassthrough',
    p269.compiledNamers.length === 0,
    `${data.compiledRows} rows scanned`,
    `${p269.compiledNamers.join(', ')} names a variable in the COMPILED table. Which ` +
      "variables an agent needs is a fact about one person's machine, so it is named by " +
      'that person, in Settings or in agents.json, and never shipped on by default.'
  );
}

// 8. Every catalog view carries `envKeys`, equal to that agent's compiled row.
const p269cat = data.p269Catalog ?? { state: 'absent', missing: 'no section printed' };
if (p269cat.state === 'absent') {
  skipped.push(
    'the flag catalog views were NOT checked for envKeys (Phase 269): ' +
      `${p269cat.missing}.`
  );
} else if (p269cat.state === 'broken') {
  fail(`composing the flag catalog views threw: ${p269cat.error}.`);
} else {
  const wrong = p269cat.rows.filter((r) => !sameList(r.envKeys, r.expected));
  p269Assert(
    'every flag catalog view carries its compiled env keys',
    wrong.length === 0,
    `${p269cat.rows.length} catalogs`,
    `${wrong
      .map((r) => `${r.id} carries ${JSON.stringify(r.envKeys)} rather than ${JSON.stringify(r.expected)}`)
      .join('; ')}. The Settings window says "this agent already sets FORCE_COLOR itself" ` +
      'from this field, so a wrong one is a sentence a person cannot act on.'
  );
}

// ---------------------------------------------------------------------------
// Section 6 — the version probe is unreachable from the create path (Phase 49)
// ---------------------------------------------------------------------------
//
// The probe composed the full create-path spec for every launchable agent
// before it read these two values. A create can never start a version probe
// and can never wait on one; these two lines are what keep that sentence
// executable rather than asserted.

const pb = data.probeBudget ?? null;
if (pb === null) {
  fail(
    'the probe printed no probeBudget section, so "the version probe is ' +
      'unreachable from the create path" was not checked.'
  );
} else {
  if (pb.versionProbeCount !== 0) {
    fail(
      `composing the create-path spec ran ${pb.versionProbeCount} version ` +
        'probe(s). The create path must never start one.'
    );
  }
  if (pb.scanResolved) {
    fail(
      'composing the create-path spec left a resolved detection scan behind, ' +
        'so something on that path started a scan.'
    );
  }
}

// ---------------------------------------------------------------------------
// The table, printed whatever the verdict, because the point is that a person
// can read it.
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padEnd(width);
const tick = (ok) => (ok ? 'yes' : 'NO');

process.stdout.write(
  '\nagent                    origin    capture         strategy      row=argv  roundtrip  ' +
    'cwd=row  extras\n'
);
process.stdout.write('-'.repeat(107) + '\n');
const rows = [...data.agents];
if (seam.state === 'present' && seam.report !== null) rows.push(seam.report);
for (const a of rows) {
  process.stdout.write(
    `${pad(a.id, 24)} ${pad(a.origin, 9)} ${pad(a.idCapture, 15)} ${pad(a.resumeStrategy, 13)} ` +
      `${pad(tick(a.resumeAgrees), 9)} ${pad(tick(a.contractRoundTrips), 10)} ` +
      `${pad(tick(a.cwdBasisIsRow), 8)} ${a.resumeExtrasPosition}\n`
  );
}

process.stdout.write(
  `\n${data.compiledRows} compiled registry rows, ${data.agents.length} of them launchable. ` +
    `Every recovery contract carries ${referenceKeys.length} fields.\n`
);
process.stdout.write(
  `renderer: seed of ${r.seed.length}, and a scan of ${r.offeredIds.length - 1} launchable ` +
    `agents including one the registry does not contain.\n`
);
process.stdout.write(`overlay loader: ${seam.state} (${seam.specifier}).\n`);
if (pb !== null && pb.versionProbeCount === 0 && !pb.scanResolved) {
  process.stdout.write(
    'the version probe is unreachable from the create path: 0 probes ran and no scan started.\n'
  );
}

process.stdout.write('\nenv passthrough (Phase 33)\n');
process.stdout.write('-'.repeat(107) + '\n');
if (p33Rows.length === 0) {
  process.stdout.write(`  not checked: the section reported ${p33.state}.\n`);
} else {
  for (const row of p33Rows) {
    process.stdout.write(`${pad(row.name, 46)} ${pad(tick(row.ok), 4)} ${row.note}\n`);
  }
  process.stdout.write(
    `\nthe configured names are ${p33.names.join(' and ')}. The sentinel value is ` +
      `${p33.sentinel.length} bytes, it was found in the pane environment, and it was found in ` +
      'no byte of the manifest record.\n'
  );
}

process.stdout.write('\nthe settings route to a shell variable name (Phase 269)\n');
process.stdout.write('-'.repeat(107) + '\n');
if (p269Rows.length === 0) {
  process.stdout.write(`  not checked: the section reported ${p269.state}.\n`);
} else {
  for (const row of p269Rows) {
    process.stdout.write(`${pad(row.name, 60)} ${pad(tick(row.ok), 4)} ${row.note}\n`);
  }
  process.stdout.write(
    `\n${p269.denied.length} denylisted names were derived from the three exported arrays ` +
      'and every one of them was refused with a sentence. No value was read, resolved or ' +
      'printed at any point: this section spawns nothing.\n'
  );
}

if (skipped.length > 0) {
  process.stdout.write(`\nSKIPPED, ${skipped.length}:\n`);
  for (const note of skipped) process.stdout.write(`  - ${note}\n`);
}

if (failures.length > 0) {
  process.stdout.write(`\nFAIL, ${failures.length}:\n`);
  for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
  process.exit(1);
}

process.stdout.write(
  '\nPASS. Every launchable agent restores from its manifest row alone, and an agent that ' +
    'exists only in a scan reaches the picker.\n'
);
