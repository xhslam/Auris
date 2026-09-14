import { NextResponse } from "next/server";
import { evaluatePronunciationAssessment } from "@/features/assessment/azure-pronunciation-assessment";

const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/flac",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/ogg; codecs=opus",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
]);

function isUploadedAudioLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === "string") {
    return false;
  }

  return (
    typeof value === "object" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const referenceText = String(formData.get("referenceText") ?? "").trim();
  const locale = String(formData.get("locale") ?? "en-US").trim() || "en-US";
  const rawSourceLabel = formData.get("sourceLabel");
  const sourceLabel =
    typeof rawSourceLabel === "string" ? rawSourceLabel.trim() : "";
  const audioFile = formData.get("audio");

  if (!referenceText) {
    return NextResponse.json(
      {
        code: "REFERENCE_TEXT_REQUIRED",
        message: "请先输入参考文本。",
      },
      { status: 400 },
    );
  }

  if (!isUploadedAudioLike(audioFile)) {
    return NextResponse.json(
      {
        code: "AUDIO_FILE_REQUIRED",
        message: "请上传或录制一段音频再开始评估。",
      },
      { status: 400 },
    );
  }

  const normalizedContentType = (audioFile.type || "audio/wav").toLowerCase();

  if (!SUPPORTED_AUDIO_TYPES.has(normalizedContentType)) {
    return NextResponse.json(
      {
        code: "UNSUPPORTED_AUDIO_TYPE",
        message: "当前只支持 wav、mp3、ogg 或 flac 音频格式。",
      },
      { status: 400 },
    );
  }

  try {
    const assessment = await evaluatePronunciationAssessment({
      audioBuffer: await audioFile.arrayBuffer(),
      contentType: normalizedContentType,
      locale,
      referenceText,
      sourceLabel: sourceLabel || "上传音频",
    });

    return NextResponse.json({ assessment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "发音评估失败，请稍后重试。";

    if (message === "AZURE_PRONUNCIATION_ASSESSMENT_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          code: message,
          message: "Azure Speech 发音评估尚未配置。",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        code: "PRONUNCIATION_ASSESSMENT_FAILED",
        message,
      },
      { status: 502 },
    );
  }
}
