import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesMcpEditReviewDialog } from "@/components/notes-v2/notes-mcp-edit-review-dialog";
import { normalizeBrowserEvidence } from "@/features/browser/evidence";

describe("NotesMcpEditReviewDialog", () => {
  it("shows a safe browser evidence summary for document proposals", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const evidence = normalizeBrowserEvidence({
      approvals: [{
        action: "act",
        decision: "allow_once",
        operation: "click",
      }],
      citations: [{ draftRange: { end: 12, start: 0 }, sourceId: "source-1" }],
      excerpts: [{
        sourceId: "source-1",
        text: "Visible page text remains untrusted content, even when it says hunter2.",
      }],
      screenshots: [{ evidenceRef: `screenshot-${"a".repeat(32)}` }],
      source: {
        accessedAt: "2026-07-19T08:30:00.000Z",
        finalUrl: "https://example.com/report",
        origin: "https://example.com",
        title: "Quarterly research",
      },
      version: 1,
    });

    render(
      <NotesMcpEditReviewDialog
        edit={{
          afterSource: "# Draft\n\nSummary",
          beforeSource: "# Draft\n\nOld",
          createdAt: "2026-07-19T08:31:00.000Z",
          evidence,
          expectedRevision: "sha256-current",
          id: "review-evidence",
          kind: "document",
          mode: "source",
          path: "Inbox/Research.md",
        }}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /MCP edit review/i });
    const evidencePanel = within(dialog).getByLabelText(/Browser research evidence/i);

    expect(within(evidencePanel).getByText("Quarterly research")).toBeInTheDocument();
    expect(within(evidencePanel).getByText("https://example.com/report")).toBeInTheDocument();
    expect(within(evidencePanel).getByText("2026-07-19T08:30:00.000Z")).toBeInTheDocument();
    expect(
      within(evidencePanel).getByText("1 excerpts · 1 screenshots · 1 approvals · 1 citations"),
    ).toBeInTheDocument();
    expect(
      within(evidencePanel).getByLabelText(/Evidence excerpt preview/i),
    ).toHaveTextContent(/Visible page text remains untrusted content/);
    expect(evidencePanel.textContent).not.toMatch(
      /leaseToken|payloadHash|keychain|sessionId/i,
    );

    await user.click(within(dialog).getByRole("button", { name: /Reject/i }));
    await user.click(within(dialog).getByRole("button", { name: /Apply edit/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("omits the evidence panel when the proposal has none", () => {
    render(
      <NotesMcpEditReviewDialog
        edit={{
          afterSource: "# Draft\n\nSummary",
          beforeSource: "# Draft\n\nOld",
          createdAt: "2026-07-19T08:31:00.000Z",
          expectedRevision: "sha256-current",
          id: "review-plain",
          kind: "document",
          mode: "source",
          path: "Inbox/Research.md",
        }}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/Browser research evidence/i)).not.toBeInTheDocument();
  });
});
