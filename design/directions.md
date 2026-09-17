# Three finishes for the same workspace

## What the reference contributes

The supplied Unpeel screenshot gives its terminal a continuous rounded outline. The surrounding navigation sits on a dark ground, with fewer full-height seams. A soft selected row stays visible without a bright accent fill. Most of the visual weight belongs to the work.

Tortie’s supplied screenshot is more continuous: square joins, long shared dividers, and an edge-to-edge header band. The controls already have a clear arrangement. This study changes the finish around that arrangement.

## A · Inset workspace

A 12px outer corner encloses Explorer, the terminal, and Sessions. The activity rail stays outside it. The three internal regions retain straight separators, with a small bottom and right inset.

This reads as one workbench inside the window. It is the smallest departure from the current structure and keeps a strong horizontal header line. The compromise is that the terminal’s individual identity is less pronounced than in the reference.

## B · Quiet surround

A slightly blue charcoal surround carries the project tabs and both sidebars. The work area is a neutral charcoal surface with one 14px rounded outline. Sidebar header rules fall away; the selected session uses a soft fill and a restrained outline. The corners frame the work rather than every piece of navigation.

This is the recommended starting point for the requested feel. Its main tradeoff is quieter sidebar boundaries: resize hit areas and keyboard focus must remain discoverable in an eventual implementation.

## C · Separate surfaces

Explorer, the work area, and Sessions each get a 12px outer corner, one hairline, and an 8px gap. The terminal’s edge is a little stronger. Headers remain aligned, while each belongs to its own surface.

This makes the individual containers clearest. It also spends more visual attention on frames and uses a little more horizontal space. It may be useful if clear separation matters more than the reference’s almost continuous navigation surround.

## Shared decisions

All variants use the same type sizes, controls, content, and row heights. Projects remain above the work, files remain left, sessions remain right, and usage stays at the foot of Sessions. No sessions move into the file tree. There is no new navigation model.

The difference in feel comes from six variables: the ground behind the app, the work surface, outer corners, border continuity, container gutters, and selection treatment. Existing working, idle, and attention colors keep their meanings.

The study uses actual HTML containers rather than edits of the screenshots. A comparison should hold content and size steady, then switch A/B/C. The long transcript and split/editor fixtures are supplementary checks that the same finish holds with more content.
