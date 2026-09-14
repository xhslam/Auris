import { getOptionalSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { deleteAudioAssetBySessionId } from "@/server/repositories/audio-asset-repository";
import { saveAudioAsset } from "@/server/repositories/audio-asset-repository";
import {
  deleteLocalAudioAsset,
  inferStoredAudioExtension,
  readLocalAudioAsset,
  writeLocalAudioAsset,
} from "@/server/repositories/local-persistence";

const AUDIO_BUCKET_NAME = "shadowing-audio";

type AudioStorageInput = {
  sessionId: string;
  audioBuffer: Buffer;
  contentType: string;
};

type AudioStorageBackend = {
  deleteAudioAsset: (sessionId: string) => Promise<void>;
  storeAudioAsset: (input: AudioStorageInput) => Promise<string>;
};

let backendOverride: AudioStorageBackend | null = null;
let bucketReady = false;

function getAudioObjectPath(sessionId: string, extension = "mp3") {
  return `sessions/${sessionId}.${extension}`;
}

function getFileExtensionFromContentType(contentType: string) {
  if (contentType.includes("mpeg")) {
    return "mp3";
  }

  if (contentType.includes("wav")) {
    return "wav";
  }

  if (contentType.includes("ogg")) {
    return "ogg";
  }

  return "bin";
}

async function ensureAudioBucket() {
  if (bucketReady) {
    return true;
  }

  const supabase = getOptionalSupabaseAdminClient();

  if (!supabase) {
    return false;
  }

  const { error } = await supabase.storage.createBucket(AUDIO_BUCKET_NAME, {
    public: false,
  });

  if (error && !error.message.toLowerCase().includes("already")) {
    return false;
  }

  bucketReady = true;
  return true;
}

const localFileBackend: AudioStorageBackend = {
  async deleteAudioAsset(sessionId) {
    await deleteAudioAssetBySessionId(sessionId);
    await deleteLocalAudioAsset(sessionId);
  },

  async storeAudioAsset(input) {
    const fileExtension = getFileExtensionFromContentType(input.contentType);

    await saveAudioAsset({
      sessionId: input.sessionId,
      audioBuffer: input.audioBuffer,
      contentType: input.contentType,
    });

    await writeLocalAudioAsset({
      sessionId: input.sessionId,
      audioBuffer: input.audioBuffer,
      contentType: input.contentType,
      fileExtension,
    });

    return `/api/audio/${input.sessionId}`;
  },
};

const supabaseBackend: AudioStorageBackend = {
  async deleteAudioAsset(sessionId) {
    const supabase = getOptionalSupabaseAdminClient();
    const extension = (await inferStoredAudioExtension(sessionId)) ?? "wav";

    await localFileBackend.deleteAudioAsset(sessionId);

    if (!supabase) {
      return;
    }

    await supabase.storage
      .from(AUDIO_BUCKET_NAME)
      .remove([getAudioObjectPath(sessionId, extension)]);
  },

  async storeAudioAsset(input) {
    const localUrl = await localFileBackend.storeAudioAsset(input);
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localUrl;
    }

    const hasBucket = await ensureAudioBucket();

    if (!hasBucket) {
      return localUrl;
    }

    const fileExtension = getFileExtensionFromContentType(input.contentType);
    const { error } = await supabase.storage
      .from(AUDIO_BUCKET_NAME)
      .upload(getAudioObjectPath(input.sessionId, fileExtension), input.audioBuffer, {
        contentType: input.contentType,
        upsert: true,
      });

    if (error) {
      return localUrl;
    }

    return localUrl;
  },
};

function getActiveBackend() {
  return backendOverride ?? supabaseBackend;
}

export function __setAudioStorageBackendForTests(
  backend: AudioStorageBackend | null,
) {
  backendOverride = backend;
}

export function getStoredAudioBucketName() {
  return AUDIO_BUCKET_NAME;
}

export async function getStoredAudioObjectPath(sessionId: string) {
  const extension = (await inferStoredAudioExtension(sessionId)) ?? "mp3";
  return getAudioObjectPath(sessionId, extension);
}

export async function getStoredLocalAudioAsset(sessionId: string) {
  return readLocalAudioAsset(sessionId);
}

export async function storeAudioAsset(input: AudioStorageInput) {
  return getActiveBackend().storeAudioAsset(input);
}

export async function deleteStoredAudioAsset(sessionId: string) {
  return getActiveBackend().deleteAudioAsset(sessionId);
}
