/**
 * `envPassthroughFor` — the two routes to a shell variable name (Phase 269).
 *
 * Phase 33 built one route, being an `agents.json` row that passes the confirm
 * gate. Phase 269 added the second, being Settings then Launch defaults, which
 * is the one a person with no such file can reach. A launch reads the UNION,
 * because somebody who set both meant both, and neither route shadows the
 * other.
 *
 * The `undefined` answer is the load-bearing one: it is what keeps an agent
 * nobody has configured byte for byte what it was before this phase, spawning
 * no probe and writing no record field.
 */

import { describe, expect, it } from 'vitest';
import { envPassthroughFor, paneEnvFor } from '../launch-plan';

const ROW = ['P269_ROW_A', 'P269_ROW_B'];
const SETTINGS = ['P269_SET_A'];

describe('envPassthroughFor', () => {
  it('answers undefined when both are empty, so nothing is paid for', () => {
    expect(envPassthroughFor(undefined, undefined)).toBeUndefined();
    expect(envPassthroughFor([], [])).toBeUndefined();
    expect(envPassthroughFor([], undefined)).toBeUndefined();
  });

  it('takes the row alone when Settings names nothing', () => {
    expect(envPassthroughFor(ROW, undefined)).toEqual(ROW);
  });

  it('takes Settings alone when the row names nothing', () => {
    expect(envPassthroughFor(undefined, SETTINGS)).toEqual(SETTINGS);
  });

  it('unions them, row first', () => {
    expect(envPassthroughFor(ROW, SETTINGS)).toEqual([...ROW, ...SETTINGS]);
  });

  it('dedupes a name both routes name, keeping the row position', () => {
    expect(envPassthroughFor(ROW, ['P269_ROW_B', 'P269_SET_A'])).toEqual([
      'P269_ROW_A',
      'P269_ROW_B',
      'P269_SET_A'
    ]);
  });

  it('mutates neither input', () => {
    const row = [...ROW];
    const settings = [...SETTINGS];
    envPassthroughFor(row, settings);
    expect(row).toEqual(ROW);
    expect(settings).toEqual(SETTINGS);
  });

  it('answers a fresh array each time, so a caller cannot edit a stored list', () => {
    const first = envPassthroughFor(ROW, SETTINGS);
    const second = envPassthroughFor(ROW, SETTINGS);
    expect(first).not.toBe(second);
    expect(first).not.toBe(ROW);
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
