import { redactWorkflowValue } from "@/features/workflows/workflow-redaction";

export type WorkflowHealCandidate = Readonly<{
  target: Readonly<{ kind: "selector" | "ref"; selector?: string; ref?: string }>;
  confidence: number;
  evidence?: unknown;
}>;

export type WorkflowHealProposal = Readonly<{
  proposalId: string;
  stepIndex: number;
  oldTarget: unknown;
  candidates: readonly WorkflowHealCandidate[];
  status: "pending" | "accepted" | "rejected";
}>;

export function createWorkflowSelfHeal({ maxCandidates = 3, maxAttempts = 2 } = {}) {
  const proposals = new Map<string, WorkflowHealProposal>();
  const attempts = new Map<number, number>();

  function propose(input: { stepIndex: number; oldTarget: unknown; candidates: readonly WorkflowHealCandidate[] }) {
    const count = attempts.get(input.stepIndex) ?? 0;
    if (count >= maxAttempts) throw new RangeError("Self-heal attempt limit reached.");
    const candidates = input.candidates.slice(0, maxCandidates).map((candidate) => Object.freeze({
      target: Object.freeze({ ...candidate.target }),
      confidence: Math.max(0, Math.min(1, candidate.confidence)),
      evidence: redactWorkflowValue(candidate.evidence),
    }));
    if (candidates.length === 0) throw new TypeError("Self-heal needs a bounded candidate.");
    const proposalId = `heal-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${count}`}`;
    const proposal = Object.freeze({
      proposalId,
      stepIndex: input.stepIndex,
      oldTarget: redactWorkflowValue(input.oldTarget),
      candidates: Object.freeze(candidates),
      status: "pending" as const,
    });
    proposals.set(proposalId, proposal);
    attempts.set(input.stepIndex, count + 1);
    return proposal;
  }

  async function accept(input: {
    proposalId: string;
    candidateIndex: number;
    authorizeFresh: (target: WorkflowHealCandidate["target"]) => Promise<boolean>;
    recompile: (target: WorkflowHealCandidate["target"]) => Promise<unknown>;
  }) {
    const proposal = proposals.get(input.proposalId);
    if (!proposal || proposal.status !== "pending") throw new TypeError("Self-heal proposal is stale.");
    const candidate = proposal.candidates[input.candidateIndex];
    if (!candidate) throw new TypeError("Self-heal candidate is invalid.");
    const compiled = await input.recompile(candidate.target);
    if (await input.authorizeFresh(candidate.target) !== true) throw new Error("Fresh authorization was denied.");
    const accepted = Object.freeze({ ...proposal, status: "accepted" as const });
    proposals.set(input.proposalId, accepted);
    return Object.freeze({ proposal: accepted, compiled, target: candidate.target });
  }

  function reject(proposalId: string) {
    const proposal = proposals.get(proposalId);
    if (!proposal || proposal.status !== "pending") return false;
    proposals.set(proposalId, Object.freeze({ ...proposal, status: "rejected" as const }));
    return true;
  }

  return Object.freeze({ accept, propose, reject });
}
