# Container values and implementation boundary

These are study values, not replacements for the production design tokens.

| Property | Current redraw | A · Inset | B · Surround | C · Surfaces |
| --- | --- | --- | --- | --- |
| Outer ground | `#0e0f13` | `#141820` | `#141a22` | `#11151b` |
| Work surface | `#131417` | `#191b20` | `#1a1a1d` | `#1b1d22` |
| Sidebar surface | Outer ground | `#171b22` | Outer ground | `#191e26` |
| Framed region | None | Whole workspace | Work area | All three regions |
| Outer corner | 0px | 12px | 14px | 12px |
| Inter-region gap | 0px | 0px | 8px | 8px |
| Bottom/right inset | 0px | 10px | 8px | 8px |
| Titlebar height | 38px | 44px | 44px | 44px |
| Inner header height | 36px | 36px | 36px | 36px |
| Selection | Existing fill and marker | Existing fill and marker | Soft fill and outline | Existing fill and marker |

System UI typography, 14px terminal fixture type, 26px file rows, 28px session rows, and state colors are shared. The extra 6px in the proposed titlebar gives the upper edge room; it is a visual tradeoff rather than a functional requirement.

## Existing source anchors

| Region | Existing implementation | Presentation boundary |
| --- | --- | --- |
| Window and project tabs | `src/renderer/app/Titlebar.tsx`, `src/renderer/styles/app.css` | Titlebar ground, spacing, tab selection |
| Overall shell | `src/renderer/app/App.tsx` | `.shell-body`, `.work-area`, `.work-row`; existing conditional regions |
| Activity rail | `src/renderer/app/ActivityBar.tsx`, `activity-bar.css` | Ground and selected icon finish |
| Explorer | `src/renderer/app/Sidebar.tsx` | Outer surface and header rules; keep the existing tree and resize handling |
| Terminal and editor | Existing `TerminalRegion` and `EditorPanelLazy` inside `.work-row` | Round the shared outer region, keep internal split dividers straight |
| Session list | `src/renderer/app/SessionDock.tsx` | Outer surface, selected row finish, header and usage seams |
| Color system | `src/renderer/styles/tokens.css`, root `DESIGN.md` | Existing appearance controls and contrast rules remain authoritative |
| Icons | `src/renderer/icons`, `src/renderer/assets/agents` | Retain the shipped glyphs and marks |

The production app currently shares its canvas color with the terminal and editor themes. Applying one of these proposals would need to preserve that agreement, carry the treatment through existing light/appearance settings, and check resize handles, focused splits, menus, and clipping at rounded edges. These details are implementation follow-through after a visual direction is chosen.

No new library, background process, data model, agent lifecycle, or session action is implied. This study deliberately ends at a reviewable visual result.
