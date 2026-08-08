import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type {
  SentenceRecord,
  SessionRecord,
  WordTokenRecord,
} from "@/features/sessions/session.types";
import type { AuthProfileRecord } from "@/features/auth/auth-profile.types";

type LocalSessionStore = {
  authProfiles?: AuthProfileRecord[];
  sentences: SentenceRecord[];
  sessions: SessionRecord[];
  wordTokens: WordTokenRecord[];
};

type LocalAudioAssetInput = {
  audioBuffer: Buffer;
  contentType: string;
  fileExtension: string;
  sessionId: string;
};

type LocalAudioAssetRecord = {
  audioBuffer: Buffer;
  contentType: string;
  fileExtension: string;
};

const DEFAULT_STORE: LocalSessionStore = {
  authProfiles: [],
  sentences: [],
  sessions: [],
  wordTokens: [],
};

let localPersistenceRootOverride: string | null = null;

function getPersistenceRoot() {
  return localPersistenceRootOverride ?? join(process.cwd(), ".shadowing-data");
}

function getStoreFilePath() {
  return join(getPersistenceRoot(), "session-store.json");
}

function getAudioDirectoryPath() {
  return join(getPersistenceRoot(), "audio");
}

function getAudioMetadataPath(sessionId: string) {
  return join(getAudioDirectoryPath(), `${sessionId}.json`);
}

function getAudioFilePath(sessionId: string, fileExtension: string) {
  return join(getAudioDirectoryPath(), `${sessionId}.${fileExtension}`);
}

async function ensurePersistenceRoot() {
  await mkdir(getPersistenceRoot(), { recursive: true });
}

async function ensureAudioDirectory() {
  await mkdir(getAudioDirectoryPath(), { recursive: true });
}

export function __setLocalPersistenceRootForTests(root: string | null) {
  localPersistenceRootOverride = root;
}

export async function readLocalSessionStore(): Promise<LocalSessionStore> {
  try {
    const raw = await readFile(getStoreFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalSessionStore>;

    return {
      authProfiles: Array.isArray(parsed.authProfiles) ? parsed.authProfiles : [],
      sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      wordTokens: Array.isArray(parsed.wordTokens) ? parsed.wordTokens : [],
    };
  } catch {
    return DEFAULT_STORE;
  }
}

export async function writeLocalSessionStore(store: LocalSessionStore) {
  await ensurePersistenceRoot();
  await writeFile(getStoreFilePath(), JSON.stringify(store, null, 2), "utf8");
}

export async function writeLocalAudioAsset(input: LocalAudioAssetInput) {
  await ensureAudioDirectory();

  await writeFile(
    getAudioFilePath(input.sessionId, input.fileExtension),
    input.audioBuffer,
  );
  await writeFile(
    getAudioMetadataPath(input.sessionId),
    JSON.stringify(
      {
        contentType: input.contentType,
        fileExtension: input.fileExtension,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function readLocalAudioAsset(
  sessionId: string,
): Promise<LocalAudioAssetRecord | null> {
  try {
    const rawMetadata = await readFile(getAudioMetadataPath(sessionId), "utf8");
    const metadata = JSON.parse(rawMetadata) as {
      contentType?: string;
      fileExtension?: string;
    };

    if (!metadata.fileExtension || !metadata.contentType) {
      return null;
    }

    const audioBuffer = await readFile(
      getAudioFilePath(sessionId, metadata.fileExtension),
    );

    return {
      audioBuffer,
      contentType: metadata.contentType,
      fileExtension: metadata.fileExtension,
    };
  } catch {
    return null;
  }
}

export async function inferStoredAudioExtension(sessionId: string) {
  try {
    const entries = await readdir(getAudioDirectoryPath());
    const entry = entries.find((item) => item.startsWith(`${sessionId}.`));

    if (!entry) {
      return null;
    }

    return extname(entry).replace(/^\./, "") || null;
  } catch {
    return null;
  }
}

export async function deleteLocalAudioAsset(sessionId: string) {
  const fileExtension = await inferStoredAudioExtension(sessionId);

  await Promise.allSettled([
    rm(getAudioMetadataPath(sessionId), { force: true }),
    fileExtension
      ? rm(getAudioFilePath(sessionId, fileExtension), { force: true })
      : Promise.resolve(),
  ]);
}
