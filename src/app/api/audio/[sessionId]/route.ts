import { NextResponse } from "next/server";
import { requireSessionOwner } from "@/features/auth/require-session-owner";
import { isLocalDesktopSessionUserId, isDesktopLocalRequest } from "@/features/auth/session-actor";
import {
  getStoredAudioBucketName,
  getStoredLocalAudioAsset,
  getStoredAudioObjectPath,
} from "@/features/storage/audio-storage";
import { getOptionalSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getAudioAssetBySessionId } from "@/server/repositories/audio-asset-repository";
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

    if (isLocalDesktopSessionUserId(session.userId)) {
      if (!isDesktopLocalRequest(_request)) {
        throw new Error("SESSION_FORBIDDEN");
      }
    } else {
      await requireSessionOwner(session.userId, _request);
    }

    const asset = await getAudioAssetBySessionId(sessionId);

    if (asset) {
      return new NextResponse(new Uint8Array(asset.audioBuffer), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Length": String(asset.audioBuffer.byteLength),
          "Content-Type": asset.contentType,
        },
      });
    }

    const localAsset = await getStoredLocalAudioAsset(sessionId);

    if (localAsset) {
      return new NextResponse(new Uint8Array(localAsset.audioBuffer), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Length": String(localAsset.audioBuffer.byteLength),
          "Content-Type": localAsset.contentType,
        },
      });
    }

    const supabase = getOptionalSupabaseAdminClient();

    if (supabase) {
      const { data, error } = await supabase.storage
        .from(getStoredAudioBucketName())
        .download(await getStoredAudioObjectPath(sessionId));

      if (!error && data) {
        return new NextResponse(await data.arrayBuffer(), {
          headers: {
            "Cache-Control": "no-store",
            "Content-Length": String(data.size),
            "Content-Type": data.type || "audio/mpeg",
          },
        });
      }
    }

    return NextResponse.json(
      {
        code: "AUDIO_NOT_FOUND",
        message: "未找到对应的训练音频。",
      },
      { status: 404 },
    );
  } catch (error) {
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

    return NextResponse.json(
      {
        code: "AUDIO_LOAD_FAILED",
        message: "加载训练音频失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
