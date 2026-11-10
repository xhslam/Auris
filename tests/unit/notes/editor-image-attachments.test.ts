import { describe, expect, it, vi } from "vitest";
import { collectNotesImageFiles, NOTES_IMAGE_MAX_BYTES, validateNotesImageFile, prepareImageInsertion } from "@/features/notes/editor/editor-image-attachments";

describe("editor image attachments", () => {
  it("stores pasted images in note assets when persistence is available", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "Cover Photo.PNG", {
      type: "image/png",
    });
    const persistAttachment = vi.fn(async () => undefined);
    const readDataUrl = vi.fn(async () => "data:image/png;base64,AAAA");

    const result = await prepareImageInsertion({
      createId: () => "abc123",
      file,
      notePath: "notes/daily-review.md",
      persistAttachment,
      readDataUrl,
    });

    expect(persistAttachment).toHaveBeenCalledWith(
      "notes/assets/daily-review-cover-photo-abc123.png",
      expect.any(Uint8Array),
    );
    expect(readDataUrl).not.toHaveBeenCalled();
    expect(result).toEqual({
      alt: "Cover Photo",
      markdown: "![Cover Photo](assets/daily-review-cover-photo-abc123.png)",
      source: "assets/daily-review-cover-photo-abc123.png",
      storagePath: "notes/assets/daily-review-cover-photo-abc123.png",
      title: "",
    });
  });

  it("falls back to a data URL when persistence is unavailable", async () => {
    const file = new File([new Uint8Array([4, 5, 6])], "cover.png", {
      type: "image/png",
    });
    const readDataUrl = vi.fn(async () => "data:image/png;base64,BBBB");

    const result = await prepareImageInsertion({
      createId: () => "abc123",
      file,
      notePath: "notes/daily-review.md",
      readDataUrl,
    });

    expect(readDataUrl).toHaveBeenCalledWith(file);
    expect(result).toEqual({
      alt: "cover",
      markdown: "![cover](data:image/png;base64,BBBB)",
      source: "data:image/png;base64,BBBB",
      storagePath: null,
      title: "",
    });
  });
  it("escapes image alt text for a Markdown round trip", async () => {
    const result = await prepareImageInsertion({ file: new File(["png"], "[photo].png", { type: "image/png" }), notePath: "note.md", readDataUrl: async () => "data:image/png;base64,AAAA" });
    expect(result.markdown).toBe("![\\[photo\\]](data:image/png;base64,AAAA)");
  });

  it("does not silently embed a large data URL after a disk failure", async () => {
    const readDataUrl = vi.fn();
    await expect(prepareImageInsertion({ file: new File(["png"], "photo.png", { type: "image/png" }), notePath: "note.md", persistAttachment: async () => { throw new Error("disk error"); }, readDataUrl })).rejects.toThrow("disk error");
    expect(readDataUrl).not.toHaveBeenCalled();
  });

  it("rejects unsafe, empty and oversized images", () => {
    expect(() => validateNotesImageFile(new File(["svg"], "x.svg", { type: "image/svg+xml" }))).toThrow("请选择");
    expect(() => validateNotesImageFile(new File([], "x.png", { type: "image/png" }))).toThrow("为空");
    const large = new File(["png"], "x.png", { type: "image/png" });
    Object.defineProperty(large, "size", { value: NOTES_IMAGE_MAX_BYTES + 1 });
    expect(() => validateNotesImageFile(large)).toThrow("20 MB");
  });

  it("leaves non-image file drops to the editor", () => {
    expect(collectNotesImageFiles({ files: [new File(["text"], "note.txt", { type: "text/plain" })] as unknown as FileList, items: [] as unknown as DataTransferItemList })).toEqual([]);
  });

});
