import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const {
  isProtocolCompatible,
  formatNdjson,
  createNdjsonParser,
} = require("../../../electron/terminal-daemon-protocol.cjs");

describe("terminal-daemon-protocol", () => {
  it("formats messages as single-line JSON followed by newline", () => {
    const msg = { type: "hello", version: 1 };
    const formatted = formatNdjson(msg);
    expect(formatted).toBe('{"type":"hello","version":1}\n');
  });

  it("parses multiple messages arriving in a single chunk", () => {
    const received: unknown[] = [];
    const parser = createNdjsonParser((msg: unknown) => received.push(msg));

    parser.feed('{"id":1}\n{"id":2}\n');
    expect(received).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("buffers partial lines across multiple chunks", () => {
    const received: unknown[] = [];
    const parser = createNdjsonParser((msg: unknown) => received.push(msg));

    parser.feed('{"id":1, "name":');
    expect(received).toHaveLength(0);

    parser.feed('"session-1"}\n{"id":2}\n');
    expect(received).toEqual([
      { id: 1, name: "session-1" },
      { id: 2 },
    ]);
  });

  it("handles blank lines and whitespace gracefully", () => {
    const received: unknown[] = [];
    const parser = createNdjsonParser((msg: unknown) => received.push(msg));

    parser.feed('\n  \n{"id":10}\n\n');
    expect(received).toEqual([{ id: 10 }]);
  });

  it("reports error on malformed JSON line but continues processing next line", () => {
    const received: unknown[] = [];
    const errors: Error[] = [];
    const parser = createNdjsonParser(
      (msg: unknown) => received.push(msg),
      (err: Error) => errors.push(err)
    );

    parser.feed('{"id":1}\n{not-json}\n{"id":2}\n');
    expect(received).toEqual([{ id: 1 }, { id: 2 }]);
    expect(errors).toHaveLength(1);
  });

  describe("isProtocolCompatible", () => {
    it("returns true when client and server versions match", () => {
      expect(isProtocolCompatible(1, 1, 1, 1)).toBe(true);
    });

    it("returns true when server supports older client", () => {
      // Client v1 (min 1), Server v2 (min 1)
      expect(isProtocolCompatible(1, 1, 2, 1)).toBe(true);
    });

    it("returns false when client requires higher min than server provides", () => {
      // Client requires at least v2, Server is v1
      expect(isProtocolCompatible(2, 2, 1, 1)).toBe(false);
    });

    it("returns false when server requires higher min than client provides", () => {
      // Server requires at least v2, Client is v1
      expect(isProtocolCompatible(1, 1, 2, 2)).toBe(false);
    });

    it("returns false for invalid inputs", () => {
      expect(isProtocolCompatible(null, 1, 1, 1)).toBe(false);
      expect(isProtocolCompatible(1, undefined, 1, 1)).toBe(false);
      expect(isProtocolCompatible("abc", 1, 1, 1)).toBe(false);
    });
  });
});
