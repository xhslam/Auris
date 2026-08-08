import { describe, expect, it, vi } from "vitest";
import { executeNotesMcpRequest } from "@/features/notes/workbench/notes-mcp-request-handler";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(): NoteDocument {
  return {
    basename: "daily",
    fileName: "daily.md",
    frontmatter: {},
    mtime: "2026-04-19T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Daily Review",
      wordCount: 4,
    },
    path: "notes/daily.md",
    rawSource: "# Daily Review\n\nShadow the line",
  };
}

describe("executeNotesMcpRequest", () => {
  it("reports notes availability without exposing a note when the editor is not ready", () => {
    const result = executeNotesMcpRequest(
      { method: "notes.getState" },
      {
        activeDocument: null,
        bridge: null,
        editorMode: "source",
      },
    );

    expect(result).toEqual({
      capabilities: ["read", "get_selection", "replace_selection"],
      ready: false,
    });
  });

  it("reads the active note with a deterministic revision", () => {
    const document = createDocument();
    const bridge = {
      focus: vi.fn(),
      getActiveLine: vi.fn(() => 2),
      getSelection: vi.fn(() => null),
      getSource: vi.fn(() => "# Daily Review\n\nEdited in the live editor"),
      insertSnippet: vi.fn(),
      revealLine: vi.fn(),
      setSelection: vi.fn(),
      view: null,
    };

    const result = executeNotesMcpRequest(
      { method: "notes.read" },
      {
        activeDocument: document,
        bridge,
        editorMode: "source",
      },
    );

    expect(result).toMatchObject({
      mode: "source",
      path: "notes/daily.md",
      source: "# Daily Review\n\nEdited in the live editor",
    });
    expect(result).toHaveProperty("revision", expect.any(String));
  });

  it("rejects a stale selection replacement without mutating the editor", () => {
    const document = createDocument();
    let source = "# Daily Review\n\nShadow the line";
    const bridge = {
      focus: vi.fn(),
      getActiveLine: vi.fn(() => 2),
      getSelection: vi.fn(() => ({ from: 16, line: 2, text: "Shadow", to: 22 })),
      getSource: vi.fn(() => source),
      insertSnippet: vi.fn((snippet: string) => {
        source = source.replace("Shadow", snippet);
      }),
      revealLine: vi.fn(),
      setSelection: vi.fn(),
      view: null,
    };

    expect(() =>
      executeNotesMcpRequest(
        {
          method: "notes.replaceSelection",
          params: {
            content: "Practise",
            expected_revision: "outdated",
          },
        },
        {
          activeDocument: document,
          bridge,
          editorMode: "source",
        },
      ),
    ).toThrow(/STALE/);
    expect(bridge.insertSnippet).not.toHaveBeenCalled();
  });

  it("does not replace the selection until MCP edit approval is enabled", () => {
    const document = createDocument();
    const bridge = {
      focus: vi.fn(),
      getActiveLine: vi.fn(() => 2),
      getSelection: vi.fn(() => ({ from: 16, line: 2, text: "Shadow", to: 22 })),
      getSource: vi.fn(() => "# Daily Review\n\nShadow the line"),
      insertSnippet: vi.fn(),
      revealLine: vi.fn(),
      setSelection: vi.fn(),
      view: null,
    };

    expect(() =>
      executeNotesMcpRequest(
        {
          method: "notes.replaceSelection",
          params: {
            content: "Practise",
            expected_revision: "fnv1a-6718c2a0-31",
          },
        },
        {
          activeDocument: document,
          autoApproveEdits: false,
          bridge,
          editorMode: "source",
        },
      ),
    ).toThrow(/PENDING_REVIEW/);
    expect(bridge.insertSnippet).not.toHaveBeenCalled();
  });

  it("creates a pending review instead of mutating selection edits by default", () => {
    const document = createDocument();
    const onPendingEdit = vi.fn(() => ({ id: "review-1" }));
    const bridge = {
      focus: vi.fn(),
      getActiveLine: vi.fn(() => 2),
      getSelection: vi.fn(() => ({ from: 16, line: 2, text: "Shadow", to: 22 })),
      getSource: vi.fn(() => "# Daily Review\n\nShadow the line"),
      insertSnippet: vi.fn(),
      revealLine: vi.fn(),
      setSelection: vi.fn(),
      view: null,
    };

    const result = executeNotesMcpRequest(
      {
        method: "notes.replaceSelection",
        params: {
          content: "Practise",
          expected_revision: "fnv1a-6718c2a0-31",
        },
      },
      {
        activeDocument: document,
        autoApproveEdits: false,
        bridge,
        editorMode: "source",
        onPendingEdit,
      },
    );

    expect(result).toEqual({
      pending_review: {
        id: "review-1",
        kind: "selection",
        path: "notes/daily.md",
      },
    });
    expect(onPendingEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Practise",
        kind: "selection",
        path: "notes/daily.md",
      }),
    );
    expect(bridge.insertSnippet).not.toHaveBeenCalled();
  });

  it("returns the live source for document.getSource", () => {
    const document = createDocument();
    const bridge = {
      focus: vi.fn(),
      getActiveLine: vi.fn(() => 2),
      getSelection: vi.fn(() => ({
        from: 0,
        line: 2,
        text: "Shadow",
        to: 6,
      })),
      getSource: vi.fn(() => "# Edited Review\n\nShadow the line\nAdded"),
      insertSnippet: vi.fn(),
      revealLine: vi.fn(),
      setSelection: vi.fn(),
      view: null,
    };

    const result = executeNotesMcpRequest(
      {
        id: "1",
        method: "document.getSource",
      },
      {
        activeDocument: document,
        bridge,
        editorMode: "wysiwyg",
      },
    );

    expect(result).toMatchObject({
      mode: "wysiwyg",
      path: "notes/daily.md",
      source: "# Edited Review\n\nShadow the line\nAdded",
    });
  });

  it("dispatches selection operations to the live editor bridge", () => {
    const document = createDocument();
    const bridge = {
      focus: vi.fn(),
      getActiveLine: vi.fn(() => 2),
      getSelection: vi.fn(() => ({
        from: 0,
        line: 2,
        text: "Shadow",
        to: 6,
      })),
      getSource: vi.fn(() => "Shadow the line"),
      insertSnippet: vi.fn(),
      revealLine: vi.fn(),
      setSelection: vi.fn(),
      view: null,
    };

    const result = executeNotesMcpRequest(
      {
        id: "2",
        method: "selection.set",
        params: {
          from: 1,
          to: 4,
        },
      },
      {
        activeDocument: document,
        bridge,
        editorMode: "source",
      },
    );

    expect(bridge.setSelection).toHaveBeenCalledWith(1, 4);
    expect(result).toMatchObject({
      mode: "source",
      path: "notes/daily.md",
    });
  });
});
