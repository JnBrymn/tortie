# Phase 284 — the quiet surround

**The contract for the four builders, the integrator and the verifier.** It decides. Read
`docs/BACKLOG.md` "## Phase 284" first; this file is subordinate to it and adds only the decisions the
entry left to the spec. Where this file departs from the study or from the entry's starting point it
says so under the heading THE DEPARTURE and gives the reason.

Subject: `feat(chrome): the work gets the one outline, and the surround goes quiet`
First body line: `Phase 284: the quiet surround`
Tree: `/private/tmp/wt-p284`, detached at `0f2f7f00`. Every path below is relative to it.

Every number in this file was computed or read on 2026-09-17, not recalled. The contrast arithmetic is
WCAG sRGB relative luminance; the rule 25 reading was run against the shipping `tokens.css`.

---

## 0. The ten decisions, in one screen

| # | Question | Decision |
| --- | --- | --- |
| 1 | Tokens | No new colour token. Surround `--bg-sidebar`, work `--bg-canvas`, the one outline `--border-strong`, selected-row outline `--border-active`, both fills `--bg-active`, seams `--border`, file filter already ships as `--bg-surface` + `--border-strong`. No file on the `conformance:hue` path list moves. |
| 2 | Radius | Three geometry tokens, `--r-frame: 14px`, `--frame-gap: 8px`, `--frame-edge: 1px`, in a NEW file `src/renderer/app/frame-geometry.css`, pulled in by `@import` from `work-area.css`. `tokens.css` is not touched, so rule 25 is not in play at all. Row radius is the existing `--r-md` (6px); no 7px token. |
| 3 | Frame and clip | The frame is `.work-area`. The OUTLINE is `.work-area::after`, drawn 1px OUTSIDE the work's box (in the gutter), `z-index: calc(var(--z-editor-overlay) + 1)`. The CLIP is on the frame's CHILDREN (`.work-area > *`, `overflow: clip`, inner radius 13px), never on `.work-area` itself. No DOM change: `App.tsx`, `TerminalRegion.tsx` and `SplitSurface.tsx` are not edited. |
| 4 | Session strip | INSIDE the curve, in both orientations, as the top 36px of the framed work. The band keeps `--bg-sidebar`, keeps `--bandline` at `--border` at rest and `--accent` when focused, and the active tab keeps its melt. The first tab takes the inner radius on its own top-left corner. No padded ends. |
| 5 | Gutters and ground | `.shell-body` takes `--bg-sidebar`. Margins on `.work-area`: right 8 always, bottom 8 always, left 8 only when the sidebar is drawn, top 0. No inset to the right of the dock and none under the sidebars. Focus mode turns the frame OFF. |
| 6 | Resizers | 5px hit areas centred in the 7px of gutter the outline leaves free, `--border-strong` on hover, `--accent` on `:focus-visible`; the dock's resizer GAINS the focus rule it never had. |
| 7 | Titlebar | Stays 38px. Loses its hairline by going `transparent`, never by losing the pixel. |
| 8 | Geometry | `FRAME_GAP = 8`, `FRAME_EDGE = 1`, `FRAME_RADIUS = 14`, `frameReservedWidth()`, `FRAME_RESERVED_MAX`. Two functions and one derived constant learn them. NO caller's signature changes. `PROJECT_RAIL_MIN_WINDOW_W` moves 1028 to 1044. |
| 9 | Selection | Dock row: bar out, `--bg-active` fill plus a 1px `--border-active` outline. Activity item: bar out, a `--bg-active` chip. The two full-bleed rails (collapsed dock, project rail) lose the bar and keep the fill alone, which is the project tab's own treatment. Editor tabs and session tabs do not change. |
| 10 | Ownership | Four builders, files disjoint, listed in §10. One new production file, three new test files, one new probe. |

---

## 1. The token mapping

### 1.1 The table

Contrast is `(Lhi + 0.05) / (Llo + 0.05)`. "on S" is against the surround, "on W" against the work.

| Study value | What it is | Token | Dark | Light | Study reads | Token reads, dark | Token reads, light |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#141a22` | ground behind the app | `--bg-sidebar` | `#0e0f13` | `#edeff3` | 1.007 against the work | 1.040 against the work | 1.073 against the work |
| `#1a1a1d` | work surface | `--bg-canvas` | `#131417` | `#f5f7fa` | same | same | same |
| `#3c3e43` | THE outline | `--border-strong` | `#353943` | `#adb1ba` | 1.634 on S, 1.622 on W | **1.658 on S, 1.594 on W** | **1.866 on S, 2.002 on W** |
| `#4a505a` | selected-row outline | `--border-active` | `#2d3038` | `#c1c4cc` | 2.154 on S, 1.392 on the fill | 1.452 on S, 1.105 on the fill | 1.516 on S, 1.271 on the fill |
| `#2a323d` | active activity chip | `--bg-active` | `#252931` | `#d9dce3` | 1.351 on S | 1.314 on S | 1.193 on S |
| `#343b45` | selected-row fill | `--bg-active` | `#252931` | `#d9dce3` | 1.547 on S | 1.314 on S | 1.193 on S |
| `#30343c` | seams inside the work | `--border` | `#25282e` | `#d1d3da` | 1.391 on W | 1.247 on W (unchanged from today) | 1.394 on W |
| `#2c333d` | usage seam | `--border` | `#25282e` | `#d1d3da` | 1.373 on S | 1.297 on S (unchanged) | 1.299 on S |
| `#1d242d` | file filter ground | `--bg-surface` | `#191b20` | `#fcfcfe` | 1.118 on S | 1.112 on S | 1.123 on S |
| `#353d47` | file filter border | `--border-strong` | `#353943` | `#adb1ba` | 1.423 on its ground | 1.491 on its ground | 2.097 on its ground |

### 1.2 The three questions the brief asked

**Does the outline read at least as strongly as today's hairline (1.297:1) against BOTH grounds on
BOTH bases?** Yes, with room, and no other token needs to be considered:

| | on the surround | on the canvas | today's hairline |
| --- | --- | --- | --- |
| dark | 1.658 | 1.594 | 1.297 on the sidebar, 1.247 on the canvas |
| light | 1.866 | 2.002 | 1.299 on the sidebar, 1.394 on the canvas |

Dark lands within 0.03 of the study's own pair (1.634 and 1.622), which is why no new neutral is
proposed. `--border-active` would also pass the floor (1.452 and 1.396 dark) and is REFUSED for the
frame: it is the row's outline, and the point of B is that the window has ONE strong outline, so the
frame takes the strongest rung of the border ramp and nothing else takes it at region size.

**Is the surround still darker than the work on the light base (`DESIGN.md:7`)?** Yes. Relative
luminance, dark: sidebar 0.00482 under canvas 0.00701. Light: sidebar 0.86209 under canvas 0.92836.
The frame is the darker ground on both bases, so "a light frame around a dark terminal" cannot occur.

**Does the treatment turn with the Appearance controls?** Yes, with no work. Every token in the table
is already in `HUE_TOKENS` (`src/renderer/theme/presets.ts:126-130`: the canvas, `CONTRAST_BG`,
`CONTRAST_BORDER`). `conformance:hue` already pins the ramp order surface, canvas, sidebar, raised,
active, border, border-active, border-strong at every offered frame, so `--border-strong` is the rung
furthest from both grounds at every frame and the outline can never read weaker than `--border` does.

### 1.3 Two study values that need NO change

The file filter. The Explorer's filter field lives in `@pierre/trees`' shadow root and is themed by
`src/renderer/pierre/theme-bridge.ts:159-160` as `input.background: P.bgSurface` and
`input.border: P.borderStrong`. That is the mapping above, already shipped. `theme-bridge.ts` is on the
`conformance:hue` path list and **nobody edits it**.

The seams. `.split-divider`, `.ed-panel`'s left border, `.restore-strip`, `.rail-footer` and the two
usage seams stay `--border`. See §9.4.

### 1.4 THE DEPARTURE: the row outline is weaker than the study's, on purpose

The study's row outline reads 1.392 on its fill; `--border-active` reads 1.105 dark. It is kept anyway.
`tokens.css:25-32` defines that token as "the hairline where it sits on `--bg-active`", which is this
exact use, and what the eye reads at a chip's edge is the step to the ground OUTSIDE it, which is 1.452
dark and 1.516 light, both above the 1.297 hairline it replaces. If the HEAD photograph shows the row
outline vanishing, the fix is `--border-strong` on that one declaration (1.262 on the fill, 1.658
outside, dark), and the commit body says so. It is not a reason for a new token.

### 1.5 What is owed to `conformance:hue`

Nothing by path: no file in its trigger list moves (§2 is why). Rule 26 (no colour literal anywhere in
`src`) is nevertheless the rule this phase is most likely to break, and no builder can run a 13 minute
gate. **The integrator should run `npm run conformance:hue` once.** Builders hold rule 26 by hand:
every colour is `var(--token)` or the keyword `transparent`, which `COLOUR_IN_VALUE` and
`COLOUR_NAME_IN_VALUE` (`build/conformance-hue.mjs:776-788`) do not match. Comments are stripped before
the scan, so a study hex may appear in a CSS comment, EXCEPT in `app.css` below the
`/* ---- S4A split surface` marker, where `focus-affordance.test.ts:117-120` reads comments too.

---

## 2. The radius and the gutter tokens

### 2.1 What rule 25 actually hashes, verified

`build/hue-conformance-probe.mts:114-133`: `tokensCssFor` strips every `/* */` comment, then
`schemeBlock(css, 'dark')` takes `css.indexOf(':root {')` to the FIRST `}` after it. `:1054-1056`
digests that slice, and `darkAsP213` digests it with the two Phase 218 greys put back.
`build/conformance-hue.mjs:1674-1698` compares `darkAsP213` with `DARK_AT_THE_PARENT.tokens`
(`:1957-1965`, `dc5f1cd8…`). `build/tokens-css.mjs:15-22` is the same slice for every other probe, and
the five theme tests inline it.

Run against the shipping file on 2026-09-17:

| Variant | Digest equals `dc5f1cd8…` |
| --- | --- |
| today | yes |
| a second `:root {` block placed AFTER the light block | yes, and the light digest is unmoved too |
| `--r-frame: 14px;` added INSIDE the first block | **no** |
| a new `:root {` block placed BEFORE the first | **no** (it becomes "the first") |

So a second block after the light base would be safe for rule 25. **It is still refused**, for two
reasons that have nothing to do with rule 25: `src/renderer/styles/tokens.css` is itself on the
`conformance:hue` path list, so touching it at all owes the 13 minute run; and no builder can run that
gate to check the other 31 rules against a file shape none of them has seen. It is recorded here as the
fallback if a later round wants these tokens beside `--r-lg`.

### 2.2 The decision

A NEW file, `src/renderer/app/frame-geometry.css`, owned by GEOMETRY, holding one `:root` block and
nothing else. Both bases inherit it because it is keyed on `:root` with no scheme attribute.
`work-area.css` (WORK) pulls it in with `@import './frame-geometry.css';` as its first statement, the
mechanism `src/renderer/styles/globals.css:6` already uses for `tokens.css`. `App.tsx:70` already
imports `work-area.css`, so no TSX import is added.

The exact text GEOMETRY writes (the header comment is GEOMETRY's to word, in the house voice; the block
is fixed):

```css
:root {
  --r-frame: 14px;
  --frame-gap: 8px;
  --frame-edge: 1px;
}
```

The header comment must say: these three mirror `FRAME_RADIUS`, `FRAME_GAP` and `FRAME_EDGE` in
`src/renderer/state/chrome-geometry.ts` BY VALUE and `chrome-geometry.test.ts` holds the two files to
one number; why they are not in `tokens.css` (§2.1); that `--r-lg` at 10px stays reserved for modals
(`DESIGN.md` §1.9) and `--r-frame` has exactly one user, the work's frame; and Phase 284.

### 2.3 No 7px token

The study rounds the session row and the activity chip at 7px. `.srow` already carries
`border-radius: var(--r-md)` (6px, `app.css:1116`), and `DESIGN.md` §1.9 names `--r-md` "rows'
selection fill". One pixel is not a reason for a fourth radius. `--r-pill` (8px) is refused: it is "a
16px badge or switch track, half its height", named after its shape so nobody joins it to a row.

---

## 3. The frame and the clip

### 3.1 Which element, and why the outline is outside the box

The frame is **`.work-area`** in both orientations. It already contains everything the curve has to
contain: `SessionStrip` (top orientation), `.work-row`, and through it `.center` (identity strip,
`RegionBars`, the terminal body with its scroll lane, `SplitSurfaceView`, `SplitDropOverlay`, the
banner) and `.ed-panel` in split, overlay and fill modes with its scrim.

**The outline is `.work-area::after` at `inset: calc(-1 * var(--frame-edge))`**, so it is drawn in the
first pixel of the gutter and NOT over the work. Three things follow, and they are why this was chosen
over an overlay at `inset: 0`:

1. **Nothing the work draws is ever under the line.** An overlay at `inset: 0` would cover the
   outermost pixel ring of the content. That ring holds the top half of the active tab's
   `inset 0 2px 0 var(--accent)` (`app.css:788`), which would read 1px instead of 2, and up to three
   sides of Phase 40's focused-split box (`app.css:2408-2415`), which sits at the pane's own outermost
   pixel.
2. **The outline is not a width term.** A 1px `padding` or a real `border` would keep the content clear
   too, but each changes the box xterm is laid out in by 2px in both axes. Drawn in the gutter, the
   line costs the terminal nothing beyond the gap it sits in. `FRAME_EDGE` is therefore exported for the
   radius arithmetic and the by-value test, and is in NO width formula (§8).
3. **No box moves vertically.** The top of the line lands on the titlebar's last pixel row, which is
   exactly where the hairline this phase removes used to be, and the band below it starts at y=38 as it
   does today.

It is an overlay and never a border or an inset shadow, per the house rule and Phase 40's precedent.

### 3.2 Why the clip is on the children

If `.work-area` itself clipped, it would clip its own `::after`, which lives outside its box. So
`.work-area` clips nothing, and each of its children clips itself at the INNER radius,
`calc(var(--r-frame) - var(--frame-edge))` = 13px. The outline's inner edge is a 13px arc about the
same centre (the `::after` box is 1px larger with a 14px radius, so its arc centre is (13, 13) in the
work's coordinates), which makes the two arcs concentric and coincident: the same pixels a real
`border` with `overflow` would give, with no clip edge anti-aliased against the line's own outer edge.

**`overflow: clip`, never `hidden`.** A `hidden` box is a scroll container, and a browser scrolls a
scroll container to reveal a focused element; xterm's helper textarea follows the cursor. A `clip` box
has no scroll offset to move. Electron 43 supports it with `border-radius`. It does not change
`min-width` resolution, and both children already state `min-width: 0`.

### 3.3 The exact rules WORK writes in `work-area.css`

`work-area.test.ts:94-96` asserts `expect(css).not.toMatch(/transition|animation/)` over the WHOLE
FILE, comments included. **The lowercase words `transition` and `animation` may not appear anywhere in
`work-area.css`, including in a comment.** The existing header gets away with `TRANSITIONS` and
`animated`. Write "NO WIDTH CHANGE OVER TIME" or keep capitals.

```css
@import './frame-geometry.css';

.work-area {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  margin: 0 var(--frame-gap) var(--frame-gap) 0;
  border-radius: calc(var(--r-frame) - var(--frame-edge));
  background: var(--bg-canvas);
}

[data-slot='sidebar'] + .work-area {
  margin-left: var(--frame-gap);
}

.work-area::after {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--frame-edge));
  border: var(--frame-edge) solid var(--border-strong);
  border-radius: var(--r-frame);
  pointer-events: none;
  z-index: calc(var(--z-editor-overlay) + 1);
}

.work-area > * {
  overflow: clip;
}

.work-area > :first-child {
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
}

.work-area > :last-child {
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
}
```

`.work-row` keeps its existing rule unchanged (`position: relative` is pinned by `work-area.test.ts:99`).

Notes that belong in the comments, with the facts:

- `.work-area`'s own `background` and radius exist so the anti-aliased seam between the line's inner arc
  and the children's clip arc composites over canvas and not over the surround.
- `inherit` on a corner longhand takes the parent's computed 13px. In the "right" orientation
  `SessionStrip` is not rendered, so `.work-row` is BOTH first and last child and takes all four. With
  no project `SessionStrip` returns null and the same holds.
- `position: relative` makes `.work-area` the `::after`'s containing block. It creates no stacking
  context (no `z-index`), so `.ed-panel.ed-overlay` at `--z-editor-overlay` keeps competing in the root
  context exactly as it does today.
- `[data-slot='sidebar'] + .work-area` works because `App.tsx:356-357` renders `<Sidebar />`
  immediately before `.work-area` and `Sidebar.tsx:397` stamps the slot. It is (0,2,0) against the base
  rule's (0,1,0), so source order does not matter.

### 3.4 The z-index

`calc(var(--z-editor-overlay) + 1)` = 301, in the root stacking context. The census of every `z-index`
under `src/renderer` on 2026-09-17: 1, 2, 3 and 4 locally; 100 the titlebar; 299 the editor scrim; 300
the editor overlay; 400 the focus copy and the Catch Me Up layer; 500 modal; 600 attention; 700 toast;
800 tooltips, hover cards and the file drop wash. So the line is ABOVE everything inside the work
(focused-split box 3, resizers 2, scroll lane 1, editor overlay 300, scrim 299) and BELOW the flying
copy, the overview layer, every modal, toast, tooltip and hover card. Native menus are not in the DOM.

### 3.5 What is inside the curve, element by element

| Thing | Why it is inside |
| --- | --- |
| Scroll lane (`scrollbar.css:11-15`) | Descendant of `.work-row`. PLUS the lane's foot lifts 8px, §3.6, because a clip that cuts the thumb is still a clipped scrollbar. |
| A split, any arity | `SplitSurfaceView` is inside `.term-body` inside `.center` inside `.work-row`. The focused-split box stays whole because the line is outside the box (§3.1). |
| Editor, split mode | `.ed-panel` is a flex child of `.work-row`. |
| Editor, overlay mode and its scrim (`editor.css:27-35`, `97-100`) | Both are `position: absolute` inside `.work-row`. The slide-in's `translateX(24px)` and the `--shadow-3` are now clipped at the row's edge, where they used to run over the dock. |
| Editor, fill mode (`editor.css:49-56`) | `position: absolute; inset: 0` inside `.work-row`. |
| `SplitDropOverlay` | Child of `.term-body.surface-root` at both of its mounts (`TerminalRegion.tsx:639` and `:792`). |
| Monaco's hover and suggest widgets | NOT clipped, correctly: `MonacoHost.tsx:111` sets `fixedOverflowWidgets: true`, and `overflow: clip` does not contain fixed descendants. |
| The file drop wash (`terminal/drop/drop.css:14-24`) | It is a `position: fixed` PORTAL on `document.body` at `--z-tooltip`, sized to the leaf's rect, so no clip reaches it. §3.7. |
| The session-focus flying copy | A fixed node on `document.body` at 400. §3.8. |

WORK greps `position: absolute` with a negative offset under the strip and the work row before
finishing, and names anything it finds in its report. Read on 2026-09-17: `.ed-divider` (`left: -3px`,
still inside the row), `.strip-overflow .badge-attention` (`top: -4px`, inside the 36px band) and
nothing else.

### 3.6 The scroll lane's foot (`scrollbar.css`, WORK)

`.gmux-terminal-scrollbar` gets `bottom: var(--space-4)` in place of `bottom: 0`. Measured against the
13px inner arc: the thumb's right edge sits `--scroll-thumb-inset` = 3px in, where the arc is 4.69px
deep (`13 - sqrt(13² - 10²)`); at the hover width its left edge is 9px in, where the arc is 0.63px deep.
So at live output, where the thumb rests at the lane's foot, up to 4.69px of it was under the curve. 8px
clears it, and 8px is the bottom padding `.xterm` already has (`app.css:1236`), so the thumb's foot
aligns with the last row's. It is uniform for every pane rather than only the pane at the frame's
corner, because CSS cannot know which pane that is and a lane that changes height when a split is
rearranged is worse than one that is 8px short. `TerminalScrollbar.tsx:46-48` reads the track's
`clientHeight`, so the thumb's travel follows with no TypeScript change. The top needs nothing: a lane
always has a 36px band or a 24px split header above it, and the arc is 13px tall.

### 3.7 The file drop wash (`terminal/drop/drop.css`, WORK)

`.attach-drop-zone` gains `border-radius: calc(var(--r-frame) - var(--frame-edge));` on all four
corners. It lights a whole leaf from a portal, so whichever pane it lights it can never push a square
corner through the curve. It is a transient wash during a drag; a uniform radius is the honest price of
not teaching a portal where the frame is.

### 3.8 The flying copy (`focus-copy.ts` and `focus-flight.ts`, WORK)

The flight's surface is `[data-surface-leaves]` (`focus-flight.ts:82`), the terminal body BELOW the
band, so only its BOTTOM corners can coincide with the frame's, and only where the body reaches them
(not above a banner, not beside a split editor). The copy is `position: fixed` at 400, above the line.

**Focus mode turns the frame off (§5.4)**, so exactly one end of every flight is framed: `first` on an
enter, `last` on a leave. The copy is laid out at `last` and drawn at `first` through `scale(sx, sy)`
(`invertTransform`), so a CSS radius on the node is exact on a leave and is scaled on an enter.

1. `focus-flight.ts`: add `measureFocusRects(shell, elements, to): FlightRect[]`, the existing one-task
   toggle reading several elements in ONE forced layout. `measureFocusRect` becomes a one-element
   wrapper over it, signature and behaviour unchanged, so its three tests (`focus-flight.test.ts:216-
   260`) hold as written. `fly()` finds `frame = surface.closest('.work-area')` and computes the frame's
   rect AT THE FRAMED END: on an enter a plain `rectOf(frame)` before anything toggles; on a leave the
   second element of `measureFocusRects(shell, [surface, frame], 'ordinary')`. It passes
   `{ frame, end: to === 'focused' ? 'first' : 'last' }` as a new optional FIFTH argument to
   `buildStillCopy`. No second toggle, no second forced layout on an enter.
2. `focus-copy.ts`: a PURE exported helper,
   `copyCornerRadii(first, last, framed, radius)`, returning the four corners as `[rx, ry]` pairs. A
   corner is rounded when the framed rect's two edges at that corner are within 0.5px of the frame
   rect's; otherwise `[0, 0]`. At `end === 'last'` the pair is `[radius, radius]`. At `end === 'first'`
   it is `[radius / sx, radius / sy]` with `sx = first.width / last.width` and
   `sy = first.height / last.height`, so the first painted frame shows exactly 13px. A zero-sized `last`
   returns all zeroes.
3. `radius` is read where `flightTiming()` already reads `--dur-panel`
   (`focus-flight.ts:250-262`): `getComputedStyle(document.documentElement)`, `--r-frame` minus
   `--frame-edge`, `parseFloat`. **Unreadable means 0 and a square copy**, which is what unit tests get.
   No literal 14 or 13 is written in either file, and nothing is imported from `chrome-geometry.ts`
   (whose header forbids a second copy of a layout constant).
4. `buildStillCopy` writes the four `border-*-radius` inline styles on the node. `.gmux-focus-copy`
   already has `overflow: hidden` (`focus-mode.css:231`), which is the clip. It adds NO child, so
   `focus-copy.test.ts:462-468` (document order canvas, header, canvas, header) holds as written.
5. The test doubles have no `closest`; guard with `typeof surface.closest === 'function'`.

**What is NOT built, stated.** The frame's outline does not fade with the chrome. On an enter it stays
drawn under the growing copy, which covers it within a frame or two; on a leave it is simply there at
the swap while the chrome fades in. `[data-focus-arriving]`'s selector list is pinned at exactly eight
regions (`focus-mode.test.ts:298`) and an opacity on a pseudo-element of the terminal's container is
not worth arguing with S12.7 over.

---

## 4. The session strip and the focus signals

### 4.1 The strip sits inside the curve

**Refused: above the framed surface, in the surround.** It would be B's thesis taken literally
(navigation lives in the surround), and it breaks both signals. The frame's top line would run between
the active tab and the terminal, so the tab could not melt; and the band's hairline would sit one pixel
above that line, a double rule, so it would have to go, taking the focus signal with it. It would also
make the two orientations different shapes, because in the "right" orientation the identity strip is
ALREADY inside `.center` (`TerminalRegion.tsx:608-622`).

**Decided: inside, as the first 36px of the frame, in both orientations.** `.work-area` is the frame,
and the band is the first thing in it, the way a window's title area is inside the window.

### 4.2 Both signals are kept, unchanged

- `.term-header { --bandline: var(--border); }` and `.term-header.term-focused { --bandline:
  var(--accent); }` (`app.css:708-721`) are NOT edited. The hairline is at y=35 of a 36px band and the
  inner arc is 13px tall, so **the curve never reaches the hairline**; it meets the outline at both ends
  in a T.
- `.stab.active` (`app.css:784-789`) is NOT edited: canvas fill, transparent bottom border, 2px accent
  top inset.
- `.identity-strip` (`:902-907`) and `.restore-strip` (`:949-959`) are NOT edited. Both are inside
  `.center`, inside the clip. The identity strip's content starts 12px in, where the arc is 0.04px
  deep.

### 4.3 THE DEPARTURE: the work's band keeps its rule and its ground

The study sets `.terminal .panel-header { border-bottom-color: transparent }` and draws the header on
the work's own surface. The app keeps `--bandline` and keeps `background: var(--bg-sidebar)` on
`.term-header`, `.split-header` and `.ed-tabs`. Reasons: the brief says the app's behaviour wins here;
"the band TURNS accent" needs a line at rest to turn; the melt is defined as the one interruption of
that line; and the 1.040 (dark) and 1.073 (light) step between band and canvas is half of what makes
the active tab read as the terminal's. "Panel header rules fall away" is therefore read as the
SURROUND's header rules: `.view-header`, `.dock-toolbar`, `.prail-band`, `.activitybar-row`.

### 4.4 The first tab, and why there are no padded ends

The strip's clip cuts the first tab's top-left 13px. Its content is safe (it starts 10px in, where the
arc is 0.35px deep), but its accent inset would stop dead at about x=6.1, where the arc is 2px deep
(`13 - sqrt(13² - 6.93²)`), and its inset focus ring would lose a corner.

**Refused: a 14px lead-in.** `StripUsageMeter.tsx:58-72` budgets the band from `header.children` and
`header.getBoundingClientRect().width`. A pseudo-element is not in `children` and padding IS in that
width, so either form makes the meter believe it has 14px it does not, and `probe:p1811` measures
exactly that arithmetic. It would also need a fourth drawer of the band's hairline.

**Decided: the first tab takes the inner radius itself.** An inset `box-shadow` follows its own box's
`border-radius`, so the accent bar and the focus ring then FOLLOW the curve instead of being cut by it.
One rule, in `app.css`, which SURROUND adds immediately after `.stab.active`:

```css
.stab-list > .stab:first-child {
  border-top-left-radius: calc(var(--r-frame) - var(--frame-edge));
}
```

When the list is scrolled a middle tab sits under the curve and is cut by it, which is what scrolling
content under a rounded edge does. The right end needs nothing: the `+` button is 4px in and 6px down,
11.4px from the arc's centre, inside it.

The same problem exists for the editor's first tab in ONE state, fill mode in the "right" orientation,
where `.ed-tabs` is at the frame's top-left. WORK adds to `editor.css`:

```css
.work-area > .work-row:first-child > .ed-panel.ed-fill .ed-tab:first-child {
  border-top-left-radius: calc(var(--r-frame) - var(--frame-edge));
}

.work-area > .work-row:first-child .ed-tabs {
  border-top-color: transparent;
}
```

The second rule is the editor tabs' top hairline in the "right" orientation, where nothing is above the
row. It exists to close the editor's box under the strip (`editor.css:171-176`); with no strip the
frame's own line closes it, and `--border` directly under `--border-strong` is a 2px double rule. The
colour goes and the pixel stays, so the row is still 36px.

---

## 5. The gutters and the ground

### 5.1 The ground

`.shell` stays `--bg-canvas` (`app.css:10-15`): it is the pre-paint agreement with
`WINDOW_BACKGROUND`, and focus mode and the Catch Me Up layer rely on it.
`canvas-color-single-source.test.ts` is untouched and stays true. **`.shell-body` takes
`background: var(--bg-sidebar)`** (SURROUND, `app.css:17-21`), so the gutters and the four corner
wedges outside the curve read as the surround.

### 5.2 The gutters, as margins on `.work-area`

No `gap` on `.shell-body`: it would also open gaps between the project rail, the activity bar and the
sidebar, which the study does not have (its rail is outside `.workspace`). No wrapper element: that
would touch `App.tsx`, whose exact `<div className="shell-body">` and `<div className="work-row">` text
two tests slice on (`work-area.test.ts:34`, `unreachable-presentation.test.tsx:432`).

| Side | Value | When |
| --- | --- | --- |
| top | 0 | always; the line lands on the titlebar's last pixel row |
| right | 8 | ALWAYS. With the dock it is the gap to the dock; without it, it is the right inset |
| bottom | 8 | always |
| left | 8 | only when `<Sidebar />` is drawn; 0 against the activity column |

### 5.3 THE DEPARTURE: no inset beyond the dock, none under the sidebars

The study pads `.workspace`, so it has 8px to the right of Sessions and 8px under Explorer and
Sessions. Both bands are the surround's colour on the surround's ground: invisible. In the app the
first would cost every terminal another 8px of width and the second would lift the dock's usage meter,
the rail footer, the activity gear and the tree's foot by 8px, for nothing a person can see. The probe's
claim ("inset 8px on the right and the bottom, separated by 8px from both sidebars") is about the WORK,
and this satisfies it in both orientations.

### 5.4 Every state the brief named

| State | What happens |
| --- | --- |
| Sidebar hidden (⌘B, or its drag snap) | No left gap. The frame's left line lands on the activity column's last pixel column, which holds nothing (the chip is inset 6px, §9.2; `.ab-badge` is `right: 4px`). The study does the same. One resize per leaf, as ⌘B already costs. |
| Dock collapsed to the 48px rail | The right gap stays 8. The dock's resizer stays in it. |
| Dock absent ("top" orientation) | The right margin is the right inset, 8px to the window edge. |
| Editor fill mode | Sidebar and dock are put away, so left 0, right 8, bottom 8. The file fills `.work-row`, inside the clip. |
| Project rail present | `[rail][activity column or nothing][sidebar][8][work][8][dock]`. The rail is never adjacent to the work: the activity column or the sidebar is always between. |
| Activity bar in ROW form (`activity-bar.css:28-35`) | The row lives at the sidebar's head and takes no width; the left gap follows the sidebar, which is by definition visible. The row's bottom hairline goes `transparent` (§9.3). |
| **Focus mode** (`focus-mode.css:70-112`) | **The frame is OFF**: no margin, no radius, no line. The mode's promise is "the session surface gets the whole window", the surround is not drawn, and a frame around nothing is the refusal in `DESIGN.md:7` turned inside out. Today's focus geometry is therefore byte for byte unchanged. |
| Catch Me Up open | `.work-area` is `display: none` (`overview.css:19-21`), and its `::after` with it. `overview.css` is NOT edited. |
| Boot blocks and first run | They render no `.shell-body`. They do render `.titlebar`, which loses its hairline like every other. |

The focus rule WORK adds to `focus-mode.css` as a new section 7, AT THE END OF THE FILE (the tests use
`rules.find`, so the grouped `display: none` of section 1 must stay the first match):

```css
.shell.session-focus .work-area,
.shell.gmux-focus-measure .work-area {
  margin: 0;
  border-radius: 0;
}

.shell.session-focus .work-area::after,
.shell.gmux-focus-measure .work-area::after {
  display: none;
}
```

Both classes in ONE rule each, because `measureFocusRect` adds `.gmux-focus-measure` on an enter and
REMOVES `.session-focus` on a leave inside one task to ask where the surface will be
(`focus-flight.ts:215-228`); a frame that turned off under one class and not the other would send the
copy to a rect 8px out. `focus-mode.test.ts:104-128` enforces the twin for any rule that declares
`margin` or `display`. (0,3,0) beats the sidebar adjacency rule's (0,2,0), and the sidebar is still the
previous sibling while it is `display: none`. The children's radii follow through `inherit`.

`.shell.overview-open` is NOT added: the work is not drawn there.

---

## 6. The resizers

Both move from overhanging a divider to sitting IN the gutter. The gutter is 8px and the line takes the
pixel nearest the work, leaving 7; a 5px handle centred in 7 leaves 1px each side. Written so it stays
centred if the gap ever moves:

```css
.sidebar-resizer {
  /* …unchanged… */
  right: calc((var(--frame-gap) + 5px - var(--frame-edge)) / -2);   /* -6px */
  border-radius: var(--r-xs);
}

.dock-resizer {
  /* …unchanged… */
  left: calc((var(--frame-gap) + 5px - var(--frame-edge)) / -2);    /* -6px */
  border-radius: var(--r-xs);
}

.dock-resizer:focus-visible {
  outline: none;
  background: var(--accent);
}
```

- Hover and `.dragging` keep `background: var(--border-strong)` on both, unedited.
- `.sidebar-resizer:focus-visible` (`app.css:502-505`) is unedited. `.dock-resizer` has NO
  `:focus-visible` rule today although `useResizeHandle` makes it a real `role="separator"` tab stop; it
  gets the sidebar's, word for word. That is the "visible `:focus-visible` state" the entry asks for,
  and it is a defect fixed in passing: say so in the commit body.
- Both handles keep `width: 5px`, `z-index: 2`, `col-resize`, and live inside their own `<aside>`, so
  the work's clip cannot reach them and the line at 301 is 1px clear of them.
- The comments above both rules are rewritten: there is no divider under the handle any more, and the
  reason a focused handle lights in accent rather than wearing a ring now reads "over the gutter".
- `build/probe-p129-projects.mjs:221-223` and `build/probe-p150-ribbon.mjs:533` find the handles by
  class and drag them by their own rect's centre. Both keep working; PROBE-DOCS confirms by reading,
  not by running.

---

## 7. The titlebar

**It stays 38px.** The study's own note calls the extra 6px "a visual tradeoff rather than a functional
requirement" (`design/system/container-map.md:20`). In the app 38 is pinned in five places, not three:
`focus-mode.css:106-112`, `focus-mode.test.ts:336-345`, `overview.css:25`, `.focus-wash`'s `height:
38px` (`focus-mode.css:264`) and the traffic lights at `{x: 12, y: 12}` (`DESIGN.md` §2.1), which are
centred for a 38px band. And with the line drawn outside the work (§3.1) the frame's top edge occupies
the row the titlebar's hairline occupied, so the band already reads as more open. Nothing B needs is
missing at 38.

The edit (SURROUND, `app.css:27-39`): `border-bottom: 1px solid var(--border)` becomes
`border-bottom: 1px solid transparent`. **`transparent`, never deleted.** The band is `box-sizing:
border-box`, so deleting the border grows its content box from 37 to 38 and shifts every centred child
half a pixel. `focus-mode.css:116-120` already transitions `border-bottom-color` to transparent in
focus mode and `focus-mode.test.ts:275` names that property; both stay meaningful.

**That is the rule for every hairline this phase removes: the colour goes and the pixel stays.** No box
in the surround moves, which is what makes the parent-to-HEAD rectangle comparison in the probe clean.

---

## 8. Geometry

### 8.1 The constants (GEOMETRY, `chrome-geometry.ts`, beside `ACTIVITY_BAR_W`)

```ts
export const FRAME_GAP = 8;      // --frame-gap
export const FRAME_EDGE = 1;     // --frame-edge. NOT a width term: the line is drawn in the gap
export const FRAME_RADIUS = 14;  // --r-frame. No arithmetic here reads it

/** The gutter the work's frame takes out of the row. */
export function frameReservedWidth(p: { sidebarVisible: boolean }): number {
  return FRAME_GAP + (p.sidebarVisible ? FRAME_GAP : 0);
}

/** Both gaps: the worst case, for the two places whose answer must not move on ⌘B. */
export const FRAME_RESERVED_MAX = 2 * FRAME_GAP;   // 16
```

The vertical 8px is `FRAME_GAP` too and is in no function: the file's own note at `:405-406` says "no
arithmetic in this file reads a height", and that stays true.

### 8.2 The three edits

1. **`workAreaWidth` (`:456-498`)**: the return becomes
   `w.windowWidth - activityBar - projects - sidebar - dock - frameReservedWidth({ sidebarVisible: w.sidebarVisible })`,
   inside the same `Math.max(0, Math.round(...))`. The term is measured AFTER the sidebar; say why in
   the comment the way Phases 129 and 135 did (it depends on nothing, and nothing but the sidebar's
   ceiling depends on it).
2. **`sidebarMaxWidth` (`:269-297`)**: `roomLeft` subtracts `FRAME_RESERVED_MAX`. The sidebar is by
   definition drawn whenever its ceiling is asked for, so both gaps are. Without this the sidebar can
   be dragged 16px into the terminal's floor, the Phase 18 fix round's defect with a new term.
3. **`PROJECT_RAIL_MIN_WINDOW_W` (`:167-168`)** adds `+ FRAME_RESERVED_MAX`: 1028 becomes **1044**. It
   takes the MAX and not `frameReservedWidth(...)` for the reason `:158-165` gives about the activity
   bar: the rail's rendered width may move only when the WINDOW does, never on ⌘B.

`terminalLayoutWidth` (`:512-538`) needs **no edit**: it is `workAreaWidth` and the editor clamps over
it. `editorMaxWidth`, `editorIsOverlay`, `defaultSplitWidth` and `clampEditorWidth` reason about the
row that seats the editor and the terminal, which is exactly what `workAreaWidth` now returns.

### 8.3 Every caller, and what each must learn

| Caller | Learns |
| --- | --- |
| `state/chrome-slice.ts:246-313` `chromeGeometryOf` | Nothing. It calls `sidebarMaxWidth` and `workAreaWidth` with arguments both already take. Its Phase 80.1 note (it computes as if the chrome were drawn while focus is on) stays true and stays deliberate. |
| `state/chrome-slice.ts:374-389` `setSidebarWidth` | Nothing. |
| `state/store.ts:147` `liveChromeGeometry` | Nothing. |
| `app/Sidebar.tsx:370-386` | Nothing. |
| `editor/EditorPanel.tsx:441-459` | Nothing. |
| `app/fill-chord.ts:122`, `editor/fill.ts:33` | Nothing. |

**No signature changes and no caller is edited.** That is the design, not luck: every new term is
derivable from `sidebarVisible`, which both functions already receive or imply.

### 8.4 The floor still holds (computed, and GEOMETRY makes it executable)

At the 960px minimum window, dock at its 320 ceiling, no rail: `sidebarMax = clamp(480, 220, 960 - 48 -
320 - 240 - 16 = 336) = 336`, terminal `960 - 48 - 336 - 320 - 16 = 240`. Exactly the floor. With a
collapsed rail and the activity row: `roomLeft = 960 - 0 - 48 - 320 - 240 - 16 = 336`, terminal 240. At
1044 with the rail expanded and the row form: `roomLeft = 1044 - 0 - 200 - 320 - 240 - 16 = 268 ≥ 220`,
terminal 240. The grid test at `chrome-geometry.test.ts:320-415` proves it over every combination.

### 8.5 What a person will notice, stated rather than discovered

- Every visible session is resized ONCE at the first paint after the upgrade: 8 or 16px narrower, 8px
  shorter. Never during a flight; `DESIGN.md:388-389` and S12.7 stand.
- A window 1028 to 1043px wide with the project rail expanded now draws it collapsed. Intent is kept and
  comes back with the window.
- In the "right" orientation the row falls under `SPLIT_MIN_WORK_AREA` 16px sooner, so a few window and
  sidebar combinations that split the editor now overlay it.

### 8.6 The CSS and the constants are one number

GEOMETRY adds to `chrome-geometry.test.ts`, in the manner of its existing `minWidth: 960` assertion
against `src/main/index.ts`: read `src/renderer/app/frame-geometry.css`, strip comments, and assert it
declares exactly `--r-frame: ${FRAME_RADIUS}px`, `--frame-gap: ${FRAME_GAP}px` and
`--frame-edge: ${FRAME_EDGE}px`, that those are the ONLY three declarations in the file, and that the
file contains no `var(--` colour and no colour literal.

---

## 9. The selection treatments

Keyboard `:focus-visible` rings stay everywhere and are not edited.

### 9.1 The dock row (`app.css:1125-1138`, SURROUND)

```css
.srow.selected {
  background: var(--bg-active);
  outline: 1px solid var(--border-active);
  outline-offset: -1px;
}
```

and the `.srow.selected::before` rule is DELETED. `outline`, as the study has it, and NOT an inset
`box-shadow`: `.srow.selected` is (0,2,0) and the global `:focus-visible { box-shadow: var(--focus-ring)
}` (`globals.css:98-101`) is (0,1,0), so a box-shadow here would silently take a focused row's ring.
The global `:focus { outline: none }` is (0,1,0) too and loses to this, which is wanted. Chromium draws
an outline along `border-radius`, and the row keeps `--r-md`.

### 9.2 The activity item (`app.css:364-426` and `activity-bar.css`, SURROUND)

The 2px bar goes and the fill becomes a chip, **on the element itself and not on a pseudo-element**,
because `build/probe-p150-ribbon.mjs` reads the computed `backgroundColor` of the button under a real
pointer and must keep reading `--bg-raised` there.

```css
.ab-item {
  /* …existing… */
  padding: var(--space-3);                                 /* 6px: a 36px chip in the 48px cell */
  border-radius: calc(var(--r-md) + var(--space-3));       /* 12px on the box is 6px on the chip */
  background-clip: content-box;
}

.ab-item:hover {
  background-color: var(--bg-raised);   /* was the `background` shorthand */
  color: var(--text-secondary);
}

.ab-item.active {
  color: var(--text-primary);
  background-color: var(--bg-active);
}
```

and the `.ab-item.active::before` rule is DELETED.

- **`background-color`, never the `background` shorthand, on the hover rule.** The shorthand resets
  `background-clip` to `border-box` and the chip becomes a full-bleed square on hover only. This is the
  easiest mistake in the phase.
- A background clipped to the content box takes `max(0, radius - padding)` as its corner, so 12 on the
  box is `--r-md` on the chip.
- The cell stays 48×48 (`box-sizing: border-box`), the 24px codicon stays centred (`inline-flex`, both
  axes centred), and `.ab-badge` is absolutely positioned against the padding box, which with no border
  IS the border box, so the badge does not move. The hit area is the whole cell, unchanged.
- `.ab-item.active` follows `.ab-item:hover` at equal specificity, so a hovered active item stays
  `--bg-active`, the ordering `.srow.selected` already relies on.
- The Phase 150 comment's last two paragraphs ("TWO THINGS THIS MUST NOT DISTURB" and "The square is
  full bleed rather than a rounded chip") are REWRITTEN: the marker was the reason for full bleed, the
  marker is gone by the operator's ask of 2026-09-17, and the chip is the project tab's own shape.
- **SURROUND must read `src/renderer/app/update-ring.css` first.** The gear is `.ab-item.
  activitybar-settings` and, on update days, `.update-ring` at `width: 48px`. If the ring's SVG is sized
  from its button's content box, 6px of padding shrinks it; exclude it
  (`.ab-item.update-ring { padding: 0; }`) and say so in the report.

Row form (`activity-bar.css:42-64`): `.activitybar-row .ab-item` adds `padding: var(--space-2);
border-radius: calc(var(--r-md) + var(--space-2));` (a 28px chip in the 36px band), and the
`.activitybar-row .ab-item.active::before` rule is DELETED with its comment.

### 9.3 The hairlines, one row per rule (all SURROUND unless marked)

Each becomes `1px solid transparent`. None is deleted.

| Rule | Side | File |
| --- | --- | --- |
| `.titlebar` | bottom | `app.css:35` |
| `.activitybar` | right | `app.css:360` |
| `.activitybar.activitybar-row` | bottom (its `border-right: none` stays) | `activity-bar.css:34` |
| `.sidebar` | right | `app.css:472` |
| `.view-header` | bottom | `app.css:531` |
| `.session-dock` | left | `app.css:981` |
| `.dock-toolbar` | bottom | `app.css:1008` |
| `.prail-band` | bottom | `project-rail.css:47` |

The S3 and S2 banner comments in `app.css` that say "hairline bottom" are corrected. The header
comments of `session-rail.css:7` and `project-rail.css:19` ("one 1px `--border` edge") are corrected.

### 9.4 What does NOT change, and why

| Thing | Ruling |
| --- | --- |
| `.project-rail`'s `border-right` (`project-rail.css:31`) | **STAYS.** It never faces the work (§5.4). It separates two lists of NAMES, the projects and the tree, which with no seam read as one list. Its BAND rule goes (§9.3): a lone 200px hairline beside three bare headers is noise. |
| `.prail-row.selected::before` and `.rail-item.selected::before` | **DELETED; the fill stays; NO outline.** Their own comments call them "the same 2px accent marker" as the dock row's, so leaving them would bring the bar back the moment the dock is collapsed. But both are FULL-BLEED rows, and a 1px outline on a full-bleed row is two rules across the rail. Fill alone is the project TAB's existing treatment (`.ptab.selected`), at the same 1.314 dark and 1.193 light. Chipping them would change their hit areas and the project names' truncation width, which is a thing a person can do. |
| Editor tabs (`editor.css:211-238`) and session tabs | Unchanged. The 2px accent TOP inset is a tab's melt, not a row's marker, and the study draws no tabs. |
| `.ed-panel`'s `border-left` (`editor.css:18`) | **STAYS**, and this corrects the entry, which lists it among the hairlines B removes. `design/prototypes/styles.css:158` sets it and lines 180-197 do not override it; `container-map.md` says "keep internal split dividers straight". It is a seam INSIDE the work, like `.split-divider`. `.ed-panel.ed-fill`'s `border-left: none` stays; WORK rewrites its comment, which credits the activity bar with a hairline that no longer exists. |
| The usage seams (`usage-meter.css:96`, `:206`) | **STAY `--border`.** B recolours and insets the full one; it removes neither. `.usage-full` gains `margin: 0 var(--space-3);` and its padding becomes `var(--space-3) var(--space-2)`, the study's `margin: 0 6px` and 4px. `p1811-mini-clothes.test.ts:100` keeps its `border-top:` and `:105-108` still holds because the change is to `.usage-full`, not `.usage-mini`. |
| `.rail-footer`, `.restore-strip`, `.split-header`, `.ed-tabs`' bottom rule | Unchanged: internal seams. |
| Everything below `/* ---- S4A split surface` in `app.css` | **NOT TOUCHED.** `focus-affordance.test.ts` stays green as written. |

---

## 10. Ownership, disjoint by file

Four builders in ONE tree. A test that reads another builder's file goes green when that file lands; a
builder whose own run was red only for that reason says so and names the file. Nobody edits a file that
is not in their list. A file marked (expected unchanged) is owned so that nobody else touches it.

### SURROUND
- `src/renderer/styles/app.css`: §5.1 ground; §7 titlebar; §9.2 activity item; §9.3 rows; §6 both
  resizers and the new dock focus rule; §4.4 first-tab rule; §9.1 dock row. **All above the S4A
  marker.**
- `src/renderer/app/activity-bar.css`: §9.2 row form, §9.3.
- `src/renderer/app/project-rail.css`: §9.3 band, §9.4 selected bar.
- `src/renderer/app/session-rail.css`: §9.4 selected bar, header comment.
- `src/renderer/app/usage-meter.css`: §9.4.
- `src/renderer/app/update-ring.css`: only if §9.2's check requires the exclusion.
- NEW `src/renderer/app/__tests__/p284-quiet-surround.test.ts`.
- Owned, expected unchanged: `src/renderer/app/__tests__/p1811-mini-clothes.test.ts`,
  `p135-rail-controls.test.tsx`, `p135-top-controls.test.ts`,
  `src/renderer/app/split/__tests__/focus-affordance.test.ts`.

### WORK
- `src/renderer/app/work-area.css`: §3.3.
- `src/renderer/app/focus-mode.css`: §5.4 section 7, plus a line in the header naming it.
- `src/renderer/app/focus-copy.ts`, `src/renderer/app/focus-flight.ts`: §3.8.
- `src/renderer/terminal/scroll/scrollbar.css`: §3.6.
- `src/renderer/terminal/drop/drop.css`: §3.7.
- `src/renderer/editor/editor.css`: §4.4's two rules and the `.ed-fill` comment.
- Tests: `src/renderer/app/__tests__/work-area.test.ts`, `focus-mode.test.ts`, `focus-copy.test.ts`,
  `focus-flight.test.ts`; NEW `src/renderer/app/__tests__/p284-work-frame.test.ts`.
- Owned, expected unchanged: `src/renderer/terminal/terminal.css`,
  `src/renderer/overview/overview.css`, `src/renderer/app/App.tsx`,
  `src/renderer/app/TerminalRegion.tsx`, `src/renderer/app/split/SplitSurface.tsx`,
  `src/renderer/app/SessionStrip.tsx`, `src/renderer/app/StripUsageMeter.tsx`.

### GEOMETRY
- `src/renderer/state/chrome-geometry.ts`: §8.
- NEW `src/renderer/app/frame-geometry.css`: §2.2.
- `src/renderer/state/__tests__/chrome-geometry.test.ts`: §8.6 and the moved pins in §12.
- Owned, expected unchanged: `src/renderer/state/chrome-slice.ts` (a comment at most),
  `src/renderer/state/__tests__/chrome-state.test.ts`,
  `src/renderer/app/__tests__/sidebar-resize.test.ts`, `p129-fill-chord.test.ts`,
  `src/renderer/editor/__tests__/p165-fill.test.ts`.

### PROBE-DOCS
- NEW `build/p284/probe-p284.mjs`: §11.
- `package.json`: `"probe:p284": "npm run build && node build/harness-socket.mjs --fresh gmux-p284 'node build/p284/probe-p284.mjs'"`.
- `build/verification-checks.mjs`: `electron('probe:p284')`, beside `electron('probe:p277')`.
- `build/assert-electron-teardown.mjs`: `HELPER_USER_FLOOR` 141 to 142, with the dated note the file
  keeps for each raise.
- `build/probe-p129-projects.mjs`: the 1028 in its header becomes 1044, and any literal in its body.
- `DESIGN.md`: §0 (the chrome and the terminal are no longer "the same material": two grounds, the work
  on the canvas inside one outline, the surround a rung under it; the refusal of a light frame around a
  dark terminal STANDS and §1.2 above is why it still holds); §1.9 (`--r-frame` and the two gutter
  tokens, where they live and why they are the one exception to "all tokens in tokens.css"; "regions are
  separated by hairlines" becomes the work's outline and the gutter); §2.2 (the diagram, the header band
  bullet, the activity bar bullet, the region divider bullet); §3's rows for the session list row and
  the activity bar item.
- `docs/DESIGN-SPEC.md`: S1 (HEADER BAND, Activity bar, Region dividers, and the right-list divider);
  S4 (the dock row and the band); S12.9 (the acceptance is no longer one unbroken hairline across the
  window: it is ONE complete outline, an unbroken band hairline INSIDE it with the one sanctioned
  interruption, and no hairline in the surround facing the work). S12.7 is NOT edited; it stands.
- `docs/research/75-chrome-visual-language.md`: a dated note at the top. On 2026-09-17 the operator
  asked for the opposite of the kept edges this document records, in his own words ("i love the queit
  surround"); Phase 284 follows the newer ask; the measurements below remain true of the tree they
  measured.
- `CHANGELOG.md`, Unreleased, Changed, ONE line in the house style. Draft: "The terminal and editor now
  sit inside one rounded outline with a little room around it, and the title bar, the sidebars and the
  session list lose the lines that divided them from it. The selected session and the active view are
  marked by a soft fill instead of a blue bar. Nothing works differently; each open session is a few
  columns narrower."
- The native menus do not change, and the phase brief says so.

---

## 11. The probe

`build/p284/probe-p284.mjs`, launched ONLY through `withElectron` from `build/electron-run.mjs`, on the
socket `build/harness-socket.mjs --fresh gmux-p284` hands it, with a scratch profile, a scratch `HOME`
and one scratch project; everything ended and unlinked in a `finally`. Siblings to copy from, by
mechanism: `build/probe-session-focus.mjs` (harness socket, real shell sessions, a split, the read-only
census of `-L gmux`), `build/probe-p150-ribbon.mjs` (real pointer moves and a resizer drag over CDP,
`Page.captureScreenshot`), `build/probe-p1811-strip-fit.mjs` (`Emulation.setDeviceMetricsOverride` for
window widths), `build/probe-p214-light-face.mjs` (switching base and hue through the app's own settings
door), `build/p258/probe-p258-surface.mjs:1002-1044` (the parent pattern).

**It judges rectangles, computed styles and hit tests, never pixels.** Screenshots are for a person.

### 11.1 One session, these states in this order

`A` "right" orientation, sidebar shown, one shell session with 300 lines of scrollback (so a thumb
exists). `B` "top" orientation. `C` a two-way split. `D` a file open at 1440 wide (editor split). `E`
the same at 1200 wide (editor overlay and scrim). `F` editor fill. `G` sidebar hidden and dock
collapsed. `H` focus mode in and out. `I` the light base. `J` one turned hue on dark. Sessions are
`agentId: null` shells; no agent, no token.

### 11.2 The readings

| Id | Reads | HEAD must read |
| --- | --- | --- |
| R1 gutters | rects of `.work-area`, `[data-slot=sidebar]`, `[data-slot=session-dock]`, `.activitybar`, `.titlebar`, the viewport | `work.left - sidebar.right = 8`; `dock.left - work.right = 8` (A); `innerWidth - work.right = 8` (B); `innerHeight - work.bottom = 8`; `work.top = titlebar.bottom`; in G `work.left = activitybar.right` and the right gap is still 8 |
| R2 the line | `getComputedStyle(work, '::after')` | `content` not `none`; `position: absolute`; four border widths `1px`; four radii `14px`; border colour equal to the resolved `--border-strong`; `pointer-events: none`; `z-index: 301`; `top/right/bottom/left: -1px` |
| R3 the clip | computed `overflow` and the four radii of each child of `.work-area` | every child `clip`; outer corners `13px`, inner corners `0px`; in A the row carries all four |
| R4 one outline | every element and both pseudo-elements under `.shell`, outside `[role=dialog]`, whose box is at least 240 by 240 and which has four non-transparent 1px-or-more borders, or a non-`none` outline | exactly ONE in A, B, D, E, F, G, and it is `.work-area::after`. In C exactly TWO, the second being `.split-pane.focused::after`, Phase 40's focus box, named as such |
| R5 quiet | computed border colour on the named side of the eight rules in §9.3 | alpha 0 on every one, and the border WIDTH still 1px |
| R6 contrast | resolved colours of the line, of `.shell-body`'s ground and of `.work-area`'s ground | both ratios ≥ 1.297 in A, I and J. Print them beside §1.1's predictions (1.658 and 1.594; 1.866 and 2.002) |
| R7 inside the curve | for each of the frame's four corners, `document.elementFromPoint` at the corner moved (2, 2) inward, which is 15.56px from the arc's centre and so OUTSIDE the curve, and at (5, 5) inward, 11.31px and INSIDE it | the first is NOT inside `.work-area`; the second IS. In A (thumb at the foot), C, E (overlay and scrim), F. Plus the thumb's rect: its bottom is ≥ 8px above its pane's |
| R8 the drop zone | a tab dragged over the terminal with real CDP pointer events; if it arms, `.split-drop-zone` and R7 again | inside. If it cannot be armed, print `NOT DRIVEN` (a stated limit, never a pass) and assert the structural half: the overlay's mount is a descendant of `.work-row` |
| R9 resizers | each handle's rect; a real pointer move to its centre; one real Tab key and then `focus()`; ArrowLeft and ArrowRight | the rect lies wholly inside the gutter and clear of the line; hover reads `--border-strong`; `:focus-visible` matches and reads `--accent`; an arrow key moves the region's width |
| R10 the band | a real click into the terminal, in A and in B | `.term-header.term-focused` exists; the identity strip's (A) and `.stab-filler`'s (B) bottom border reads the resolved `--accent`; in B the active tab's bottom border has alpha 0, its box-shadow names the accent, and its top-left radius is `13px` |
| R11 selection | `.srow.selected` and its `::before`; `.ab-item.active` and its `::before`; `.rail-item.selected::before` in G | `::before` `content: none` on all three; the row's ground `--bg-active`, outline 1px of `--border-active`, radius 6px; the item's ground `--bg-active`, `background-clip: content-box`, and under a real pointer an inactive item's ground `--bg-raised` with the clip STILL `content-box` |
| R12 no pixel lost | the widths of every region in the row, plus the gaps | they sum to `innerWidth` exactly, in A, B and G |
| R13 the titlebar | `.titlebar`'s rect | height 38 |
| R14 focus mode | the chord through the shot drive; `.work-area`'s rect, radii and `::after` | rect is `(0, 38, innerWidth, innerHeight - 38)`; radii `0px`; `::after` `display: none`. A `MutationObserver` on `document.body` installed BEFORE the chord records `.gmux-focus-copy`'s inline radii at the moment it is appended: on the leave the bottom-left is `13px`; on the enter it is the elliptical pair of §3.8 |

### 11.3 Parent mode

`P284_PARENT_CHECKOUT=<a BUILT worktree at 0f2f7f00>` runs a SECOND Electron from that checkout
(`cwd`), AFTER the first has ended and never beside it, through the same readings, and prints one table
with a HEAD and a PARENT column. The parent is expected to FAIL: R1 reads 0, 0, 0; R2 finds no
`::after`; R4 finds no outline; R5 reads eight hairlines at the resolved `--border`; R11 finds two 2px
`--accent` bars. **The run passes when HEAD has 0 findings AND the parent has at least one finding on
each of R1, R2, R4, R5 and R11.** An arm the parent also passes asserts nothing, and that is itself a
finding. The parent's `.center` width is printed beside HEAD's so the 8 or 16px is on the page.

### 11.4 Photographs

`out/p284/` (`out/` is gitignored), by `Page.captureScreenshot`:
`{head,parent}-{A-right,B-top,C-split,D-editor,E-overlay,F-fill,G-bare,I-light,J-hue}.png`. The study's
B is not photographed; a person opens `design/prototypes/index.html#surround` beside them.

### 11.5 What it refuses

No agent, no token. It never touches `-L gmux` beyond the read-only census its siblings take. It never
runs `conformance:hue`. It launches one Electron at a time. The resize proof is NOT here; it is
`probe:sessionfocus`, `probe:p1811` and `probe:p167`, which the main session runs.

---

## 12. Every existing test that moves

| Test | Today asserts | After |
| --- | --- | --- |
| `chrome-geometry.test.ts:65-73` | `crossover = 2 × (48 + 240) = 576`; `sidebarMaxWidth(560) = 560 - 48 - 240` | crossover `2 × (48 + 240 + FRAME_RESERVED_MAX) = 608`; `sidebarMaxWidth(560) = 256` |
| `:145-152` | `workAreaWidth(base) = 1440 - 48 - 280`; hidden `1440 - 48`; right `- dock` | each minus `frameReservedWidth(...)`: 16, 8 and 16 |
| `:155-174` | collapsed dock, top orientation and rendered sidebar rows | each minus the same term |
| `:320-415` the grid | window list holds 1027, 1028, 1029 and 1216 | ADD 1043, 1044, 1045 and 1248. The invariant `terminal === 0 \|\| terminal >= TERMINAL_FLOOR` is UNCHANGED and is the point |
| `:461` | `sidebarMaxWidth(960, DOCK_DEFAULT) = 472` | 456 |
| `:470-497` | comment: the row falls under `SPLIT_MIN_WORK_AREA` "below 1216px" | 1248 (`w/2 - 48 - 16 < 560`); the assertion holds as written |
| `:551-570` | `PROJECT_RAIL_MIN_WINDOW_W = 48 + 200 + 220 + 320 + 240 = 1028`; boundaries 1027 and 1028 | `+ FRAME_RESERVED_MAX = 1044`; boundaries 1043 and 1044 |
| `:594-608` | `sidebarMaxWidth(1440, dock, rail) = 632 = 1440 - 48 - rail - dock - 240` | 616, with `- FRAME_RESERVED_MAX` in the identity |
| `:422-448` the four squeeze rows | sidebar is `round(w / 2)` at 1400, 1440, 1500, 1600 | expected unchanged (`roomLeft` at 1400 is 776 against a half of 700); GEOMETRY confirms by running |
| `work-area.test.ts:94-100` | no `transition\|animation` in `work-area.css`; `.work-row` is `position: relative` | BOTH KEPT. Added: the `@import` is the file's first statement; `.work-area::after` declares `pointer-events: none`, `position: absolute` and a negative inset; `.work-area` declares NO `overflow`; `.work-area > *` declares `overflow: clip`; no `px` literal other than in a comment |
| `focus-mode.test.ts:74-93` | `LAYOUT_PROPS` lacks the margin longhands | add `margin-left`, `margin-right`, `margin-bottom`, `border-radius`. `:243-275` and `:336` hold as written. New case: the frame-off rule names both classes in one rule, and the `::after` rule does too |
| `focus-copy.test.ts:436-468` | document order canvas, header, canvas, header | HOLDS as written. New cases for `copyCornerRadii`: a leave with both bottom corners coincident gives `[13, 13]` twice and zeroes on top; an enter gives `[13 / sx, 13 / sy]`; a split editor on the right zeroes the bottom-right; a banner under the body zeroes both; radius 0 zeroes everything; a surface with no `closest` builds a square copy |
| `focus-flight.test.ts:216-260` | `measureFocusRect` toggles and restores inside one task | HOLD as written. New cases for `measureFocusRects`: two elements, ONE toggle, both rects, class restored |
| `p1811-mini-clothes.test.ts:100` | the rail's mini meter keeps `border-top:` | HOLDS as written |
| `focus-affordance.test.ts` | one `--accent-soft` line and no literal below the S4A marker | HOLDS as written; nothing below the marker is edited |
| `canvas-color-single-source.test.ts` | the canvas is one value | HOLDS; `.shell` and `tokens.css` are untouched |

New: `p284-quiet-surround.test.ts` (SURROUND) pins §5.1, §6, §7 and §9 as text over the five
stylesheets: the eight rules of §9.3 each declare `transparent` and still declare `1px`; no
`selected::before` or `active::before` rule survives in any of them; `.ab-item:hover` declares
`background-color` and NOT the `background` shorthand; `.srow.selected` declares an `outline` and no
`box-shadow`; both resizers name `--frame-gap`; `.dock-resizer:focus-visible` exists; `.shell-body`
names `--bg-sidebar`; `.project-rail` still declares `border-right: 1px solid var(--border)`; and
nothing was added below the S4A marker (its byte length is unchanged from the parent's, read from the
marker to the end). `p284-work-frame.test.ts` (WORK) pins §3.6, §3.7 and §4.4 the same way.

---

## 13. What the verifier is handed

Tier 2 for the surface, Tier 3 for the geometry, per item. The parent measurement is mandatory.

- **Attack**: a second region-sized outline; a square corner (R7's hit test at all four corners, in a
  four-way split, in fill, in overlay, with a file dragged over each pane); a clipped thumb or first
  tab; a resizer that Tab cannot reach or that shows nothing when it has focus; a colour literal; a
  session resized twice; all of it at `TERMINAL_FLOOR`, in focus mode and with both sidebars away.
- **Re-derive**: `workAreaWidth` for ten window sizes against the rendered `.center` width and xterm's
  columns, `cols = floor((width - 12 - 14) / cellWidth)`.
- The builder did NOT run `conformance:hue`, any probe, a build or the whole suite. Those are the main
  session's, and §1.5 says why `conformance:hue` should be run once although no path owes it.

---

## 14. Corrections after verification (fix round, 2026-09-17)

Two verifiers, one attacking and one re-deriving, read the first probe run and its 33 HEAD findings.
Every problem below was reproduced again by the fixer before anything moved, in its own Electron on a
scratch profile and socket, and from the run's own photographs with `build/png-read.mjs`. Where a
decision above was wrong it is corrected here rather than rewritten in place, so the record shows what
was decided and what the measurement said.

### 14.1 §11.1 H and §11.2 R14: the probe never left focus mode, and read K, I and J inside it

Sixteen of the 33 findings were one thing. Entering session focus takes the keyboard out of the session:
`focus-flight.ts` sets `visibility: hidden` on the surface for the flight, Chromium blurs a hidden
element, and nothing refocuses after the swap, so `document.activeElement` is `body` and
`fill-chord.ts`'s `activeFillRegion()` routes the second ⇧⌘↩ to no region. The first run pressed the chord
twice with no click between, stayed in the mode, and then read K (whose control is a titlebar child the
mode hides), I and J with the frame OFF by design. Measured by the fixer: before the chord
`textarea.xterm-helper-textarea`, after it `body`, a second chord still focused, and a click into the
terminal followed by the chord leaves with the frame back at 13px. **The parent reads the same**, so the
keyboard loss is not this phase's; it is queued as its own entry (`docs/BACKLOG.md`, Phase 286).

The probe now does what a person does: a click into the terminal before the leave chord, a NOTE naming
the keyboard loss, an Escape fallback with the keyboard blurred if the chord still does not leave, and a
stop with a RUN finding if that does not leave either, so K, I and J can never again be read in the wrong
state. In the fix run H left by the chord, both copies were recorded (enter `20.89px 13.70px`, leave
`13px`), and K, I and J all read the frame on: light `1.866 / 2.002`, hue 150 `1.667 / 1.601`.

### 14.2 §11.2 R7: the outer corner is judged by its PIXEL, not by a hit test

"It judges rectangles, computed styles and hit tests, never pixels" was the rule, and it read a "SQUARE
bottom-right corner" in A, B, C, E, G and R8 whose photographs all showed a round one. The pixel 2px
inside that corner was `#0e0f12`, the surround; the hit landed on `.xterm-viewport` because it is a
scroll container with a 10px native vertical scrollbar and Chromium hit-tests a scrollbar against its
rectangular box, ignoring the ancestor's rounded `overflow: clip`. Reproduced: hiding the native bar with
a temporary style turns the same hit into `div.shell-body`. `terminal.css` is NOT touched for this; xterm
measures that scrollbar's width for the lane the fit addon reserves.

R7's outer reading is now the colour painted 2px inside each corner, off one `Page.captureScreenshot` of
the emulated 1440 by 900 viewport, against the resolved ground of `.shell-body`, within two levels per
channel; the inner reading, 5px in, is still a hit test. The self-test grades both shapes. §11's "never
pixels" is therefore "one pixel per corner", and the header says why.

### 14.3 §3.5: the focused-split box did NOT stay whole at the frame's corner

The table said "the focused-split box stays whole because the line is outside the box". The line is
outside; the clip is not. Where the focused pane's bottom corner is the frame's, the row's 13px clip cut
the ring square and the frame's grey arc closed the corner: in the first run's own `head-C-split.png` the
ring's left edge at `x=work.left` stopped 12px above the bottom. **Fixed, in CSS, with no DOM change**:
`work-area.css` gives the ring the inner radius on that corner alone, through `--frame-corner`, a custom
property `.work-area` declares equal to its own inner radius and `focus-mode.css` section 7 zeroes in the
same twin rule. The corner leaf is found by STRUCTURE: `:not()` with a complex selector excludes any pane
under a cell that is the right half of a row or the top half of a column (bottom-left), or under any
first cell (bottom-right), at any depth, and bottom-right only while `.center` is the row's last child,
because a split editor beside it owns that corner. Read live in the fix run: left pane focused
`0 0 0 13px`, right pane focused `0 0 13px 0`, and the C photograph shows the accent following the arc.
The armed drop zone's accent border shows the same cut for the length of a drag and is left alone.
`SplitSurface.tsx` is still unchanged.

### 14.4 §3.6: the editor's scrollbars reach the corner too (corrected in Phase 284.1)

The terminal lane was lifted 8px and the editor was not. A 400 line file scrolled to its end put Monaco's
slider at `{top 800, bottom 892}` with the arc over it; the Pierre diff, the markdown preview, the report
and the map carry their own scrollbars at the same edge. **The fix round's form**: `.ed-body` lifted every
root it drew by `--space-4`, a `padding-bottom` for the in-flow roots (`height: 100%`) and `bottom` on
`.ed-panel .ed-body > *` for the absolute ones, which an absolute child would otherwise ignore. By
structure and once: the first attempt put the lift on the shared `inset: 0` rule and Monaco moved 16px,
because its mount sits inside its host. Measured after: slider `{794..884}`, 8px above the frame. The
arc still reaches 1px into the slider's outermost column at the foot, stated in the CSS.

**The reverify refuted the premise (B1 / N1).** "An in-flow root ignores `bottom`" holds for a STATIC
root. The roots come in three kinds, not two: absolute at `inset: 0` (Monaco's host, the diff, the
preview, an image, the redline), static in flow at `height: 100%` (the report's `.diag`, the context
card's `.ctxd-detail`), and RELATIVE in flow at `height: 100%`, which is the map alone: `.arch-map-tab` is
`position: relative` since Phase 162 for its drill overlay, and it is a direct child of `.ed-body`
because `React.Suspense` adds no node. A relative box with `bottom: 8px` and `top: auto` moves UP 8px.

**Phase 284.1 measured the shipped form and both repairs in one Electron** (scratch profile, scratch
HOME, harness socket, the wt-p284 build with the two candidates injected as a `<style>` over it), with
the editor beside the terminal at 1440 by 900, the frame's bottom at 892 and the tab strip 38..74:

| Form | `.ed-body` | `.arch-map-tab` (relative) | `.ed-host` (absolute) |
| --- | --- | --- | --- |
| Fix round: `padding-bottom` + child `bottom` | 74..892 (padding 8) | **66..876** — 8px over the strip, 16px above the frame | 74..884 |
| (a) `margin-bottom: var(--space-4)`, no child rule | 74..884 | 74..884 | 74..884 |
| (b) fix round + `top: 0` on the child rule | 74..892 (padding 8) | 74..884 | 74..884 |

Both repairs put every root exactly 8px above the frame. **(a) ships.** It is one declaration and it
places nothing: the body's own box ends 8px above the panel, which is the box an absolute root is placed
against and the box an in-flow root's `height: 100%` resolves against, so a root of a kind nobody listed
is lifted the same way. (b) keeps a per-root positioning rule whose correctness depends on a fourth kind
of root never appearing, which is exactly the shape that was wrong once. The margin survives the panel's
column flex layout: `.ed-body` is `flex: 1; min-height: 0` and a flex item's margin is honoured in the
free-space calculation, which is what the 74..884 reading shows. Monaco's slider with the long file
scrolled to its end ends at the host's foot, 884, 8px above the frame; the slider is read against its
lane in `probe:p284`'s M state so a scroll that stopped short is a finding rather than a vacuous pass.

`src/renderer/app/__tests__/p284-work-frame.test.ts`'s "the editor's foot" describe now pins the margin,
the absence of any `.ed-body > *` rule, and the map's `position: relative` with no `bottom` of its own;
it read red on the fix round's rule before the CSS moved and green after. `probe:p284` gained R15 and the
M state, which opens the Architecture pane over the scratch repository through its own door (the switch
seeded on with `build/probe-arch-switch.mjs`, no agent named) and reads `.arch-map-tab` rendered.

**B2, accepted and stated.** The 8px under the body is the panel's `--bg-canvas`. Under a root that
paints `--bg-surface`, being the map (`arch.css`) and the report (`diagnostics.css`), the foot reads as a
darker step; under the context card, Monaco, the diff and the previews, which paint `--bg-canvas`, there
is no step. It is the work's ground showing through, the same ground the terminal's foot shows under its
last row, and painting it per root would need the per-root rule this round removes. Accepted.

### 14.5 §6: the resizer offset is −7px, not −6px

The CSS reads `calc((gap + 5px − edge) / −2 − 1px)` and its comment says why: an absolutely positioned
child is placed against the padding box, which ends 1px inside the aside's transparent border. Measured:
sidebar handle 329..334 inside the gutter [328, 335] with the line at 335; dock handle 1234..1239 inside
[1233, 1240]. The CSS is right; §6's `-6px` was the stale number.

### 14.6 §3.4, a stated limit: Monaco's fixed widgets under the line

The suggest and hover widgets are `position: fixed` at z 40 and 50; the line is at 301 in the root
context. A widget that extends past the frame's right edge over the dock has the line drawn through it.
Not reproduced (no language worker opens them in the harness); reasoned from the z census. Accepted, and
recorded here so a person who reports it finds the reason.

### 14.7 The photographs' glyph scale, a stated limit

The A to G captures draw xterm's glyphs at half scale on a 2x display, because the run emulates the
viewport at `deviceScaleFactor: 1`. Rects and tmux pane sizes are unaffected. The probe's header says so.

**A banner is the panel's last child, not the body's.** A tab that draws a banner under the body (a
commit's file, a deleted or truncated file, a remote read-only file, a compare) now shows an 8px
canvas-coloured strip between the body's foot and the banner's top hairline, and the banner itself still
sits at the panel's foot under the frame's arc; at the parent the body abutted the banner. Both
reverifiers found it and both passed with it stated: a banner carries no scrollbar to keep off the arc,
and the lift belongs to the body. Accepted here; a later phase may lift the panel's last child instead
when a banner is drawn.

### 14.8 §11.2 R9: the pointer reading settles, and never behind a forced frame (Phase 284.1)

The reverify's B3: R9 read each resizer's `:hover` once, 350 ms after one synthetic `mouseMoved`, and one
HEAD run produced four R9 findings with boxes, gutters and keyboard widths identical to two runs that
passed. The fixer measured in one Electron before changing the arm, and in THAT environment a
`Page.captureScreenshot` between the move and the read moved the `:hover` chain from
`div.sidebar-resizer` to the terminal's `canvas.xterm-link-layer` every time (one move then a forced
frame, false; two moves then a forced frame, false; six samples each behind a forced frame, 0 of 6 lit),
while the same reads without a frame lit (one move then a sleep, true; two moves then a sleep, true; ten
samples with no frame, 10 of 10), which reads as Blink re-dispatching hover at the OS pointer's own
position when a frame is produced. **The cause is not established.** The Phase 284.1 reverifiers, with
the OS pointer over the window, did not reproduce the clearing behind a forced frame (14 of 14 lit), and
one of them holds a record of a clearing that landed inside the 200 ms sleep after the second move with
no frame at all, which the shipped poll cannot re-light because it never re-moves the pointer. So the
settle below is an improvement over one coin-toss sample, not a closure; if R9 reds again, the next step
is to re-issue the 1px move before each sample so every sample is self-healing.

The arm now moves the pointer, moves it again by 1px so the last known position is the handle's own, and
polls `:hover` for up to about 800 ms WITHOUT forcing a frame, grading the first sample that lit, or the
last one when none did, which is a finding carrying the sample count and never a pass. The first form of
this settle put a forced frame before every sample, the way `settled()` does for geometry, and read
NOT lit on 7 of 7 samples for both handles in a full run, which is what sent the fixer to measure; R9 is
therefore the one poll in the probe that must not go through `settled()`, and its header says so.
`--self-test` covers `hoverPick` both ways and the never-lit sentence.
