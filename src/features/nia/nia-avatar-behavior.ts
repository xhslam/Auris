export const NIA_EXPRESSIONS = { neutral: "自然", happy: "开心", shy: "害羞", sad: "难过", angry: "生气", surprised: "惊讶", thinking: "思考", sleepy: "困倦" } as const;
export const NIA_MOTIONS = { nod: "点头", hop: "轻跳", turn: "转头", sway: "轻摆", swing: "摇晃", wander: "游移" } as const;
export type NiaExpression = keyof typeof NIA_EXPRESSIONS;
export type NiaMotion = keyof typeof NIA_MOTIONS;
export type NiaAvatarCue = { expression?: NiaExpression; motion?: NiaMotion; intensity: number; expiresAt: number };
export const NIA_AVATAR_CUE_KEY = "auris.nia.avatar-cue";
export const NIA_AVATAR_CUE_EVENT = "auris:nia-avatar-cue";

export function parseNiaAvatarCue(value: unknown, now = Date.now()): NiaAvatarCue | null {
  if (!value || typeof value !== "object") return null;
  const cue = value as Record<string, unknown>;
  const owns = (table: object, key: unknown) => typeof key === "string" && Object.hasOwn(table, key);
  if (cue.expression !== undefined && !owns(NIA_EXPRESSIONS, cue.expression)) return null;
  if (cue.motion !== undefined && !owns(NIA_MOTIONS, cue.motion)) return null;
  if (cue.expression === undefined && cue.motion === undefined) return null;
  if (typeof cue.expiresAt !== "number" || !Number.isFinite(cue.expiresAt) || cue.expiresAt <= now || cue.expiresAt > now + 10_000) return null;
  if (typeof cue.intensity !== "number" || !Number.isFinite(cue.intensity)) return null;
  return { expression: cue.expression as NiaExpression | undefined, motion: cue.motion as NiaMotion | undefined, intensity: Math.max(0, Math.min(1, cue.intensity)), expiresAt: cue.expiresAt };
}

export function sendNiaAvatarCue(cue: { expression?: NiaExpression; motion?: NiaMotion; intensity?: number }): void {
  const value = { ...cue, intensity: cue.intensity ?? 1, expiresAt: Date.now() + 5_000 };
  if (!parseNiaAvatarCue(value)) return;
  try { window.localStorage.setItem(NIA_AVATAR_CUE_KEY, JSON.stringify(value)); } catch { /* Current window still receives it. */ }
  window.dispatchEvent(new CustomEvent(NIA_AVATAR_CUE_EVENT, { detail: value }));
}

export function niaExpressionForStatus(status: string): NiaExpression {
  if (status === "resting") return "sleepy";
  if (status === "thinking" || status === "working") return "thinking";
  if (status === "failed") return "sad";
  if (status === "opening") return "surprised";
  return "neutral";
}

export function niaAudioEnvelope(samples: Float32Array): number {
  if (!samples.length) return 0;
  let energy = 0;
  for (const sample of samples) if (Number.isFinite(sample)) energy += sample * sample;
  return Math.min(1, Math.max(0, (Math.sqrt(energy / samples.length) - 0.008) * 8));
}
