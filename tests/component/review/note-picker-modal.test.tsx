import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotePickerModal } from "@/components/review/note-picker-modal";
import type { NotesStorage, NotePageSummary } from "@/features/notes/note-types";

describe("NotePickerModal", () => {
  const mockNotes: NotePageSummary[] = [
    {
      id: "note-1",
      title: "Linear Algebra Eigenvalues",
      fileName: "Linear Algebra.md",
      relativePath: "Math/Linear Algebra.md",
      icon: "📝",
      updatedAt: "2026-11-10T12:00:00Z",
    },
    {
      id: "note-2",
      title: "Quantum Mechanics Bra-Ket",
      fileName: "Quantum.md",
      relativePath: "Physics/Quantum.md",
      icon: "⚛️",
      updatedAt: "2026-11-12T12:00:00Z",
    },
  ];

  const mockStorage = {
    listPages: vi.fn().mockResolvedValue(mockNotes),
  } as unknown as NotesStorage;

  it("loads and lists notes from storage", async () => {
    render(
      <NotePickerModal
        existingNoteIds={new Set(["note-1"])}
        notesStorage={mockStorage}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("从笔记库选择复习笔记")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Linear Algebra Eigenvalues")).toBeInTheDocument();
      expect(screen.getByText("Quantum Mechanics Bra-Ket")).toBeInTheDocument();
    });

    expect(screen.getByText("已在复习中")).toBeInTheDocument();
  });

  it("filters notes by search input and submits selected", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <NotePickerModal
        existingNoteIds={new Set()}
        notesStorage={mockStorage}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Quantum Mechanics Bra-Ket")).toBeInTheDocument();
    });

    // Search for Quantum
    const searchInput = screen.getByPlaceholderText("搜索笔记标题或文件夹路径…");
    await user.type(searchInput, "Quantum");

    expect(screen.queryByText("Linear Algebra Eigenvalues")).not.toBeInTheDocument();
    expect(screen.getByText("Quantum Mechanics Bra-Ket")).toBeInTheDocument();

    // Select checkbox
    const checkbox = screen.getByRole("checkbox", { name: "选择 Quantum Mechanics Bra-Ket" });
    await user.click(checkbox);

    const submitBtn = screen.getByRole("button", { name: "加入今日回顾 (1)" });
    await user.click(submitBtn);

    expect(onConfirm).toHaveBeenCalledWith([
      {
        id: "note-2",
        title: "Quantum Mechanics Bra-Ket",
        relativePath: "Physics/Quantum.md",
      },
    ]);
  });
});
