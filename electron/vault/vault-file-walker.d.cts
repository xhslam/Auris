declare namespace vaultFileWalker {
  type DirectoryEntry = { name: string; isDirectory(): boolean };
  type FileRecord = {
    absolutePath: string;
    fileName: string;
    relativePath: string;
    isDirectory?: true;
    mtime?: string | null;
  };
  type Dependencies = {
    readdir?: (path: string, options: { withFileTypes: true }) => Promise<DirectoryEntry[]>;
    stat?: (path: string) => Promise<{ mtime: Date }>;
  };
  function createVaultFileWalker(dependencies?: Dependencies): (vaultPath: string) => Promise<FileRecord[]>;
  function walkVaultFiles(vaultPath: string): Promise<FileRecord[]>;
}
export = vaultFileWalker;
