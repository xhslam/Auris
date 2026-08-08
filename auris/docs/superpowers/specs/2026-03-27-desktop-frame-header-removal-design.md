# Desktop Frame Header Removal

## Goal

Remove the low-value shared desktop header strip and let each desktop page start directly with its own content.

## Problem

The shared frame header currently consumes a full horizontal band while repeating information that pages already express in their own layouts. It reduces first-screen density and makes the app feel more like a mockup shell than a real desktop workspace.

## Design

- Remove the shared header row entirely.
- Remove the secondary workspace status chip row with it.
- Keep the sidebar as the only global desktop chrome.
- Let the viewport begin immediately after the frame container so each page owns its own opening hierarchy.

## Layout Impact

- Tighten frame spacing after the header removal so the content block rises naturally.
- Preserve the existing page cards and shells.
- Do not add a replacement top bar.

## Testing

- Update the desktop frame component test to assert that shared header controls and shared status chips no longer render.
- Verify the page content still renders and sidebar persistence still works.
