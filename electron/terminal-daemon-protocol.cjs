"use strict";

const PROTOCOL_VERSION = 1;
const MIN_COMPATIBLE_VERSION = 1;
const MAX_FRAME_BUFFER_LENGTH = 10 * 1024 * 1024; // 10MB safety limit

function isProtocolCompatible(clientVersion, clientMin, serverVersion, serverMin) {
  const cVer = Number(clientVersion);
  const cMin = Number(clientMin);
  const sVer = Number(serverVersion);
  const sMin = Number(serverMin);

  if (!Number.isFinite(cVer) || !Number.isFinite(cMin) || !Number.isFinite(sVer) || !Number.isFinite(sMin)) {
    return false;
  }

  // Client supports server version, and server supports client version
  return cVer >= sMin && sVer >= cMin;
}

function formatNdjson(message) {
  return JSON.stringify(message) + "\n";
}

function createNdjsonParser(onMessage, onError) {
  let buffer = "";

  function feed(chunk) {
    if (typeof chunk !== "string") {
      chunk = chunk.toString("utf8");
    }
    buffer += chunk;

    if (buffer.length > MAX_FRAME_BUFFER_LENGTH) {
      buffer = "";
      onError?.(new Error("NDJSON frame buffer exceeded maximum allowed size"));
      return;
    }

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line);
          onMessage(parsed);
        } catch (err) {
          onError?.(err, line);
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }

  function reset() {
    buffer = "";
  }

  return {
    feed,
    reset,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  MIN_COMPATIBLE_VERSION,
  isProtocolCompatible,
  formatNdjson,
  createNdjsonParser,
};
