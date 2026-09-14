import browserWorkflowContract from "../../../electron/shared/browser-workflow-contract.cjs";
import niaWorkflowContract from "../../../electron/shared/nia-workflow-contract.cjs";

export const WORKFLOW_FILE_FAMILIES = ["nia_yaml", "browser_markdown"] as const;
export type WorkflowFileFamily = (typeof WORKFLOW_FILE_FAMILIES)[number];

export class WorkflowFileRouteError extends Error {
  readonly code:
    | "UNSUPPORTED_EXTENSION"
    | "FAMILY_EXTENSION_MISMATCH"
    | "AMBIGUOUS_FAMILY"
    | "INVALID_WORKFLOW";

  constructor(code: WorkflowFileRouteError["code"], message: string) {
    super(message);
    this.name = "WorkflowFileRouteError";
    this.code = code;
  }
}

function extensionOf(fileName: string) {
  const match = /(?:^|\/)[^/]+(\.[^.\/]+)$/u.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

function tryParseNia(source: string) {
  try {
    return niaWorkflowContract.parseNiaWorkflowYaml(source);
  } catch {
    return null;
  }
}

function tryParseBrowser(source: string) {
  try {
    return browserWorkflowContract.parseBrowserWorkflowMarkdown(source);
  } catch {
    return null;
  }
}

export function routeWorkflowFile(input: { fileName: string; source: string }) {
  if (!input || typeof input.fileName !== "string" || typeof input.source !== "string") {
    throw new WorkflowFileRouteError("INVALID_WORKFLOW", "A file name and raw source are required.");
  }
  const extension = extensionOf(input.fileName);
  if (![".yaml", ".yml", ".md", ".markdown"].includes(extension)) {
    throw new WorkflowFileRouteError(
      "UNSUPPORTED_EXTENSION",
      `Unsupported workflow extension "${extension || "(none)"}".`,
    );
  }

  const niaAst = tryParseNia(input.source);
  const browserAst = tryParseBrowser(input.source);
  const looksLikeMarkdownWorkflow = input.source.trimStart().startsWith("---");
  if (niaAst && browserAst) {
    throw new WorkflowFileRouteError(
      "AMBIGUOUS_FAMILY",
      "Workflow source matches both Nia YAML and browser Markdown families.",
    );
  }

  if (extension === ".yaml" || extension === ".yml") {
    if (browserAst || looksLikeMarkdownWorkflow) {
      throw new WorkflowFileRouteError(
        "FAMILY_EXTENSION_MISMATCH",
        "Browser Markdown workflows must use a Markdown extension.",
      );
    }
    if (!niaAst) {
      try {
        niaWorkflowContract.parseNiaWorkflowYaml(input.source);
      } catch (error) {
        throw new WorkflowFileRouteError(
          "INVALID_WORKFLOW",
          error instanceof Error ? error.message : "Invalid Nia YAML workflow.",
        );
      }
    }
    return Object.freeze({ family: "nia_yaml" as const, ast: niaAst });
  }

  if (niaAst) {
    throw new WorkflowFileRouteError(
      "FAMILY_EXTENSION_MISMATCH",
      "Nia YAML workflows must use a .yaml or .yml extension.",
    );
  }
  if (!browserAst) {
    try {
      browserWorkflowContract.parseBrowserWorkflowMarkdown(input.source);
    } catch (error) {
      throw new WorkflowFileRouteError(
        "INVALID_WORKFLOW",
        error instanceof Error ? error.message : "Invalid browser Markdown workflow.",
      );
    }
  }
  return Object.freeze({ family: "browser_markdown" as const, ast: browserAst });
}
