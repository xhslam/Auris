import { NextResponse } from "next/server";
import { listTemplates } from "@/features/templates/list-templates";

export async function GET() {
  try {
    const templates = await listTemplates();
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json(
      {
        code: "TEMPLATE_LIST_FAILED",
        message: "加载模板失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
