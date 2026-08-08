# Login Apple-Style Redesign

- Date: 2026-03-23
- Project: `english-shadowing-web`
- Status: Approved in chat, awaiting file review before implementation

## Summary

Redesign the login page so it feels closer to Apple’s official website visual language: lighter, quieter, more restrained, and more atmospheric. Keep the current two-column structure, but bring the left and right sides visually closer together and replace the current warm dark-orange treatment with a subtler dark grayscale composition that feels softly present rather than loudly styled.

## Goals

- Keep the login page in a two-column layout.
- Reduce the distance between the left story area and the right auth card.
- Shift the palette away from warm accent-heavy dark red into Apple-like dark neutral tones.
- Create a “若隐若现” effect through:
  - layered dark gradients
  - faint glows
  - low-contrast panel surfaces
  - soft translucency
- Make typography, spacing, and hierarchy feel calmer and more premium.

## Non-Goals

- Do not copy Apple’s actual content, navigation, or exact page structure.
- Do not change login business logic or auth flows.
- Do not redesign register and login as separate visual systems; the auth shell should remain shared.

## Experience Direction

### Layout

- Preserve left story content and right login form.
- Pull the two columns closer toward the center so they feel part of a single composition.
- Reduce empty negative space between them while keeping enough breathing room for elegance.
- Keep desktop balance refined and readable on large screens.

### Background

- Replace the current reddish-black background with a layered dark neutral backdrop.
- Use subtle vignettes, faint gradients, and soft glow fields rather than loud color blooms.
- The final impression should feel cinematic and understated, not neon or gaming-inspired.

### Left Content

- Keep the product story area, but lighten its density.
- Headline and body should feel more like Apple product copy:
  - stronger top headline rhythm
  - softer supporting text
  - more intentional spacing
- Metrics remain, but should feel quieter and more editorial, not like a dashboard.

### Right Auth Card

- The form should sit inside a lighter, softer panel.
- Card styling should move toward:
  - translucent dark glass
  - faint border
  - diffuse shadow
  - minimal edge contrast
- Inputs should look cleaner and more refined, with softer fills and subtler focus states.
- Primary button should remain clear, but become more restrained and Apple-like rather than aggressively saturated.

## Visual Principles

- Prioritize gray, charcoal, off-white, and only a very subtle cool highlight if needed.
- Avoid strong orange-red gradients in the login shell.
- Keep visual hierarchy driven by spacing, contrast, and type rather than decorative accents.
- Use blur and translucency sparingly so the page still feels crisp.

## Typography

- Larger headline with tighter tracking and more confident scale.
- Supporting copy should be smaller, lighter, and more relaxed in rhythm.
- Labels and helper text should be quieter and less visually heavy than they are now.

## Components Affected

### `src/components/auth/auth-shell.tsx`

- Rebalance the layout and copy grouping.
- Keep the brand row and metrics, but reduce their visual heaviness.
- Rework the story section to better match the new tone.

### `src/components/auth/auth-form.tsx`

- Keep logic intact.
- Update labels, helper text spacing, and control presentation if needed for the new visual language.

### `src/app/globals.css`

- Rework the `auth-shell` styles:
  - overall layout spacing
  - background treatment
  - left content styling
  - card styling
  - form field styling
  - button styling
  - responsive behavior

## Responsive Behavior

- Desktop is the main design target.
- On narrower screens, keep the page stacked, but preserve the same lighter and quieter visual system.
- The mobile layout should not feel cramped or visually heavier than desktop.

## Testing / Verification

- Confirm login page still renders with the shared auth shell.
- Confirm inputs and submit button remain accessible and functional.
- Run auth-related component tests if present.
- Run a production build smoke test after the redesign.

## Risks

### Risk: the new design becomes too empty after reducing contrast

Mitigation:
- keep hierarchy through typography scale, card silhouette, and measured glow placement

### Risk: reducing the inter-column gap may feel cramped on medium widths

Mitigation:
- tune grid widths and gap together; do not only shrink gap in isolation

### Risk: “Apple-like” drifts into generic glassmorphism

Mitigation:
- favor restraint, spacing, and grayscale hierarchy over heavy blur and glossy effects

## Implementation Notes

- Keep auth functionality unchanged.
- Preserve shared auth shell usage between login/register.
- Focus this change on the shell and form presentation only.
- The current project folder is not inside a Git repository, so a commit may not be possible unless Git is initialized later.

## Review Constraint

- Subagent-based spec review was not run because this session does not have explicit user permission to delegate work to subagents.
