import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createNiaLiveSessionPayload, type NiaLiveVoice } from "@/features/nia/nia-live-session-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function publicError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
function safetyIdentifier(clientInstanceId: string) {
  return `auris-live-${createHash("sha256").update(`auris-live:${clientInstanceId}`).digest("hex").slice(0, 48)}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return publicError(503, "LIVE_NOT_CONFIGURED", "GPT Live is not configured on this Auris host.");
  let input: { clientInstanceId?: unknown; voice?: unknown };
  try { input = await request.json() as { clientInstanceId?: unknown; voice?: unknown }; }
  catch { return publicError(400, "INVALID_REQUEST", "A JSON Live session request is required."); }
  let payload: ReturnType<typeof createNiaLiveSessionPayload>;
  try { payload = createNiaLiveSessionPayload({ clientInstanceId: input.clientInstanceId as string, voice: input.voice as NiaLiveVoice | undefined }); }
  catch { return publicError(400, "INVALID_REQUEST", "Invalid Live session configuration."); }
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier(payload.clientInstanceId),
      },
      body: JSON.stringify(payload.body),
      cache: "no-store",
    });
  } catch { return publicError(502, "LIVE_UPSTREAM_UNAVAILABLE", "Unable to create a GPT Live session right now."); }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("Nia Live client secret request failed", upstream.status, detail.slice(0, 600));
    return publicError(502, "LIVE_SESSION_UNAVAILABLE", "GPT Live could not start. Check the host configuration and model access.");
  }
  const data = await upstream.json() as { value?: unknown; expires_at?: unknown };
  if (typeof data.value !== "string" || !data.value.startsWith("ek_")) return publicError(502, "LIVE_SESSION_INVALID", "The Live provider returned an invalid session secret.");
  return NextResponse.json({ clientSecret: data.value, expiresAt: typeof data.expires_at === "number" ? data.expires_at : null, model: "gpt-realtime-2.1" }, { headers: { "Cache-Control": "no-store" } });
}
