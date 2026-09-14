import { describe, expect, it } from "vitest";

import {
  createBrowserCommandEnvelope,
  parseBrowserCommandEnvelope,
} from "../../../src/features/browser/contracts";
import {
  BROWSER_ERROR_MESSAGES_ZH,
  BROWSER_PUBLIC_ERROR_CODES,
  createBrowserPublicError,
  serializeBrowserError,
} from "../../../src/features/browser/errors";
import {
  browserActionRequestSchema,
  browserCommandEnvelopeSchema,
} from "../../../src/features/browser/schemas";
import {
  BROWSER_AMBIGUOUS_TARGET_CASES,
  BROWSER_APPROVAL_RETRY_CASES,
  BROWSER_COMMAND_REJECTION_CASES,
  BROWSER_COMMAND_REQUEST_CASES,
  BROWSER_ENVELOPE_EXPECTATIONS,
  BROWSER_EVIDENCE_BUNDLE_CASES,
  BROWSER_OPEN_ACQUIRE_CASES,
  freezeBrowserFixtures,
} from "../../contracts/browser-command-cases";
import {
  BROWSER_ERROR_CASES,
  BROWSER_ERROR_SECRET_REJECTIONS,
  freezeBrowserErrorFixtures,
} from "../../contracts/browser-error-cases";

freezeBrowserFixtures();
freezeBrowserErrorFixtures();

describe("compatibility command fixtures", () => {
  it("round-trips every request fixture through the strict schema", () => {
    for (const request of BROWSER_COMMAND_REQUEST_CASES) {
      expect(browserActionRequestSchema.parse(request)).toEqual(request);
      expect(() =>
        browserActionRequestSchema.parse({ ...request, unexpected: true }),
      ).toThrow();
    }
  });

  it("builds open/acquire and evidence envelopes without weaker authority", () => {
    for (const fixture of [
      ...BROWSER_OPEN_ACQUIRE_CASES,
      ...BROWSER_EVIDENCE_BUNDLE_CASES,
    ]) {
      const envelope = createBrowserCommandEnvelope(
        fixture.context,
        fixture.request,
      );
      expect(parseBrowserCommandEnvelope(envelope)).toEqual(envelope);
      expect(browserCommandEnvelopeSchema.parse(envelope)).toEqual(envelope);
    }

    for (const fixture of BROWSER_ENVELOPE_EXPECTATIONS) {
      const envelope = createBrowserCommandEnvelope(
        fixture.context,
        fixture.request,
      );
      expect(envelope.authorityOperation).toBe(fixture.authorityOperation);
      // Reject an authority that is never allowed for this action (not merely weaker).
      expect(() =>
        parseBrowserCommandEnvelope({
          ...envelope,
          authorityOperation: "upload",
        }),
      ).toThrow();
    }
  });

  it("keeps approval-retry and ambiguous-target fixtures schema-safe", () => {
    for (const fixture of [
      ...BROWSER_APPROVAL_RETRY_CASES,
      ...BROWSER_AMBIGUOUS_TARGET_CASES,
    ]) {
      const error = createBrowserPublicError(fixture.code, fixture.metadata);
      const serialized = serializeBrowserError(error);
      expect(serialized.code).toBe(fixture.code);
      expect(serialized.message).toBe(BROWSER_ERROR_MESSAGES_ZH[fixture.code]);
      expect(JSON.stringify(serialized)).not.toContain("lease_");
    }
  });

  it("rejects unknown/hostile command shapes", () => {
    for (const fixture of BROWSER_COMMAND_REJECTION_CASES) {
      expect(
        () => browserActionRequestSchema.parse(fixture.value),
        fixture.name,
      ).toThrow();
    }
  });

  it("exports deeply frozen fixtures (no shared mutable state)", () => {
    expect(Object.isFrozen(BROWSER_COMMAND_REQUEST_CASES)).toBe(true);
    expect(Object.isFrozen(BROWSER_COMMAND_REQUEST_CASES[0])).toBe(true);
    expect(() => {
      (BROWSER_COMMAND_REQUEST_CASES as BrowserActionRequestMutable[])[0] = {
        action: "close",
      };
    }).toThrow();
  });
});

type BrowserActionRequestMutable = { action: string };

describe("compatibility error fixtures", () => {
  it("covers every public error code exactly once", () => {
    const codes = BROWSER_ERROR_CASES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort()).toEqual([...BROWSER_PUBLIC_ERROR_CODES].sort());
  });

  it("round-trips every error fixture through serializeBrowserError", () => {
    for (const fixture of BROWSER_ERROR_CASES) {
      const error = createBrowserPublicError(fixture.code, fixture.metadata);
      const serialized = serializeBrowserError(error);
      expect(serialized.code).toBe(fixture.code);
      expect(serialized.message).toBe(BROWSER_ERROR_MESSAGES_ZH[fixture.code]);
      if (fixture.metadata) {
        expect(serialized.metadata).toEqual(fixture.metadata);
      } else {
        expect(serialized.metadata).toBeUndefined();
      }
      expect(serialized).not.toHaveProperty("stack");
      expect(serialized).not.toHaveProperty("cause");
      expect(Object.keys(serialized).every((key) =>
        key === "code" || key === "message" || key === "metadata"
      )).toBe(true);
    }
  });

  it("never serializes secret-bearing metadata keys", () => {
    for (const fixture of BROWSER_ERROR_SECRET_REJECTIONS) {
      const serialized = serializeBrowserError(
        createBrowserPublicError(fixture.code, fixture.metadata),
      );
      const json = JSON.stringify(serialized);
      expect(json).not.toContain("lease_should_not_leak");
      expect(json).not.toContain("hunter2");
      expect(json).not.toContain("password");
    }
  });
});

describe("fixture immutability across repeated runs", () => {
  it.each([1, 2])("run %s keeps frozen exports intact", () => {
    freezeBrowserFixtures();
    freezeBrowserErrorFixtures();
    expect(BROWSER_COMMAND_REQUEST_CASES).toHaveLength(23);
    expect(BROWSER_ERROR_CASES).toHaveLength(BROWSER_PUBLIC_ERROR_CODES.length);
    expect(Object.isFrozen(BROWSER_ERROR_CASES[0])).toBe(true);
  });

  it("shuffled double pass round-trips without shared mutable state", () => {
    const shuffle = <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
      }
      return copy;
    };

    const pass = () => {
      for (const request of shuffle(BROWSER_COMMAND_REQUEST_CASES)) {
        expect(browserActionRequestSchema.parse(request)).toEqual(request);
      }
      for (const fixture of shuffle([
        ...BROWSER_OPEN_ACQUIRE_CASES,
        ...BROWSER_EVIDENCE_BUNDLE_CASES,
      ])) {
        const envelope = createBrowserCommandEnvelope(
          fixture.context,
          fixture.request,
        );
        expect(parseBrowserCommandEnvelope(envelope)).toEqual(envelope);
      }
      for (const fixture of shuffle(BROWSER_ERROR_CASES)) {
        const serialized = serializeBrowserError(
          createBrowserPublicError(fixture.code, fixture.metadata),
        );
        expect(serialized.code).toBe(fixture.code);
        expect(serialized.message).toBe(BROWSER_ERROR_MESSAGES_ZH[fixture.code]);
      }
    };

    pass();
    pass();
    expect(Object.isFrozen(BROWSER_COMMAND_REQUEST_CASES[0])).toBe(true);
    expect(Object.isFrozen(BROWSER_ERROR_CASES[0])).toBe(true);
  });
});
