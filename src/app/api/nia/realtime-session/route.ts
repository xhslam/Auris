import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { error: { code: "LIVE_DESKTOP_ONLY", message: "Nia Realtime now uses the Codex desktop login through the Auris companion." } },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
