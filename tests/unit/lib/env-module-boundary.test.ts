import { describe, expect, it } from "vitest";
import * as publicEnv from "@/lib/env";

describe("public env module boundary", () => {
  it("does not export server-only accessors", () => {
    expect(publicEnv).not.toHaveProperty("getOptionalAzureSpeechEnv");
    expect(publicEnv).not.toHaveProperty("getOptionalOpenAIEnv");
    expect(publicEnv).not.toHaveProperty("getOptionalServerOnlyEnv");
    expect(publicEnv).not.toHaveProperty("getOptionalVoiceEngineEnv");
  });
});
