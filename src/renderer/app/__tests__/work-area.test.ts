/**
 * The work area's STRUCTURAL invariants (Phase 18 item 3).
 *
 * These are source-level assertions on purpose. What they guard cannot be
 * observed in a unit test — the renderer here is Electron with a real xterm —
 * and it is expensive to get wrong:
 *
 *  - if either wrapper is ever made conditional (the obvious temptation, since
 *    the strip inside it only exists in one orientation), React re-keys the
 *    subtree on every orientation switch, xterm tears down, and every visible
 *    pane recreates its WebGL context;
 *  - the drag engine hit-tests the strip through `[data-slot="session-strip"]`
 *    and the terminal through `[data-slot="terminal-stack"]`
 *    (src/renderer/app/split/surface-dnd.ts). Moving the strip's markup
 *    without those attributes silently kills tab reorder and drag-to-split;
 *  - a width TRANSITION anywhere in the work row is a stream of
 *    ResizeObserver fits and therefore a stream of tmux resizes of live work.
 *
 * PHASE 284 made `.work-area` the FRAME, the one region that wears a complete
 * outline, and the second describe block below holds the four things about it
 * that are cheap to break and invisible until a terminal is on screen: the
 * outline is an overlay that takes no pointer and no pixel from the work, the
 * frame itself never clips (it would clip its own line), its children clip
 * with `clip` and never `hidden`, and every number it uses is a token.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(__dirname, '..');
const read = (name: string): string =>
  readFileSync(join(APP_DIR, name), 'utf8');

const appSource = read('App.tsx');
/**
 * The shell body, with JSX comments removed — the layout comment inside it
 * quotes the very element names these assertions look for.
 */
const app = appSource
  .slice(appSource.indexOf('<div className="shell-body">'))
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const terminalRegion = read('TerminalRegion.tsx');
const sessionStrip = read('SessionStrip.tsx');
const css = read('work-area.css');

/** The line an element opens on, trimmed. */
function lineWith(source: string, needle: string): string {
  const line = source.split('\n').find((l) => l.includes(needle));
  expect(line, `expected to find ${needle}`).toBeDefined();
  return (line ?? '').trim();
}

describe('work area structure', () => {
  it('renders the column wrapper above the terminal+editor row', () => {
    const area = app.indexOf('<div className="work-area"');
    const row = app.indexOf('<div className="work-row">');
    const region = app.indexOf('<TerminalRegion />');
    const editor = app.indexOf('<EditorPanelLazy />');
    expect(area).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(area);
    expect(region).toBeGreaterThan(row);
    expect(editor).toBeGreaterThan(region);
  });

  it('renders BOTH wrappers unconditionally — a conditional one remounts xterm', () => {
    for (const needle of [
      '<div className="work-area"',
      '<div className="work-row">',
      '<TerminalRegion />',
      '<EditorPanelLazy />'
    ]) {
      const line = lineWith(app, needle);
      expect(line, `${needle} must not be conditional`).not.toMatch(/\?|&&/);
    }
  });

  it('makes the session strip the only orientation-dependent child', () => {
    const between = app.slice(
      app.indexOf('<div className="work-area"'),
      app.indexOf('<div className="work-row">')
    );
    expect(between).toContain("orientation === 'top' ? <SessionStrip /> : null");
  });

  it('keeps the drag engine’s two hit-test slots where it looks for them', () => {
    // src/renderer/app/split/surface-dnd.ts hit-tests exactly these.
    expect(sessionStrip).toContain('data-slot="session-strip"');
    expect(sessionStrip).toContain('className="stab-list"');
    expect(terminalRegion).toContain('data-slot="terminal-stack"');
  });

  it('leaves the tab strip out of the terminal region entirely', () => {
    // The whole point of the hoist: no band of the strip's kind may be
    // rendered inside the region the editor is a sibling of.
    expect(terminalRegion).not.toContain('session-strip');
    expect(terminalRegion).not.toContain('stab-list');
    expect(terminalRegion).not.toContain('SessionTabStrip');
  });

  it('animates nothing in the work area (a fit per frame is a tmux resize per frame)', () => {
    expect(css).not.toMatch(/transition|animation/);
  });

  it('gives the work row a containing block for the fill and overlay editors', () => {
    expect(css).toMatch(/\.work-row\s*\{[^}]*position:\s*relative/);
  });
});

// ---------------------------------------------------------------------------
// The frame (Phase 284)
// ---------------------------------------------------------------------------

/** The stylesheet with every comment removed. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the ONE rule whose whole selector is `selector`. */
function bodyOf(selector: string): string {
  const bodies: string[] = [];
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = (m[1] ?? '')
      .replace(/@import[^;]*;/g, '')
      .trim()
      .replace(/\s+/g, ' ');
    if (sel === selector) bodies.push(m[2] ?? '');
  }
  expect(bodies, `exactly one rule for "${selector}"`).toHaveLength(1);
  return bodies[0] ?? '';
}

/** Declarations as `property` to `value`, both trimmed. */
function decls(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const decl of body.split(';')) {
    const at = decl.indexOf(':');
    if (at === -1) continue;
    out.set(decl.slice(0, at).trim(), decl.slice(at + 1).trim());
  }
  return out;
}

describe('the work’s frame (Phase 284)', () => {
  it('pulls the frame’s three numbers in as its FIRST statement', () => {
    // An @import that follows any rule is dropped by the CSS parser, silently,
    // and every var() below it would then be invalid at computed-value time:
    // no radius, no gutter and no line, with nothing red to say so.
    expect(bare.trimStart().startsWith("@import './frame-geometry.css';")).toBe(
      true
    );
    expect(bare.match(/@import/g)).toHaveLength(1);
  });

  it('draws the outline as an overlay that takes no pointer and sits OUTSIDE the box', () => {
    const line = decls(bodyOf('.work-area::after'));
    expect(line.get('content')).toBe("''");
    expect(line.get('position')).toBe('absolute');
    expect(line.get('pointer-events')).toBe('none');
    // A NEGATIVE inset: the line is in the first pixel of the gutter, so the
    // active tab's 2px accent and Phase 40's focused-split box, both on the
    // work's outermost pixel ring, are never under it.
    expect(line.get('inset')).toBe('calc(-1 * var(--frame-edge))');
    expect(line.get('border')).toBe(
      'var(--frame-edge) solid var(--border-strong)'
    );
    expect(line.get('border-radius')).toBe('var(--r-frame)');
    // One above the editor overlay, in the root stacking context.
    expect(line.get('z-index')).toBe('calc(var(--z-editor-overlay) + 1)');
  });

  it('never clips on the frame itself, which would clip the frame’s own line', () => {
    const frame = decls(bodyOf('.work-area'));
    expect([...frame.keys()].filter((p) => p.startsWith('overflow'))).toEqual(
      []
    );
    // The containing block for the line, and NOT a stacking context: a
    // z-index here would pull the editor overlay out of the root context.
    expect(frame.get('position')).toBe('relative');
    expect(frame.has('z-index')).toBe(false);
    // The inner radius and the canvas under the seam between the two arcs.
    expect(frame.get('border-radius')).toBe(
      'calc(var(--r-frame) - var(--frame-edge))'
    );
    expect(frame.get('background')).toBe('var(--bg-canvas)');
  });

  it('clips on the CHILDREN, with clip and never hidden', () => {
    // `hidden` makes a scroll container, and a browser scrolls one to reveal a
    // focused element. xterm's helper textarea follows the cursor.
    expect(decls(bodyOf('.work-area > *')).get('overflow')).toBe('clip');
    expect(bare).not.toMatch(/overflow(-[xy])?\s*:\s*hidden/);
    const first = decls(bodyOf('.work-area > :first-child'));
    expect(first.get('border-top-left-radius')).toBe('inherit');
    expect(first.get('border-top-right-radius')).toBe('inherit');
    const last = decls(bodyOf('.work-area > :last-child'));
    expect(last.get('border-bottom-left-radius')).toBe('inherit');
    expect(last.get('border-bottom-right-radius')).toBe('inherit');
  });

  it('opens the gutters as margins: right and bottom always, left beside a sidebar, top never', () => {
    expect(decls(bodyOf('.work-area')).get('margin')).toBe(
      '0 var(--frame-gap) var(--frame-gap) 0'
    );
    expect(
      decls(bodyOf("[data-slot='sidebar'] + .work-area")).get('margin-left')
    ).toBe('var(--frame-gap)');
    // No padding and no border on the frame: either one changes the box xterm
    // is laid out in, in both axes, and the line is an overlay so that it
    // costs the terminal nothing beyond the gap it sits in.
    const frame = decls(bodyOf('.work-area'));
    for (const prop of frame.keys()) {
      expect(prop, `.work-area declares ${prop}`).not.toMatch(
        /^(padding|border(?!-radius)|outline|box-shadow)/
      );
    }
  });

  it('writes no pixel length outside a comment, so the three tokens are the only numbers', () => {
    expect(bare).not.toMatch(/\d(px|rem|em)\b/);
  });
});
