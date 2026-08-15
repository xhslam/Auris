import type { NiaContextCard, NiaContextCardKind } from "@/features/nia/nia-context-card";

export type NiaToolRiskLevel = "low" | "medium" | "high";
export type NiaToolApproval = "none" | "per-action";
export type NiaToolDescriptor = Readonly<{
  approval: NiaToolApproval;
  contextKinds: readonly NiaContextCardKind[];
  description: string;
  id: string;
  label: string;
  risk: NiaToolRiskLevel;
}>;
export type NiaToolAvailability = NiaToolDescriptor & Readonly<{
  available: boolean;
  reason: string | null;
}>;

const TOOL_REGISTRY: readonly NiaToolDescriptor[] = Object.freeze([
  { id: "notes.read", label: "Read note", description: "Inspect the explicitly attached note only.", risk: "low", approval: "none", contextKinds: ["note"] },
  { id: "notes.propose-edit", label: "Propose note edit", description: "Prepare a revision; the existing path, revision and selection checks remain mandatory.", risk: "high", approval: "per-action", contextKinds: ["note"] },
  { id: "browser.inspect", label: "Inspect page", description: "Read the explicitly attached browser page through the existing browser authority.", risk: "low", approval: "none", contextKinds: ["browser"] },
  { id: "browser.control", label: "Control browser", description: "Request a browser operation; control lease and per-operation approval remain enforced by the browser runtime.", risk: "high", approval: "per-action", contextKinds: ["browser"] },
  { id: "reading.inspect", label: "Inspect reading material", description: "Reason over the supplied reading excerpt and location.", risk: "low", approval: "none", contextKinds: ["reading"] },
  { id: "video.inspect", label: "Inspect video reference", description: "Reason over the supplied transcript excerpt and playback location.", risk: "low", approval: "none", contextKinds: ["video"] },
  { id: "workflow.review", label: "Review workflow result", description: "Inspect an attached workflow step result without rerunning it.", risk: "medium", approval: "none", contextKinds: ["workflow"] },
  { id: "workflow.run", label: "Run workflow", description: "Request a workflow execution through the existing trusted workflow runtime.", risk: "high", approval: "per-action", contextKinds: ["workflow", "note", "browser", "reading", "video"] },
]);

export function listNiaRegisteredTools() {
  return TOOL_REGISTRY;
}

export function getNiaToolAvailability(card: NiaContextCard | null, toolId: string): NiaToolAvailability {
  const tool = TOOL_REGISTRY.find((candidate) => candidate.id === toolId);
  if (!tool) throw new TypeError(`Unknown Nia tool: ${toolId}`);
  const available = Boolean(card && tool.contextKinds.includes(card.kind));
  return Object.freeze({
    ...tool,
    available,
    reason: available ? null : card ? `This tool requires ${tool.contextKinds.join(" or ")} context.` : "Attach a context card first.",
  });
}

export function listNiaToolsForContext(card: NiaContextCard | null) {
  return Object.freeze(TOOL_REGISTRY.map((tool) => getNiaToolAvailability(card, tool.id)));
}

export function requiresNiaToolApproval(toolId: string) {
  return getNiaToolAvailability(null, toolId).approval === "per-action";
}
