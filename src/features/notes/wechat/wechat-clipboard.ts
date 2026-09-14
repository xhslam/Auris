export type WechatClipboardTransport = "desktop" | "web" | "legacy";

export type WechatClipboardResult = {
  html: string;
  text: string;
  transport: WechatClipboardTransport;
};

export type WechatClipboardOptions = {
  isCurrent?: () => boolean;
};

export class WechatClipboardRevisionChangedError extends Error {
  constructor() {
    super("预览内容已变化，正在复制最新版本");
    this.name = "WechatClipboardRevisionChangedError";
  }
}

const LOCAL_IMAGE_PROTOCOL = /^(?:app|blob|file|shadowing-media):/iu;
const DATA_IMAGE_PROTOCOL = /^data:/iu;
const SAFE_INLINE_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_LOCAL_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_LOCAL_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_RICH_HTML_BYTES = 36 * 1024 * 1024;
const MAX_PLAIN_TEXT_BYTES = 4 * 1024 * 1024;
const LOCAL_IMAGE_TIMEOUT_MS = 15_000;
const LOCAL_IMAGE_LIMIT_MESSAGE = "本地图片超过 12 MB，请压缩后再复制";
const TOTAL_IMAGE_LIMIT_MESSAGE = "本地图片总量超过 24 MB，请分批或压缩后再复制";
const UNSUPPORTED_IMAGE_MESSAGE = "仅支持 PNG、JPEG、GIF 或 WebP 图片";
let clipboardOperationQueue: Promise<void> = Promise.resolve();

function enqueueClipboardOperation<T>(operation: () => Promise<T>) {
  const result = clipboardOperationQueue.then(operation, operation);
  clipboardOperationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function normalizeImageMimeType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function requireSafeImageMimeType(value: string) {
  const mimeType = normalizeImageMimeType(value);
  if (!SAFE_INLINE_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(UNSUPPORTED_IMAGE_MESSAGE);
  }
  return mimeType;
}

function estimateBase64DataImageBytes(source: string) {
  const commaIndex = source.indexOf(",");
  if (commaIndex === -1) {
    throw new Error(UNSUPPORTED_IMAGE_MESSAGE);
  }

  const metadata = source.slice(5, commaIndex);
  const metadataParts = metadata.split(";");
  const mimeType = requireSafeImageMimeType(metadataParts[0] ?? "");
  if (!metadataParts.some((part) => part.toLowerCase() === "base64")) {
    throw new Error(UNSUPPORTED_IMAGE_MESSAGE);
  }

  const payloadLength = source.length - commaIndex - 1;
  return {
    bytes: Math.ceil((payloadLength * 3) / 4),
    mimeType,
  };
}

function preflightInlineDataImages(root: HTMLElement) {
  let totalBytes = 0;

  for (const image of root.querySelectorAll("img")) {
    const source = image.getAttribute("src")?.trim() ?? "";
    if (!DATA_IMAGE_PROTOCOL.test(source)) continue;

    const { bytes } = estimateBase64DataImageBytes(source);
    if (bytes > MAX_LOCAL_IMAGE_BYTES) {
      throw new Error(LOCAL_IMAGE_LIMIT_MESSAGE);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_LOCAL_IMAGE_BYTES) {
      throw new Error(TOTAL_IMAGE_LIMIT_MESSAGE);
    }
  }

  return totalBytes;
}

async function blobToDataUrl(blob: Blob, mimeType: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

async function readImageBlobWithinLimit(
  response: Response,
  maxBytes: number,
  limitMessage: string,
) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(limitMessage);
  }

  if (response.body) {
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(limitMessage);
      }
      chunks.push(value);
    }

    return new Blob(chunks, {
      type: response.headers.get("content-type") || "application/octet-stream",
    });
  }

  const blob = await response.blob();
  if (blob.size > maxBytes) {
    throw new Error(limitMessage);
  }
  return blob;
}

async function inlineLocalImage(
  image: HTMLImageElement,
  remainingTotalBytes: number,
) {
  const source = image.getAttribute("src")?.trim() ?? "";

  if (!source || DATA_IMAGE_PROTOCOL.test(source) || !LOCAL_IMAGE_PROTOCOL.test(source)) {
    return 0;
  }

  const maxBytes = Math.min(MAX_LOCAL_IMAGE_BYTES, remainingTotalBytes);
  const limitMessage =
    remainingTotalBytes < MAX_LOCAL_IMAGE_BYTES
      ? TOTAL_IMAGE_LIMIT_MESSAGE
      : LOCAL_IMAGE_LIMIT_MESSAGE;

  const abortController = new AbortController();
  const timeout = window.setTimeout(
    () => abortController.abort(),
    LOCAL_IMAGE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(source, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`无法读取本地图片（${response.status}）`);
    }

    const blob = await readImageBlobWithinLimit(
      response,
      maxBytes,
      limitMessage,
    );
    const mimeType = requireSafeImageMimeType(blob.type);

    image.setAttribute("src", await blobToDataUrl(blob, mimeType));
    image.removeAttribute("data-src");
    return blob.size;
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error("本地图片读取超时，请重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function inlineLocalImages(root: HTMLElement, initialTotalBytes: number) {
  const images = Array.from(root.querySelectorAll("img"));
  let totalBytes = initialTotalBytes;

  // Sequential conversion keeps the peak memory bounded: each Data URL already
  // holds roughly 4/3 of the original bytes before the HTML crosses IPC.
  for (const image of images) {
    const remainingTotalBytes = MAX_TOTAL_LOCAL_IMAGE_BYTES - totalBytes;
    totalBytes += await inlineLocalImage(image, remainingTotalBytes);
  }
}

function getPlainText(root: HTMLElement) {
  return (root.innerText || root.textContent || "").trim();
}

function getUtf8ByteLength(value: string) {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800
      && codeUnit <= 0xdbff
      && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00
      && value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

function assertCurrent(options: WechatClipboardOptions) {
  if (options.isCurrent && !options.isCurrent()) {
    throw new WechatClipboardRevisionChangedError();
  }
}

async function writeWithDesktopBridge(html: string, text: string) {
  const writeHtml = window.shadowingDesktop?.clipboard?.writeHtml;
  if (typeof writeHtml !== "function") {
    return false;
  }

  await writeHtml(html, text);
  return true;
}

async function writeWithWebClipboard(html: string, text: string) {
  if (
    typeof ClipboardItem === "undefined" ||
    typeof navigator === "undefined" ||
    typeof navigator.clipboard?.write !== "function"
  ) {
    return false;
  }

  const item = new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([text], { type: "text/plain" }),
  });
  await navigator.clipboard.write([item]);
  return true;
}

function writeWithLegacySelection(root: HTMLElement) {
  if (typeof document.execCommand !== "function") {
    return false;
  }

  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.inset = "0 auto auto -100000px";
  host.append(root.cloneNode(true));
  document.body.append(host);

  const selection = window.getSelection();
  const previousRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : [];
  const range = document.createRange();
  range.selectNodeContents(host);
  selection?.removeAllRanges();
  selection?.addRange(range);

  try {
    return document.execCommand("copy");
  } finally {
    selection?.removeAllRanges();
    previousRanges.forEach((previousRange) => selection?.addRange(previousRange));
    host.remove();
  }
}

async function copyWechatHtmlToClipboardNow(
  previewContent: HTMLElement,
  options: WechatClipboardOptions,
): Promise<WechatClipboardResult> {
  const existingInlineImageBytes = preflightInlineDataImages(previewContent);
  const copy = previewContent.cloneNode(true) as HTMLElement;
  await inlineLocalImages(copy, existingInlineImageBytes);
  assertCurrent(options);

  const html = copy.outerHTML;
  const text = getPlainText(copy);
  if (getUtf8ByteLength(html) > MAX_RICH_HTML_BYTES) {
    throw new Error("复制内容超过 36 MB，请压缩图片或拆分文章");
  }
  if (getUtf8ByteLength(text) > MAX_PLAIN_TEXT_BYTES) {
    throw new Error("文章纯文本超过 4 MB，请拆分后再复制");
  }

  const transportErrors: unknown[] = [];

  try {
    assertCurrent(options);
    if (await writeWithDesktopBridge(html, text)) {
      assertCurrent(options);
      return { html, text, transport: "desktop" };
    }
  } catch (error) {
    if (error instanceof WechatClipboardRevisionChangedError) {
      throw error;
    }
    transportErrors.push(error);
  }

  try {
    assertCurrent(options);
    if (await writeWithWebClipboard(html, text)) {
      assertCurrent(options);
      return { html, text, transport: "web" };
    }
  } catch (error) {
    if (error instanceof WechatClipboardRevisionChangedError) {
      throw error;
    }
    transportErrors.push(error);
  }

  assertCurrent(options);
  if (writeWithLegacySelection(copy)) {
    return { html, text, transport: "legacy" };
  }

  const finalError = transportErrors.at(-1);
  if (finalError instanceof Error) {
    throw finalError;
  }
  throw new Error("当前环境无法写入富文本剪贴板");
}

export function copyWechatHtmlToClipboard(
  previewContent: HTMLElement,
  options: WechatClipboardOptions = {},
): Promise<WechatClipboardResult> {
  return enqueueClipboardOperation(() =>
    copyWechatHtmlToClipboardNow(previewContent, options),
  );
}
