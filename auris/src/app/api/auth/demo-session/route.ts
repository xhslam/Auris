import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildDemoAuthUser,
  DEMO_AUTH_COOKIE_NAME,
  encodeDemoAuthCookieValue,
} from "@/features/auth/demo-auth";
import { upsertAuthProfile } from "@/server/repositories/auth-profile-repository";

const demoSessionSchema = z.object({
  account: z.string().min(1),
  password: z.string().min(1),
});

const DEMO_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  try {
    const payload = demoSessionSchema.parse(await request.json());
    const user = buildDemoAuthUser(payload.account);

    if (!user) {
      return NextResponse.json(
        {
          code: "INVALID_ACCOUNT",
          message: "请输入有效的手机号或邮箱。",
        },
        { status: 400 },
      );
    }

    await upsertAuthProfile({
      accountIdentifier: payload.account,
      userId: user.id,
    });

    const response = NextResponse.json({ user });

    response.cookies.set({
      httpOnly: true,
      maxAge: DEMO_AUTH_COOKIE_MAX_AGE_SECONDS,
      name: DEMO_AUTH_COOKIE_NAME,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      value: encodeDemoAuthCookieValue(user),
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_AUTH_INPUT",
          message: error.issues[0]?.message ?? "认证参数无效。",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        code: "DEMO_SESSION_FAILED",
        message: "创建登录会话失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
