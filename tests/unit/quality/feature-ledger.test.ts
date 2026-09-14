import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { validateFeatureLedger, verifyFeatureLedger } = require("../../../scripts/verify-feature-ledger.cjs");

describe("feature evidence ledger", () => {
  it("validates the checked-in core capability ledger", () => {
    const ledger = verifyFeatureLedger();
    expect(ledger.domains.map((domain: { domainId: string }) => domain.domainId)).toEqual(
      expect.arrayContaining(["notes", "mcp", "nia", "browser", "updates"]),
    );
  });

  it("rejects a feature whose evidence path is absent", () => {
    const errors = validateFeatureLedger(
      {
        schemaVersion: 1,
        domains: [
          {
            domainId: "updates",
            problem: "Keep updates recoverable.",
            features: [
              {
                featureId: "missing-evidence",
                problem: "Detect a stale evidence reference.",
                implementation: ["electron/not-present.cjs"],
                tests: ["tests/unit/not-present.test.ts"],
              },
            ],
          },
        ],
      },
      process.cwd(),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "feature missing-evidence implementation path does not exist: electron/not-present.cjs",
        "feature missing-evidence tests path does not exist: tests/unit/not-present.test.ts",
      ]),
    );
  });
});
