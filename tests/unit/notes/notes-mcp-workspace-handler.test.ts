import { describe, expect, it, vi } from "vitest";
import { executeNotesMcpWorkspaceRequest } from "@/features/notes/workbench/notes-mcp-workspace-handler";
import { createNotesMcpRevision } from "@/features/notes/workbench/notes-mcp-contract";
import type { NotesMcpPendingEditHandler } from "@/features/notes/workbench/notes-mcp-edit-review";
import { createWorkspaceState, openWorkspacePath } from "@/features/notes/workspace/workspace-store";

describe("notes MCP workspace handler", () => {
  const evidence = {
    citations: [{ draftRange: { end: 13, start: 2 }, sourceId: "source-1" }],
    excerpts: [{ sourceId: "source-1", text: "Visible source" }],
    source: {
      accessedAt: "2026-07-19T08:30:00.000Z",
      finalUrl: "https://example.com/report",
      origin: "https://example.com",
      title: "Research",
    },
    version: 1,
  } as const;

  it("reports open vault tabs in one session request without revealing the host root", () => {
    const workspace = openWorkspacePath(createWorkspaceState(), "Inbox/Daily.md");
    const result = executeNotesMcpWorkspaceRequest(
      { method: "notes.mcp.session", params: { action: "get_state" } },
      {
        client: { rootPath: "/Users/apple/private-vault" },
        documents: [{ path: "Inbox/Daily.md", rawSource: "# Daily" }],
        dirtyPaths: { "Inbox/Daily.md": true },
        setWorkspace: vi.fn(),
        workspace,
      },
    );

    expect(result).toMatchObject({
      active_tab_id: "Inbox/Daily.md",
      tabs: [{ dirty: true, path: "Inbox/Daily.md" }],
      vault: { configured: true },
    });
    expect(JSON.stringify(result)).not.toContain("/Users/apple/private-vault");
  });

  it("rejects document reads that target an unknown tab", () => {
    expect(() =>
      executeNotesMcpWorkspaceRequest(
        { method: "notes.mcp.document", params: { action: "read", tab_id: "missing.md" } },
        {
          client: { rootPath: null },
          documents: [],
          dirtyPaths: {},
          setWorkspace: vi.fn(),
          workspace: createWorkspaceState(),
        },
      ),
    ).toThrow(/INVALID_TAB/);
  });

  it("writes only when the caller supplies the current document revision", () => {
    const onDocumentChange = vi.fn();
    const workspace = openWorkspacePath(createWorkspaceState(), "Inbox/Daily.md");
    const context = {
      autoApproveEdits: true,
      client: { rootPath: "/vault" },
      documents: [{ path: "Inbox/Daily.md", rawSource: "# Original" }],
      dirtyPaths: {},
      onDocumentChange,
      setWorkspace: vi.fn(),
      workspace,
    };

    expect(() =>
      executeNotesMcpWorkspaceRequest(
        {
          method: "notes.mcp.document",
          params: {
            action: "write",
            content: "# Replacement",
            expected_revision: "sha256-stale",
          },
        },
        context,
      ),
    ).toThrow(/STALE/);
    expect(onDocumentChange).not.toHaveBeenCalled();

    const result = executeNotesMcpWorkspaceRequest(
      {
        method: "notes.mcp.document",
        params: {
          action: "write",
          content: "# Replacement",
          expected_revision: "sha256-1223fcefccd1ce246319f7fe60ab6b0f4361c1153848813948bb83da30d32c0f",
        },
      },
      context,
    );

    expect(onDocumentChange).toHaveBeenCalledWith("Inbox/Daily.md", "# Replacement");
    expect(result).toMatchObject({ tab_id: "Inbox/Daily.md" });
  });

  it("does not apply a document write until MCP edit approval is enabled", () => {
    const onDocumentChange = vi.fn();
    const context = {
      autoApproveEdits: false,
      client: { rootPath: "/vault" },
      documents: [{ path: "Inbox/Daily.md", rawSource: "# Original" }],
      dirtyPaths: {},
      onDocumentChange,
      setWorkspace: vi.fn(),
      workspace: openWorkspacePath(createWorkspaceState(), "Inbox/Daily.md"),
    };

    expect(() =>
      executeNotesMcpWorkspaceRequest(
        {
          method: "notes.mcp.document",
          params: {
            action: "write",
            content: "# Replacement",
            expected_revision: "sha256-1223fcefccd1ce246319f7fe60ab6b0f4361c1153848813948bb83da30d32c0f",
          },
        },
        context,
      ),
    ).toThrow(/PENDING_REVIEW/);
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("returns a pending review for document writes when approval is required", () => {
    const onDocumentChange = vi.fn();
    const onPendingEdit = vi.fn(() => ({ id: "review-1" }));
    const context = {
      autoApproveEdits: false,
      client: { rootPath: "/vault" },
      documents: [{ path: "Inbox/Daily.md", rawSource: "# Original" }],
      dirtyPaths: {},
      onDocumentChange,
      onPendingEdit,
      setWorkspace: vi.fn(),
      workspace: openWorkspacePath(createWorkspaceState(), "Inbox/Daily.md"),
    };

    expect(
      executeNotesMcpWorkspaceRequest(
        {
          method: "notes.mcp.document",
          params: {
            action: "write",
            content: "# Replacement",
            expected_revision: "sha256-1223fcefccd1ce246319f7fe60ab6b0f4361c1153848813948bb83da30d32c0f",
          },
        },
        context,
      ),
    ).toEqual({
      pending_review: {
        id: "review-1",
        kind: "document",
        path: "Inbox/Daily.md",
      },
    });
    expect(onPendingEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        afterSource: "# Replacement",
        beforeSource: "# Original",
        kind: "document",
        path: "Inbox/Daily.md",
      }),
    );
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("attaches immutable evidence to a pending proposal after the unchanged stale check", () => {
    const onDocumentChange = vi.fn();
    const onPendingEdit = vi.fn<NotesMcpPendingEditHandler>(() => ({ id: "review-evidence" }));
    const context = {
      autoApproveEdits: false,
      client: { rootPath: "/vault" },
      documents: [{ path: "Inbox/Daily.md", rawSource: "# Original" }],
      dirtyPaths: {},
      onDocumentChange,
      onPendingEdit,
      setWorkspace: vi.fn(),
      workspace: openWorkspacePath(createWorkspaceState(), "Inbox/Daily.md"),
    };

    expect(() => executeNotesMcpWorkspaceRequest({
      method: "notes.mcp.document",
      params: {
        action: "write",
        content: "# Replacement",
        evidence,
        expected_revision: "sha256-stale",
      },
    }, context)).toThrow(/STALE/);
    expect(onPendingEdit).not.toHaveBeenCalled();

    const result = executeNotesMcpWorkspaceRequest({
      method: "notes.mcp.document",
      params: {
        action: "write",
        content: "# Replacement",
        evidence,
        expected_revision: "sha256-1223fcefccd1ce246319f7fe60ab6b0f4361c1153848813948bb83da30d32c0f",
      },
    }, context);

    expect(result).toEqual({
      pending_review: {
        id: "review-evidence",
        kind: "document",
        path: "Inbox/Daily.md",
      },
    });
    expect(onPendingEdit).toHaveBeenCalledWith(expect.objectContaining({ evidence }));
    const proposal = onPendingEdit.mock.calls[0]?.[0];
    expect(proposal?.kind).toBe("document");
    expect(Object.isFrozen(proposal?.kind === "document" ? proposal.evidence : undefined)).toBe(true);
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("never serializes evidence into vault content on the explicit auto-approve path", () => {
    const onDocumentChange = vi.fn();

    executeNotesMcpWorkspaceRequest({
      method: "notes.mcp.document",
      params: {
        action: "write",
        content: "# Replacement",
        evidence,
        expected_revision: "sha256-1223fcefccd1ce246319f7fe60ab6b0f4361c1153848813948bb83da30d32c0f",
      },
    }, {
      autoApproveEdits: true,
      client: { rootPath: "/vault" },
      documents: [{ path: "Inbox/Daily.md", rawSource: "# Original" }],
      dirtyPaths: {},
      onDocumentChange,
      setWorkspace: vi.fn(),
      workspace: openWorkspacePath(createWorkspaceState(), "Inbox/Daily.md"),
    });

    expect(onDocumentChange).toHaveBeenCalledWith("Inbox/Daily.md", "# Replacement");
    expect(onDocumentChange.mock.calls[0]).toHaveLength(2);
  });

  it("switches an existing tab and refuses to close a dirty one without force", () => {
    const setWorkspace = vi.fn();
    const workspace = openWorkspacePath(
      openWorkspacePath(createWorkspaceState(), "Inbox/One.md"),
      "Inbox/Two.md",
    );
    const context = {
      client: { rootPath: "/vault" },
      documents: [
        { path: "Inbox/One.md", rawSource: "# One" },
        { path: "Inbox/Two.md", rawSource: "# Two" },
      ],
      dirtyPaths: { "Inbox/One.md": true },
      setWorkspace,
      workspace,
    };

    expect(() =>
      executeNotesMcpWorkspaceRequest(
        { method: "notes.mcp.workspace", params: { action: "close", tab_id: "Inbox/One.md" } },
        context,
      ),
    ).toThrow(/DIRTY/);

    expect(
      executeNotesMcpWorkspaceRequest(
        { method: "notes.mcp.workspace", params: { action: "switch_tab", tab_id: "Inbox/One.md" } },
        context,
      ),
    ).toEqual({ tab_id: "Inbox/One.md" });
    expect(setWorkspace).toHaveBeenCalledOnce();
  });

  it("opens an existing vault note and reports the persisted revision after saving", async () => {
    const setWorkspace = vi.fn();
    const context = {
      client: { rootPath: "/vault" },
      documents: [{ path: "Inbox/Existing.md", rawSource: "# Existing" }],
      dirtyPaths: {},
      onSaveDocument: vi.fn(async () => ({ status: "saved", persistedSource: "# Existing" })),
      setWorkspace,
      workspace: createWorkspaceState(),
    };

    expect(
      executeNotesMcpWorkspaceRequest(
      { method: "notes.mcp.workspace", params: { action: "open", path: "Inbox/Existing.md" } },
        context,
      ),
    ).toEqual({ tab_id: "Inbox/Existing.md" });
    context.workspace = openWorkspacePath(context.workspace, "Inbox/Existing.md");
    expect(await
      executeNotesMcpWorkspaceRequest(
        { method: "notes.mcp.workspace", params: { action: "save", tab_id: "Inbox/Existing.md" } },
        context,
      ),
    ).toMatchObject({ tab_id: "Inbox/Existing.md", revision: expect.any(String) });
    expect(context.onSaveDocument).toHaveBeenCalledWith("Inbox/Existing.md");
  });

  it("does not acknowledge a save before the shared writer finishes", async () => {
    let finish!: (value: { status: string; persistedSource: string }) => void;
    const writing = new Promise<{ status: string; persistedSource: string }>(resolve => { finish = resolve; });
    const onSaveDocument = vi.fn(() => writing);
    const context = {
      client: { rootPath: "/vault" },
      documents: [{ path: "Daily.md", rawSource: "# stale capture" }],
      dirtyPaths: { "Daily.md": true },
      onSaveDocument,
      setWorkspace: vi.fn(),
      workspace: openWorkspacePath(createWorkspaceState(), "Daily.md"),
    };
    let acknowledged = false;
    const pending = Promise.resolve(executeNotesMcpWorkspaceRequest(
      { method: "notes.mcp.workspace", params: { action: "save", tab_id: "Daily.md" } }, context,
    )).then(result => { acknowledged = true; return result; });
    await Promise.resolve();
    expect(onSaveDocument).toHaveBeenCalledWith("Daily.md");
    expect(acknowledged).toBe(false);
    finish({ status: "saved", persistedSource: "# actual normalized bytes" });
    expect(await pending).toMatchObject({ revision: createNotesMcpRevision("# actual normalized bytes") });
  });

  it.each(["conflict", "failed", "missing"])("refuses to acknowledge a %s save", async status => {
    const context = {
      client: { rootPath: "/vault" },
      documents: [{ path: "Daily.md", rawSource: "# text" }],
      dirtyPaths: { "Daily.md": true },
      onSaveDocument: vi.fn(async () => ({ status })),
      setWorkspace: vi.fn(),
      workspace: openWorkspacePath(createWorkspaceState(), "Daily.md"),
    };
    await expect((async () => await executeNotesMcpWorkspaceRequest(
      { method: "notes.mcp.workspace", params: { action: "save", tab_id: "Daily.md" } }, context,
    ))()).rejects.toThrow(status === "conflict" ? /STALE/ : /NOTES_UNAVAILABLE/);
  });

  it("does not write a cached document whose tab is closed", () => {
    const onSaveDocument = vi.fn();
    expect(() => executeNotesMcpWorkspaceRequest(
      { method: "notes.mcp.workspace", params: { action: "save", tab_id: "Closed.md" } },
      { client: { rootPath: "/vault" }, documents: [{ path: "Closed.md", rawSource: "# discarded" }], dirtyPaths: {}, onSaveDocument, setWorkspace: vi.fn(), workspace: createWorkspaceState() },
    )).toThrow(/INVALID_TAB/);
    expect(onSaveDocument).not.toHaveBeenCalled();
  });

  it("refuses to save when the pipeline is unavailable", () => {
    expect(() => executeNotesMcpWorkspaceRequest(
      { method: "notes.mcp.workspace", params: { action: "save", tab_id: "Daily.md" } },
      { client: { rootPath: "/vault" }, documents: [{ path: "Daily.md", rawSource: "# text" }], dirtyPaths: {}, setWorkspace: vi.fn(), workspace: openWorkspacePath(createWorkspaceState(), "Daily.md") },
    )).toThrow(/NOTES_UNAVAILABLE/);
  });

  it("creates a new vault-relative Markdown note without overwriting an existing document", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const setWorkspace = vi.fn();
    const context = {
      client: { rootPath: "/vault", writeFile },
      documents: [],
      dirtyPaths: {},
      setWorkspace,
      workspace: createWorkspaceState(),
    };

    await expect(
      executeNotesMcpWorkspaceRequest(
        { method: "notes.mcp.workspace", params: { action: "new", path: "Inbox/Agent Draft.md" } },
        context,
      ),
    ).resolves.toEqual({ tab_id: "Inbox/Agent Draft.md" });
    expect(writeFile).toHaveBeenCalledWith("Inbox/Agent Draft.md", "# Agent Draft\n");
    expect(setWorkspace).toHaveBeenCalledOnce();
  });
});
