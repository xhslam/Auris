import type { StructuredDataFormat } from "@/features/notes/formats/structured-data";

export type StructuredSchemaSection = Readonly<{
  label: string;
  value: string;
}>;

export type StructuredSchemaMatch = Readonly<{
  id:
    | "cargo-toml"
    | "docker-compose"
    | "gha-workflow"
    | "openapi"
    | "package-json"
    | "pyproject-toml"
    | "tsconfig-json";
  label: string;
  sections: readonly StructuredSchemaSection[];
  summary: string;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function countKeys(value: unknown) {
  return Object.keys(asRecord(value) ?? {}).length;
}

function stringValue(value: unknown, fallback = "未声明") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pathInfo(path: string) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return {
    fileName: normalized.split("/").at(-1) ?? normalized,
    normalized,
  };
}

export function detectStructuredSchema(
  format: StructuredDataFormat,
  path: string,
  value: unknown,
): StructuredSchemaMatch | null {
  const root = asRecord(value);

  if (!root) {
    return null;
  }

  const { fileName, normalized } = pathInfo(path);

  if (
    format === "json" &&
    (fileName === "package.json" ||
      (typeof root.name === "string" &&
        (asRecord(root.dependencies) || asRecord(root.devDependencies))))
  ) {
    const dependencyCount =
      countKeys(root.dependencies) +
      countKeys(root.devDependencies) +
      countKeys(root.peerDependencies);

    return {
      id: "package-json",
      label: "Node.js package",
      sections: [
        { label: "名称", value: stringValue(root.name) },
        { label: "版本", value: stringValue(root.version) },
        { label: "脚本", value: String(countKeys(root.scripts)) },
        { label: "依赖", value: String(dependencyCount) },
      ],
      summary: "已按 package.json 语义识别脚本与依赖。",
    };
  }

  if (
    format === "json" &&
    (/^tsconfig(?:\..+)?\.json$/u.test(fileName) ||
      asRecord(root.compilerOptions))
  ) {
    return {
      id: "tsconfig-json",
      label: "TypeScript config",
      sections: [
        {
          label: "编译选项",
          value: String(countKeys(root.compilerOptions)),
        },
        { label: "引用项目", value: String(Array.isArray(root.references) ? root.references.length : 0) },
        { label: "继承", value: stringValue(root.extends, "无") },
      ],
      summary: "已按 tsconfig 语义识别编译选项与项目引用。",
    };
  }

  if (
    format === "yaml" &&
    (normalized.includes("/.github/workflows/") ||
      (Object.hasOwn(root, "on") && asRecord(root.jobs)))
  ) {
    return {
      id: "gha-workflow",
      label: "GitHub Actions workflow",
      sections: [
        { label: "名称", value: stringValue(root.name) },
        { label: "任务", value: String(countKeys(root.jobs)) },
        {
          label: "权限",
          value: Object.hasOwn(root, "permissions") ? "已声明" : "使用默认值",
        },
      ],
      summary: "已按 GitHub Actions 语义识别触发器、权限与 jobs。",
    };
  }

  if (
    format === "yaml" &&
    (/^(?:docker-)?compose(?:\..+)?\.ya?ml$/u.test(fileName) ||
      asRecord(root.services))
  ) {
    return {
      id: "docker-compose",
      label: "Docker Compose",
      sections: [
        { label: "服务", value: String(countKeys(root.services)) },
        { label: "网络", value: String(countKeys(root.networks)) },
        { label: "卷", value: String(countKeys(root.volumes)) },
      ],
      summary: "已按 Compose 语义识别服务、网络与持久卷。",
    };
  }

  if (
    (format === "json" || format === "yaml") &&
    (typeof root.openapi === "string" ||
      typeof root.swagger === "string" ||
      fileName.startsWith("openapi."))
  ) {
    return {
      id: "openapi",
      label: "OpenAPI specification",
      sections: [
        {
          label: "规范版本",
          value: stringValue(root.openapi ?? root.swagger),
        },
        {
          label: "API 标题",
          value: stringValue(asRecord(root.info)?.title),
        },
        { label: "路径", value: String(countKeys(root.paths)) },
        { label: "Schema", value: String(countKeys(asRecord(root.components)?.schemas)) },
      ],
      summary: "已按 OpenAPI 语义识别元数据、路径与组件。",
    };
  }

  if (
    format === "toml" &&
    (fileName === "cargo.toml" ||
      (asRecord(root.package) &&
        (asRecord(root.dependencies) || asRecord(root.workspace))))
  ) {
    const packageRecord = asRecord(root.package);

    return {
      id: "cargo-toml",
      label: "Rust Cargo manifest",
      sections: [
        { label: "包名", value: stringValue(packageRecord?.name) },
        { label: "版本", value: stringValue(packageRecord?.version) },
        { label: "依赖", value: String(countKeys(root.dependencies)) },
        {
          label: "Workspace 成员",
          value: String(
            Array.isArray(asRecord(root.workspace)?.members)
              ? (asRecord(root.workspace)?.members as unknown[]).length
              : 0,
          ),
        },
      ],
      summary: "已按 Cargo 语义识别 package、workspace 与依赖。",
    };
  }

  if (
    format === "toml" &&
    (fileName === "pyproject.toml" ||
      asRecord(root.project) ||
      asRecord(root.tool))
  ) {
    const project = asRecord(root.project);

    return {
      id: "pyproject-toml",
      label: "Python project",
      sections: [
        { label: "项目名", value: stringValue(project?.name) },
        { label: "版本", value: stringValue(project?.version) },
        {
          label: "Python",
          value: stringValue(project?.["requires-python"], "未限制"),
        },
        {
          label: "工具配置",
          value: String(countKeys(root.tool)),
        },
      ],
      summary: "已按 pyproject 语义识别项目元数据与工具配置。",
    };
  }

  return null;
}
