import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionOwner } from "@/features/auth/require-session-owner";
import { prepareSessionPlayback } from "@/features/sessions/prepare-session";
import { getSessionById } from "@/server/repositories/session-repository";

const prepareSessionSchema = z.object({
  voiceId: z.string().min(1).default("alloy"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const payload = prepareSessionSchema.parse(await request.json());
    const session = await getSessionById(sessionId);

    if (!session) {
      return NextResponse.json(
        {
          code: "SESSION_NOT_FOUND",
          message: "没有找到对应的训练会话。",
        },
        { status: 404 },
      );
    }

    await requireSessionOwner(session.userId, request);

    const prepared = await prepareSessionPlayback({
      sessionId,
      text: session.normalizedText,
      voiceId: payload.voiceId,
    });

    return NextResponse.json({
      playback: {
        sessionId: prepared.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_PREPARE_INPUT",
          message: error.issues[0]?.message ?? "无效的音频准备参数。",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "请先登录后再访问训练音频。",
        },
        { status: 401 },
      );
    }

    if (error instanceof Error && error.message === "SESSION_FORBIDDEN") {
      return NextResponse.json(
        {
          code: "SESSION_FORBIDDEN",
          message: "你无权访问其他人的训练会话。",
        },
        { status: 403 },
      );
    }

    if (error instanceof Error && error.message === "ALIGNMENT_FAILED") {
      return NextResponse.json(
        {
          code: "ALIGNMENT_FAILED",
          message: "逐词时间对齐失败，请稍后再试。",
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        code: "SESSION_PREPARE_FAILED",
        message: "生成训练音频失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
