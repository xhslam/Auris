import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PersonalVocabLookupError,
  lookupPersonalVocabDefinition,
} from "@/features/dictionary/personal-vocab/personal-vocab";

const lookupSchema = z.object({
  word: z.string().min(1).max(64),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = lookupSchema.parse({
      word: searchParams.get("word"),
    });
    const entry = await lookupPersonalVocabDefinition(payload.word);

    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_LOOKUP_INPUT",
          message: error.issues[0]?.message ?? "请输入有效的英文单词。",
        },
        { status: 400 },
      );
    }

    if (error instanceof PersonalVocabLookupError) {
      return NextResponse.json(
        {
          code: error.code,
          message:
            error.code === "WORD_NOT_FOUND"
              ? "资料库里没有这个词。"
              : error.code === "INVALID_WORD"
                ? "请输入有效的英文单词。"
                : "个人词库加载失败，请稍后再试。",
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        code: "DICTIONARY_LOOKUP_FAILED",
        message: "单词释义加载失败，请稍后再试。",
      },
      { status: 500 },
    );
  }
}
