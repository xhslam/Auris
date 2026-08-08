import browserEvidence from "../../../electron/browser/browser-evidence.cjs";

export const APPROVAL_DECISIONS = browserEvidence.APPROVAL_DECISIONS;
export const BROWSER_EVIDENCE_LIMITS = browserEvidence.BROWSER_EVIDENCE_LIMITS;
export const browserEvidenceSchema = browserEvidence.browserEvidenceSchema;
export const normalizeBrowserEvidence = browserEvidence.normalizeBrowserEvidence;

export type BrowserEvidence = ReturnType<typeof normalizeBrowserEvidence>;
