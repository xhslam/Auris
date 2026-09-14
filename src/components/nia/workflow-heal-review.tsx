"use client";

import { useState } from "react";
import type { WorkflowHealProposal } from "@/features/workflows/workflow-self-heal";

export function WorkflowHealReview({ proposal, onAccept, onReject }: {
  proposal: WorkflowHealProposal;
  onAccept: (candidateIndex: number) => void;
  onReject: () => void;
}) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  return (
    <section aria-label="Review workflow self-heal" className="nia-apply-review">
      <h4>Review target repair</h4>
      <pre>{JSON.stringify(proposal.oldTarget, null, 2)}</pre>
      <label>
        Proposed target
        <select aria-label="Proposed target" onChange={(event) => setCandidateIndex(Number(event.target.value))} value={candidateIndex}>
          {proposal.candidates.map((candidate, index) => (
            <option key={JSON.stringify(candidate.target)} value={index}>{JSON.stringify(candidate.target)}</option>
          ))}
        </select>
      </label>
      <button onClick={() => onAccept(candidateIndex)} type="button">Accept and reauthorize</button>
      <button onClick={onReject} type="button">Reject repair</button>
    </section>
  );
}
