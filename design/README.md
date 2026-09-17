# Tortie look and feel study

17 September 2026

[Open the HTML comparison](prototypes/index.html#gallery). It runs directly from disk with no install or server. The structure follows the Runstory study in `/Users/gdc/runstory/design`: a comparison gallery, full-size HTML variations, reference material, and a short handoff.

The brief is mainly about look and feel. Borrow the quiet surround and inset work surface from the supplied Unpeel screenshot while keeping Tortie’s familiar arrangement and functionality. These are visual proposals, not changes to the running application.

| Treatment | Visual idea | Open |
| --- | --- | --- |
| Current | Flush edges, continuous dividers, graphite surfaces. A source-informed redraw of the starting screenshot. | [Baseline](prototypes/index.html#current) |
| A · Inset workspace | One rounded frame around Explorer, the work area, and Sessions. | [Variation A](prototypes/index.html#inset) |
| B · Quiet surround | A single rounded work surface, with the sidebars resting in a charcoal surround. Closest to the reference. | [Variation B](prototypes/index.html#surround) |
| C · Separate surfaces | Three lightly outlined surfaces with small, consistent gaps. | [Variation C](prototypes/index.html#surfaces) |

Start with B. The terminal has a clear, complete edge, and the sidebars feel like part of the window rather than competing panels. A is a modest change to the current appearance. C makes the regions more explicit but draws more borders.

## Explore

- Choose a treatment in the top bar. The same content and panel sizes carry across, making differences easier to judge.
- Use **Reference** to see both supplied screenshots together.
- Use **Content** to inspect the screenshot fixture, a longer transcript, split terminals, or terminal plus editor.
- Use **Canvas only** to remove the study controls. Escape brings them back.
- Resize either sidebar by dragging its inner edge or focusing the separator and using the arrow keys. Toggle Explorer or collapse Sessions to inspect the remaining frame.

The comparison gallery adapts to a phone. Full-size views preserve a desktop canvas and scroll horizontally below 760px; a phone app is outside this study.

## Scope

The proposals change outer corners, borders, background tones, selection finishes, and spacing between containers. They preserve the positions of projects, the activity rail, Explorer, the terminal, Sessions, and usage. Typography, row heights, agent marks, and status colors are shared across the alternatives. All use the same HTML tree and fixture data.

The current view is a redraw rather than a pixel-identical capture. The unmodified screenshots are in [references](references/). The sample names come from the supplied screenshot; additional transcript and editor content is illustrative. Filters, local selections, collapse controls, and resizing work inside the HTML. Buttons for live app commands show a prototype notice. They never launch agents, change files, or call Tortie’s bridge.

No production source, settings, dependencies, or live session data are changed by this study.

## Files

- [Visual decisions and tradeoffs](directions.md)
- [Container values and source mapping](system/container-map.md)
- [Browser review and limitations](system/verification.md)
- [HTML](prototypes/index.html), [CSS](prototypes/styles.css), [local fixtures](prototypes/app.js)

The bundled codicon font is copied from the repository’s installed `@vscode/codicons` package and retains its [license](prototypes/assets/CODICONS-LICENSE). Agent SVGs are copied from Tortie’s existing vendor mark assets; this study introduces no replacement icon system.
