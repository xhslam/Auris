import {
  createNotesMcpError,
  createNotesMcpRevision,
  parseVaultMarkdownPath,
  safeParseNotesMcpToolInput,
  type NotesMcpToolInput,
} from "@/features/notes/workbench/notes-mcp-contract";
import { normalizeBrowserEvidence } from "@/features/browser/evidence";
import {
  createNotesMcpPendingEditResult,
  type NotesMcpPendingEditHandler,
} from "@/features/notes/workbench/notes-mcp-edit-review";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import {
  closeWorkspacePath,
  openWorkspacePath,
} from "@/features/notes/workspace/workspace-store";

type McpDocument = Pick<NoteDocument, "path" | "rawSource">;

type WorkspaceRequest = {
  method: "notes.mcp.document" | "notes.mcp.session" | "notes.mcp.workspace";
  params?: unknown;
};

type WorkspaceContext = {
  autoApproveEdits?: boolean;
  client: { rootPath: string | null; writeFile?: (path: string, content: string) => Promise<void> };
  documents: McpDocument[];
  dirtyPaths: Record<string, boolean>;
  onDocumentChange?: (path: string, rawSource: string) => void;
  onPendingEdit?: NotesMcpPendingEditHandler;
  onSaveDocument?: (path: string) => Promise<{ status: string; persistedSource?: string }>;
  setWorkspace: (update: (current: NotesWorkspaceState) => NotesWorkspaceState) => void;
  workspace: NotesWorkspaceState;
};

function throwMcpError(
  error: Parameters<typeof createNotesMcpError>[0],
  message: string,
  currentRevision?: string,
): never {
  throw new Error(JSON.stringify(createNotesMcpError(error, message, currentRevision)));
}

function getDocument(context: WorkspaceContext, tabId?: string) {
  const resolvedTabId = tabId ?? context.workspace.activePath;
  const document = context.documents.find((candidate) => candidate.path === resolvedTabId);

  if (!document || !resolvedTabId) {
    throwMcpError("INVALID_TAB", "The requested Auris note tab is not open.");
  }

  return document;
}

export function executeNotesMcpWorkspaceRequest(
  request: WorkspaceRequest,
  context: WorkspaceContext,
) {
  if (request.method === "notes.mcp.session") {
    const parsed = safeParseNotesMcpToolInput("auris_session", request.params ?? {});
    if (!parsed.success) {
      throwMcpError("INVALID_ARGUMENT", "The MCP tool input is invalid.");
    }

    return {
      active_tab_id: context.workspace.activePath,
      capabilities: {
        document: ["read", "write"],
        selection: ["get", "set"],
        workspace: ["new", "open", "save", "close", "switch_tab"],
      },
      tabs: context.workspace.openTabs.flatMap((path) => {
        const document = context.documents.find((candidate) => candidate.path === path);

        return document
          ? [{
              dirty: context.dirtyPaths[path] === true,
              path,
              revision: createNotesMcpRevision(document.rawSource),
            }]
          : [];
      }),
      vault: { configured: context.client.rootPath !== null },
    };
  }

  if (request.method === "notes.mcp.document") {
    const parsed = safeParseNotesMcpToolInput("auris_document", request.params ?? {});
    if (!parsed.success) {
      throwMcpError("INVALID_ARGUMENT", "The MCP tool input is invalid.");
    }
    const data = parsed.data as NotesMcpToolInput<"auris_document">;

    if (data.action === "read") {
      const document = getDocument(context, data.tab_id);

      return {
        content: document.rawSource,
        dirty: context.dirtyPaths[document.path] === true,
        file_path: document.path,
        revision: createNotesMcpRevision(document.rawSource),
        tab_id: document.path,
      };
    }

    const document = getDocument(context, data.tab_id);
    const currentRevision = createNotesMcpRevision(document.rawSource);

    if (!data.expected_revision || data.expected_revision !== currentRevision) {
      throwMcpError(
        "STALE",
        "The Auris note has changed since the last read.",
        currentRevision,
      );
    }

    if (!context.onDocumentChange) {
      throwMcpError("NOTES_UNAVAILABLE", "The Auris notes editor is not ready.");
    }

    const evidence = data.evidence
      ? normalizeBrowserEvidence(data.evidence)
      : undefined;

    if (context.autoApproveEdits !== true) {
      if (!context.onPendingEdit) {
        throwMcpError(
          "PENDING_REVIEW",
          "MCP edit approval is required before replacing a note.",
        );
      }

      return createNotesMcpPendingEditResult({
        ...context.onPendingEdit({
          afterSource: data.content,
          beforeSource: document.rawSource,
          ...(evidence ? { evidence } : {}),
          expectedRevision: currentRevision,
          kind: "document",
          mode: "source",
          path: document.path,
        }),
        afterSource: data.content,
        beforeSource: document.rawSource,
        createdAt: new Date().toISOString(),
        ...(evidence ? { evidence } : {}),
        expectedRevision: currentRevision,
        kind: "document",
        mode: "source",
        path: document.path,
      });
    }

    context.onDocumentChange(document.path, data.content);

    return {
      revision: createNotesMcpRevision(data.content),
      tab_id: document.path,
    };
  }

  const parsed = safeParseNotesMcpToolInput("auris_workspace", request.params ?? {});
  if (!parsed.success) {
    throwMcpError("INVALID_ARGUMENT", "The MCP tool input is invalid.");
  }
  const data = parsed.data as NotesMcpToolInput<"auris_workspace">;

  if (data.action === "switch_tab") {
    getDocument(context, data.tab_id);
    context.setWorkspace((current) => openWorkspacePath(current, data.tab_id));
    return { tab_id: data.tab_id };
  }

  if (data.action === "open") {
    getDocument(context, data.path);
    context.setWorkspace((current) => openWorkspacePath(current, data.path));
    return { tab_id: data.path };
  }

  if (data.action === "new") {
    const path = parseVaultMarkdownPath(data.path ?? "Untitled.md");
    if (context.documents.some((document) => document.path === path)) {
      throwMcpError("INVALID_PATH", "An Auris note already exists at that path.");
    }
    if (!context.client.writeFile) {
      throwMcpError("NOTES_UNAVAILABLE", "The Auris vault is not ready for note creation.");
    }

    const title = path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "Untitled";
    return context.client.writeFile(path, `# ${title}\n`).then(() => {
      context.setWorkspace((current) => openWorkspacePath(current, path));
      return { tab_id: path };
    });
  }

  if (data.action === "save") {
    const document = getDocument(context, data.tab_id);
    // Like VMark saveToPathForMcp (2d3903cb2, ISC), acknowledge the shared
    // persistence pipeline, not a revision computed from an unsaved capture.
    if (!context.workspace.openTabs.includes(document.path)) {
      throwMcpError("INVALID_TAB", "The requested Auris note tab is not open.");
    }
    if (!context.onSaveDocument) {
      throwMcpError("NOTES_UNAVAILABLE", "The Auris note save pipeline is not ready.");
    }
    return context.onSaveDocument(document.path).then(result => {
      if (result.status !== "saved" || typeof result.persistedSource !== "string") {
        throwMcpError(result.status === "conflict" ? "STALE" : "NOTES_UNAVAILABLE", "The Auris note could not be saved.");
      }
      return { revision: createNotesMcpRevision(result.persistedSource), tab_id: document.path };
    });
  }

  if (data.action === "close") {
    getDocument(context, data.tab_id);
    if (context.dirtyPaths[data.tab_id] && !data.force) {
      throwMcpError("DIRTY", "The Auris note has unsaved local changes.");
    }

    context.setWorkspace((current) => closeWorkspacePath(current, data.tab_id));
    return { closed: true, tab_id: data.tab_id };
  }

  throwMcpError("INVALID_ARGUMENT", "This MCP operation is not available yet.");
}
