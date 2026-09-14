import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NiaApplyReview } from "@/components/nia/nia-apply-review";
import { createNotesSelectionContext } from "@/features/nia/nia-context";

describe("Notes Nia apply review", () => {
  it("previews and submits an explicit selection proposal", async () => {
    const user = userEvent.setup();
    const context = createNotesSelectionContext({
      path: "note.md",
      source: "hello",
      selection: { from: 0, to: 5, line: 0, text: "hello" },
    })!;
    const onApply = vi.fn(() => ({ ok: true }));
    render(
      <NiaApplyReview
        content="hi"
        context={context}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("hi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({
      content: "hi",
      context,
      mode: "replace_selection",
    });
  });

  it("surfaces stale revision refusal from the host facade", async () => {
    const user = userEvent.setup();
    const context = createNotesSelectionContext({
      path: "note.md",
      source: "hello",
      selection: { from: 0, to: 5, line: 0, text: "hello" },
    })!;
    render(
      <NiaApplyReview
        content="hi"
        context={context}
        onApply={() => ({ ok: false, reason: "The note changed. Review the response again." })}
        onDiscard={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The note changed");
  });

  it("supports insert/document modes and discards without mutating", async () => {
    const user = userEvent.setup();
    const context = createNotesSelectionContext({
      path: "note.md",
      source: "hello",
      selection: { from: 0, to: 5, line: 0, text: "hello" },
    })!;
    const onApply = vi.fn(() => ({ ok: true }));
    const onDiscard = vi.fn();
    render(
      <NiaApplyReview content="hi" context={context} onApply={onApply} onDiscard={onDiscard} />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Apply mode" }), "insert_at_cursor");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenLastCalledWith({ content: "hi", context, mode: "insert_at_cursor" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Apply mode" }), "replace_document");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenLastCalledWith({ content: "hi", context, mode: "replace_document" });
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
