/**
 * PHASE 282. THE FAKE MAIN the phase's three rigs press against, and the gates
 * that choose the interleaving.
 *
 * It was written three times in the parallel round — `p282-one-press.test.ts`
 * and `p282-view-presses.test.ts` by one builder, `p282-typing-rig.ts` by
 * another — as the same twenty-five lines: a counted `readFile`, a sha256
 * compare-and-swap `writeGuarded`, and a promise per step that a test lets go
 * by name. The integrator extracted it so the compare-and-swap main really
 * performs has ONE spelling in this phase's tests.
 *
 * What stays in the calling file, on purpose:
 *
 *   - `vi.stubGlobal('window', …)` itself. The three need different documents,
 *     different listeners and different globals around the bridge, so each
 *     spreads `gmuxBridge(…)` into a `window` of its own.
 *   - How a held step is LET GO. `p282-one-press.test.ts` polls, because it
 *     drives the presses directly and a step it names may not have been
 *     reached yet; the two that mount React let it go inside `act`, so the
 *     render the continuation causes is flushed before the assertion.
 */

export interface GatedStep {
  readonly label: string;
  readonly release: () => void;
}

export interface GatedFs {
  /** The file, as main sees it. `writes` counts the writes that LANDED. */
  readonly disk: { text: string; writes: number };
  /** Every read that has been asked for, whether or not it has answered. */
  readonly reads: number;
  /** Every write that has been asked for, including the ones refused stale. */
  readonly writes: number;
  /** The steps waiting at a gate, oldest first. */
  readonly gates: GatedStep[];
  /** Suspend these steps when they come, by the names `read#1`, `write#2`, … */
  hold: (...labels: string[]) => void;
  /** Take a waiting step off the queue by name; null when it has not arrived. */
  take: (label: string) => (() => void) | null;
  /** What is waiting now, for an error message that names it. */
  waiting: () => string;
  /** Start again over `text`: no reads, no writes, nothing held, nothing waiting. */
  reset: (text: string) => void;
  /** The `fs` half of `window.gmux`, to spread into the caller's own stub. */
  readonly fs: {
    readFile: () => Promise<{ contents: string; truncated: boolean }>;
    writeGuarded: (input: { expect: string; contents: string }) => Promise<
      | { outcome: 'wrote'; sha256: string; bytes: number }
      | { outcome: 'stale'; sha256: string; reason: string }
    >;
  };
}

/**
 * A fake main over one file. With `holdEvery`, every read and write suspends
 * and must be named to go on — which is how `p282-one-press.test.ts` chooses
 * the order of two presses. Without it, only the steps `hold()` names suspend,
 * so a rig can drive a whole mount and hold the one write it is attacking.
 *
 * `digest` is the caller's own sha256 of a string, because this module is in
 * the renderer's test lane and the hash belongs to the file that already has one.
 */
export function gatedFs(digest: (text: string) => string, options: { holdEvery?: boolean } = {}): GatedFs {
  const disk = { text: '', writes: 0 };
  const gates: GatedStep[] = [];
  const held = new Set<string>();
  let reads = 0;
  let writes = 0;
  const gate = (label: string): Promise<void> =>
    options.holdEvery === true || held.has(label)
      ? new Promise<void>((release) => {
          gates.push({ label, release });
        })
      : Promise.resolve();

  return {
    disk,
    get reads() {
      return reads;
    },
    get writes() {
      return writes;
    },
    gates,
    hold: (...labels: string[]) => {
      for (const label of labels) held.add(label);
    },
    take: (label: string) => {
      const at = gates.findIndex((g) => g.label === label);
      if (at === -1) return null;
      const [step] = gates.splice(at, 1);
      return step?.release ?? null;
    },
    waiting: () => gates.map((g) => g.label).join(','),
    reset: (text: string) => {
      reads = 0;
      writes = 0;
      disk.text = text;
      disk.writes = 0;
      gates.length = 0;
      held.clear();
    },
    fs: {
      readFile: async () => {
        reads += 1;
        await gate(`read#${String(reads)}`);
        return { contents: disk.text, truncated: false };
      },
      writeGuarded: async (input: { expect: string; contents: string }) => {
        writes += 1;
        await gate(`write#${String(writes)}`);
        const now = digest(disk.text);
        // The compare-and-swap main performs: the loser of two writes is
        // refused rather than overwriting the winner (Phase 282 §1.2).
        if (now !== input.expect) return { outcome: 'stale' as const, sha256: now, reason: 'changed since it was read' };
        disk.text = input.contents;
        disk.writes += 1;
        return { outcome: 'wrote' as const, sha256: digest(input.contents), bytes: input.contents.length };
      }
    }
  };
}

/**
 * `window.gmux` for a rig: the gated `fs` above, plus the neighbours every one
 * of the three touches while the editor store mounts — the two position
 * setters, `git` and `baselines`. `extra` merges over each half, which is how a
 * rig adds `readDir`, refuses the plain write door, or answers a HEAD of its
 * own.
 */
export function gmuxBridge(
  main: GatedFs,
  extra: { fs?: Record<string, unknown>; git?: Record<string, unknown>; rest?: Record<string, unknown> } = {}
): Record<string, unknown> {
  return {
    setSessionsPosition: async () => {},
    setProjectsPosition: async () => {},
    fs: { ...main.fs, ...extra.fs },
    git: { showHead: async () => '', onChanged: () => () => {}, ...extra.git },
    baselines: { store: async () => ({ stored: false }), load: async () => null, forget: async () => undefined },
    ...extra.rest
  };
}
