import { describe, expect, it } from "vitest";
import {
  cleanDisplayToken,
  createParagraphsFromText,
  getLookupKey,
  getWordCount,
  isMostlyChineseText,
  normalizeWord,
  READING_TRANSLATION_PLACEHOLDER,
  serializeReadingParagraphs,
} from "@/features/reading/reading-text";

describe("cleanDisplayToken", () => {
  it("strips surrounding punctuation but keeps original case", () => {
    expect(cleanDisplayToken('"Consciousness,')).toBe("Consciousness");
    expect(cleanDisplayToken("(utility)")).toBe("utility");
  });

  it("returns empty for pure punctuation/space tokens", () => {
    expect(cleanDisplayToken("—")).toBe("");
    expect(cleanDisplayToken("   ")).toBe("");
  });
});

describe("getLookupKey", () => {
  it("lowercases and trims a single word", () => {
    expect(getLookupKey("Momentum")).toBe("momentum");
    expect(getLookupKey('"Utility."')).toBe("utility");
  });

  it("keeps internal spaces for phrases so词组 can be收录", () => {
    expect(getLookupKey("  Sport Utility Vehicle ")).toBe("sport utility vehicle");
  });

  it("returns empty for blank input", () => {
    expect(getLookupKey("   ")).toBe("");
  });

  it("matches normalizeWord for single words", () => {
    expect(getLookupKey("Reading!")).toBe(normalizeWord("Reading!"));
  });
});

describe("getWordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(getWordCount("a steady reading rhythm")).toBe(4);
    expect(getWordCount("   ")).toBe(0);
  });
});

describe("isMostlyChineseText", () => {
  it("detects Chinese-majority blocks", () => {
    expect(isMostlyChineseText("安静的动量从回到同一页开始。")).toBe(true);
    expect(isMostlyChineseText("Hello world")).toBe(false);
    expect(isMostlyChineseText("He said 你好 once")).toBe(false);
  });
});

describe("createParagraphsFromText", () => {
  it("pairs English + blank line + Chinese into one bilingual paragraph", () => {
    const paragraphs = createParagraphsFromText(
      "demo",
      "Quiet momentum begins when a learner returns.\n\n安静的动量从学习者回到同一页开始。\n\nA steady rhythm protects attention.\n\n稳定的节奏保护注意力。",
    );

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.english).toBe(
      "Quiet momentum begins when a learner returns.",
    );
    expect(paragraphs[0]?.translation).toBe(
      "安静的动量从学习者回到同一页开始。",
    );
    expect(paragraphs[1]?.english).toBe("A steady rhythm protects attention.");
    expect(paragraphs[1]?.translation).toBe("稳定的节奏保护注意力。");
  });

  it("keeps English-only multi-paragraph files unpaired", () => {
    const paragraphs = createParagraphsFromText(
      "demo",
      "First paragraph about momentum.\n\nSecond paragraph keeps context close.",
    );

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.english).toBe("First paragraph about momentum.");
    expect(paragraphs[0]?.translation).toBe(READING_TRANSLATION_PLACEHOLDER);
    expect(paragraphs[1]?.english).toBe(
      "Second paragraph keeps context close.",
    );
    expect(paragraphs[1]?.translation).toBe(READING_TRANSLATION_PLACEHOLDER);
  });

  it("leaves a trailing English paragraph unpaired when translation is missing", () => {
    const paragraphs = createParagraphsFromText(
      "demo",
      "Only English here.\n\n只有中文译文。\n\nOrphan English paragraph.",
    );

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.english).toBe("Only English here.");
    expect(paragraphs[0]?.translation).toBe("只有中文译文。");
    expect(paragraphs[1]?.english).toBe("Orphan English paragraph.");
    expect(paragraphs[1]?.translation).toBe(READING_TRANSLATION_PLACEHOLDER);
  });
});

describe("serializeReadingParagraphs", () => {
  it("writes bilingual empty-line pairs and omits placeholders", () => {
    const body = serializeReadingParagraphs([
      {
        english: "Quiet momentum begins.",
        translation: "安静的动量开始了。",
      },
      {
        english: "English only.",
        translation: READING_TRANSLATION_PLACEHOLDER,
      },
    ]);

    expect(body).toBe(
      "Quiet momentum begins.\n\n安静的动量开始了。\n\nEnglish only.",
    );
  });
});
