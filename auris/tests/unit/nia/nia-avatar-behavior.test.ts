import { describe, expect, it } from "vitest";
import { niaAudioEnvelope, niaExpressionForStatus, parseNiaAvatarCue } from "@/features/nia/nia-avatar-behavior";

describe("Nia avatar input boundaries", () => {
  it("rejects stale, malformed and invented expression commands", () => {
    const cue = { expression: "angry", intensity: 1, expiresAt: 6000 };
    expect(parseNiaAvatarCue(cue, 1000)?.expression).toBe("angry");
    for (const bad of [{ ...cue, expression: "constructor" }, { ...cue, expiresAt: 1000 }, { ...cue, expiresAt: Infinity }, { ...cue, intensity: NaN }, { ...cue, motion: "fly" }]) expect(parseNiaAvatarCue(bad, 1000)).toBeNull();
    expect(parseNiaAvatarCue({ ...cue, intensity: 3 }, 1000)?.intensity).toBe(1);
  });
  it("uses real signal energy and ignores silence and invalid samples", () => {
    expect(niaAudioEnvelope(new Float32Array(256))).toBe(0);
    expect(niaAudioEnvelope(new Float32Array([NaN, Infinity]))).toBe(0);
    const quiet = niaAudioEnvelope(new Float32Array(256).fill(.03));
    expect(quiet).toBeGreaterThan(0);
    expect(niaAudioEnvelope(new Float32Array(256).fill(.1))).toBeGreaterThan(quiet);
    expect(niaAudioEnvelope(new Float32Array(256).fill(2))).toBe(1);
  });
  it("does not mistake an offline failure for anger", () => {
    expect(niaExpressionForStatus("failed")).toBe("sad");
    expect(niaExpressionForStatus("resting")).toBe("sleepy");
    expect(niaExpressionForStatus("thinking")).toBe("thinking");
    expect(niaExpressionForStatus("speaking")).toBe("neutral");
  });
});
