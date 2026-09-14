import type { SessionPlayback, SessionSourceType } from "@/features/sessions/session.types";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

export type PreparedTrainingContext = {
  sessionId: string;
  sourceNotePath?: string | null;
  sourceType: SessionSourceType;
  text: string;
  title: string;
};

type TrainingAudioAssetPayload = {
  bytes: Uint8Array;
  contentType: string | null;
} | null;

async function readAudioAsset(
  fetchImpl: typeof fetch,
  audioUrl: string | null,
): Promise<TrainingAudioAssetPayload> {
  if (!audioUrl) {
    return null;
  }

  const response = await fetchImpl(audioUrl);

  if (!response.ok) {
    return null;
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
}

export function hasDesktopTrainingHistory(bridge: DesktopBridge | null) {
  return Boolean(bridge?.trainingHistory);
}

export async function savePreparedSessionToDesktopHistory(input: {
  bridge: DesktopBridge;
  context: PreparedTrainingContext;
  fetchImpl?: typeof fetch;
  playback: SessionPlayback;
}) {
  if (!input.bridge.trainingHistory) {
    return;
  }

  const audioAsset = await readAudioAsset(
    input.fetchImpl ?? fetch,
    input.playback.session.audioUrl,
  );

  await input.bridge.trainingHistory.savePreparedSession({
    audioAsset,
    originalText: input.context.text,
    playback: input.playback,
    sourceType: input.context.sourceType,
    title: input.context.title,
  });
}
