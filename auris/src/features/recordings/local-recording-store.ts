export type LocalRecordingRecord = {
  blob: Blob;
  createdAt: string;
  durationMs: number;
  id: string;
  mimeType: string;
  title: string;
};

export type LocalRecordingStorage = {
  deleteRecording: (recordingId: string) => Promise<void>;
  listRecordings: () => Promise<LocalRecordingRecord[]>;
  saveRecording: (recording: LocalRecordingRecord) => Promise<void>;
};

const DATABASE_NAME = "shadowing-studio";
const DATABASE_VERSION = 1;
const STORE_NAME = "local-recordings";

let backendOverride: LocalRecordingStorage | null = null;

function getIndexedDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("LOCAL_RECORDING_STORAGE_UNAVAILABLE");
  }

  return window.indexedDB;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = getIndexedDb().open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("LOCAL_DB_OPEN_FAILED"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void,
  ) => void,
) {
  return new Promise<T>((resolve, reject) => {
    void openDatabase()
      .then((database) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("LOCAL_DB_TRANSACTION_FAILED"));
          database.close();
        };

        operation(store, resolve, reject);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

const indexedDbBackend: LocalRecordingStorage = {
  async deleteRecording(recordingId) {
    await withStore<void>("readwrite", (store, resolve, reject) => {
      const request = store.delete(recordingId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async listRecordings() {
    return withStore<LocalRecordingRecord[]>("readonly", (store, resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const recordings = (request.result as LocalRecordingRecord[]).sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        );
        resolve(recordings);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async saveRecording(recording) {
    await withStore<void>("readwrite", (store, resolve, reject) => {
      const request = store.put(recording);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
};

function getActiveBackend() {
  return backendOverride ?? indexedDbBackend;
}

export function __setLocalRecordingStorageBackendForTests(
  backend: LocalRecordingStorage | null,
) {
  backendOverride = backend;
}

export async function listLocalRecordings() {
  return getActiveBackend().listRecordings();
}

export async function saveLocalRecording(recording: LocalRecordingRecord) {
  return getActiveBackend().saveRecording(recording);
}

export async function deleteLocalRecording(recordingId: string) {
  return getActiveBackend().deleteRecording(recordingId);
}
