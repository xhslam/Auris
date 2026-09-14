import { POST } from "@/app/api/assessment/pronunciation/route";

function createMultipartRequest(formData: FormData) {
  return {
    formData: async () => formData,
  } as Request;
}

describe("POST /api/assessment/pronunciation", () => {
  const originalEnv = {
    azureKey: process.env.AZURE_SPEECH_KEY,
    azureRegion: process.env.AZURE_SPEECH_REGION,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.AZURE_SPEECH_KEY = originalEnv.azureKey;
    process.env.AZURE_SPEECH_REGION = originalEnv.azureRegion;
  });

  it("returns 503 when Azure pronunciation assessment is not configured", async () => {
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;

    const formData = new FormData();
    formData.set("referenceText", "Learning a language is not only about rhythm.");
    formData.set("locale", "en-US");
    formData.set("sourceLabel", "Shadowing Demo");
    formData.set(
      "audio",
      new File([new Uint8Array([82, 73, 70, 70])], "sample.wav", {
        type: "audio/wav",
      }),
    );

    const response = await POST(createMultipartRequest(formData));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "AZURE_PRONUNCIATION_ASSESSMENT_NOT_CONFIGURED",
    });
  });

  it("returns parsed pronunciation scores when Azure responds successfully", async () => {
    process.env.AZURE_SPEECH_KEY = "test-key";
    process.env.AZURE_SPEECH_REGION = "eastasia";

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          DisplayText: "Learning a language is not only about rhythm.",
          NBest: [
            {
              PronunciationAssessment: {
                AccuracyScore: 91,
                CompletenessScore: 100,
                FluencyScore: 96,
                PronScore: 94,
              },
              Words: [
                {
                  PronunciationAssessment: {
                    AccuracyScore: 97,
                    ErrorType: "None",
                  },
                  Word: "Learning",
                },
                {
                  PronunciationAssessment: {
                    AccuracyScore: 86,
                    ErrorType: "Mispronunciation",
                  },
                  Word: "rhythm",
                },
              ],
            },
          ],
          RecognitionStatus: "Success",
        }),
        { status: 200 },
      ),
    );

    const formData = new FormData();
    formData.set("referenceText", "Learning a language is not only about rhythm.");
    formData.set("locale", "en-US");
    formData.set("sourceLabel", "Shadowing Demo");
    formData.set(
      "audio",
      new File([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], "sample.wav", {
        type: "audio/wav",
      }),
    );

    const response = await POST(createMultipartRequest(formData));
    const payload = (await response.json()) as {
      assessment?: {
        accuracyScore: number;
        completenessScore: number;
        fluencyScore: number;
        overallScore: number;
        sourceLabel: string;
        wordAssessments: Array<{ accuracyScore: number; errorType: string; word: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://eastasia.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "audio/wav",
          "Ocp-Apim-Subscription-Key": "test-key",
          "Pronunciation-Assessment": expect.any(String),
        }),
        method: "POST",
      }),
    );
    expect(payload.assessment).toMatchObject({
      accuracyScore: 91,
      completenessScore: 100,
      fluencyScore: 96,
      overallScore: 94,
      sourceLabel: "Shadowing Demo",
      wordAssessments: [
        {
          accuracyScore: 97,
          errorType: "None",
          word: "Learning",
        },
        {
          accuracyScore: 86,
          errorType: "Mispronunciation",
          word: "rhythm",
        },
      ],
    });
  });
});
