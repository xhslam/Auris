import { NextResponse } from "next/server";
import { requireSessionOwner } from "@/features/auth/require-session-owner";
import { isLocalDesktopSessionUserId } from "@/features/auth/session-actor";
import { getSessionPlayback } from "@/features/sessions/get-session-playback";
import { getSessionById } from "@/server/repositories/session-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
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

    await requireSessionOwner(session.userId, _request);

    const playback = await getSessionPlayback(sessionId);

    if (isLocalDesktopSessionUserId(session.userId) && playback.session.audioUrl) {
      const audioUrl = new URL(playback.session.audioUrl, "http://localhost");
      audioUrl.searchParams.set("localDesktop", "1");
      playback.session.audioUrl = `${audioUrl.pathname}${audioUrl.search}`;
    }

    return NextResponse.json({ playback });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "请先登录后再访问训练回放。",
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

    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return NextResponse.json(
        {
          code: "SESSION_NOT_FOUND",
          message: "没有找到对应的训练会话。",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        code: "PLAYBACK_LOAD_FAILED",
        message: "加载播放数据失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
