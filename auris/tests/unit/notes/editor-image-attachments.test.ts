import { describe, expect, it, vi } from "vitest";
import { prepareImageInsertion } from "@/features/notes/editor/editor-image-attachments";

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
});
