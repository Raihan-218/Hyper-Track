# Hyper Track visual system and screen layouts

## Product identity

Hyper Track uses a **quiet momentum** visual direction: focused, calm, and progress-oriented. The interface should make the next useful action obvious, keep status information legible, and give progress a small amount of expressive color. The references are broad principles: Linear's restrained navigation and hierarchy, Notion's flexible information grouping, and Motion's emphasis on time and next actions. Hyper Track keeps its own indigo identity and avoids copying their layouts.

## Foundation

- **Color:** light and dark palettes share semantic roles. Indigo is reserved for primary actions, selected navigation, and progress. Green signals completion, amber signals a caution, and red signals destructive or overdue states. Muted text and borders should carry secondary information without competing with content.
- **Type:** use system sans-serif for platform consistency. Page titles are 24–32 px, section headings 18–20 px, body text 14–16 px, and metadata 11–13 px. Use weight and spacing before adding decorative color.
- **Spacing:** use the shared 4 px base scale (`xs` through `xxxl`). Page gutters are 20–24 px on phones and 32 px or more on desktop. Keep related controls close and give major sections more separation.
- **Shape:** small controls use 8–12 px corners, fields and buttons 12–14 px, and larger panels 16–20 px. Avoid wrapping every row in a card; reserve raised surfaces for content groups that need separation.
- **Interaction:** provide a clear selected state, a pressed state, and accessible labels/selection for navigation. Phone targets stay at least 44 px high. Motion stays brief and functional; reduced-motion support is part of the later polish milestone.

The tokens and semantic palette live in `src/theme/theme.tsx`. Theme-aware foundational primitives live in `src/components/ui.tsx`. Do not add a color or spacing value to a new shared component when a semantic token already exists.

## Screen layout map

| Section | Desktop layout | Mobile layout | Information hierarchy |
| --- | --- | --- | --- |
| Dashboard | Sidebar plus a spacious content canvas. A top progress/level strip, then a two-column overview for today's priorities and schedule; supporting habits and trends below. | Single column with compact progress summary, today's next actions, then supporting sections. | What needs attention → daily progress → upcoming work → supporting insight. |
| Tasks | Task workspace with section/filter rail or toolbar, a primary list/board, and task details when selected. Keep search and filters near the list. | One task list with a compact filter row and touch-sized completion/edit actions. | Scope and filters → add task → prioritized task rows. |
| Calendar | Month/week/day controls over a wide calendar, with selected-day agenda alongside where width permits. | Calendar grid or short date strip above the selected-day agenda. | Date navigation → scheduled activity → selected-day details. |
| Analytics | Period controls and metric summary at top; trend visualization and habit/project breakdown in a two-column grid. | Period controls and metrics first, then vertically stacked readable charts. | Time range and coverage → key metrics → trends and breakdowns. |
| Projects | Project list/navigation beside a project overview with progress and linked tasks. | Project selector followed by project summary and tasks. | Active project → outcome and deadline → linked work. |
| Habits | Habit overview with today's check-ins and a separate consistency/history area. | Today's check-ins first, then streak and history details. | Today's action → current consistency → historical performance. |
| Profile & Settings | Account summary and grouped settings sections; appearance, timezone, notifications, and data controls are easy to scan. | Compact profile header and vertically grouped settings with accessible controls. | Account identity → preferences → account/data actions. |

Historical charts must use completion events and schedule/plan snapshots. Current task/project counts must be labeled as current state. If the older records cannot establish a historical fact, the UI must say that coverage is partial instead of filling gaps with estimates.

## Current milestone scope

Milestone 1 establishes semantic theme tokens, shared UI primitives, and a responsive `AppShell` with desktop sidebar and phone bottom navigation. The table above is the layout contract for the later screen milestones; it does not imply those screen redesigns are already implemented.
