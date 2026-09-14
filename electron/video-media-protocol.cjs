"use strict";

const fsSync = require("node:fs");
const { Readable } = require("node:stream");

const MEDIA_PROTOCOL_SCHEME = "shadowing-media";

const IMAGE_MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function createVideoVariantPlaybackUrl(videoId, variantId) {
  return `${MEDIA_PROTOCOL_SCHEME}://video/${encodeURIComponent(videoId)}/${encodeURIComponent(variantId)}`;
}

function parseVideoVariantPlaybackUrl(requestUrl) {
  const parsed = new URL(requestUrl);

  if (parsed.protocol !== `${MEDIA_PROTOCOL_SCHEME}:` || parsed.host !== "video") {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  if (segments.length !== 2) {
    return null;
  }

  return {
    variantId: decodeURIComponent(segments[1]),
    videoId: decodeURIComponent(segments[0]),
  };
}

function parseVaultMediaUrl(requestUrl) {
  const parsed = new URL(requestUrl);

  if (parsed.protocol !== `${MEDIA_PROTOCOL_SCHEME}:` || parsed.host !== "vault") {
    return null;
  }

  const relativePath = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join("/");

  if (!relativePath) {
    return null;
  }

  return {
    relativePath,
  };
}

function getMediaMimeType(filePath) {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();

  return IMAGE_MIME_TYPES.get(extension) ?? "application/octet-stream";
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (typeof rangeHeader !== "string" || !rangeHeader.startsWith("bytes=")) {
    return null;
  }

  const [startToken, endToken] = rangeHeader.replace("bytes=", "").split("-");

  if (!startToken && !endToken) {
    return null;
  }

  let start;
  let end;

  if (!startToken) {
    const suffixLength = Number.parseInt(endToken, 10);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startToken, 10);
    end = endToken ? Number.parseInt(endToken, 10) : fileSize - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    end: Math.min(end, fileSize - 1),
    start,
  };
}

function createVideoStreamResponse({ filePath, mimeType, rangeHeader }) {
  const stats = fsSync.statSync(filePath);
  const headers = new Headers({
    "accept-ranges": "bytes",
    "content-type": mimeType || "application/octet-stream",
  });
  const range = parseRangeHeader(rangeHeader, stats.size);

  if (!rangeHeader || range) {
    if (range) {
      headers.set("content-length", String(range.end - range.start + 1));
      headers.set("content-range", `bytes ${range.start}-${range.end}/${stats.size}`);

      return new Response(
        Readable.toWeb(fsSync.createReadStream(filePath, { end: range.end, start: range.start })),
        {
          headers,
          status: 206,
        },
      );
    }

    headers.set("content-length", String(stats.size));

    return new Response(Readable.toWeb(fsSync.createReadStream(filePath)), {
      headers,
      status: 200,
    });
  }

  headers.set("content-range", `bytes */${stats.size}`);

  return new Response(null, {
    headers,
    status: 416,
  });
}

module.exports = {
  MEDIA_PROTOCOL_SCHEME,
  createVideoStreamResponse,
  getMediaMimeType,
  createVideoVariantPlaybackUrl,
  parseVaultMediaUrl,
  parseVideoVariantPlaybackUrl,
};
