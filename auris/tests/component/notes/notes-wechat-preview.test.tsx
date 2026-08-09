import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesWechatPreview } from "@/components/notes-v2/notes-wechat-preview";

afterEach(() => {
  Object.defineProperty(window, "shadowingDesktop", {
    configurable: true,
    value: undefined,
  });
  vi.unstubAllGlobals();
});

describe("NotesWechatPreview", () => {
  it("restarts a slow image copy with the latest rendered revision", async () => {
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(async () => undefined);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });

    const pendingFetch: { resolve?: (response: Response) => void } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            pendingFetch.resolve = resolve;
          }),
      ),
    );

    const { rerender } = render(
      <NotesWechatPreview
        markdown="旧正文\n\n![图](asset.png)"
        notePath="notes/article.md"
        resolveImageSource={() => "shadowing-media://vault/asset.png"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制到公众号" }));
    await waitFor(() => expect(pendingFetch.resolve).toBeTypeOf("function"));
    rerender(
      <NotesWechatPreview
        markdown="新正文"
        notePath="notes/article.md"
        resolveImageSource={() => null}
      />,
    );
    pendingFetch.resolve?.(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      }),
    );

    await waitFor(() => expect(writeHtml).toHaveBeenCalledTimes(1));
    expect(writeHtml.mock.calls[0][0]).toContain("新正文");
    expect(writeHtml.mock.calls[0][0]).not.toContain("旧正文");
    expect(screen.getByRole("status")).toHaveTextContent(
      "已复制，可直接粘贴到公众号后台",
    );
  });

  it("overwrites a stale slow transport with the latest rendered revision", async () => {
    const pendingWrite: { resolve?: () => void } = {};
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(() => {
      if (writeHtml.mock.calls.length === 1) {
        return new Promise<void>((resolve) => {
          pendingWrite.resolve = resolve;
        });
      }
      return Promise.resolve();
    });
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });
    const { rerender } = render(
      <NotesWechatPreview markdown="旧版本" notePath="notes/article.md" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制到公众号" }));
    await waitFor(() => expect(writeHtml).toHaveBeenCalledTimes(1));
    rerender(
      <NotesWechatPreview markdown="最新版本" notePath="notes/article.md" />,
    );
    const copyButton = screen.getByRole("button", { name: "正在复制…" });
    expect(copyButton).toBeDisabled();
    fireEvent.click(copyButton);
    expect(writeHtml).toHaveBeenCalledTimes(1);
    pendingWrite.resolve?.();

    await waitFor(() => expect(writeHtml).toHaveBeenCalledTimes(2));
    expect(writeHtml.mock.calls.at(-1)?.[0]).toContain("最新版本");
    expect(screen.getByRole("status")).toHaveTextContent(
      "已复制，可直接粘贴到公众号后台",
    );
  });

  it("keeps the newest clipboard write last across preview remounts", async () => {
    const pendingWrite: { resolve?: () => void } = {};
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(() => {
      if (writeHtml.mock.calls.length === 1) {
        return new Promise<void>((resolve) => {
          pendingWrite.resolve = resolve;
        });
      }
      return Promise.resolve();
    });
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });

    const first = render(
      <NotesWechatPreview markdown="笔记 A" notePath="notes/a.md" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "复制到公众号" }));
    await waitFor(() => expect(writeHtml).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<NotesWechatPreview markdown="笔记 B" notePath="notes/b.md" />);
    fireEvent.click(screen.getByRole("button", { name: "复制到公众号" }));
    expect(writeHtml).toHaveBeenCalledTimes(1);
    pendingWrite.resolve?.();

    await waitFor(() => expect(writeHtml).toHaveBeenCalledTimes(2));
    expect(writeHtml.mock.calls.at(-1)?.[0]).toContain("笔记 B");
    expect(screen.getByRole("status")).toHaveTextContent(
      "已复制，可直接粘贴到公众号后台",
    );
  });

  it("prevents preview links from navigating the Auris window", () => {
    render(
      <NotesWechatPreview
        markdown="[外部链接](https://example.com)"
        notePath="notes/article.md"
      />,
    );
    const link = screen.getByRole("link", { name: "外部链接" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    const allowed = link.dispatchEvent(event);

    expect(allowed).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });
});
