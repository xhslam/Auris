import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createExternalMarkdownFiles,
  collectMarkdownOpenPaths,
  readBoundedMarkdownText,
  isSafeAbsoluteLinkedMarkdownPath,
  hash,
} = require("../../../electron/external-markdown-files.cjs");

interface ExternalMarkdownPayload {
  diskHash?: string;
  diskSource?: string;
  fileName: string;
  id: string;
  mtime: string;
  path: string;
  rawSource: string;
  savedSource: string;
  sourceHash?: string;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auris-external-md-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
});

describe("collectMarkdownOpenPaths", () => {
  it("filters non-markdown extensions and CLI flags", () => {
    const args = ["--debug", "-v", "note.md", "script.js", "doc.markdown", "other.txt", "comp.mdx"];
    const collected = collectMarkdownOpenPaths(args, tempDir);
    expect(collected).toEqual([
      path.resolve(tempDir, "note.md"),
      path.resolve(tempDir, "doc.markdown"),
      path.resolve(tempDir, "comp.mdx"),
    ]);
  });

  it("deduplicates paths ignoring case on Windows", () => {
    const args = ["note.md", "note.md", "NOTE.MD"];
    const collected = collectMarkdownOpenPaths(args, tempDir);
    if (process.platform === "win32") {
      expect(collected).toHaveLength(1);
    } else {
      expect(collected).toHaveLength(2);
    }
  });
});

describe("isSafeAbsoluteLinkedMarkdownPath", () => {
  it("accepts local absolute paths while rejecting UNC and drive-relative paths", () => {
    expect(isSafeAbsoluteLinkedMarkdownPath("C:/Vault/A.md", "win32")).toBe(true);
    expect(isSafeAbsoluteLinkedMarkdownPath("C:Vault/A.md", "win32")).toBe(false);
    expect(isSafeAbsoluteLinkedMarkdownPath("\\\\host\\share\\A.md", "win32")).toBe(false);
    expect(isSafeAbsoluteLinkedMarkdownPath("/Users/me/A.md", "darwin")).toBe(true);
    expect(isSafeAbsoluteLinkedMarkdownPath("//host/share/A.md", "darwin")).toBe(false);
    expect(isSafeAbsoluteLinkedMarkdownPath("relative/A.md", "darwin")).toBe(false);
  });
});

describe("readBoundedMarkdownText & decodeAndValidateMarkdown", () => {
  it("strips UTF-8 BOM automatically and does not include \\uFEFF", async () => {
    const filePath = path.join(tempDir, "bom.md");
    const bomBuffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("# Heading with BOM\n\nContent", "utf8"),
    ]);
    await fs.writeFile(filePath, bomBuffer);

    const result = await readBoundedMarkdownText(fs, filePath);
    expect(result.text.startsWith("# Heading")).toBe(true);
    expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
    expect(result.text).toBe("# Heading with BOM\n\nContent");
  });

  it("rejects invalid UTF-8 byte sequences", async () => {
    const filePath = path.join(tempDir, "invalid-utf8.md");
    await fs.writeFile(filePath, Buffer.from([0xff, 0xfe, 0x12, 0x34]));

    await expect(readBoundedMarkdownText(fs, filePath)).rejects.toThrow(
      "EXTERNAL_MARKDOWN_FILE_NOT_UTF8",
    );
  });

  it("rejects binary files containing NUL bytes", async () => {
    const filePath = path.join(tempDir, "binary.md");
    await fs.writeFile(filePath, Buffer.from("Hello\u0000World", "utf8"));

    await expect(readBoundedMarkdownText(fs, filePath)).rejects.toThrow(
      "EXTERNAL_MARKDOWN_FILE_NOT_TEXT",
    );
  });

  it("enforces max byte limits safely with bounded read", async () => {
    const filePath = path.join(tempDir, "small-limit.md");
    await fs.writeFile(filePath, Buffer.from("1234567890abcdef", "utf8")); // 16 bytes

    // Max 10 bytes -> should throw TOO_LARGE
    await expect(readBoundedMarkdownText(fs, filePath, 10)).rejects.toThrow(
      "EXTERNAL_MARKDOWN_FILE_TOO_LARGE",
    );

    // Max 16 bytes -> should succeed
    const ok = await readBoundedMarkdownText(fs, filePath, 16);
    expect(ok.text).toBe("1234567890abcdef");
  });
});

describe("createExternalMarkdownFiles", () => {
  async function mockWriteFileAtomically(
    targetPath: string,
    content: string,
    encoding: string,
    beforeRename?: (resolved: string) => Promise<void>,
  ) {
    const tempPath = `${targetPath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, content, encoding as BufferEncoding);
    if (typeof beforeRename === "function") {
      await beforeRename(targetPath);
    }
    await fs.rename(tempPath, targetPath);
  }

  it("opens a clean markdown file and notifies subscribers", async () => {
    const filePath = path.join(tempDir, "test.md");
    await fs.writeFile(filePath, "# Hello", "utf8");

    const manager = createExternalMarkdownFiles({
      fs,
      writeFileAtomically: mockWriteFileAtomically,
    });

    const events1: ExternalMarkdownPayload[] = [];
    const events2: ExternalMarkdownPayload[] = [];
    manager.subscribe((payload: ExternalMarkdownPayload) => events1.push(payload));
    const listener2 = (payload: ExternalMarkdownPayload) => events2.push(payload);
    manager.subscribe(listener2);
    const unsubscribe2 = () => manager.unsubscribe(listener2);

    const record = await manager.open(filePath);
    expect(record.fileName).toBe("test.md");
    expect(record.rawSource).toBe("# Hello");
    expect(record.savedSource).toBe("# Hello");

    // Both subscribers should have received the event
    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);

    // Unsubscribe listener2
    unsubscribe2();
    await manager.open(filePath);
    expect(events1).toHaveLength(2);
    expect(events2).toHaveLength(1);
  });

  it("opens an absolute local Markdown path from a link", async () => {
    const filePath = path.join(tempDir, "linked.md");
    await fs.writeFile(filePath, "# Linked", "utf8");
    const manager = createExternalMarkdownFiles({ fs, writeFileAtomically: mockWriteFileAtomically });

    await expect(manager.openLinkedFile(filePath)).resolves.toMatchObject({
      fileName: "linked.md",
      rawSource: "# Linked",
    });
    await expect(manager.openLinkedFile("\\\\host\\share\\linked.md")).rejects.toThrow(
      "EXTERNAL_MARKDOWN_LINK_PATH_INVALID",
    );
  });

  it("prevents silent overwrite when reopening a file with dirty buffer", async () => {
    const filePath = path.join(tempDir, "concurrent.md");
    await fs.writeFile(filePath, "Original Content", "utf8");

    const manager = createExternalMarkdownFiles({
      fs,
      writeFileAtomically: mockWriteFileAtomically,
    });

    const opened = await manager.open(filePath);
    const originalHash = hash("Original Content");
    expect(opened.sourceHash).toBe(originalHash);

    // User edits in renderer (dirty buffer in renderer)
    // External editor modifies disk file
    await fs.writeFile(filePath, "External Modified Content", "utf8");
    const externalHash = hash("External Modified Content");

    // File reopened by system/user
    const reopened = await manager.open(filePath);
    // Crucial check: sourceHash must NOT be quietly overwritten to externalHash!
    expect(reopened.sourceHash).toBe(originalHash);
    expect(reopened.diskHash).toBe(externalHash);
    expect(reopened.diskSource).toBe("External Modified Content");

    // Now if user tries to save without overwrite confirmation, it MUST reject!
    await expect(
      manager.save(reopened.id, "User Dirty Content", false),
    ).rejects.toThrow(`EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK:${externalHash}`);

    // External file remains intact!
    const diskAfter = await fs.readFile(filePath, "utf8");
    expect(diskAfter).toBe("External Modified Content");
  });

  it("allows safe baseline acceptance when renderer confirms buffer is clean", async () => {
    const filePath = path.join(tempDir, "clean-sync.md");
    await fs.writeFile(filePath, "Version 1", "utf8");

    const manager = createExternalMarkdownFiles({
      fs,
      writeFileAtomically: mockWriteFileAtomically,
    });

    const opened = await manager.open(filePath);
    await fs.writeFile(filePath, "Version 2", "utf8");
    const v2Hash = hash("Version 2");

    await manager.open(filePath);

    // Renderer confirms buffer was clean and updates baseline
    manager.acceptCleanBaseline(opened.id, "Version 2", v2Hash);

    // Subsequent save from editor based on Version 2 should succeed without conflict
    await manager.save(opened.id, "Version 2 + Edit", false);
    const diskAfter = await fs.readFile(filePath, "utf8");
    expect(diskAfter).toBe("Version 2 + Edit");
  });

  it("prevents overwrite window via pre-rename check if disk changes during temporary file write", async () => {
    const filePath = path.join(tempDir, "race.md");
    await fs.writeFile(filePath, "Initial", "utf8");

    const manager = createExternalMarkdownFiles({
      fs,
      writeFileAtomically: async (
        targetPath: string,
        content: string,
        encoding: string,
        beforeRename?: (resolved: string) => Promise<void>,
      ) => {
        // Simulate disk change happening while temporary file is being prepared
        await fs.writeFile(targetPath, "External Ninja Edit", "utf8");
        if (typeof beforeRename === "function") {
          await beforeRename(targetPath);
        }
        await fs.writeFile(targetPath, content, encoding as BufferEncoding);
      },
    });

    const opened = await manager.open(filePath);

    // Saving should detect the ninja edit right before rename and reject!
    const ninjaHash = hash("External Ninja Edit");
    await expect(
      manager.save(opened.id, "Auris Saved Content", false),
    ).rejects.toThrow(`EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK:${ninjaHash}`);

    const currentDisk = await fs.readFile(filePath, "utf8");
    expect(currentDisk).toBe("External Ninja Edit");
  });

  it("protects against symbolic link replacement at save time", async () => {
    const targetFile = path.join(tempDir, "real.md");
    const otherFile = path.join(tempDir, "sensitive.md");
    await fs.writeFile(targetFile, "Safe Content", "utf8");
    await fs.writeFile(otherFile, "Sensitive Content", "utf8");

    const manager = createExternalMarkdownFiles({
      fs,
      writeFileAtomically: mockWriteFileAtomically,
    });

    const opened = await manager.open(targetFile);

    // Delete real.md and replace with symlink to sensitive.md
    await fs.rm(targetFile);
    await fs.symlink(otherFile, targetFile);

    // Saving must reject symlink replacement!
    await expect(
      manager.save(opened.id, "Malicious Overwrite", true, hash("Safe Content")),
    ).rejects.toThrow("EXTERNAL_MARKDOWN_FILE_SYMLINK_REPLACED");

    // Sensitive file should not be modified
    const sensitive = await fs.readFile(otherFile, "utf8");
    expect(sensitive).toBe("Sensitive Content");
  });

  it("blocks oversized files during save if disk file grew beyond 20MB", async () => {
    const filePath = path.join(tempDir, "grow.md");
    await fs.writeFile(filePath, "Small Initially", "utf8");

    // Create a mock fs that reports huge size on save
    let hugeOnSave = false;
    const mockFs = {
      ...fs,
      open: async (p: string, flags: string) => {
        const handle = await fs.open(p, flags);
        return {
          ...handle,
          stat: async () => {
            const st = await handle.stat();
            return {
              ...st,
              isFile: () => true,
              size: hugeOnSave ? 50 * 1024 * 1024 : st.size,
            };
          },
          read: handle.read.bind(handle),
          close: handle.close.bind(handle),
        };
      },
    };

    const manager = createExternalMarkdownFiles({
      fs: mockFs,
      writeFileAtomically: mockWriteFileAtomically,
    });

    const opened = await manager.open(filePath);
    hugeOnSave = true;

    await expect(manager.save(opened.id, "New text", false)).rejects.toThrow(
      "EXTERNAL_MARKDOWN_FILE_TOO_LARGE",
    );
  });

  it("serializes concurrent saves for the same file", async () => {
    const filePath = path.join(tempDir, "concurrent-save.md");
    await fs.writeFile(filePath, "Base", "utf8");

    const executionOrder: string[] = [];
    const manager = createExternalMarkdownFiles({
      fs,
      writeFileAtomically: async (targetPath: string, content: string) => {
        executionOrder.push(`start:${content}`);
        await new Promise((resolve) => setTimeout(resolve, 30));
        await fs.writeFile(targetPath, content, "utf8");
        executionOrder.push(`end:${content}`);
      },
    });

    const opened = await manager.open(filePath);

    // Fire two saves concurrently
    const p1 = manager.save(opened.id, "Save 1", false);
    const p2 = manager.save(opened.id, "Save 2", true, hash("Save 1"));

    await Promise.all([p1, p2]);

    expect(executionOrder).toEqual([
      "start:Save 1",
      "end:Save 1",
      "start:Save 2",
      "end:Save 2",
    ]);
  });
});
