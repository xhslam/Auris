import { NextResponse } from "next/server";
import { z } from "zod";
import { extractReadableTextFromHtml } from "@/features/import/extract-readable-text";

const importUrlSchema = z.object({
  url: z.string().url(),
});

function ensureSupportedRemoteUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("UNSUPPORTED_URL_PROTOCOL");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("LOCAL_URL_BLOCKED");
  }

  return url;
}

function toReadableTitle(url: URL, text: string) {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0);
  return firstLine?.slice(0, 80) ?? url.hostname;
}

export async function POST(request: Request) {
  try {
    const payload = importUrlSchema.parse(await request.json());
    const url = ensureSupportedRemoteUrl(payload.url);
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShadowingStudio/1.0; +https://localhost)",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          code: "URL_FETCH_FAILED",
          message: "抓取链接内容失败，请确认链接可访问。",
        },
        { status: 422 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const text = contentType.includes("text/html")
      ? extractReadableTextFromHtml(body)
      : body.replace(/\r\n/g, "\n").trim();

    if (!text) {
      return NextResponse.json(
        {
          code: "URL_IMPORT_EMPTY",
          message: "没有从这个链接里提取到可用于跟读的文本。",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      sourceType: "url",
      text,
      title: toReadableTitle(url, text),
      url: url.toString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_URL_INPUT",
          message: error.issues[0]?.message ?? "请输入有效的链接地址。",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "UNSUPPORTED_URL_PROTOCOL") {
      return NextResponse.json(
        {
          code: "UNSUPPORTED_URL_PROTOCOL",
          message: "目前只支持导入 http 或 https 链接。",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "LOCAL_URL_BLOCKED") {
      return NextResponse.json(
        {
          code: "LOCAL_URL_BLOCKED",
          message: "为了安全起见，暂不支持导入本地或内网地址。",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        code: "URL_IMPORT_FAILED",
        message: "导入链接失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
