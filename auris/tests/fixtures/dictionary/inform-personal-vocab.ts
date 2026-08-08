import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";

// Exact Inform payload reported from the current main personal-vocabulary source.
export const INFORM_PERSONAL_VOCAB_LINES = [
  "- **词源/构词**: 拉丁语 informare = in-（进入）+ forma「形状」→ 原义「赋予形状/使知晓」。",
  "- **原始画面**: 把一条信息「注入」对方脑中，使其成形。",
  "- **核心意象**: 让对方「成形」地知道。",
] as const;

export const INFORM_PERSONAL_VOCAB_ENTRY: DictionaryEntry = {
  meanings: [{ definitions: ["通知，告知"], lexicalCategory: "verb" }],
  personal: {
    definition: "通知，告知",
    fileName: "inform.md",
    sections: [
      {
        lines: [...INFORM_PERSONAL_VOCAB_LINES],
        title: "词源与构词",
      },
    ],
    source: {},
  },
  pronunciations: ["/ɪnfɔrm/"],
  sourceLabel: "个人词库",
  synonyms: [],
  word: "Inform",
};
