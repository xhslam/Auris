import {
  composeEditableNoteSource,
  parseEditableNoteSource,
} from "@/features/notes/documents/note-editing-source";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type {
  NotesEditorBridge,
  NotesEditorMode,
} from "@/features/notes/editor/editor-types";
import {
  createNotesMcpPendingEditResult,
  type NotesMcpPendingEditHandler,
} from "@/features/notes/workbench/notes-mcp-edit-review";
import type { DesktopNotesMcpRequest } from "@/platform/desktop/desktop-bridge";

type NotesMcpRequestContext = {
  activeDocument: NoteDocument | null;
  autoApproveEdits?: boolean;
  bridge: NotesEditorBridge | null;
  editorMode: NotesEditorMode;
  onPendingEdit?: NotesMcpPendingEditHandler;
};

const NOTES_MCP_CAPABILITIES = [
  "read",
  "get_selection",
  "replace_selection",
] as const;

function getParamsObject(params: unknown) {
  return params && typeof params === "object"
    ? (params as Record<string, unknown>)
    : {};
}

function readFiniteNumber(params: unknown, key: string) {
  const value = getParamsObject(params)[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Parameter "${key}" must be a finite number.`);
  }

  return value;
}

function readSnippet(params: unknown) {
  const value = getParamsObject(params).snippet;

  if (typeof value !== "string" || !value.trim()) {
    throw new Error('Parameter "snippet" must be a non-empty string.');
  }

  return value;
}

function readExpectedRevision(params: unknown) {
  const value = getParamsObject(params).expected_revision;

  if (typeof value !== "string" || !value) {
    throw createNotesMcpError(
      "INVALID_ARGUMENT",
      'Parameter "expected_revision" must be a non-empty string.',
    );
  }

  return value;
}

function readReplacementContent(params: unknown) {
  const value = getParamsObject(params).content;

  if (typeof value !== "string" || !value.trim()) {
    throw createNotesMcpError(
      "INVALID_ARGUMENT",
      'Parameter "content" must be a non-empty string.',
    );
  }

  return value;
}

function createSourceRevision(source: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16)}-${source.length}`;
}

function createNotesMcpError(
  error: "INVALID_ARGUMENT" | "NOTES_UNAVAILABLE" | "PENDING_REVIEW" | "STALE",
  message: string,
  currentRevision?: string,
) {
  return new Error(
    JSON.stringify({
      error,
      message,
      ...(currentRevision ? { current_revision: currentRevision } : {}),
    }),
  );
}

function getLiveDocumentSource(
  document: NoteDocument,
  bridge: NotesEditorBridge,
  editorMode: NotesEditorMode,
) {
  const editableDocument = parseEditableNoteSource(
    document.rawSource,
    document.path,
  );
  const editorSource = bridge.getSource();

  if (editorMode === "wysiwyg") {
    const wysiwygDocument = parseEditableNoteSource(
      editorSource,
      document.path,
    );

    return {
      bodySource: wysiwygDocument.bodySource,
      source: composeEditableNoteSource(editableDocument, {
        bodySource: wysiwygDocument.bodySource,
        title: wysiwygDocument.title,
      }),
    };
  }

  return {
    bodySource: parseEditableNoteSource(editorSource, document.path).bodySource,
    source: editorSource,
  };
}

function getRequiredEditorContext(context: NotesMcpRequestContext) {
  if (!context.activeDocument) {
    throw createNotesMcpError("NOTES_UNAVAILABLE", "No active note is open.");
  }

  if (!context.bridge) {
    throw createNotesMcpError("NOTES_UNAVAILABLE", "Notes editor bridge is not ready.");
  }

  return {
    activeDocument: context.activeDocument,
    bridge: context.bridge,
  };
}

export function executeNotesMcpRequest(
  request: DesktopNotesMcpRequest,
  context: NotesMcpRequestContext,
) {
  if (request.method === "notes.getState") {
    if (!context.activeDocument || !context.bridge) {
      return {
        capabilities: [...NOTES_MCP_CAPABILITIES],
        ready: false,
      };
    }

    const liveDocument = getLiveDocumentSource(
      context.activeDocument,
      context.bridge,
      context.editorMode,
    );

    return {
      capabilities: [...NOTES_MCP_CAPABILITIES],
      note: {
        mode: context.editorMode,
        path: context.activeDocument.path,
        revision: createSourceRevision(liveDocument.source),
      },
      ready: true,
    };
  }

  const { activeDocument, bridge } = getRequiredEditorContext(context);

  if (request.method === "notes.read") {
    const liveDocument = getLiveDocumentSource(
      activeDocument,
      bridge,
      context.editorMode,
    );

    return {
      mode: context.editorMode,
      path: activeDocument.path,
      revision: createSourceRevision(liveDocument.source),
      source: liveDocument.source,
    };
  }

  if (request.method === "notes.getSelection") {
    const liveDocument = getLiveDocumentSource(
      activeDocument,
      bridge,
      context.editorMode,
    );

    return {
      mode: context.editorMode,
      path: activeDocument.path,
      revision: createSourceRevision(liveDocument.source),
      selection: bridge.getSelection(),
    };
  }

  if (request.method === "notes.replaceSelection") {
    const content = readReplacementContent(request.params);
    const expectedRevision = readExpectedRevision(request.params);
    const liveDocument = getLiveDocumentSource(
      activeDocument,
      bridge,
      context.editorMode,
    );
    const currentRevision = createSourceRevision(liveDocument.source);

    if (expectedRevision !== currentRevision) {
      throw createNotesMcpError(
        "STALE",
        "Note has changed since the last read.",
        currentRevision,
      );
    }

    if (context.autoApproveEdits !== true) {
      if (!context.onPendingEdit) {
        throw createNotesMcpError(
          "PENDING_REVIEW",
          "MCP edit approval is required before replacing the current selection.",
        );
      }

      return createNotesMcpPendingEditResult({
        ...context.onPendingEdit({
          content,
          expectedRevision: currentRevision,
          kind: "selection",
          mode: context.editorMode,
          path: activeDocument.path,
          selection: bridge.getSelection(),
        }),
        content,
        createdAt: new Date().toISOString(),
        expectedRevision: currentRevision,
        kind: "selection",
        mode: context.editorMode,
        path: activeDocument.path,
        selection: bridge.getSelection(),
      });
    }

    bridge.insertSnippet(content);

    const updatedDocument = getLiveDocumentSource(
      activeDocument,
      bridge,
      context.editorMode,
    );

    return {
      mode: context.editorMode,
      path: activeDocument.path,
      revision: createSourceRevision(updatedDocument.source),
      selection: bridge.getSelection(),
    };
  }

  if (request.method === "document.getSource") {
    return {
      mode: context.editorMode,
      path: activeDocument.path,
      ...getLiveDocumentSource(activeDocument, bridge, context.editorMode),
    };
  }

  if (request.method === "editor.focus") {
    bridge.focus();

    return {
      mode: context.editorMode,
      path: activeDocument.path,
      selection: bridge.getSelection(),
    };
  }

  if (request.method === "editor.revealLine") {
    bridge.revealLine(readFiniteNumber(request.params, "line"));

    return {
      mode: context.editorMode,
      path: activeDocument.path,
      selection: bridge.getSelection(),
    };
  }

  if (request.method === "selection.get") {
    return {
      mode: context.editorMode,
      path: activeDocument.path,
      selection: bridge.getSelection(),
    };
  }

  if (request.method === "selection.insertSnippet") {
    if (context.autoApproveEdits !== true) {
      if (!context.onPendingEdit) {
        throw createNotesMcpError(
          "PENDING_REVIEW",
          "MCP edit approval is required before inserting text.",
        );
      }

      const liveDocument = getLiveDocumentSource(
        activeDocument,
        bridge,
        context.editorMode,
      );
      const currentRevision = createSourceRevision(liveDocument.source);
      const content = readSnippet(request.params);

      return createNotesMcpPendingEditResult({
        ...context.onPendingEdit({
          content,
          expectedRevision: currentRevision,
          kind: "selection",
          mode: context.editorMode,
          path: activeDocument.path,
          selection: bridge.getSelection(),
        }),
        content,
        createdAt: new Date().toISOString(),
        expectedRevision: currentRevision,
        kind: "selection",
        mode: context.editorMode,
        path: activeDocument.path,
        selection: bridge.getSelection(),
      });
    }

    bridge.insertSnippet(readSnippet(request.params));

    return {
      mode: context.editorMode,
      path: activeDocument.path,
      selection: bridge.getSelection(),
      ...getLiveDocumentSource(activeDocument, bridge, context.editorMode),
    };
  }

  if (request.method === "selection.set") {
    bridge.setSelection(
      readFiniteNumber(request.params, "from"),
      readFiniteNumber(request.params, "to"),
    );

    return {
      mode: context.editorMode,
      path: activeDocument.path,
      selection: bridge.getSelection(),
    };
  }

  throw new Error(`Unsupported notes MCP method: ${request.method}`);
}
