/**
 * Phase 267 — New File in a COMPLETELY EMPTY project (GitHub issue 22).
 *
 * ## Why this file reads source text rather than driving a tree
 *
 * The bug lived in the coupling between the render and the inline-rename
 * adapter: when the project root was empty, FileTree rendered a `section-stub`
 * line INSTEAD OF @pierre/trees, so the shadow-DOM adapter was never mounted,
 * `renameView()` was null, and `newEntry` refused with the toast issue 22
 * reports. The fix mounts the tree unconditionally and draws the empty line as
 * a sibling HINT that steps aside for a pending create. That coupling cannot be
 * exercised here — the node test environment has no shadow DOM and does not
 * mount @pierre/trees (see p127-tree-hooks.test.ts) — so this pins the render
 * and wiring as source, and the live proof is probe:p267.
 *
 * Each assertion is RED at the parent commit (14279ae9) and green after.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name: string): string =>
  readFileSync(join(HERE, '..', name), 'utf8');

const component = read('FileTree.tsx');
const rename = read('use-tree-rename.ts');
const css = read('tree.css');

describe('the tree is mounted unconditionally, even at zero rows', () => {
  it('the old empty-stub-FOR-tree swap is gone', () => {
    // The parent shape: `rootEmpty ... ? <div section-stub> ... : ( <PierreTree`.
    expect(component).not.toMatch(
      /rootEmpty[^?]*\?[\s\S]{0,120}section-stub[\s\S]*?<PierreTree/
    );
  });

  it('PierreTree is mounted once and is not the false-arm of a ternary', () => {
    expect(component.match(/<PierreTree/g)?.length).toBe(1);
    // At the parent, `<PierreTree` is the `) : (` arm of the rootEmpty ternary.
    expect(component).not.toMatch(/\)\s*:\s*\(\s*<PierreTree/);
  });

  it('FileTree renders no section-stub of its own any more', () => {
    // Other sidebar sections still use .section-stub; the tree no longer does.
    expect(component).not.toContain('section-stub');
  });
});

describe('the empty hint is gated on the create-pending guard', () => {
  it('the hint condition names createPending, so a create is never covered', () => {
    expect(component).toMatch(/rootEmpty[\s\S]{0,60}!\s*createPending/);
  });

  it('the hint uses its own sibling class, not the full-height stub', () => {
    expect(component).toContain('files-tree-empty');
  });

  it('the container gets the is-empty modifier under the same condition', () => {
    expect(component).toContain("(emptyHint ? ' is-empty' : '')");
  });
});

describe('the create-pending guard is real and reactive', () => {
  it('use-tree-rename declares the state', () => {
    expect(rename).toContain(
      'const [createPending, setCreatePending] = useState(false);'
    );
  });

  it('and returns it alongside the other two results', () => {
    expect(rename).toContain(
      'return { opsCreated, nameError, createPending };'
    );
  });

  it('and drives it off the pending placeholder inside a model.subscribe', () => {
    const set = 'setCreatePending(opsRef.current?.pendingPath() != null);';
    expect(rename).toContain(set);
    // It is set inside the model.subscribe callback (not only synchronously),
    // so the flag falls again when the placeholder is settled or removed.
    const subAt = rename.indexOf('model.subscribe(() => {');
    expect(subAt).toBeGreaterThan(-1);
    const returnAt = rename.indexOf('return unsubscribe;', subAt);
    const setInside = rename.indexOf(set, subAt);
    expect(setInside).toBeGreaterThan(subAt);
    expect(setInside).toBeLessThan(returnAt);
  });
});

describe('the hint class exists in tree.css with token-only styling', () => {
  it('both classes are present', () => {
    expect(css).toContain('.files-tree-empty');
    expect(css).toContain('.files-tree.is-empty');
  });

  it('the .files-tree-empty block has no raw color or length literal', () => {
    const start = css.indexOf('.files-tree-empty {');
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf('}', start);
    const block = css.slice(start, end);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,}/); // no hex color
    expect(block).not.toMatch(/\brgb/); // no rgb()/rgba()
    expect(block).not.toMatch(/\b\d*\.?\d+(px|em|rem)\b/); // no length literal
    // It DOES paint through tokens.
    expect(block).toContain('var(--text-muted)');
  });
});
