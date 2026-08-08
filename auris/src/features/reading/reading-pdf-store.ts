export type ReadingPdfRecord = {
  bytes: ArrayBuffer;
  id: string;
  mimeType: string;
  title: string;
  updatedAt: string;
};

const DATABASE_NAME = "auris-reading-pdfs";
const DATABASE_VERSION = 1;
const STORE_NAME = "pdf-blobs";

function getIndexedDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("READING_PDF_STORAGE_UNAVAILABLE");
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
    request.onerror = () =>
      reject(request.error ?? new Error("READING_PDF_DB_OPEN_FAILED"));
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
          reject(transaction.error ?? new Error("READING_PDF_DB_TRANSACTION_FAILED"));
          database.close();
        };

        operation(store, resolve, reject);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

export async function saveReadingPdfBytes(
  record: ReadingPdfRecord,
): Promise<void> {
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("READING_PDF_SAVE_FAILED"));
  });
}

export async function loadReadingPdfBytes(
  sourceId: string,
): Promise<ArrayBuffer | null> {
  return withStore<ArrayBuffer | null>("readonly", (store, resolve, reject) => {
    const request = store.get(sourceId);
    request.onsuccess = () => {
      const record = request.result as ReadingPdfRecord | undefined;
      resolve(record?.bytes ?? null);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("READING_PDF_LOAD_FAILED"));
  });
}

export async function deleteReadingPdfBytes(sourceId: string): Promise<void> {
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(sourceId);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("READING_PDF_DELETE_FAILED"));
  });
}
