import { afterEach, describe, expect, it, vi } from "vitest";
import { copyWechatHtmlToClipboard } from "@/features/notes/wechat/wechat-clipboard";

afterEach(() => {
  Object.defineProperty(window, "shadowingDesktop", {
    configurable: true,
    value: undefined,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("copyWechatHtmlToClipboard", () => {
  it("prefers the native rich clipboard so HTML and plain text are written together", async () => {
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(async () => undefined);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });
    const article = document.createElement("section");
    article.dataset.aurisWechatContent = "true";
    article.style.color = "rgb(62, 62, 62)";
    article.innerHTML = '<h1 style="font-weight:700">标题</h1><p style="margin:0">正文</p>';

    const result = await copyWechatHtmlToClipboard(article);

    expect(result.transport).toBe("desktop");
    expect(writeHtml).toHaveBeenCalledTimes(1);
    const [html, text] = writeHtml.mock.calls[0];
    expect(html).toContain('data-auris-wechat-content="true"');
    expect(html).toContain('style="color: rgb(62, 62, 62);"');
    expect(text).toContain("标题正文");
  });

  it("rejects oversized local images before sending HTML across IPC", async () => {
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(async () => undefined);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });
    const cancel = vi.fn(async () => undefined);
    const chunks = [
      new Uint8Array(7 * 1024 * 1024),
      new Uint8Array(6 * 1024 * 1024),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        body: {
          getReader: () => ({
            cancel,
            read: vi.fn(async () => {
              const value = chunks.shift();
              return value ? { done: false, value } : { done: true, value: undefined };
            }),
          }),
        },
        headers: new Headers({ "content-type": "image/png" }),
        ok: true,
        status: 200,
      }) as unknown as Response),
    );
    const article = document.createElement("section");
    article.innerHTML = '<img alt="large" src="shadowing-media://vault/assets/large.png">';

    await expect(copyWechatHtmlToClipboard(article)).rejects.toThrow(
      "本地图片超过 12 MB",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(writeHtml).not.toHaveBeenCalled();
  });

  it("rejects oversized inline data images before cloning the preview", async () => {
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(async () => undefined);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });
    const article = document.createElement("section");
    const image = document.createElement("img");
    image.setAttribute(
      "src",
      `data:image/png;base64,${"A".repeat(16 * 1024 * 1024 + 4)}`,
    );
    article.append(image);
    const cloneNode = vi.spyOn(article, "cloneNode");

    await expect(copyWechatHtmlToClipboard(article)).rejects.toThrow(
      "本地图片超过 12 MB",
    );
    expect(cloneNode).not.toHaveBeenCalled();
    expect(writeHtml).not.toHaveBeenCalled();
  });

  it("rejects active local image formats before writing rich HTML", async () => {
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(async () => undefined);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<svg></svg>", {
        headers: { "content-type": "image/svg+xml" },
      })),
    );
    const article = document.createElement("section");
    article.innerHTML = '<img alt="svg" src="shadowing-media://vault/assets/vector.svg">';

    await expect(copyWechatHtmlToClipboard(article)).rejects.toThrow(
      "仅支持 PNG、JPEG、GIF 或 WebP 图片",
    );
    expect(writeHtml).not.toHaveBeenCalled();
  });

  it("inlines local preview images before writing rich HTML", async () => {
    const writeHtml = vi.fn<
      (html: string, text: string) => Promise<void>
    >(async () => undefined);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { clipboard: { writeHtml, writeText: vi.fn() } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      })),
    );
    const article = document.createElement("section");
    article.innerHTML = '<img alt="local" src="shadowing-media://vault/assets/hero.png">';

    await copyWechatHtmlToClipboard(article);

    const [html] = writeHtml.mock.calls[0];
    expect(html).toContain('src="data:image/png;base64,AQID"');
  });
});
