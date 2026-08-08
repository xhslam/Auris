type AudioAssetRecord = {
  audioBuffer: Buffer;
  contentType: string;
  sessionId: string;
};

const audioAssets = new Map<string, AudioAssetRecord>();

export async function saveAudioAsset(input: AudioAssetRecord) {
  audioAssets.set(input.sessionId, input);
  return input;
}

export async function getAudioAssetBySessionId(sessionId: string) {
  return audioAssets.get(sessionId) ?? null;
}

export async function deleteAudioAssetBySessionId(sessionId: string) {
  audioAssets.delete(sessionId);
}
