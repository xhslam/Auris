import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  MEDIA_PROTOCOL_SCHEME,
  createVideoStreamResponse,
  createVideoVariantPlaybackUrl,
  parseVideoVariantPlaybackUrl,
} = require("../../../electron/video-media-protocol.cjs");

describe("video-media-protocol", () => {
  let tempDirectory: string | null = null;

  afterEach(async () => {
    if (tempDirectory) {
      await fs.rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = null;
    }
  });

  it("creates custom playback urls instead of raw file urls", () => {
    const playbackUrl = createVideoVariantPlaybackUrl("video-1", "video-1-source");

    expect(playbackUrl).toBe(
      `${MEDIA_PROTOCOL_SCHEME}://video/video-1/video-1-source`,
    );
    expect(parseVideoVariantPlaybackUrl(playbackUrl)).toEqual({
      variantId: "video-1-source",
      videoId: "video-1",
    });
  });

  it("serves ranged video responses for media seeking", async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shadowing-video-stream-"));
    const videoPath = path.join(tempDirectory, "sample.mp4");
    const payload = Buffer.from("0123456789");

    await fs.writeFile(videoPath, payload);

    const response = createVideoStreamResponse({
      filePath: videoPath,
      mimeType: "video/mp4",
      rangeHeader: "bytes=2-5",
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");

    const buffer = Buffer.from(await response.arrayBuffer());

    expect(buffer.toString("utf8")).toBe("2345");
  });
});
