/** Formula adapter for the shared bounded viewport queue. */
import { scheduleNotesViewportRender } from "./notes-viewport-render-scheduler";
export function scheduleNotesMathRender(target: HTMLElement, editorRoot: HTMLElement, render: () => void) {
  return scheduleNotesViewportRender(target, () => editorRoot.closest<HTMLElement>(".notes-v2__editor-host--wysiwyg") ?? editorRoot.parentElement, render);
}
