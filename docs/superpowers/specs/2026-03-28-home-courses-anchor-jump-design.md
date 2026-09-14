# Home Courses Anchor Jump Design

## Goal

Design the first navigation step from the home page "参加的课程" section into the courses page without depending on real course data yet.

## Scope

- Only the "查看更多" action in the home page courses section should navigate.
- The three course cards on the home page remain display-only for now.
- The navigation target should be the courses page section that shows the course list/panel.

## Chosen Approach

- Use a URL hash jump from the home page to the courses page.
- The "查看更多" control should navigate to `/courses#course-panel`.
- The courses page should expose a stable anchor on the "课程面板" section with `id="course-panel"`.

## Interaction Rules

- Clicking "查看更多" from the home page opens the courses page and lands the viewport on the "课程面板" block.
- Home page course cards do not navigate yet, because there is no real course detail destination.
- The courses page keeps showing placeholder/mock course cards until real course data is available.

## Why This Approach

- It is the lightest implementation and does not require extra state management.
- It stays compatible with future real course data and future course detail pages.
- It creates a clear contract now: home summary entry -> full courses panel.

## Non-Goals

- No course detail page in this step.
- No real course persistence or backend integration in this step.
- No change to the current placeholder course content in the courses page.

## Future Follow-Up

- Replace the home page three-course source with the latest real joined courses.
- Replace the courses page placeholder cards with the real full course list.
- Add per-course navigation once a stable course detail route exists.

## Testing

- Verify the home page "查看更多" control points to `/courses#course-panel`.
- Verify the courses page contains a stable `course-panel` anchor.
- Verify navigation still works when placeholder course cards are present.
