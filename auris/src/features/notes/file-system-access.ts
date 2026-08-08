const DATABASE_NAME = "english-shadowing-notes";
const DATABASE_VERSION = 1;
const STORE_NAME = "handles";
const DIRECTORY_HANDLE_KEY = "notes-directory";

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

async function openNotesDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onerror = () => {
      reject(request.error ?? new Error("无法打开笔记数据库。"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

export async function loadDirectoryHandle() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  const database = await openNotesDatabase();

  return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(DIRECTORY_HANDLE_KEY);

    request.onerror = () => {
      reject(request.error ?? new Error("无法读取笔记文件夹。"));
    };

    request.onsuccess = () => {
      resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    };
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const database = await openNotesDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(handle, DIRECTORY_HANDLE_KEY);

    request.onerror = () => {
      reject(request.error ?? new Error("无法保存笔记文件夹。"));
    };

    transaction.oncomplete = () => {
      resolve();
    };
  });
}

export async function verifyDirectoryPermission(handle: FileSystemDirectoryHandle) {
  const permissionHandle = handle as PermissionAwareDirectoryHandle;
  const currentPermission = await permissionHandle.queryPermission({ mode: "readwrite" });

  if (currentPermission === "granted") {
    return true;
  }

  const nextPermission = await permissionHandle.requestPermission({ mode: "readwrite" });
  return nextPermission === "granted";
}
