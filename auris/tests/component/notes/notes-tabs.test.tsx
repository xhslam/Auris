import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NotesTabs } from "@/components/notes-v2/notes-tabs";
import type { NoteDocument } from "@/features/notes/documents/document-types";

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollBy = vi.fn();
});

function document(path: string, title: string): NoteDocument {
  const fileName = path.split("/").at(-1) ?? path;
  return {
    basename: fileName.replace(/\.md$/, ""),
    fileName,
    frontmatter: {},
    mtime: "2026-08-24T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title,
      wordCount: 1,
    },
    path,
    rawSource: `# ${title}`,
  };
}

const documents = [
  document("notes/a.md", "Alpha"),
  document("notes/b.md", "Beta"),
  document("notes/c.md", "Gamma"),
];

describe("NotesTabs", () => {
  it("activates adjacent and boundary tabs from the keyboard", () => {
    const onOpenPath = vi.fn();
    render(
      <NotesTabs
        activePath="notes/b.md"
        documents={documents}
        onOpenPath={onOpenPath}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), {
      key: "ArrowRight",
    });
    expect(onOpenPath).toHaveBeenLastCalledWith("notes/c.md");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), {
      key: "Home",
    });
    expect(onOpenPath).toHaveBeenLastCalledWith("notes/a.md");
  });

  it("reveals a right scroll affordance when tabs overflow", () => {
    render(
      <NotesTabs
        activePath="notes/a.md"
        documents={documents}
        onOpenPath={vi.fn()}
      />,
    );
    const strip = screen.getByRole("tablist");
    Object.defineProperties(strip, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 300 },
    });
    fireEvent.scroll(strip);

    const right = screen.getByRole("button", {
      name: /Scroll tabs right|向右滚动标签/,
    });
    expect(right).toBeEnabled();
    fireEvent.click(right);
    expect(strip.scrollBy).toHaveBeenCalled();
  });
});
