/**
 * `envPassthroughFor` — the routes to a shell variable name (Phase 269, a third
 * route added in Phase 275).
 *
 * Phase 33 built one route, being an `agents.json` row that passes the confirm
 * gate. Phase 269 added the second, being Settings then Launch defaults, which
 * is the one a person with no such file can reach. Phase 275 added the third,
 * being the list that reaches EVERY agent, which is the shape an API key
 * actually has: one DeepSeek key is the same key whichever agent talks to
 * DeepSeek. A launch reads the UNION, because somebody who set more than one of
 * them meant all of them, and no route shadows another.
 *
 * The `undefined` answer is the load-bearing one: it is what keeps an agent
 * nobody has configured byte for byte what it was before Phase 269, spawning
 * no probe and writing no record field. Phase 275 leans on it again —
 * `envPassthroughShared` defaults to [], so a fresh install still spawns no
 * login shell on any launch.
 *
 * THE ORDER IS PINNED HERE BECAUSE IT IS A PROMISE TO EVERY EXISTING USER.
 * Phase 275 put the third source ON THE END so that a person who has a row and
 * a per-agent list gets the identical list in the identical order they got at
 * the parent — no argv order, no manifest row and no notice list moves for
 * somebody who never uses the shared list.
 */

import { describe, expect, it } from 'vitest';
import { envPassthroughFor, paneEnvFor } from '../launch-plan';

const ROW = ['P269_ROW_A', 'P269_ROW_B'];
const SETTINGS = ['P269_SET_A'];
const SHARED = ['P275_SHARED_A'];

describe('envPassthroughFor', () => {
  it('answers undefined when all three are empty, so nothing is paid for', () => {
    expect(envPassthroughFor(undefined, undefined, undefined)).toBeUndefined();
    expect(envPassthroughFor([], [], [])).toBeUndefined();
    expect(envPassthroughFor([], undefined, [])).toBeUndefined();
    expect(envPassthroughFor(undefined, undefined, [])).toBeUndefined();
  });

  it('takes the row alone when neither settings list names anything', () => {
    expect(envPassthroughFor(ROW, undefined, undefined)).toEqual(ROW);
  });

  it('takes the per-agent list alone when the other two name nothing', () => {
    expect(envPassthroughFor(undefined, SETTINGS, undefined)).toEqual(SETTINGS);
  });

  it('takes the shared list alone when the other two name nothing', () => {
    expect(envPassthroughFor(undefined, undefined, SHARED)).toEqual(SHARED);
  });

  it('unions them, row then per-agent then shared', () => {
    expect(envPassthroughFor(ROW, SETTINGS, SHARED)).toEqual([
      ...ROW,
      ...SETTINGS,
      ...SHARED
    ]);
  });

  it('leaves the first two sources in the order they had at the parent', () => {
    // The promise to a person who never uses the shared list: adding a third
    // source moves nothing about the first two.
    expect(envPassthroughFor(ROW, SETTINGS, undefined)).toEqual([
      ...ROW,
      ...SETTINGS
    ]);
    expect(envPassthroughFor(ROW, SETTINGS, [])).toEqual([...ROW, ...SETTINGS]);
  });

  it('dedupes a name two routes name, keeping the row position', () => {
    expect(
      envPassthroughFor(ROW, ['P269_ROW_B', 'P269_SET_A'], undefined)
    ).toEqual(['P269_ROW_A', 'P269_ROW_B', 'P269_SET_A']);
  });

  it('dedupes a name the shared list repeats, keeping the earlier position', () => {
    expect(
      envPassthroughFor(ROW, SETTINGS, ['P269_ROW_A', 'P275_SHARED_A'])
    ).toEqual([...ROW, ...SETTINGS, 'P275_SHARED_A']);
  });

  it('mutates none of its inputs', () => {
    const row = [...ROW];
    const settings = [...SETTINGS];
    const shared = [...SHARED];
    envPassthroughFor(row, settings, shared);
    expect(row).toEqual(ROW);
    expect(settings).toEqual(SETTINGS);
    expect(shared).toEqual(SHARED);
  });

  it('answers a fresh array each time, so a caller cannot edit a stored list', () => {
    const first = envPassthroughFor(ROW, SETTINGS, SHARED);
    const second = envPassthroughFor(ROW, SETTINGS, SHARED);
    expect(first).not.toBe(second);
    expect(first).not.toBe(ROW);
  });

  it('is uncapped, because the cap belongs to the doors and not to the union', () => {
    // Three doors of sixteen. This function spells no number, and spelling one
    // here would need an import the module may not have.
    const many = (p: string): string[] =>
      Array.from({ length: 16 }, (_v, i) => `${p}${i}`);
    expect(envPassthroughFor(many('R'), many('S'), many('H'))).toHaveLength(48);
  });
});

/**
 * The merge under it does not move (Phase 269).
 *
 * `paneEnvFor` is the ONE merge rule and it is untouched by this phase. What
 * is asserted here is that the names route reaching it changes nothing about
 * the order: a resolved passthrough value outranks the agent row's own
 * `launch.env`, and the GMUX stamps still go last and therefore still win, so
 * a pane can never carry another session's identity because somebody named a
 * variable.
 */
describe('the GMUX stamps still win over a passthrough value', () => {
  it('puts the resolved value on the pane and keeps the stamp Tortie set', () => {
    const merged = paneEnvFor(
      { P269_NAMED: 'from-the-agent-row', GMUX_SESSION_ID: 'not-this-one' },
      { P269_NAMED: 'from-the-login-shell' },
      'p269-session-id',
      {}
    );
    expect(merged['P269_NAMED']).toBe('from-the-login-shell');
    expect(merged['GMUX_SESSION_ID']).toBe('p269-session-id');
    expect(merged['GMUX_MANAGED']).toBe('1');
  });
});
