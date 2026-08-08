import type { z } from "zod";
import browserContract = require("../shared/browser-contract.cjs");

declare namespace browserEvidence {
  type BrowserEvidence = Readonly<{
    approvals?: readonly Readonly<{
      action: browserContract.BrowserToolAction;
      decision: "deny" | "allow_once";
      operation: browserContract.BrowserAuthorityOperation;
    }>[];
    citations?: readonly Readonly<{
      draftRange: Readonly<{ end: number; start: number }>;
      sourceId: string;
    }>[];
    excerpts?: readonly Readonly<{ sourceId: string; text: string }>[];
    refs?: readonly Readonly<{ generation: number; ref: string }>[];
    screenshots?: readonly Readonly<{ evidenceRef: string }>[];
    source: Readonly<{
      accessedAt: string;
      finalUrl: string;
      origin: string;
      title: string;
    }>;
    version: 1;
  }>;

  const APPROVAL_DECISIONS: readonly ["deny", "allow_once"];
  const BROWSER_EVIDENCE_LIMITS: Readonly<{
    approvals: number;
    citations: number;
    excerptText: number;
    excerpts: number;
    ref: number;
    refs: number;
    screenshots: number;
    sourceId: number;
    title: number;
    url: number;
  }>;
  const browserEvidenceSchema: z.ZodType<BrowserEvidence>;
  function normalizeBrowserEvidence(input: unknown): BrowserEvidence;
}

export = browserEvidence;
