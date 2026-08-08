import { GET } from "@/app/api/dictionary/lookup/route";

describe("GET /api/dictionary/lookup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed personal vocabulary definitions for a word without any API config", async () => {
    const lookupSpy = vi.spyOn(global, "fetch");

    const response = await GET(
      new Request("http://localhost/api/dictionary/lookup?word=fundamental"),
    );
    const payload = (await response.json()) as {
      entry?: {
        meanings: Array<{ definitions: string[]; lexicalCategory: string }>;
        personal?: {
          sections: Array<{ lines: string[]; title: string }>;
        };
        pronunciations: string[];
        sourceLabel: string;
        word: string;
      };
    };

    expect(response.status).toBe(200);
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(payload.entry).toMatchObject({
      word: "Fundamental",
      sourceLabel: "个人词库",
      pronunciations: ["/ˌfəndəˈmɛnəl/"],
      meanings: [
        {
          lexicalCategory: "形容词",
          definitions: ["重要的；基本的"],
        },
      ],
    });
    expect(payload.entry?.personal?.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lines: expect.arrayContaining([
            "原始画面: 把建筑物一路拆到最下面，露出真正承重的地基。",
          ]),
          title: "词源与构词",
        }),
      ]),
    );
  });

  it("normalizes lookup casing and punctuation", async () => {
    const response = await GET(
      new Request("http://localhost/api/dictionary/lookup?word=Approach%2C"),
    );
    const payload = (await response.json()) as {
      entry?: {
        meanings: Array<{ definitions: string[] }>;
        word: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.entry).toMatchObject({
      word: "Approach",
      meanings: [{ definitions: ["方法；靠近；临近"] }],
    });
  });

  it("resolves an inflected word to the canonical personal vocabulary entry", async () => {
    const response = await GET(
      new Request("http://localhost/api/dictionary/lookup?word=duties"),
    );
    const payload = (await response.json()) as {
      entry?: { personal?: { fileName: string }; word: string };
    };

    expect(response.status).toBe(200);
    expect(payload.entry).toMatchObject({
      word: "Duty",
      personal: { fileName: "2832-duty.md" },
    });
  });

  it("returns not found when the personal vocabulary has no entry", async () => {
    const response = await GET(
      new Request("http://localhost/api/dictionary/lookup?word=zzzznonexistentword"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      message: "资料库里没有这个词。",
      code: "WORD_NOT_FOUND",
    });
  });
});
