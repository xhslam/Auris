import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesImagePreview, isNotesImagePath } from "@/components/notes-v2/notes-image-preview";

describe("NotesImagePreview", () => {
  it("uses vault URLs without corrupting Unicode, spaces or literal percent escapes", () => {
    render(<NotesImagePreview path="附件/中文 %20 #图.png" onClose={vi.fn()} />);
    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("src", "shadowing-media://vault/" + ["附件", "中文 %20 #图.png"].map(encodeURIComponent).join("/"));
    fireEvent.load(image);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("supports fit, actual size, zoom and closing without document edits", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<NotesImagePreview path="附件/photo.PNG" onClose={close} />);
    await user.click(screen.getByRole("button", { name: "原图" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "放大图片" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "缩小图片" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "适应窗口" }));
    expect(screen.getByText("自动")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭图片" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports load failure and retries with a fresh URL", async () => {
    render(<NotesImagePreview path="photo.png" onClose={vi.fn()} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("alert")).toHaveTextContent("无法加载图片");
    await userEvent.setup().click(screen.getByRole("button", { name: "重试" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", "shadowing-media://vault/photo.png?v=1");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not enable documents, archives or unsupported images", () => {
    for (const path of ["a.pdf", "a.zip", "a.md", "a.heic", "a.png.exe"]) expect(isNotesImagePath(path)).toBe(false);
    for (const path of ["a.PNG", "a.jpg", "a.jpeg", "a.webp", "a.gif"]) expect(isNotesImagePath(path)).toBe(true);
  });
});
