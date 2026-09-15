/**
 * Phase 271 fix-round probe. Pure. Imports the shipping registry and the
 * shipping consumers, spawns nothing, reads nothing under a home directory.
 */
import { AGENT_REGISTRY } from '../../src/main/agents/registry.ts';
import { DEFAULT_IMAGE_DROP } from '../../src/shared/agent-defaults.ts';

const rows = AGENT_REGISTRY.map((e: any) => ({
  id: e.id,
  displayName: e.displayName,
  kind: e.kind,
  launchable: e.launchable,
  dropDeclared: e.imageDrop !== undefined,
  strategy: e.imageDrop?.strategy ?? DEFAULT_IMAGE_DROP.strategy,
  insert: e.imageDrop?.insert ?? DEFAULT_IMAGE_DROP.insert,
  dropVerified: e.imageDrop?.verified ?? DEFAULT_IMAGE_DROP.verified,
  specstoryDeclared: e.specstory !== undefined,
  specstoryProvider: e.specstory === undefined ? '(no field)' : String(e.specstory.provider),
  specstoryVerified: e.specstory?.verified ?? '(none)',
  fidelity: e.specstory?.exitCodeFidelity ?? '(none)',
  activityTier: e.activity?.tier ?? '(none)',
  animatesWhenIdle: e.activity?.animatesWhenIdle ?? '(none)',
  native: e.activity?.native ?? '(none)',
  idCapture: e.resume?.idCapture?.mode ?? '(none)',
  idConfidence: e.resume?.idCapture?.confidence ?? '(none)',
  flagPresets: e.flagPresets === undefined ? 'undefined' : 'PRESENT'
}));

console.log('=== rows:', rows.length);
console.log('=== DEFAULT_IMAGE_DROP:', JSON.stringify(DEFAULT_IMAGE_DROP));
console.log('\n=== imageDrop, every row ===');
for (const r of rows) {
  console.log(
    r.id.padEnd(12),
    'declared=' + String(r.dropDeclared).padEnd(6),
    'strategy=' + String(r.strategy).padEnd(18),
    'insert=' + String(r.insert).padEnd(8),
    'verified=' + String(r.dropVerified)
  );
}
console.log('\n=== specstory.provider vs own id ===');
for (const r of rows) {
  const same = r.specstoryDeclared && r.specstoryProvider === r.id;
  console.log(
    r.id.padEnd(12),
    'provider=' + r.specstoryProvider.padEnd(14),
    'identity=' + String(same).padEnd(6),
    'verified=' + String(r.specstoryVerified).padEnd(12),
    'fidelity=' + String(r.fidelity)
  );
}
console.log('\n=== flagPresets / activity.tier ===');
for (const r of rows) {
  console.log(
    r.id.padEnd(12),
    'flagPresets=' + r.flagPresets.padEnd(10),
    'tier=' + String(r.activityTier).padEnd(9),
    'native=' + String(r.native).padEnd(26),
    'animatesWhenIdle=' + String(r.animatesWhenIdle)
  );
}
