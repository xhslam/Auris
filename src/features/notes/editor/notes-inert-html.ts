/**
 * Parse import markup without a browsing context. Creating detached elements
 * in the live document can still fetch images and run their error handlers.
 * Adapted from VMark src/utils/htmlToMarkdown.ts at
 * 2d3903cb2887a7c6a7a8df7b814f14b745bc2415 (ISC).
 */
export function createInertNotesHtmlContainer(html: string): HTMLDivElement {
  const inert = new window.DOMParser().parseFromString("", "text/html");
  const container = inert.createElement("div");
  container.innerHTML = html;
  return container;
}
