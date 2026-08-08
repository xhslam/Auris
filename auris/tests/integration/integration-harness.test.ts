import { describe, expect, it } from "vitest";

import {
  createBrowserCommandEnvelope,
  parseBrowserCommandEnvelope,
} from "../../src/features/browser/contracts";
import {
  BROWSER_ERROR_MESSAGES_ZH,
  createBrowserPublicError,
  serializeBrowserError,
} from "../../src/features/browser/errors";
import { browserActionRequestSchema } from "../../src/features/browser/schemas";
import {
  BROWSER_COMMAND_REQUEST_CASES,
  BROWSER_EVIDENCE_BUNDLE_CASES,
  BROWSER_OPEN_ACQUIRE_CASES,
} from "../contracts/browser-command-cases";
import { BROWSER_ERROR_CASES } from "../contracts/browser-error-cases";

describe("browser compatibility integration harness", () => {
  it("imports shared command fixtures in a Node environment", () => {
    expect(BROWSER_COMMAND_REQUEST_CASES.length).toBeGreaterThan(0);
    for (const request of BROWSER_COMMAND_REQUEST_CASES) {
      expect(browserActionRequestSchema.parse(request)).toEqual(request);
    }
  });

  it("round-trips open/acquire and evidence envelopes from shared fixtures", () => {
    for (const fixture of [
      ...BROWSER_OPEN_ACQUIRE_CASES,
      ...BROWSER_EVIDENCE_BUNDLE_CASES,
    ]) {
      const envelope = createBrowserCommandEnvelope(
        fixture.context,
        fixture.request,
      );
      expect(parseBrowserCommandEnvelope(envelope)).toEqual(envelope);
    }
  });

  it("imports shared error fixtures without leaking internals", () => {
    for (const fixture of BROWSER_ERROR_CASES) {
      const serialized = serializeBrowserError(
        createBrowserPublicError(fixture.code, fixture.metadata),
      );
      expect(serialized.message).toBe(BROWSER_ERROR_MESSAGES_ZH[fixture.code]);
      expect(serialized).not.toHaveProperty("stack");
    }
  });
});
