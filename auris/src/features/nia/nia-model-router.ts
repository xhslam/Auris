import type { NiaContext } from "@/features/nia/nia-context";

export type NiaRoutingPreference = "auto" | "prefer_cli";
export type NiaTaskClass = "conversation" | "writing" | "research" | "browser" | "workflow" | "local" | "voice";
export type NiaRoutableProvider = Readonly<{ id: string; enabled: boolean; kind: "rest" | "cli"; defaultModel: string; supportedModels: readonly string[] }>;
export type NiaModelRoute = Readonly<{
  fallback: string | null;
  model: string | null;
  providerId: string | null;
  providerKind: "rest" | "cli" | "live" | null;
  reason: string;
  taskClass: NiaTaskClass;
}>;

export function inferNiaTaskClass(prompt: string, context: NiaContext | null): NiaTaskClass {
  const normalized = prompt.toLocaleLowerCase();
  if (/\b(live|voice|speak|realtime)\b|语音|实时对话/.test(normalized)) return "voice";
  if (/\b(local|offline|private)\b|本地|离线|隐私/.test(normalized)) return "local";
  if (context?.kind === "browser_reference" || /网页|页面|browser|website/.test(normalized)) return "browser";
  if (context?.kind === "workflow_step" || /工作流|workflow/.test(normalized)) return "workflow";
  if (/总结|改写|润色|写作|大纲|translate|rewrite|summari[sz]e|outline|draft/.test(normalized)) return "writing";
  if (/研究|分析|比较|research|analy[sz]e|compare/.test(normalized)) return "research";
  return "conversation";
}

function routeProvider(candidates: readonly NiaRoutableProvider[], preferredProviderId: string | null, kind: "rest" | "cli") {
  const compatible = candidates.filter((provider) => provider.enabled && provider.kind === kind);
  return compatible.find((provider) => provider.id === preferredProviderId) ?? compatible[0] ?? null;
}

export function routeNiaTextRequest(input: { context: NiaContext | null; preference?: NiaRoutingPreference; preferredProviderId: string | null; prompt: string; providers: readonly NiaRoutableProvider[] }): NiaModelRoute {
  const taskClass = inferNiaTaskClass(input.prompt, input.context);
  if (taskClass === "voice") return Object.freeze({ taskClass, providerKind: "live", providerId: null, model: "gpt-realtime-2.1", reason: "Live voice is handled by the dedicated WebRTC session.", fallback: "Use configured text providers if Live is unavailable." });
  const preferCli = input.preference === "prefer_cli" || taskClass === "local";
  const primary = routeProvider(input.providers, input.preferredProviderId, preferCli ? "cli" : "rest");
  const secondary = routeProvider(input.providers, input.preferredProviderId, preferCli ? "rest" : "cli");
  const selected = primary ?? secondary;
  if (!selected) return Object.freeze({ taskClass, providerKind: null, providerId: null, model: null, reason: "No enabled text provider is configured.", fallback: "Configure a REST or CLI provider in Nia settings." });
  const usedFallback = !primary;
  return Object.freeze({
    taskClass,
    providerKind: selected.kind,
    providerId: selected.id,
    model: selected.defaultModel,
    reason: selected.kind === "cli" ? "CLI/local route selected for an explicit local preference or available fallback." : "REST text route selected for the requested task.",
    fallback: usedFallback ? (preferCli ? "No CLI provider was enabled; Nia fell back to a REST provider." : "No REST provider was enabled; Nia fell back to a CLI provider.") : null,
  });
}
