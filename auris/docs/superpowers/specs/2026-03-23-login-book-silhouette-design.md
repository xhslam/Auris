# Login Book Silhouette Addendum

- Date: 2026-03-23
- Project: `english-shadowing-web`
- Status: Approved in chat, awaiting file review before implementation

## Summary

Extend the Apple-style login redesign by adding a large, subtle book silhouette on the far left side of the page and replacing the current main story copy with a new message centered around notes plus English practice. The book should read as a half-open page silhouette in the background, not a literal illustration, and should stay atmospheric and secondary to the text and form.

## Goals

- Add a large, soft, half-open book silhouette anchored to the left edge.
- Keep the book as a background presence rather than a foreground graphic.
- Update the main story copy to:
  - `集笔记和英语练习于一身，`
  - `实现真正的 thinking by yourself,`
  - `talking to yourself……`
- Preserve the lighter Apple-like dark atmosphere from the prior redesign.

## Non-Goals

- Do not add realistic illustrations, textures, or photo-based book imagery.
- Do not turn the left side into an illustration-heavy hero.
- Do not change login functionality.

## Composition

### Book Placement

- The book sits against the far left edge of the layout.
- It should occupy a large background area, especially in the upper-left to mid-left region.
- It must feel like part of the environment rather than an inserted object.

### Book Form

- Shape: half-open book pages viewed at a soft angle.
- Left page:
  - larger
  - softer
  - more faded
- Right page:
  - narrower
  - slightly brighter
- Spine:
  - only lightly suggested through a faint fold line or tonal split

### Visual Treatment

- Use gradients, soft highlights, and diffuse shadows only.
- No hard outlines.
- No visible paper texture.
- No literal page text.
- The silhouette should be recognizable, but only after a short look.

## Typography and Copy

### Main Story Copy

Replace the current left-side primary message with:

```text
集笔记和英语练习于一身，
实现真正的 thinking by yourself,
talking to yourself……
```

### Layout Treatment

- Set the copy as a hero-style text block rather than a normal paragraph.
- Break into deliberate lines with poster-like rhythm.
- Keep Chinese as the dominant visual language.
- Let the English phrases live inside the sentence rather than becoming separate slogans.

## Layering

- Background layer:
  - dark gradients
  - subtle environmental glow
  - book silhouette
- Mid layer:
  - brand row
  - main story copy
  - metrics
- Foreground:
  - login card

The text must remain clearly legible above the book layer.

## Component Impact

### `src/components/auth/auth-shell.tsx`

- Update the left-side story copy.
- Add a structural background element for the book silhouette if needed.
- Keep the existing shared-shell role.

### `src/app/globals.css`

- Add the left-side book silhouette styling.
- Adjust left story positioning relative to the new background shape.
- Re-tune typography spacing so the new message reads like a hero statement.

## Responsive Behavior

- Desktop should show the full silhouette.
- Tablet should keep a recognizable but reduced version.
- Mobile should tone the silhouette down heavily or partially hide it so the page does not feel crowded.

## Risks

### Risk: the book shape becomes too illustrative

Mitigation:
- keep edges soft and rely on tonal mass instead of line detail

### Risk: the large left-side book competes with the text

Mitigation:
- lower contrast and keep the copy on a cleaner tonal pocket

### Risk: English phrases disrupt the Chinese reading rhythm

Mitigation:
- keep them inside the sentence flow and tune line breaks carefully

## Implementation Notes

- This is an extension of the Apple-style auth redesign, not a separate redesign direction.
- Preserve the shared auth shell and existing form logic.
- The current project folder is not inside a Git repository, so a commit may not be possible unless Git is initialized later.

## Review Constraint

- Subagent-based spec review was not run because this session does not have explicit user permission to delegate work to subagents.
