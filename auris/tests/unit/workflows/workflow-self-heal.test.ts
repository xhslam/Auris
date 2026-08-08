import { describe, expect, it, vi } from "vitest";
import { createWorkflowSelfHeal } from "@/features/workflows/workflow-self-heal";

describe("workflow self-heal", () => {
  it("proposes a bounded redacted diff and changes nothing until accept + fresh authorization", async () => {
    const heal = createWorkflowSelfHeal({ maxCandidates: 2, maxAttempts: 1 });
    const proposal = heal.propose({
      stepIndex: 2,
      oldTarget: { kind: "selector", selector: "#old" },
      candidates: [
        { target: { kind: "selector", selector: "#new" }, confidence: 0.9, evidence: { token: "secret" } },
        { target: { kind: "selector", selector: "#other" }, confidence: 0.7 },
        { target: { kind: "selector", selector: "#ignored" }, confidence: 0.2 },
      ],
    });
    expect(proposal.candidates).toHaveLength(2);
    expect(JSON.stringify(proposal)).not.toContain("secret");
    const recompile = vi.fn(async (target) => ({ target }));
    const authorizeFresh = vi.fn(async () => true);
    const result = await heal.accept({ proposalId: proposal.proposalId, candidateIndex: 0, recompile, authorizeFresh });
    expect(result.proposal.status).toBe("accepted");
    expect(recompile).toHaveBeenCalledBefore(authorizeFresh);
    await expect(heal.accept({ proposalId: proposal.proposalId, candidateIndex: 0, recompile, authorizeFresh })).rejects.toThrow(/stale/u);
  });

  it("supports rejection and caps attempts", () => {
    const heal = createWorkflowSelfHeal({ maxAttempts: 1 });
    const proposal = heal.propose({ stepIndex: 1, oldTarget: {}, candidates: [{ target: { kind: "ref", ref: "r1" }, confidence: 1 }] });
    expect(heal.reject(proposal.proposalId)).toBe(true);
    expect(() => heal.propose({ stepIndex: 1, oldTarget: {}, candidates: [{ target: { kind: "ref", ref: "r2" }, confidence: 1 }] })).toThrow(/limit/u);
  });
});
