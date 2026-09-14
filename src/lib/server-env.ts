import { z } from "zod";

const serverOnlyEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
});

const azureSpeechEnvSchema = z.object({
  AZURE_SPEECH_KEY: z.string().min(1),
  AZURE_SPEECH_REGION: z.string().min(1),
});

const voiceEngineEnvSchema = z.object({
  SHADOWING_VOXCPM_URL: z.string().url(),
  SHADOWING_VOXCPM_MODEL_VERSION: z.string().min(1).optional(),
});

export type ServerOnlyEnv = z.infer<typeof serverOnlyEnvSchema>;
export type OpenAIEnv = z.infer<typeof openAIEnvSchema>;
export type AzureSpeechEnv = z.infer<typeof azureSpeechEnvSchema>;
export type VoiceEngineEnv = z.infer<typeof voiceEngineEnvSchema>;

export function getOptionalServerOnlyEnv() {
  const parsed = serverOnlyEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return parsed.success ? parsed.data : null;
}

export function getOptionalOpenAIEnv() {
  const parsed = openAIEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  });

  return parsed.success ? parsed.data : null;
}

export function getOptionalAzureSpeechEnv() {
  const parsed = azureSpeechEnvSchema.safeParse({
    AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION,
  });

  return parsed.success ? parsed.data : null;
}

export function getOptionalVoiceEngineEnv() {
  const parsed = voiceEngineEnvSchema.safeParse({
    SHADOWING_VOXCPM_MODEL_VERSION: process.env.SHADOWING_VOXCPM_MODEL_VERSION,
    SHADOWING_VOXCPM_URL: process.env.SHADOWING_VOXCPM_URL,
  });

  return parsed.success ? parsed.data : null;
}
