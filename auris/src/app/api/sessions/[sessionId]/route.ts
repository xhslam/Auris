import { NextResponse } from "next/server";
import { requireSessionOwner } from "@/features/auth/require-session-owner";
import { deleteSession } from "@/features/sessions/delete-session";
import { getSessionById } from "@/server/repositories/session-repository";

export async function DELETE(
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
    await deleteSession(sessionId);

    return NextResponse.json({
      deletedSessionId: sessionId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "请先登录后再删除训练记录。",
        },
        { status: 401 },
      );
    }

    if (error instanceof Error && error.message === "SESSION_FORBIDDEN") {
      return NextResponse.json(
        {
          code: "SESSION_FORBIDDEN",
          message: "你无权删除其他人的训练记录。",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        code: "SESSION_DELETE_FAILED",
        message: "删除训练记录失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
