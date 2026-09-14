import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/features/auth/session-actor";
import { createSession } from "@/features/sessions/create-session";
import { listRecentSessions } from "@/features/sessions/list-recent-sessions";

const createSessionSchema = z.object({
  sourceType: z.enum(["paste", "file", "url", "template"]),
  title: z.string().min(1).max(120),
  text: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const user = await getSessionActor(request);

    if (!user) {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "请先登录后再查看最近训练。",
        },
        { status: 401 },
      );
    }

    const sessions = await listRecentSessions(user.id);

    return NextResponse.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        status: session.status,
        title: session.title,
      })),
    });
  } catch {
    return NextResponse.json(
      {
        code: "SESSION_LIST_FAILED",
        message: "加载最近训练失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = createSessionSchema.parse(await request.json());
    const user = await getSessionActor(request);

    if (!user) {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "请先登录后再创建训练会话。",
        },
        { status: 401 },
      );
    }

    const session = await createSession({
      user,
      sourceType: payload.sourceType,
      title: payload.title,
      text: payload.text,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_SESSION_INPUT",
          message: error.issues[0]?.message ?? "Invalid session input.",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "TEXT_REQUIRED") {
      return NextResponse.json(
        {
          code: "TEXT_REQUIRED",
          message: "请输入要练习的英文文本。",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "请先登录后再创建训练会话。",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        code: "SESSION_CREATE_FAILED",
        message: "创建训练会话失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
