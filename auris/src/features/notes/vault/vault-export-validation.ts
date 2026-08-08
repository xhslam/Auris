import type { VaultExportManifest } from "@/features/notes/vault/vault-export-manifest";

export type VaultExportValidationIssue = {
  code:
    | "duplicate-file-path"
    | "invalid-document"
    | "invalid-source-of-truth"
    | "invalid-version"
    | "missing-file";
  message: string;
  path?: string;
};

export type VaultExportValidationResult = {
  issues: VaultExportValidationIssue[];
  valid: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addIssue(
  issues: VaultExportValidationIssue[],
  issue: VaultExportValidationIssue,
) {
  issues.push(issue);
}

export function validateVaultExportManifest(
  manifest: VaultExportManifest,
): VaultExportValidationResult {
  const issues: VaultExportValidationIssue[] = [];
  const filePaths = new Set<string>();

  if (manifest.version !== 1) {
    addIssue(issues, {
      code: "invalid-version",
      message: `导出清单版本不受支持：${manifest.version}`,
    });
  }

  if (manifest.sourceOfTruth !== "markdown-vault") {
    addIssue(issues, {
      code: "invalid-source-of-truth",
      message: `导出清单来源不正确：${manifest.sourceOfTruth}`,
    });
  }

  manifest.files.forEach((file) => {
    if (!file.path) {
      addIssue(issues, {
        code: "invalid-document",
        message: "导出文件缺少路径。",
      });
      return;
    }

    if (filePaths.has(file.path)) {
      addIssue(issues, {
        code: "duplicate-file-path",
        message: `导出文件路径重复：${file.path}`,
        path: file.path,
      });
      return;
    }

    filePaths.add(file.path);
  });

  Object.entries(manifest.documents).forEach(([path, document]) => {
    if (!filePaths.has(path)) {
      addIssue(issues, {
        code: "missing-file",
        message: `导出清单缺少文件条目：${path}`,
        path,
      });
    }

    if (!path.toLowerCase().endsWith(".md")) {
      addIssue(issues, {
        code: "invalid-document",
        message: `导出文档路径必须是 Markdown：${path}`,
        path,
      });
    }

    if (
      !isPlainObject(document.frontmatter) ||
      !Array.isArray(document.links) ||
      !Array.isArray(document.tags) ||
      !Array.isArray(document.backlinks)
    ) {
      addIssue(issues, {
        code: "invalid-document",
        message: `导出文档结构无效：${path}`,
        path,
      });
    }
  });

  return {
    issues,
    valid: issues.length === 0,
  };
}

export function formatVaultExportValidationIssues(
  issues: VaultExportValidationIssue[],
) {
  return issues.map((issue) => issue.message).join(" ");
}
