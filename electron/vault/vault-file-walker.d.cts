declare namespace vaultFileWalker {
  type DirectoryEntry = { name: string; isDirectory(): boolean };
  type FileRecord = {
    absolutePath: string;
    fileName: string;
    relativePath: string;
    isDirectory?: true;
    mtime?: string | null;
    size?: number | null;
  };
  type WalkOptions = {
    namesOnly?: boolean;
    mode?: "names-only" | "complete";
  };
  type Dependencies = {
    readdir?: (path: string, options: { withFileTypes: true }) => Promise<DirectoryEntry[]>;
    stat?: (path: string) => Promise<{ mtime: Date; size?: number }>;
    statConcurrency?: number;
  };
  function createVaultFileWalker(dependencies?: Dependencies): (vaultPath: string, options?: WalkOptions) => Promise<FileRecord[]>;
  function walkVaultFiles(vaultPath: string, options?: WalkOptions): Promise<FileRecord[]>;
}
export = vaultFileWalker;
