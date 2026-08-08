# notes-v2 VMark-like Minimal Redesign

Date: 2026-05-22
Status: Approved direction, awaiting implementation plan
Project: `english-shadowing-web`

## Goal

Redesign `notes-v2` so it feels like a minimal desktop writing canvas inspired by VMark: almost no visible chrome by default, no persistent top toolbar, no permanent left or right sidebars, and no obvious panel borders. Keep the existing notes-v2 capabilities, but move them into small bottom-corner symbols and lightweight popovers.

The target feeling is: open, quiet, native, keyboard-friendly, and fast. It should look much closer to the provided VMark screenshot than to Notion, Obsidian, VS Code, or the earlier panel-heavy redesign.

## Context

The current notes-v2 UI is built in `english-shadowing-web/src/components/notes-v2/` and includes:

- `notes-workbench.tsx` / `notes-workbench-center.tsx` for the main workbench layout.
- `notes-workbench-header.tsx` for the current top action area.
- `notes-workbench-left-sidebar.tsx` for file tree, outline, and search modes.
- `notes-workbench-right-sidebar.tsx` for properties, backlinks, learning, and terminal modes.
- `notes-editor-pane.tsx` and `notes-rich-editor-pane.tsx` for source/rich editing.
- Supporting panels for outline, backlinks, properties, learning snippets, terminal, search, and command palette.

The user explicitly prefers the VMark screenshot's bottom-corner UI: all controls live in the lower left and lower right, while the center stays mostly blank. The previous Notion-like and Obsidian-like directions were too designed and too panel-heavy.

## Constraints

- Do not copy VMark branding, code, exact icons, or identity. Copy the interaction structure and restraint.
- Do not add a marketing-style interface, hero section, nested cards, or decorative background.
- Avoid persistent chrome: no always-visible full top toolbar, full left sidebar, or full right inspector.
- Avoid visible borders for default layout. Use whitespace, soft background contrast, and occasional translucent popovers.
- Keep keyboard workflows intact: command palette, find, source/rich toggle, navigation, and escape-to-close.
- Preserve notes-v2 functionality; this is a redesign of presentation and interaction, not a feature removal.
- Keep accessibility labels even when visible UI is symbolic.

## Done When

- Opening notes-v2 shows a mostly empty editor canvas with only bottom-corner controls visible.
- Existing file tree, recent documents, search, outline, backlinks, properties, learning, terminal, export, rename, delete, refresh, and rebuild-index actions remain reachable.
- Side panels no longer permanently occupy horizontal space in the default state.
- Bottom-corner controls are small, icon-like, and have hover/focus states plus accessible labels.
- `Esc` closes active popovers; `Cmd+K` remains the main command entry; `Cmd+F` opens find.
- Local verification covers TypeScript/build health and at least one browser visual check of the notes-v2 screen.

## Visual Direction

Use a single quiet canvas:

- Background: soft warm gray/white, close to VMark's low-contrast gray canvas.
- Main document area: centered editor region, but without a visible card frame.
- Window top: if the desktop shell provides window controls, let the window controls exist without adding a heavy app toolbar underneath.
- Default screen: sparse enough that controls feel like a status bar, not an app dashboard.

Avoid:

- Large header bars.
- Repeated cards.
- Thick separators.
- Permanent inspector columns.
- Button labels for common actions.
- Dense UI text explaining how to use the app.

## Layout

### Default State

The default notes-v2 screen should contain:

- A full-window editor canvas.
- Bottom-left cluster:
  - workspace/files toggle icon
  - new note icon
  - active document pill
- Bottom-right cluster:
  - word count
  - character count
  - save/sync status
  - learning/AI context icon
  - history/backlinks icon
  - terminal icon
  - source/rich mode icon
  - lock/read-only icon
  - overflow menu icon if needed

No left sidebar, right sidebar, or top action toolbar should be open by default.

### Bottom-Left Cluster

Purpose: document and workspace navigation.

Controls:

- Files icon opens a floating workspace popover containing file tree, recent documents, and search entry.
- Plus icon creates a new note.
- Active document pill shows the current note title. It may open a tab/recent-document menu on click.

Behavior:

- The popover appears above the bottom-left cluster.
- It should not push or resize the editor.
- It should close on outside click, `Esc`, or after selecting a document.

### Bottom-Right Cluster

Purpose: status and tools.

Controls:

- Word/character count remains textual.
- Save/sync indicator shows clean/dirty/saving/error states.
- Learning icon opens the learning snippet/context popover.
- History/backlinks icon opens backlinks/history popover.
- Terminal icon opens a compact terminal popover or bottom overlay.
- `T` or equivalent icon toggles Source/Rich mode.
- Lock icon toggles read-only/editable state if supported.
- Overflow menu contains rename, export HTML/PDF/vault, refresh, rebuild index, delete.

Behavior:

- Tool popovers open above the bottom-right cluster.
- Only one bottom popover should be open at a time.
- Popovers should feel like translucent floating utilities rather than sidebars.

## Panel Mapping

Existing notes-v2 panels map into bottom popovers:

- `NotesFileTree`, recent documents, and `NotesSearchPanel` move under the bottom-left files popover.
- `NotesOutlinePanel` becomes an outline tab/section in a right-bottom utility popover.
- `NotesBacklinksPanel` becomes a backlinks/history popover.
- `NotesPropertiesPanel` becomes a compact properties section inside the overflow or inspector popover.
- `NotesLearningPanel` opens from the learning icon.
- `NotesTerminalPanel` opens from the terminal icon.

Panels can share a reusable popover shell:

- position: bottom-left or bottom-right anchored
- max height: viewport-aware
- transparent/blurred or soft solid background
- no strong border by default
- subtle shadow for separation
- keyboard close support

## Interaction Model

Primary interactions:

- `Cmd+K`: command palette for files and actions.
- `Cmd+F`: floating find/replace.
- `Esc`: close active popover, command palette, find, or menu.
- Click bottom-left files icon: open file/recent/search popover.
- Click bottom-right tool icons: open corresponding popover.
- Click outside a popover: close it.

Selection priority:

1. Editor remains the main focus.
2. Bottom controls are secondary and quiet.
3. Popovers are temporary tools.
4. Destructive actions are hidden behind overflow and confirmation.

## Accessibility

Because visible controls are symbolic, every icon control must have:

- `aria-label`
- `title`
- keyboard focus state
- visible hover/focus affordance
- pressed/expanded state where relevant

Popover requirements:

- Focus should move into interactive popovers when opened if the action expects immediate selection.
- `Esc` closes the popover.
- Active popover should expose a clear accessible name.
- Destructive actions must remain text-labeled inside menus.

## Implementation Shape

Prefer small, focused changes:

1. Add a notes-v2 minimal chrome layer around the existing workbench.
2. Replace the persistent header with bottom-left and bottom-right chrome.
3. Convert left sidebar content into a bottom-left popover.
4. Convert right sidebar modes into bottom-right popovers.
5. Keep existing panel components where possible; change their container and styling first.
6. Move low-frequency actions into overflow before removing any behavior.
7. Add CSS tokens/classes for the minimal canvas, status clusters, icon buttons, and popover shell.

Likely new or changed components:

- `notes-workbench-minimal-chrome.tsx`
- `notes-workbench-bottom-left.tsx`
- `notes-workbench-bottom-right.tsx`
- `notes-workbench-popover.tsx`
- existing `notes-workbench-header.tsx` reduced or removed from the default visual path
- existing sidebars adapted or wrapped as popover content

## Verification Plan

Minimum verification:

- Run the relevant TypeScript check or build command used by `english-shadowing-web`.
- Run focused tests if existing notes-v2 tests cover layout or state.
- Start the local app and inspect notes-v2 in a browser/desktop preview.
- Verify default state: no permanent sidebars or top toolbar.
- Verify bottom-left file popover opens/closes and can open a note.
- Verify bottom-right tool popovers open/close one at a time.
- Verify `Cmd+K`, `Cmd+F`, and `Esc`.
- Verify an empty vault/no active document state.

Residual risk:

- Some existing sidebar assumptions may expect persistent mounted panels.
- Terminal behavior may need a larger overlay than other popovers.
- Desktop shell/window controls may constrain how closely the top-left VMark look can be matched.

