import type { VaultClient, VaultEntry } from "@/features/notes/vault/vault-types";

export type LargeVaultFixtureOptions = {
  fileCount: number;
  flatDirectoryCount?: number;
  averageBodyBytes?: number;
  linkDensity?: number; // 0 to 1, probability of including a wiki-link per paragraph
  directoryDepth?: number;
  includeAttachments?: boolean;
  includeHiddenRoots?: boolean;
};

export type LargeVaultFixture = {
  client: VaultClient;
  files: Map<string, string>;
  entries: VaultEntry[];
  readCount: () => number;
  resetReadCount: () => void;
};

export function createLargeVaultFixture(
  options: LargeVaultFixtureOptions,
): LargeVaultFixture {
  const {
    fileCount,
    flatDirectoryCount = 1,
    averageBodyBytes = 300,
    linkDensity = 0.3,
    directoryDepth = 3,
    includeAttachments = false,
    includeHiddenRoots = false,
  } = options;

  const files = new Map<string, string>();
  const entries: VaultEntry[] = [];
  let readCounter = 0;

  const docNames: string[] = [];
  for (let i = 0; i < fileCount; i++) {
    docNames.push(`note-${String(i).padStart(5, "0")}`);
  }

  // Pre-generate paths
  const paths: string[] = [];
  for (let i = 0; i < fileCount; i++) {
    const name = docNames[i];
    if (flatDirectoryCount > 1) {
      const dirIndex = i % flatDirectoryCount;
      paths.push(`folder-${String(dirIndex).padStart(3, "0")}/${name}.md`);
    } else if (directoryDepth > 1) {
      const depth = (i % directoryDepth) + 1;
      const segments: string[] = [];
      for (let d = 1; d < depth; d++) {
        segments.push(`dir-${d}`);
      }
      segments.push(`${name}.md`);
      paths.push(segments.join("/"));
    } else {
      paths.push(`${name}.md`);
    }
  }

  // Generate contents
  for (let i = 0; i < fileCount; i++) {
    const filePath = paths[i];
    const name = docNames[i];
    const linkedTarget =
      Math.random() < linkDensity
        ? docNames[(i + 1) % fileCount]
        : null;

    const tags = [`tag${i % 10}`, `category${i % 5}`];
    const frontmatter = [
      "---",
      `title: ${name}`,
      `tags: [${tags.join(", ")}]`,
      "---",
    ].join("\n");

    const linkText = linkedTarget ? `\n\nReference: [[${linkedTarget}]]` : "";
    const paddingLength = Math.max(0, averageBodyBytes - frontmatter.length - linkText.length - 30);
    const bodyPadding = " Content line ".repeat(Math.ceil(paddingLength / 14)).slice(0, paddingLength);

    const content = `${frontmatter}\n\n# ${name}\n\n${bodyPadding}${linkText}\n`;
    files.set(filePath, content);

    entries.push({
      kind: "file",
      mtime: "2026-11-05T00:00:00.000Z",
      name: filePath.split("/").at(-1) ?? filePath,
      path: filePath,
      size: content.length,
    });
  }

  if (includeAttachments) {
    const attachPath = "assets/image-001.png";
    files.set(attachPath, "binary-png-content");
    entries.push({
      kind: "file",
      mtime: "2026-11-05T00:00:00.000Z",
      name: "image-001.png",
      path: attachPath,
      size: 18,
    });
  }

  if (includeHiddenRoots) {
    const hiddenPath = ".obsidian/workspace.json";
    files.set(hiddenPath, '{"main": true}');
    entries.push({
      kind: "file",
      mtime: "2026-11-05T00:00:00.000Z",
      name: "workspace.json",
      path: hiddenPath,
      size: 14,
    });

    const videoPath = "视频区/recording.mp4";
    files.set(videoPath, "video-binary");
    entries.push({
      kind: "file",
      mtime: "2026-11-05T00:00:00.000Z",
      name: "recording.mp4",
      path: videoPath,
      size: 12,
    });
  }

  const client: VaultClient = {
    createDirectory: async () => undefined,
    deleteEntry: async (path) => {
      files.delete(path);
      const index = entries.findIndex((e) => e.path === path);
      if (index >= 0) entries.splice(index, 1);
    },
    listEntries: async () => [...entries],
    moveEntry: async (fromPath, toPath) => {
      const content = files.get(fromPath);
      if (content !== undefined) {
        files.delete(fromPath);
        files.set(toPath, content);
      }
      const entry = entries.find((e) => e.path === fromPath);
      if (entry) {
        entry.path = toPath;
        entry.name = toPath.split("/").at(-1) ?? toPath;
      }
    },
    readFile: async (path) => {
      readCounter += 1;
      return files.get(path) ?? null;
    },
    renameEntry: async (fromPath, toPath) => {
      const content = files.get(fromPath);
      if (content !== undefined) {
        files.delete(fromPath);
        files.set(toPath, content);
      }
      const entry = entries.find((e) => e.path === fromPath);
      if (entry) {
        entry.path = toPath;
        entry.name = toPath.split("/").at(-1) ?? toPath;
      }
    },
    rootPath: "C:/virtual-vault",
    subscribeToChanges: () => () => undefined,
    writeFile: async (path, content) => {
      files.set(path, content);
      let entry = entries.find((e) => e.path === path);
      if (!entry) {
        entry = {
          kind: "file",
          mtime: new Date().toISOString(),
          name: path.split("/").at(-1) ?? path,
          path,
          size: content.length,
        };
        entries.push(entry);
      } else {
        entry.mtime = new Date().toISOString();
        entry.size = content.length;
      }
    },
  };

  return {
    client,
    files,
    entries,
    readCount: () => readCounter,
    resetReadCount: () => {
      readCounter = 0;
    },
  };
}

/**
 * Dataset A: 10,000 Markdown, distributed directories, with frontmatter, headings, tags, links.
 */
export function createDatasetA(): LargeVaultFixture {
  return createLargeVaultFixture({
    fileCount: 10_000,
    flatDirectoryCount: 20,
    averageBodyBytes: 400,
    linkDensity: 0.35,
    directoryDepth: 4,
  });
}

/**
 * Dataset B: Single directory 5,000 Markdown, to expose tree quadratic complexity.
 */
export function createDatasetB(): LargeVaultFixture {
  return createLargeVaultFixture({
    fileCount: 5_000,
    flatDirectoryCount: 1,
    directoryDepth: 1,
  });
}

/**
 * Dataset C: 1,000 Markdown + attachments + hidden directories, for scanning & filtering correctness.
 */
export function createDatasetC(): LargeVaultFixture {
  return createLargeVaultFixture({
    fileCount: 1_000,
    flatDirectoryCount: 10,
    includeAttachments: true,
    includeHiddenRoots: true,
  });
}
