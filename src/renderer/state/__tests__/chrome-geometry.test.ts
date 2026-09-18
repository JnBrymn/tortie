/**
 * The window-layout limits (Phase 18 items 1, 2, 4).
 *
 * These run on the `node` environment, so every function is called with an
 * EXPLICIT window width — which is also the point of the signatures: the live
 * window is an argument, never a hidden read.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_BAR_W,
  activityBarIsRow,
  activityBarRenderedWidth,
  APP_MIN_WINDOW_W,
  dockRenderedWidth,
  editorIsOverlay,
  FRAME_EDGE,
  FRAME_GAP,
  FRAME_RADIUS,
  FRAME_RESERVED_MAX,
  frameReservedWidth,
  projectRailForcedNarrow,
  projectsRenderedWidth,
  PROJECT_RAIL_COLLAPSED_W,
  PROJECT_RAIL_MIN_WINDOW_W,
  PROJECT_RAIL_W,
  SPLIT_MIN_WORK_AREA,
  terminalLayoutWidth,
  clampDockWidth,
  clampEditorWidth,
  clampSidebarWidth,
  DOCK_DEFAULT,
  DOCK_MAX,
  DOCK_MIN,
  DOCK_RAIL_W,
  dockMaxWidth,
  EDITOR_MIN,
  editorMaxWidth,
  sanitizeStoredWidth,
  SIDEBAR_DEFAULT,
  SIDEBAR_MIN,
  sidebarMaxWidth,
  TERMINAL_FLOOR,
  workAreaWidth
} from '../chrome-geometry';

describe('sidebarMaxWidth', () => {
  it('is half the LIVE window at every realistic size', () => {
    expect(sidebarMaxWidth(1280)).toBe(640);
    expect(sidebarMaxWidth(1440)).toBe(720);
    expect(sidebarMaxWidth(1920)).toBe(960);
    // The old hard cap. The whole complaint was that a 1440px window gave the
    // explorer 28% and never more.
    expect(sidebarMaxWidth(1440)).toBeGreaterThan(400);
  });

  it('moves with the window rather than sitting on a constant', () => {
    const widths = [1024, 1280, 1440, 1600, 1920, 2560];
    const maxes = widths.map((w) => sidebarMaxWidth(w));
    expect(new Set(maxes).size).toBe(widths.length);
    for (let i = 1; i < maxes.length; i += 1) {
      expect(maxes[i]!).toBeGreaterThan(maxes[i - 1]!);
    }
  });

  it("yields to the terminal's floor only in absurd windows", () => {
    // With NO dock reserved, the floor term overtakes the 50% term below
    // 2 × (ACTIVITY_BAR_W + TERMINAL_FLOOR + FRAME_RESERVED_MAX) = 608px.
    // Reserve a dock and the crossover moves up to the ~976px the spec's
    // prose named (1008 since Phase 284) — which is the case the shipped
    // version was missing; see the fix-round block at the bottom of this file.
    //
    // PHASE 284 moved this pin. It read 2 × (48 + 240) = 576 and
    // sidebarMaxWidth(560) = 272 while the row had no gutters. The frame's two
    // 8px gutters are in the room term now, so both numbers move by exactly
    // that term: the crossover by 2 × 16 and the ceiling under it by 16.
    const crossover = 2 * (ACTIVITY_BAR_W + TERMINAL_FLOOR + FRAME_RESERVED_MAX);
    expect(crossover).toBe(608);
    expect(crossover - 2 * (ACTIVITY_BAR_W + TERMINAL_FLOOR)).toBe(
      2 * FRAME_RESERVED_MAX
    );
    expect(sidebarMaxWidth(crossover)).toBe(crossover / 2);
    // Just under it, the floor term is what answers…
    expect(sidebarMaxWidth(560)).toBe(
      560 - ACTIVITY_BAR_W - TERMINAL_FLOOR - FRAME_RESERVED_MAX
    );
    expect(sidebarMaxWidth(560)).toBe(256);
    // …and the floor never wins so hard that the sidebar goes under its min.
    expect(sidebarMaxWidth(400)).toBe(SIDEBAR_MIN);
    expect(sidebarMaxWidth(0)).toBe(SIDEBAR_MIN);
  });

  it('always leaves the terminal room at realistic widths', () => {
    // Phase 284: the row is also charged both gutters of the work's frame.
    for (const w of [1024, 1280, 1440, 1920]) {
      expect(
        w - ACTIVITY_BAR_W - sidebarMaxWidth(w) - FRAME_RESERVED_MAX
      ).toBeGreaterThanOrEqual(TERMINAL_FLOOR);
    }
  });
});

describe('dockMaxWidth', () => {
  it('is still the constant 320 — the ask was collapse, not width', () => {
    expect(dockMaxWidth(1280)).toBe(DOCK_MAX);
    expect(dockMaxWidth(2560)).toBe(DOCK_MAX);
    expect(dockMaxWidth()).toBe(DOCK_MAX);
  });
});

describe('editorMaxWidth', () => {
  it('replaces the 0.65 cap with "everything but the terminal floor"', () => {
    // 1440px window, no sidebar, top orientation → work area 1392.
    const workArea = 1440 - ACTIVITY_BAR_W;
    expect(editorMaxWidth(workArea)).toBe(workArea - TERMINAL_FLOOR);
    // Strictly more than the cap it replaces, which is the feature.
    expect(editorMaxWidth(workArea)).toBeGreaterThan(
      Math.round(workArea * 0.65)
    );
  });

  /**
   * The fix round's central correction. This function used to floor at
   * EDITOR_MIN — "the editor is never allowed to be useless" — which sounds
   * protective and is the opposite: paired with a min-wins clamp it handed the
   * editor its 320px out of a 332px row and left the terminal 12px, i.e. a
   * live pane reflowed to two columns. The editor's minimum is a comfort; the
   * terminal's floor is a promise about work in flight.
   */
  it('yields to the terminal floor BEFORE the editor floor', () => {
    expect(editorMaxWidth(0)).toBe(0);
    expect(editorMaxWidth(300)).toBe(60);
    expect(editorMaxWidth(TERMINAL_FLOOR + 10)).toBe(10);
    // The row measured in the failing report: 1400px window, sidebar at 50%,
    // dock at 320. The editor may have 92px there — and because that is under
    // its own minimum, the row does not get a split at all (editorIsOverlay).
    expect(editorMaxWidth(332)).toBe(92);
    expect(editorIsOverlay(1400, 332)).toBe(true);
  });

  it('leaves the terminal at least its floor whenever the area allows', () => {
    for (const area of [800, 1000, 1392, 1872]) {
      expect(area - editorMaxWidth(area)).toBeGreaterThanOrEqual(
        TERMINAL_FLOOR
      );
    }
  });
});

describe('workAreaWidth', () => {
  const base = {
    windowWidth: 1440,
    sidebarVisible: true,
    sidebarWidth: SIDEBAR_DEFAULT,
    orientation: 'top' as const,
    dockCollapsed: false,
    dockWidth: DOCK_DEFAULT
  };

  // PHASE 284 moved every pin in this block by the frame's gutters and by
  // nothing else: 16 with the sidebar drawn (a gutter on each side of the
  // work) and 8 with it hidden (the right one alone). Each expectation keeps
  // the arithmetic it had and subtracts the named term, so the term is
  // visibly what moved the number.
  it('subtracts the activity bar, the sidebar, the dock and the frame', () => {
    expect(workAreaWidth(base)).toBe(
      1440 - ACTIVITY_BAR_W - SIDEBAR_DEFAULT - FRAME_RESERVED_MAX
    );
    expect(workAreaWidth(base)).toBe(1096);
    expect(workAreaWidth({ ...base, sidebarVisible: false })).toBe(
      1440 - ACTIVITY_BAR_W - FRAME_GAP
    );
    expect(workAreaWidth({ ...base, sidebarVisible: false })).toBe(1384);
    expect(workAreaWidth({ ...base, orientation: 'right' })).toBe(
      1440 - ACTIVITY_BAR_W - SIDEBAR_DEFAULT - DOCK_DEFAULT - FRAME_RESERVED_MAX
    );
    expect(workAreaWidth({ ...base, orientation: 'right' })).toBe(896);
  });

  it('counts a collapsed dock as its rail, not as zero and not as its width', () => {
    expect(
      workAreaWidth({ ...base, orientation: 'right', dockCollapsed: true })
    ).toBe(
      1440 - ACTIVITY_BAR_W - SIDEBAR_DEFAULT - DOCK_RAIL_W - FRAME_RESERVED_MAX
    );
  });

  it('ignores a collapsed dock entirely in top orientation', () => {
    expect(workAreaWidth({ ...base, dockCollapsed: true })).toBe(
      workAreaWidth(base)
    );
  });

  it('uses the RENDERED sidebar width, so stored over-intent cannot lie', () => {
    // 900px stored under a 1280px window renders at 640 (the live 50%).
    const area = workAreaWidth({
      ...base,
      windowWidth: 1280,
      sidebarWidth: 900
    });
    expect(area).toBe(
      1280 - ACTIVITY_BAR_W - sidebarMaxWidth(1280) - FRAME_RESERVED_MAX
    );
  });

  it('never goes negative', () => {
    expect(
      workAreaWidth({ ...base, windowWidth: 200, sidebarWidth: 400 })
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('clampSidebarWidth', () => {
  it('holds the DESIGN floor and the live ceiling', () => {
    expect(clampSidebarWidth(10, 1440)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(5000, 1440)).toBe(720);
    expect(clampSidebarWidth(500, 1440)).toBe(500);
    expect(clampSidebarWidth(500.4, 1440)).toBe(500);
  });

  it('clamps PRESENTATION without the stored intent ever changing', () => {
    const chosen = 900; // chosen at 1920
    expect(clampSidebarWidth(chosen, 1920)).toBe(900);
    expect(clampSidebarWidth(chosen, 1280)).toBe(640); // squeezed…
    expect(clampSidebarWidth(chosen, 1920)).toBe(900); // …and back, exactly
  });

  it('falls back to the floor for nonsense', () => {
    expect(clampSidebarWidth(Number.NaN, 1440)).toBe(SIDEBAR_MIN);
  });
});

describe('clampDockWidth', () => {
  it('keeps the unchanged 160–320 band', () => {
    expect(clampDockWidth(10, 1440)).toBe(DOCK_MIN);
    expect(clampDockWidth(5000, 1440)).toBe(DOCK_MAX);
    expect(clampDockWidth(240, 1440)).toBe(240);
  });
});

describe('clampEditorWidth', () => {
  it('clamps into [EDITOR_MIN, editorMaxWidth(area)]', () => {
    const area = 1392;
    expect(clampEditorWidth(10, area)).toBe(EDITOR_MIN);
    expect(clampEditorWidth(5000, area)).toBe(area - TERMINAL_FLOOR);
    expect(clampEditorWidth(700, area)).toBe(700);
  });

  /**
   * Note the areas below 560: those are the ones the shipped version got
   * wrong, and the old test never asked about them (it started at 700).
   */
  it('never takes a single pixel out of the terminal floor, at ANY area', () => {
    // Stated as "the editor leaves whatever the floor could have had" rather
    // than "the terminal is ≥ 240", because a 100px work row cannot give the
    // terminal 240 no matter who yields — that case is the WINDOW's problem
    // and is covered by the grid below, which only drives windows the app can
    // actually be opened at.
    for (let area = 0; area <= 3000; area += 1) {
      for (const want of [0, 10, 320, 480, area, area + 500]) {
        const terminal = area - clampEditorWidth(want, area);
        expect(
          terminal >= Math.min(area, TERMINAL_FLOOR),
          `area ${area}, requested ${want} → terminal ${terminal}px`
        ).toBe(true);
      }
    }
  });
});

describe('sanitizeStoredWidth', () => {
  it('accepts every width an older build could have written', () => {
    // gmux.sidebarWidth used to live in [220, 400]; all of it survives.
    for (const v of [220, 280, 333, 400]) {
      expect(sanitizeStoredWidth(v, SIDEBAR_DEFAULT, SIDEBAR_MIN)).toBe(v);
    }
    // gmux.rightListWidth used to live in [160, 320].
    for (const v of [160, 200, 320]) {
      expect(sanitizeStoredWidth(v, DOCK_DEFAULT, DOCK_MIN)).toBe(v);
    }
  });

  it('rejects nonsense a hand-edited store could hold', () => {
    for (const v of [
      undefined,
      null,
      'wide',
      {},
      [],
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0,
      -50,
      99999
    ]) {
      expect(sanitizeStoredWidth(v, SIDEBAR_DEFAULT, SIDEBAR_MIN)).toBe(
        SIDEBAR_DEFAULT
      );
    }
  });

  it('lifts an under-floor value to the floor rather than to the default', () => {
    expect(sanitizeStoredWidth(50, SIDEBAR_DEFAULT, SIDEBAR_MIN)).toBe(
      SIDEBAR_MIN
    );
    expect(sanitizeStoredWidth(12, DOCK_DEFAULT, DOCK_MIN)).toBe(DOCK_MIN);
  });

  it('rounds, so no fractional width is ever persisted', () => {
    expect(sanitizeStoredWidth(283.6, SIDEBAR_DEFAULT, SIDEBAR_MIN)).toBe(284);
  });

  it('does NOT clamp to a live maximum — intent outlives the window', () => {
    // 900 is above the 50% ceiling of a 1280px window but is kept verbatim;
    // clampSidebarWidth is what renders it small, and the value comes back.
    expect(sanitizeStoredWidth(900, SIDEBAR_DEFAULT, SIDEBAR_MIN)).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// THE INVARIANT, DRIVEN
// ---------------------------------------------------------------------------

/**
 * The fix round's headline test, and the one the phase should have shipped
 * with. Everything above checks a single function against numbers a human
 * chose; this drives the WHOLE budget over every combination the user can
 * actually produce and asserts the one property that protects live work:
 *
 *   the terminal is laid out at 0 (display:none) or at ≥ TERMINAL_FLOOR,
 *   and never in between.
 *
 * It exists because a 72-cell drive of the real app found a 12px terminal —
 * `tmux display -p '#{pane_width}'` returned 2 columns and shredded a live
 * transcript into 2-character lines — while 1563 green tests said nothing.
 * The reason they said nothing is that every one of them tested a function in
 * isolation, and the defect was in how three of them composed.
 */
describe('the terminal never lands in the reflow band (Phase 18 fix round)', () => {
  it('agrees with the app about the minimum window', () => {
    // If someone lowers minWidth, this grid stops covering the real range.
    const main = readFileSync(
      resolve(__dirname, '..', '..', '..', 'main', 'index.ts'),
      'utf8'
    );
    expect(main).toContain(`minWidth: ${APP_MIN_WINDOW_W}`);
  });

  it('holds across every window / sidebar / dock / projects / editor combination', () => {
    // PHASE 129 widened this grid by the two project-tab dimensions. Every
    // window below is now driven with the tabs on top (0px), with the rail
    // collapsed (48px) and with the rail expanded (200px or, under
    // PROJECT_RAIL_MIN_WINDOW_W, the 48px it is actually drawn at).
    //
    // PHASE 284 added 1043, 1044 and 1045, the three windows around the rail's
    // NEW threshold, and 1248, where the top-orientation row now meets
    // SPLIT_MIN_WORK_AREA. 1027 to 1029 and 1216 stay: they are where those
    // two edges used to be, and the band between the old edge and the new one
    // is exactly where a gutter term that was half applied would show. The
    // invariant below did not change, and that is the point of the phase's
    // geometry: 16px came out of the row and the floor still holds everywhere.
    const windows = [
      960, 1000, 1027, 1028, 1029, 1043, 1044, 1045, 1100, 1216, 1248, 1280,
      1400, 1440, 1500, 1600, 1920, 2560
    ];
    const orientations = ['top', 'right'] as const;
    const projectPositions = ['top', 'left'] as const;
    const editorWidths = [undefined, 320, 480, 800, 4096];
    let cells = 0;
    let overlays = 0;
    let railsDrawn = 0;

    for (const windowWidth of windows) {
      for (const orientation of orientations) {
        for (const dockCollapsed of [false, true]) {
          for (const dockWidth of [DOCK_MIN, DOCK_DEFAULT, DOCK_MAX]) {
            const dockReserved = dockRenderedWidth(
              { orientation, dockCollapsed, dockWidth },
              windowWidth
            );
            for (const projectsPosition of projectPositions) {
              for (const projectsCollapsed of [false, true]) {
                const projectsReserved = projectsRenderedWidth(
                  { projectsPosition, projectsCollapsed },
                  windowWidth
                );
                if (projectsReserved === PROJECT_RAIL_W) railsDrawn += 1;
                // Every sidebar width the user can reach: hidden, the floor,
                // the live ceiling, and a stale stored value from a wider
                // window.
                const sidebars = [
                  SIDEBAR_MIN,
                  SIDEBAR_DEFAULT,
                  sidebarMaxWidth(windowWidth, dockReserved, projectsReserved),
                  4096
                ];
                for (const sidebarVisible of [true, false]) {
                  for (const sidebarWidth of sidebars) {
                    for (const editorOpen of [false, true]) {
                      for (const filling of [false, true]) {
                        for (const editorWidth of editorWidths) {
                          const w = {
                            windowWidth,
                            sidebarVisible,
                            sidebarWidth,
                            orientation,
                            dockCollapsed,
                            dockWidth,
                            projectsPosition,
                            projectsCollapsed,
                            editorOpen,
                            editorWidth,
                            filling: filling && editorOpen
                          };
                          const terminal = terminalLayoutWidth(w);
                          cells += 1;
                          if (
                            editorOpen &&
                            !w.filling &&
                            editorIsOverlay(windowWidth, workAreaWidth(w))
                          ) {
                            overlays += 1;
                          }
                          expect(
                            terminal === 0 || terminal >= TERMINAL_FLOOR,
                            `terminal ${terminal}px at window ${windowWidth} ` +
                              `${orientation} sidebar ${sidebarVisible ? sidebarWidth : 'hidden'} ` +
                              `dock ${dockCollapsed ? 'rail' : dockWidth} ` +
                              `projects ${projectsPosition}` +
                              `${projectsCollapsed ? ' collapsed' : ''} ` +
                              `(${projectsReserved}px) ` +
                              `editor ${editorOpen ? (editorWidth ?? 'default') : 'closed'}` +
                              `${w.filling ? ' filling' : ''}`
                          ).toBe(true);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // A grid that never exercises the branch it was written for proves
    // nothing, so it says out loud that it reached both sides.
    expect(cells).toBeGreaterThan(2000);
    expect(overlays).toBeGreaterThan(0);
    expect(railsDrawn).toBeGreaterThan(0);
  });

  /**
   * The exact four rows from the failure report, replayed. Before the fix
   * these laid the terminal out at 12 / 32 / 62 / 112 px; tmux answered 2, 2,
   * 4 and 11 columns.
   */
  it('replays the four measured squeeze rows', () => {
    const rows = [1400, 1440, 1500, 1600];
    for (const windowWidth of rows) {
      const dockReserved = dockRenderedWidth(
        { orientation: 'right', dockCollapsed: false, dockWidth: DOCK_MAX },
        windowWidth
      );
      const sidebarWidth = sidebarMaxWidth(windowWidth, dockReserved);
      const w = {
        windowWidth,
        sidebarVisible: true,
        sidebarWidth,
        orientation: 'right' as const,
        dockCollapsed: false,
        dockWidth: DOCK_MAX,
        editorOpen: true,
        editorWidth: EDITOR_MIN
      };
      const workArea = workAreaWidth(w);
      // The sidebar still reaches 50% at these sizes — item 1 is intact…
      expect(sidebarWidth).toBe(Math.round(windowWidth / 2));
      // …and the row simply cannot seat a split, so the editor overlays.
      expect(workArea).toBeLessThan(SPLIT_MIN_WORK_AREA);
      expect(editorIsOverlay(windowWidth, workArea)).toBe(true);
      // The terminal keeps the whole row underneath the overlay.
      expect(terminalLayoutWidth(w)).toBe(workArea);
      expect(terminalLayoutWidth(w)).toBeGreaterThanOrEqual(TERMINAL_FLOOR);
    }
  });

  it('keeps the sidebar at 50% wherever the row can still afford it', () => {
    // The dock term only bites below ~976px with the default 200px dock —
    // which is what the spec's prose said all along, and what the shipped
    // implementation had dropped.
    //
    // PHASE 284 moved that edge from 976 to 1008, because the room term gives
    // up FRAME_RESERVED_MAX as well: `w - 48 - 200 - 16 - 240 = w - 504`
    // meets `w / 2` at 1008. So 1000 left this list, where it read 500, and is
    // pinned below at the 496 it reads now; and 960 moved from 472 to 456.
    // Each moved by 16 or by less, and never by more.
    for (const windowWidth of [1008, 1100, 1280, 1440, 1920, 2560]) {
      expect(sidebarMaxWidth(windowWidth, DOCK_DEFAULT)).toBe(
        Math.round(windowWidth / 2)
      );
    }
    expect(sidebarMaxWidth(1007, DOCK_DEFAULT)).toBe(503);
    expect(sidebarMaxWidth(1000, DOCK_DEFAULT)).toBe(496);
    expect(sidebarMaxWidth(1000, DOCK_DEFAULT)).toBe(
      1000 - ACTIVITY_BAR_W - DOCK_DEFAULT - FRAME_RESERVED_MAX - TERMINAL_FLOOR
    );
    expect(sidebarMaxWidth(960, DOCK_DEFAULT)).toBe(456);
    expect(sidebarMaxWidth(960, DOCK_DEFAULT)).toBe(
      960 - ACTIVITY_BAR_W - DOCK_DEFAULT - FRAME_RESERVED_MAX - TERMINAL_FLOOR
    );
    expect(sidebarMaxWidth(960, DOCK_DEFAULT)).toBeLessThan(480);
  });

  /**
   * Item 3's guarantee, kept intact by item 1's fix. The new overlay trigger
   * could in principle cover the hoisted session strip — the exact bug item 3
   * exists to kill — so it must be unreachable in "top" orientation, where the
   * strip lives. It is, by arithmetic: with no dock, a sidebar at 50% leaves
   * the row `w/2 - 48 - 16` (the 16 is Phase 284's two gutters), which only
   * falls under SPLIT_MIN_WORK_AREA below 1248px (1216px before Phase 284),
   * and everything under 1400px was already an overlay. The new condition
   * therefore only ever fires with the dock on the right, where there is no
   * strip to cover. The 152px between 1248 and 1400 is the margin this
   * guarantee has left, and the loop below drives every pixel of it.
   */
  it('never introduces a NEW overlay in top orientation (item 3 is safe)', () => {
    for (let windowWidth = APP_MIN_WINDOW_W; windowWidth <= 4096; windowWidth += 1) {
      for (const sidebarWidth of [
        SIDEBAR_MIN,
        SIDEBAR_DEFAULT,
        sidebarMaxWidth(windowWidth, 0),
        4096
      ]) {
        const workArea = workAreaWidth({
          windowWidth,
          sidebarVisible: true,
          sidebarWidth,
          orientation: 'top',
          dockCollapsed: false,
          dockWidth: DOCK_MAX
        });
        const wasOverlay = windowWidth < 1400;
        expect(
          editorIsOverlay(windowWidth, workArea) === wasOverlay,
          `window ${windowWidth}, sidebar ${sidebarWidth} → row ${workArea}`
        ).toBe(true);
      }
    }
  });

  it('leaves the top orientation exactly as it was', () => {
    // No dock, no reservation: every number verifier A measured stands.
    for (const windowWidth of [1440, 1800, 2400]) {
      expect(sidebarMaxWidth(windowWidth, 0)).toBe(windowWidth / 2);
      expect(
        dockRenderedWidth(
          { orientation: 'top', dockCollapsed: false, dockWidth: DOCK_MAX },
          windowWidth
        )
      ).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// PHASE 129 — the project rail enters the budget
// ---------------------------------------------------------------------------

/**
 * The rail is the third region that can take width from the terminal, and the
 * first one added since the Phase 18 fix round wrote the budget down. These
 * cases pin the arithmetic that keeps rule 2 true, with the numbers spelled
 * out rather than described.
 */
describe('the project rail (Phase 129)', () => {
  it('is 0 while the tabs are on top, whatever the collapsed flag says', () => {
    for (const projectsCollapsed of [false, true]) {
      expect(
        projectsRenderedWidth(
          { projectsPosition: 'top', projectsCollapsed },
          1920
        )
      ).toBe(0);
    }
  });

  it('is 200 expanded and 48 collapsed in a window that can seat it', () => {
    expect(
      projectsRenderedWidth(
        { projectsPosition: 'left', projectsCollapsed: false },
        1920
      )
    ).toBe(PROJECT_RAIL_W);
    expect(
      projectsRenderedWidth(
        { projectsPosition: 'left', projectsCollapsed: true },
        1920
      )
    ).toBe(PROJECT_RAIL_COLLAPSED_W);
  });

  it('derives its minimum window from the regions it has to share with', () => {
    // 48 + 200 + 220 + 320 + 240 + 16. Written out so a later change to any
    // of the six constants has to come past this line.
    //
    // PHASE 284 moved this pin from 1028 to 1044. The sixth term is both
    // gutters of the work's frame, the MAX and never the live 8 or 16, so the
    // rail still moves only when the window does.
    expect(PROJECT_RAIL_MIN_WINDOW_W).toBe(
      ACTIVITY_BAR_W +
        PROJECT_RAIL_W +
        SIDEBAR_MIN +
        DOCK_MAX +
        TERMINAL_FLOOR +
        FRAME_RESERVED_MAX
    );
    expect(PROJECT_RAIL_MIN_WINDOW_W).toBe(1044);
    expect(PROJECT_RAIL_MIN_WINDOW_W - FRAME_RESERVED_MAX).toBe(1028);
    // And it is above the app's own minimum window, which is the whole reason
    // the narrow branch below has to exist at all.
    expect(PROJECT_RAIL_MIN_WINDOW_W).toBeGreaterThan(APP_MIN_WINDOW_W);
  });

  it('renders collapsed in a window too narrow to seat it expanded', () => {
    const asked = { projectsPosition: 'left' as const, projectsCollapsed: false };
    // PHASE 284 moved this boundary from 1027 | 1028 to 1043 | 1044. The old
    // edge is asserted too, on the collapsed side, because a window 1028 to
    // 1043px wide is the one place a person meets this phase's geometry as
    // something other than a narrower terminal.
    expect(projectsRenderedWidth(asked, 1043)).toBe(PROJECT_RAIL_COLLAPSED_W);
    expect(projectsRenderedWidth(asked, 1044)).toBe(PROJECT_RAIL_W);
    expect(projectsRenderedWidth(asked, 1028)).toBe(PROJECT_RAIL_COLLAPSED_W);
    // Presentation clamps, intent persists: the caller's own value never moved.
    expect(asked.projectsCollapsed).toBe(false);
    expect(projectRailForcedNarrow(asked, 1043)).toBe(true);
    expect(projectRailForcedNarrow(asked, 1044)).toBe(false);
    // A rail the person collapsed themselves is not "forced" — the control
    // that expands it again still works.
    expect(
      projectRailForcedNarrow(
        { projectsPosition: 'left', projectsCollapsed: true },
        960
      )
    ).toBe(false);
  });

  it('does not move when the window does not, which is what keeps live panes still', () => {
    // The rendered width reads ONE input. A dock drag, a ⌘B, a sidebar drag
    // and a stale stored sidebar width all leave it alone, so none of them can
    // resize the work area a second time through the rail.
    const at = (w: number): number =>
      projectsRenderedWidth(
        { projectsPosition: 'left', projectsCollapsed: false },
        w
      );
    expect(at(1440)).toBe(PROJECT_RAIL_W);
    expect(at(1440)).toBe(at(1440));
  });

  it('takes its width out of the SIDEBAR ceiling, not out of the terminal', () => {
    // 1440px window, dock at its ceiling, rail expanded. The floor term now
    // answers, because 1440 - 48 - 200 - 320 - 16 - 240 = 616 is under half.
    // (632 before Phase 284: the 16 is the work's two gutters.)
    const dock = DOCK_MAX;
    const rail = PROJECT_RAIL_W;
    expect(sidebarMaxWidth(1440, dock, rail)).toBe(616);
    expect(sidebarMaxWidth(1440, dock, rail)).toBe(
      1440 - ACTIVITY_BAR_W - rail - dock - FRAME_RESERVED_MAX - TERMINAL_FLOOR
    );
    // …and the same window with the tabs on top keeps the 720 it had, because
    // there the 50% term is still the smaller of the two.
    expect(sidebarMaxWidth(1440, dock, 0)).toBe(720);
    expect(sidebarMaxWidth(1440, dock, 0)).toBe(sidebarMaxWidth(1440, dock));
    // 200.0 px, from 0: that is the whole difference the rail makes here.
    // It read 88 before Phase 284. The with-rail ceiling is the room term and
    // gave up 16 to the frame; the without-rail ceiling is half the window and
    // gave up nothing; so the difference between them grew by that 16.
    expect(sidebarMaxWidth(1440, dock, 0) - sidebarMaxWidth(1440, dock, rail)).toBe(
      88 + FRAME_RESERVED_MAX
    );
  });

  it('leaves the work row exactly the floor at the tightest legal window', () => {
    // The case the phase spec named: the minimum window that seats the rail,
    // with the dock at 320 and the sidebar asking for half the window.
    const w = {
      windowWidth: PROJECT_RAIL_MIN_WINDOW_W,
      sidebarVisible: true,
      sidebarWidth: 4096,
      orientation: 'right' as const,
      dockCollapsed: false,
      dockWidth: DOCK_MAX,
      projectsPosition: 'left' as const,
      projectsCollapsed: false
    };
    expect(clampSidebarWidth(4096, w.windowWidth, DOCK_MAX, PROJECT_RAIL_W)).toBe(
      SIDEBAR_MIN
    );
    expect(workAreaWidth(w)).toBe(TERMINAL_FLOOR);
    expect(terminalLayoutWidth({ ...w, editorOpen: false })).toBe(
      TERMINAL_FLOOR
    );
    // With a file open the row cannot seat a split, so the panel overlays and
    // the terminal keeps the whole row underneath it.
    expect(editorIsOverlay(w.windowWidth, workAreaWidth(w))).toBe(true);
    expect(terminalLayoutWidth({ ...w, editorOpen: true })).toBe(
      TERMINAL_FLOOR
    );
  });

  it('holds at the app minimum window, where the rail is drawn collapsed', () => {
    const w = {
      windowWidth: APP_MIN_WINDOW_W,
      sidebarVisible: true,
      sidebarWidth: 4096,
      orientation: 'right' as const,
      dockCollapsed: false,
      dockWidth: DOCK_MAX,
      projectsPosition: 'left' as const,
      projectsCollapsed: false
    };
    expect(
      projectsRenderedWidth(w, APP_MIN_WINDOW_W)
    ).toBe(PROJECT_RAIL_COLLAPSED_W);
    // The sidebar's ceiling is 960 - 48 - 48 - 320 - 16 - 240 = 288, so a
    // sidebar asking for half the window renders at 288 and the row is left
    // exactly the floor. Nothing is under it, which is the property that
    // matters. (304 before Phase 284. The 16 the frame's gutters need came out
    // of the SIDEBAR here and not out of the terminal, which is the whole
    // reason `sidebarMaxWidth` reserves them.)
    expect(clampSidebarWidth(4096, 960, DOCK_MAX, PROJECT_RAIL_COLLAPSED_W)).toBe(
      288
    );
    expect(clampSidebarWidth(4096, 960, DOCK_MAX, PROJECT_RAIL_COLLAPSED_W)).toBe(
      304 - FRAME_RESERVED_MAX
    );
    expect(workAreaWidth(w)).toBe(TERMINAL_FLOOR);
    expect(workAreaWidth(w)).toBeGreaterThanOrEqual(TERMINAL_FLOOR);
  });

  it('leaves every number the app had before it exactly where it was', () => {
    // Absent fields mean "tabs on top", so every pre-Phase-129 caller reads
    // the same answer it always read.
    const base = {
      windowWidth: 1440,
      sidebarVisible: true,
      sidebarWidth: SIDEBAR_DEFAULT,
      orientation: 'right' as const,
      dockCollapsed: false,
      dockWidth: DOCK_DEFAULT
    };
    expect(workAreaWidth(base)).toBe(
      workAreaWidth({
        ...base,
        projectsPosition: 'top',
        projectsCollapsed: false
      })
    );
    // …less the frame's two gutters, which Phase 284 charges every row.
    expect(workAreaWidth(base)).toBe(
      1440 - ACTIVITY_BAR_W - SIDEBAR_DEFAULT - DOCK_DEFAULT - FRAME_RESERVED_MAX
    );
    expect(sidebarMaxWidth(1440, DOCK_DEFAULT)).toBe(
      sidebarMaxWidth(1440, DOCK_DEFAULT, 0)
    );
  });
});

// ---------------------------------------------------------------------------
// PHASE 135 — the activity bar's two shapes
// ---------------------------------------------------------------------------

describe('activityBarIsRow', () => {
  it('is true only with the projects on the left AND the sidebar showing', () => {
    expect(
      activityBarIsRow({ projectsPosition: 'left', sidebarVisible: true })
    ).toBe(true);
    expect(
      activityBarIsRow({ projectsPosition: 'left', sidebarVisible: false })
    ).toBe(false);
    expect(
      activityBarIsRow({ projectsPosition: 'top', sidebarVisible: true })
    ).toBe(false);
    expect(
      activityBarIsRow({ projectsPosition: 'top', sidebarVisible: false })
    ).toBe(false);
  });
});

describe('activityBarRenderedWidth', () => {
  it('gives back exactly 48px, and only as the row', () => {
    const asRow = activityBarRenderedWidth({
      projectsPosition: 'left',
      sidebarVisible: true
    });
    const asColumn = activityBarRenderedWidth({
      projectsPosition: 'left',
      sidebarVisible: false
    });
    expect(asRow).toBe(0);
    expect(asColumn).toBe(ACTIVITY_BAR_W);
    expect(asColumn - asRow).toBe(48);
  });

  it('never changes anything while the projects are on top', () => {
    // The operator asked for this one by name. Both booleans are tried and
    // the answer is the same 48px column in both.
    for (const sidebarVisible of [true, false]) {
      expect(
        activityBarRenderedWidth({ projectsPosition: 'top', sidebarVisible })
      ).toBe(ACTIVITY_BAR_W);
    }
  });
});

describe('Phase 135: the 48px the row hands back', () => {
  const base = {
    windowWidth: 1440,
    sidebarVisible: true,
    sidebarWidth: SIDEBAR_DEFAULT,
    orientation: 'right' as const,
    dockCollapsed: false,
    dockWidth: DOCK_DEFAULT,
    projectsPosition: 'left' as const,
    projectsCollapsed: false
  };

  it('goes to the work area, at every window width', () => {
    // The work area subtracts the activity bar unconditionally, so the row
    // hands it the whole 48px whatever else the window is doing. The number a
    // pre-135 build drew is written out by hand rather than produced by
    // hiding the sidebar, because hiding the sidebar changes a second term.
    //
    // PHASE 284. The first window was 1028 and is 1044, because this loop
    // writes the rail as the constant 200 and under the new threshold the rail
    // is drawn at 48. Both sides of the comparison carry the frame's gutters,
    // so the 48px this test is about is still exactly what separates them.
    for (const windowWidth of [1044, 1200, 1440, 1920, 2560]) {
      const w = { ...base, windowWidth };
      const sidebar = clampSidebarWidth(
        SIDEBAR_DEFAULT,
        windowWidth,
        DOCK_DEFAULT,
        PROJECT_RAIL_W,
        0
      );
      const beforeThisPhase =
        windowWidth -
        ACTIVITY_BAR_W -
        PROJECT_RAIL_W -
        sidebar -
        DOCK_DEFAULT -
        FRAME_RESERVED_MAX;
      expect(workAreaWidth(w)).toBe(beforeThisPhase + 48);
    }
    expect(workAreaWidth(base)).toBe(
      1440 - 0 - PROJECT_RAIL_W - SIDEBAR_DEFAULT - DOCK_DEFAULT - FRAME_RESERVED_MAX
    );
  });

  it('goes to the sidebar ceiling ONLY where the room term binds', () => {
    // Stated precisely, because "the ceiling gains 48px" is not true at every
    // width. The ceiling is `min(half the window, the room left over)`. The
    // activity bar is a term in the second one and not in the first, so the
    // 48px arrives only while the room term is the smaller of the two.
    //
    // With a 200px dock and a 200px rail the room term is
    // `w - 48 - 200 - 200 - 16 - 240 = w - 704`, and half is `w / 2`. The
    // room term binds while `w - 704 < w / 2`, which is `w < 1408`. (688 and
    // 1376 before Phase 284: the 16 is the work's two gutters, and it is in
    // both ceilings below, so the 48px between them is untouched.)
    const ceiling = (w: number, activityBar: number): number =>
      sidebarMaxWidth(w, DOCK_DEFAULT, PROJECT_RAIL_W, activityBar);

    // 1280 is under 1408, so the room term binds and the whole 48px arrives.
    expect(ceiling(1280, ACTIVITY_BAR_W)).toBe(
      1280 - 48 - 200 - 200 - FRAME_RESERVED_MAX - 240
    );
    expect(ceiling(1280, 0)).toBe(1280 - 0 - 200 - 200 - FRAME_RESERVED_MAX - 240);
    expect(ceiling(1280, 0) - ceiling(1280, ACTIVITY_BAR_W)).toBe(48);

    // 1440 is over 1408, so half the window binds and the ceiling does not
    // move at all. This is the honest half of the claim.
    expect(ceiling(1440, ACTIVITY_BAR_W)).toBe(720);
    expect(ceiling(1440, 0)).toBe(720);
    expect(ceiling(1440, 0) - ceiling(1440, ACTIVITY_BAR_W)).toBe(0);

    // Across the range the ceiling never LOSES width to this phase, and never
    // gains more than the 48px the row gave up.
    for (let w = APP_MIN_WINDOW_W; w <= 3200; w += 16) {
      const gain = ceiling(w, 0) - ceiling(w, ACTIVITY_BAR_W);
      expect(gain).toBeGreaterThanOrEqual(0);
      expect(gain).toBeLessThanOrEqual(48);
    }
  });

  it('leaves the terminal floor intact across the whole grid', () => {
    // The row hands 48px to the work area AND to the sidebar's ceiling, so
    // the budget could double-count it. It does not, because the same term is
    // subtracted in both places. Drive it and prove the floor still holds.
    // Phase 284 added 1043 and 1044, either side of the rail's new threshold.
    for (const windowWidth of [960, 1028, 1043, 1044, 1200, 1440, 1920, 2560]) {
      for (const projectsCollapsed of [true, false]) {
        for (const dockCollapsed of [true, false]) {
          for (const sidebarVisible of [true, false]) {
            for (const orientation of ['top', 'right'] as const) {
              const w = {
                ...base,
                windowWidth,
                orientation,
                projectsCollapsed,
                dockCollapsed,
                sidebarVisible,
                // The widest a hand-edited store could ask for.
                sidebarWidth: 4096
              };
              expect(workAreaWidth(w)).toBeGreaterThanOrEqual(TERMINAL_FLOOR);
            }
          }
        }
      }
    }
  });

  it('does not move the project rail when the sidebar is toggled', () => {
    // PROJECT_RAIL_MIN_WINDOW_W keeps the activity bar's 48px in it on
    // purpose. Taking it out would let the rail expand at 996px while the
    // sidebar is showing and collapse again on Command B, and every width
    // change of the rail resizes live sessions.
    //
    // PHASE 284 holds the frame to the same rule. The threshold sums
    // FRAME_RESERVED_MAX, both gutters, and never the live term, which is 8
    // with the sidebar hidden: that would seat the rail at 1036 on one side of
    // Command B and 1044 on the other. So 1028 became 1044 and 980 became 996.
    expect(PROJECT_RAIL_MIN_WINDOW_W).toBe(
      ACTIVITY_BAR_W +
        PROJECT_RAIL_W +
        SIDEBAR_MIN +
        DOCK_MAX +
        TERMINAL_FLOOR +
        FRAME_RESERVED_MAX
    );
    expect(PROJECT_RAIL_MIN_WINDOW_W).toBe(1044);
    // The rail's width is a function of the window alone. There is no
    // sidebar field in its input, so no press of Command B can reach it.
    expect(
      projectsRenderedWidth(
        { projectsPosition: 'left', projectsCollapsed: false },
        1043
      )
    ).toBe(PROJECT_RAIL_COLLAPSED_W);
    expect(
      projectsRenderedWidth(
        { projectsPosition: 'left', projectsCollapsed: false },
        1044
      )
    ).toBe(PROJECT_RAIL_W);
  });

  it('changes no answer any pre-135 call site reads', () => {
    // Every existing call passes three arguments or fewer, and the fourth
    // defaults to the column's width.
    expect(sidebarMaxWidth(1280, DOCK_DEFAULT, PROJECT_RAIL_W)).toBe(
      sidebarMaxWidth(1280, DOCK_DEFAULT, PROJECT_RAIL_W, ACTIVITY_BAR_W)
    );
    expect(sidebarMaxWidth(1280)).toBe(sidebarMaxWidth(1280, 0, 0));
    expect(clampSidebarWidth(4096, 1280, DOCK_DEFAULT, PROJECT_RAIL_W)).toBe(
      clampSidebarWidth(
        4096,
        1280,
        DOCK_DEFAULT,
        PROJECT_RAIL_W,
        ACTIVITY_BAR_W
      )
    );
    // And with the projects on top, the work area arithmetic is untouched.
    const top = {
      windowWidth: 1440,
      sidebarVisible: true,
      sidebarWidth: SIDEBAR_DEFAULT,
      orientation: 'right' as const,
      dockCollapsed: false,
      dockWidth: DOCK_DEFAULT
    };
    // (Phase 284 charges both rows the frame's gutters: 16 with the sidebar
    // drawn and 8 without. Nothing Phase 135 added is in either number.)
    expect(workAreaWidth(top)).toBe(
      1440 - ACTIVITY_BAR_W - SIDEBAR_DEFAULT - DOCK_DEFAULT - FRAME_RESERVED_MAX
    );
    expect(workAreaWidth({ ...top, sidebarVisible: false })).toBe(
      1440 - ACTIVITY_BAR_W - DOCK_DEFAULT - FRAME_GAP
    );
  });
});

// ---------------------------------------------------------------------------
// PHASE 284 — the work's frame enters the budget
// ---------------------------------------------------------------------------

/**
 * The quiet surround puts the work inside one outline with an 8px gutter on
 * each side of it. The gutter is a margin, a margin comes out of the box xterm
 * is laid out in, and so it is the fourth thing that can take width from the
 * terminal and the first that is not a region. Three things in the module
 * learned it (`workAreaWidth`, `sidebarMaxWidth`, `PROJECT_RAIL_MIN_WINDOW_W`)
 * and no signature moved. The pins above this block that moved say so where
 * they moved. This block pins the term itself, holds the stylesheet to it, and
 * then puts the whole change on one page as a table.
 */
describe("the work's frame (Phase 284)", () => {
  it('is an 8px gutter, a 1px line and a 14px radius', () => {
    expect(FRAME_GAP).toBe(8);
    expect(FRAME_EDGE).toBe(1);
    expect(FRAME_RADIUS).toBe(14);
    // Both gutters. Derived, so a change to the gap cannot leave it behind.
    expect(FRAME_RESERVED_MAX).toBe(2 * FRAME_GAP);
    expect(FRAME_RESERVED_MAX).toBe(16);
  });

  it('takes two answers and only two, and reads the sidebar alone', () => {
    expect(frameReservedWidth({ sidebarVisible: true })).toBe(16);
    expect(frameReservedWidth({ sidebarVisible: false })).toBe(8);
    expect(frameReservedWidth({ sidebarVisible: true })).toBe(FRAME_RESERVED_MAX);
    expect(frameReservedWidth({ sidebarVisible: false })).toBe(FRAME_GAP);
    // The line is NOT a width term. It is drawn in the gutter's first pixel,
    // so neither answer carries a +1 or a +2 for it.
    for (const sidebarVisible of [true, false]) {
      expect(frameReservedWidth({ sidebarVisible }) % FRAME_GAP).toBe(0);
    }
  });

  it('does not read the dock, so no dock gesture moves it', () => {
    // The right gutter is 8px to the expanded dock, 8px to the 48px rail and
    // 8px to the window's edge with the sessions across the top. So a dock
    // drag, a dock collapse and an orientation change each move the work by
    // the dock's own rendered width and by nothing else.
    const base = {
      windowWidth: 1440,
      sidebarVisible: true,
      sidebarWidth: SIDEBAR_DEFAULT,
      dockWidth: DOCK_DEFAULT
    };
    const top = workAreaWidth({
      ...base,
      orientation: 'top',
      dockCollapsed: false
    });
    const expanded = workAreaWidth({
      ...base,
      orientation: 'right',
      dockCollapsed: false
    });
    const rail = workAreaWidth({
      ...base,
      orientation: 'right',
      dockCollapsed: true
    });
    expect(top - expanded).toBe(DOCK_DEFAULT);
    expect(top - rail).toBe(DOCK_RAIL_W);
    expect(rail - expanded).toBe(DOCK_DEFAULT - DOCK_RAIL_W);
  });

  it('moves by exactly one gutter on Command B, beyond the sidebar itself', () => {
    // Hiding the sidebar gives the work the sidebar's width AND the left
    // gutter, which is only drawn beside a sidebar. 8px, never 16 and never 0.
    for (const windowWidth of [960, 1280, 1440, 1920, 2560]) {
      const shown = {
        windowWidth,
        sidebarVisible: true,
        sidebarWidth: SIDEBAR_DEFAULT,
        orientation: 'right' as const,
        dockCollapsed: false,
        dockWidth: DOCK_DEFAULT
      };
      const gained =
        workAreaWidth({ ...shown, sidebarVisible: false }) - workAreaWidth(shown);
      expect(gained).toBe(SIDEBAR_DEFAULT + FRAME_GAP);
    }
  });

  /**
   * THE STYLESHEET AND THE CONSTANTS ARE ONE NUMBER.
   *
   * CSS cannot import a TypeScript constant, so
   * src/renderer/app/frame-geometry.css declares the three BY VALUE, and this
   * is what holds the two files together, in the manner of the `minWidth: 960`
   * assertion against src/main/index.ts above. A gutter that is 8 in the model
   * and 10 in the stylesheet is a terminal 4px narrower than the sidebar's
   * ceiling thinks, at exactly the windows where the floor binds.
   */
  describe('src/renderer/app/frame-geometry.css mirrors it by value', () => {
    const renderer = resolve(__dirname, '..', '..');
    const stripComments = (css: string): string =>
      css.replace(/\/\*[\s\S]*?\*\//g, '');
    const css = stripComments(
      readFileSync(resolve(renderer, 'app', 'frame-geometry.css'), 'utf8')
    );
    const declarations = (text: string): string[] =>
      [...text.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+);/g)].map(
        (m) => `${m[1]!}: ${m[2]!.trim()}`
      );

    it('declares the three, equal to the constants, and nothing else', () => {
      expect(declarations(css)).toEqual([
        `--r-frame: ${FRAME_RADIUS}px`,
        `--frame-gap: ${FRAME_GAP}px`,
        `--frame-edge: ${FRAME_EDGE}px`
      ]);
      // One block, keyed on `:root` with no scheme attribute, so the dark and
      // the light base both inherit it.
      expect(css.trim()).toMatch(/^:root\s*\{[^{}]*\}$/);
    });

    it('holds no colour, by token or by literal', () => {
      // The frame's colours are --border-strong, --bg-canvas and --bg-sidebar
      // and they live where they turn with the Appearance controls. This file
      // is lengths. It reads no token at all, so it cannot read a colour one.
      expect(css).not.toMatch(/var\(/);
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/);
    });

    it('is the ONLY stylesheet that declares them, and is loaded', () => {
      // A second declaration anywhere in the renderer would win or lose on
      // source order, and the by-value pin above would go on passing while
      // the window drew something else.
      const sheets = (
        readdirSync(renderer, { recursive: true }) as string[]
      ).filter((f) => f.endsWith('.css'));
      expect(sheets.length).toBeGreaterThan(20);
      const declaring = sheets.filter((f) =>
        /--(?:r-frame|frame-gap|frame-edge)\s*:/.test(
          stripComments(readFileSync(resolve(renderer, f), 'utf8'))
        )
      );
      expect(declaring).toEqual([join('app', 'frame-geometry.css')]);
      // work-area.test.ts holds the @import to the FIRST statement of
      // work-area.css. This only asks that somebody pulls the file in at all,
      // because a mirror nothing loads is two numbers that agree and a window
      // with no gutter.
      expect(
        readFileSync(resolve(renderer, 'app', 'work-area.css'), 'utf8')
      ).toContain("@import './frame-geometry.css';");
    });
  });

  /**
   * THE WHOLE CHANGE ON ONE PAGE.
   *
   * Thirteen rows over ten window sizes. Every `parent` number was MEASURED,
   * on 2026-09-17, by importing the module as it stood at the parent commit
   * 0f2f7f00 and printing what it returned; none of them was worked out from
   * this phase's arithmetic, so the table cannot agree with itself by
   * construction. Every `now` number is what this tree must return.
   *
   * What makes the frame term "what moved each number" is the two sums. The
   * regions of the row and the row itself add up to the window, exactly, at
   * the parent with no gutter and now with one:
   *
   *   parent:  bar + rail + sidebar + dock + work          = window
   *   now:     bar + rail + sidebar + dock + work + frame  = window
   *
   * Subtract one from the other and the frame's 8 or 16px is precisely what
   * left the rail, the sidebar and the work between them, and no pixel went
   * anywhere else. In most rows it all left the work. In the two floor rows
   * it all left the SIDEBAR and the terminal kept its 240. In the 1030 row the
   * rail gave up 152 and the work gained 136.
   */
  describe('thirteen rows, measured at the parent and pinned here', () => {
    interface Row {
      name: string;
      state: Parameters<typeof terminalLayoutWidth>[0];
      /** Session focus is on. The MODEL has no such input, see the last test. */
      focus?: true;
      parent: { rail: number; sidebar: number; work: number; terminal: number };
      now: {
        frame: 8 | 16;
        rail: number;
        sidebar: number;
        work: number;
        terminal: number;
      };
    }
    const shape = {
      sidebarVisible: true,
      sidebarWidth: SIDEBAR_DEFAULT,
      orientation: 'right' as const,
      dockCollapsed: false,
      dockWidth: DOCK_DEFAULT,
      editorOpen: false
    };
    const rows: Row[] = [
      {
        name: 'a 2560 window, sessions across the top, so no dock at all',
        state: { ...shape, windowWidth: 2560, orientation: 'top' },
        parent: { rail: 0, sidebar: 280, work: 2232, terminal: 2232 },
        now: { frame: 16, rail: 0, sidebar: 280, work: 2216, terminal: 2216 }
      },
      {
        name: 'the default 1440 window: sidebar 280, dock 200',
        state: { ...shape, windowWidth: 1440 },
        parent: { rail: 0, sidebar: 280, work: 912, terminal: 912 },
        now: { frame: 16, rail: 0, sidebar: 280, work: 896, terminal: 896 }
      },
      {
        name: 'a 1600 window with the sidebar hidden: the right gutter alone',
        state: { ...shape, windowWidth: 1600, sidebarVisible: false },
        parent: { rail: 0, sidebar: 0, work: 1352, terminal: 1352 },
        now: { frame: 8, rail: 0, sidebar: 0, work: 1344, terminal: 1344 }
      },
      {
        name: 'a 1366 window with BOTH put away: sidebar hidden, dock on its rail',
        state: {
          ...shape,
          windowWidth: 1366,
          sidebarVisible: false,
          dockCollapsed: true
        },
        parent: { rail: 0, sidebar: 0, work: 1270, terminal: 1270 },
        now: { frame: 8, rail: 0, sidebar: 0, work: 1262, terminal: 1262 }
      },
      {
        name: 'a 1280 window, sidebar drawn, dock on its 48px rail',
        state: { ...shape, windowWidth: 1280, dockCollapsed: true },
        parent: { rail: 0, sidebar: 280, work: 904, terminal: 904 },
        now: { frame: 16, rail: 0, sidebar: 280, work: 888, terminal: 888 }
      },
      {
        name: 'THE FLOOR: the 960 minimum window, dock at 320, sidebar asking for everything',
        state: { ...shape, windowWidth: 960, sidebarWidth: 4096, dockWidth: DOCK_MAX },
        parent: { rail: 0, sidebar: 352, work: 240, terminal: 240 },
        now: { frame: 16, rail: 0, sidebar: 336, work: 240, terminal: 240 }
      },
      {
        name: 'THE FLOOR AGAIN: 1044, the narrowest window that seats the expanded rail',
        state: {
          ...shape,
          windowWidth: 1044,
          sidebarWidth: 4096,
          dockWidth: DOCK_MAX,
          projectsPosition: 'left',
          projectsCollapsed: false
        },
        parent: { rail: 200, sidebar: 284, work: 240, terminal: 240 },
        now: { frame: 16, rail: 200, sidebar: 268, work: 240, terminal: 240 }
      },
      {
        name: 'a 1030 window that asked for the expanded rail and no longer gets it',
        state: {
          ...shape,
          windowWidth: 1030,
          sidebarWidth: SIDEBAR_MIN,
          projectsPosition: 'left',
          projectsCollapsed: false
        },
        parent: { rail: 200, sidebar: 220, work: 410, terminal: 410 },
        now: { frame: 16, rail: 48, sidebar: 220, work: 546, terminal: 546 }
      },
      {
        name: 'a 1920 window with the editor split at a dragged 700',
        state: { ...shape, windowWidth: 1920, editorOpen: true, editorWidth: 700 },
        parent: { rail: 0, sidebar: 280, work: 1392, terminal: 692 },
        now: { frame: 16, rail: 0, sidebar: 280, work: 1376, terminal: 676 }
      },
      {
        name: 'the same 1920 window with the editor at its default split',
        state: { ...shape, windowWidth: 1920, editorOpen: true },
        // The default is 45% of the row, so the 16 is SHARED: the editor goes
        // 626 to 619 and the terminal 766 to 757. Seven and nine.
        parent: { rail: 0, sidebar: 280, work: 1392, terminal: 766 },
        now: { frame: 16, rail: 0, sidebar: 280, work: 1376, terminal: 757 }
      },
      {
        name: 'a 1200 window with a file open: the editor overlays, the terminal keeps the row',
        state: {
          ...shape,
          windowWidth: 1200,
          orientation: 'top',
          editorOpen: true,
          editorWidth: 480
        },
        parent: { rail: 0, sidebar: 280, work: 872, terminal: 872 },
        now: { frame: 16, rail: 0, sidebar: 280, work: 856, terminal: 856 }
      },
      {
        name: 'editor fill at 1440: the store holds the sidebar hidden and the dock on its rail',
        state: {
          ...shape,
          windowWidth: 1440,
          sidebarVisible: false,
          dockCollapsed: true,
          editorOpen: true,
          filling: true
        },
        // The terminal is display: none, the only safe vanish, at both commits.
        parent: { rail: 0, sidebar: 0, work: 1344, terminal: 0 },
        now: { frame: 8, rail: 0, sidebar: 0, work: 1336, terminal: 0 }
      },
      {
        name: 'SESSION FOCUS at 1440, over the default layout',
        state: { ...shape, windowWidth: 1440 },
        focus: true,
        parent: { rail: 0, sidebar: 280, work: 912, terminal: 912 },
        now: { frame: 16, rail: 0, sidebar: 280, work: 896, terminal: 896 }
      }
    ];

    /** The regions beside the work, as the module itself renders them. */
    function regions(s: Row['state']): {
      bar: number;
      rail: number;
      sidebar: number;
      dock: number;
    } {
      const projects = {
        projectsPosition: s.projectsPosition ?? ('top' as const),
        projectsCollapsed: s.projectsCollapsed ?? false
      };
      const dock = dockRenderedWidth(s, s.windowWidth);
      const rail = projectsRenderedWidth(projects, s.windowWidth);
      const bar = activityBarRenderedWidth({
        projectsPosition: projects.projectsPosition,
        sidebarVisible: s.sidebarVisible
      });
      const sidebar = s.sidebarVisible
        ? clampSidebarWidth(s.sidebarWidth, s.windowWidth, dock, rail, bar)
        : 0;
      return { bar, rail, sidebar, dock };
    }

    it('covers ten window sizes, both gutter answers, the floor and the fill', () => {
      // A table that never reaches the case it was written for proves nothing.
      expect(rows.length).toBeGreaterThanOrEqual(10);
      expect(new Set(rows.map((r) => r.state.windowWidth)).size).toBe(10);
      expect(new Set(rows.map((r) => r.now.frame))).toEqual(new Set([8, 16]));
      expect(rows.filter((r) => r.now.terminal === TERMINAL_FLOOR).length).toBe(2);
      expect(rows.some((r) => r.state.filling === true)).toBe(true);
      expect(rows.some((r) => r.focus === true)).toBe(true);
      expect(
        rows.some((r) => !r.state.sidebarVisible && r.state.dockCollapsed)
      ).toBe(true);
    });

    for (const row of rows) {
      it(row.name, () => {
        const s = row.state;
        const { bar, rail, sidebar, dock } = regions(s);
        const frame = frameReservedWidth({ sidebarVisible: s.sidebarVisible });

        // What this tree returns.
        expect(frame).toBe(row.now.frame);
        expect(rail).toBe(row.now.rail);
        expect(sidebar).toBe(row.now.sidebar);
        expect(workAreaWidth(s)).toBe(row.now.work);
        expect(terminalLayoutWidth(s)).toBe(row.now.terminal);

        // No pixel lost, at either commit. The second line is arithmetic over
        // the MEASURED parent numbers, so it also checks they were copied
        // down correctly. The bar and the dock did not move between the two.
        expect(bar + rail + sidebar + dock + row.now.work + frame).toBe(
          s.windowWidth
        );
        expect(
          bar + row.parent.rail + row.parent.sidebar + dock + row.parent.work
        ).toBe(s.windowWidth);

        // THE NEW TERM IS WHAT MOVED EACH NUMBER. Whatever left the rail, the
        // sidebar and the work between the two commits is the frame, exactly.
        expect(
          row.parent.rail -
            row.now.rail +
            (row.parent.sidebar - row.now.sidebar) +
            (row.parent.work - row.now.work)
        ).toBe(frame);

        // And the property the file exists for, at both commits.
        for (const terminal of [row.parent.terminal, row.now.terminal]) {
          expect(terminal === 0 || terminal >= TERMINAL_FLOOR).toBe(true);
        }
        // The terminal never GAINED from the frame except through the rail.
        if (row.parent.rail === row.now.rail) {
          expect(row.now.terminal).toBeLessThanOrEqual(row.parent.terminal);
          expect(row.parent.terminal - row.now.terminal).toBeLessThanOrEqual(frame);
        }
      });
    }

    it('takes the 16px out of the SIDEBAR, not the terminal, where the floor binds', () => {
      const floor = rows.filter((r) => r.now.terminal === TERMINAL_FLOOR);
      for (const row of floor) {
        expect(row.parent.terminal).toBe(TERMINAL_FLOOR);
        expect(row.parent.sidebar - row.now.sidebar).toBe(FRAME_RESERVED_MAX);
        expect(row.parent.work - row.now.work).toBe(0);
        // Without the reservation in `sidebarMaxWidth` the sidebar would have
        // kept its parent width and the row would have paid instead: 224px,
        // inside the reflow band.
        expect(row.parent.work - FRAME_RESERVED_MAX).toBe(224);
        expect(row.parent.work - FRAME_RESERVED_MAX).toBeLessThan(TERMINAL_FLOOR);
      }
    });

    it('has no focus input, so session focus cannot move a width the person chose', () => {
      // Session focus turns the frame OFF in the stylesheet: no margin, no
      // radius, no line, and the surface is drawn at the whole window. The
      // model deliberately does not follow it there (chromeGeometryOf's Phase
      // 80.1 note): its one consumer is the sidebar's clamp, the sidebar is
      // not drawn in focus mode, and what it returns is the ordinary layout
      // the window goes BACK to. So a store that carries `sessionFocus: true`
      // reads the same numbers as one that does not, frame term included.
      const focused = rows.find((r) => r.focus === true)!;
      const ordinary = rows.find(
        (r) => r.focus !== true && r.state.windowWidth === 1440 && !r.state.editorOpen
      )!;
      expect(focused.now).toEqual(ordinary.now);
      const withFocus = { ...focused.state, sessionFocus: true };
      expect(workAreaWidth(withFocus)).toBe(workAreaWidth(focused.state));
      expect(terminalLayoutWidth(withFocus)).toBe(focused.now.terminal);
      // What is DRAWN in focus mode is not this module's to say, and a reader
      // comparing the model with a rendered width has to know that: the
      // surface is `windowWidth` wide there, which is the model's row plus
      // every region beside it plus the gutters the mode switched off.
      const { bar, rail, sidebar, dock } = regions(focused.state);
      expect(
        focused.now.work + bar + rail + sidebar + dock + focused.now.frame
      ).toBe(focused.state.windowWidth);
    });
  });
});
