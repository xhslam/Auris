import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertAuthProfile } from "@/server/repositories/auth-profile-repository";

const profileSyncSchema = z.object({
  account: z.string().min(1),
  userId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const payload = profileSyncSchema.parse(await request.json());
    const profile = await upsertAuthProfile({
      accountIdentifier: payload.account,
      userId: payload.userId,
    });

    return NextResponse.json({
      profile,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_PROFILE_SYNC_INPUT",
          message: error.issues[0]?.message ?? "资料同步参数无效。",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        code: "PROFILE_SYNC_FAILED",
        message: "保存登录资料失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
