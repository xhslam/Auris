"use strict";

const { z } = require("zod");

const BROWSER_TOOL_ACTIONS = Object.freeze([
  "get_state",
  "open",
  "acquire_control",
  "release_control",
  "close",
  "focus",
  "navigate",
  "wait",
  "wait_for",
  "read",
  "screenshot",
  "query",
  "console",
  "act",
  "style",
  "execute_js",
  "session_save",
  "session_load",
]);

const BROWSER_AUTHORITY_OPERATIONS = Object.freeze([
  "read",
  "attach",
  "click",
  "type",
  "scroll",
  "key",
  "style",
  "navigate",
  "publish",
  "upload",
  "eval",
  "session",
]);

const BROWSER_PUBLIC_ERROR_CODES = Object.freeze([
  "BROWSER_DISABLED",
  "WINDOW_NOT_FOUND",
  "TAB_NOT_FOUND",
  "AMBIGUOUS_TARGET",
  "STALE_NAVIGATION",
  "CONTROL_STALE",
  "OWNER_MISMATCH",
  "NO_COMMITTED_ORIGIN",
  "ORIGIN_NOT_GRANTED",
  "ATTACHMENT_REQUIRED",
  "LEASE_LOST",
  "POLICY_STALE",
  "NAVIGATION_BLOCKED",
  "OPERATION_NOT_ALLOWED",
  "APPROVAL_REQUIRED",
  "APPROVAL_EXPIRED",
  "PAYLOAD_MISMATCH",
  "PROFILE_ORIGIN_CONFINED",
  "TIMEOUT",
  "CANCELLED",
  "CONNECTION_CLOSED",
  "PAGE_CRASHED",
  "SESSION_NOT_FOUND",
  "CAPABILITY_NOT_VERIFIED",
  "WORKFLOW_INVALID",
  "WORKFLOW_UNTRUSTED",
  "NIA_PROVIDER_UNAVAILABLE",
  "NIA_PROVIDER_RESPONSE_INVALID",
]);

const BROWSER_ERROR_MESSAGES_ZH = Object.freeze({
  BROWSER_DISABLED: "浏览器能力当前未启用，请先在设置中启用后重试。",
  WINDOW_NOT_FOUND: "没有找到指定窗口，请刷新浏览器状态后重试。",
  TAB_NOT_FOUND: "没有找到指定标签页，请刷新标签页列表后重试。",
  AMBIGUOUS_TARGET: "页面目标不够明确，请重新读取页面并选择唯一目标。",
  STALE_NAVIGATION: "页面已经发生跳转，请重新读取当前页面后再操作。",
  CONTROL_STALE: "控制状态已经更新，请重新获取控制权后再操作。",
  OWNER_MISMATCH: "当前控制权属于其他任务，请切换到正确任务后重试。",
  NO_COMMITTED_ORIGIN: "页面尚未确认安全来源，请等待页面加载完成后重试。",
  ORIGIN_NOT_GRANTED: "当前网站尚未获得授权，请确认来源权限后重试。",
  ATTACHMENT_REQUIRED: "此操作需要先连接标签页，请获取控制权后重试。",
  LEASE_LOST: "浏览器控制租约已经失效，请重新获取控制权。",
  POLICY_STALE: "浏览器安全策略已经更新，请刷新状态后重新操作。",
  NAVIGATION_BLOCKED: "此跳转被安全策略阻止，请检查网址或权限设置。",
  OPERATION_NOT_ALLOWED: "当前权限不允许此操作，请调整授权或改用安全操作。",
  APPROVAL_REQUIRED: "此操作需要你的确认，请批准后继续。",
  APPROVAL_EXPIRED: "操作确认已经过期，请重新发起并及时确认。",
  PAYLOAD_MISMATCH: "操作内容与已确认内容不一致，请重新确认后执行。",
  PROFILE_ORIGIN_CONFINED: "此浏览器配置仅限已授权网站，请切换网站或配置。",
  TIMEOUT: "页面操作等待超时，请检查页面状态后重试。",
  CANCELLED: "页面操作已取消，你可以在准备好后重新发起。",
  CONNECTION_CLOSED: "浏览器连接已经关闭，请重新连接后重试。",
  PAGE_CRASHED: "页面意外停止运行，请重新加载页面后重试。",
  SESSION_NOT_FOUND: "没有找到指定浏览会话，请检查会话名称后重试。",
  CAPABILITY_NOT_VERIFIED: "浏览器能力未就绪。请在「设置 → 集成 → 浏览器自动化」确认安全门与开关后重试；不要尝试环境变量绕过。",
  WORKFLOW_INVALID: "工作流内容无效，请修正步骤后重新运行。",
  WORKFLOW_UNTRUSTED: "此工作流尚未受信任，请检查来源并确认后运行。",
  NIA_PROVIDER_UNAVAILABLE: "Nia 服务暂时不可用，请稍后重试或检查配置。",
  NIA_PROVIDER_RESPONSE_INVALID: "Nia 返回了无法识别的结果，请重试或检查配置。",
});

const BROWSER_CONTRACT_LIMITS = Object.freeze({
  id: 128,
  token: 512,
  selector: 2_048,
  text: 32_768,
  key: 64,
  url: 2_048,
  script: 65_536,
  css: 32_768,
  sessionName: 128,
  metadataValue: 512,
  timeoutMs: 120_000,
});
const BROWSER_PUBLIC_ERROR_MARKER = Symbol.for("auris.browser.public-error");

const browserToolActionSchema = z.enum(BROWSER_TOOL_ACTIONS);
const browserAuthorityOperationSchema = z.enum(BROWSER_AUTHORITY_OPERATIONS);
const browserPublicErrorCodeSchema = z.enum(BROWSER_PUBLIC_ERROR_CODES);

/** Reject any Unicode Cc in identifiers / tokens. */
function hasIdentifierControlCharacters(value) {
  return /\p{Cc}/u.test(value);
}

/**
 * Freeform text/css/script may include tab/LF/CR, but must not carry NUL or
 * other control characters that can corrupt IPC or logs.
 */
function hasFreeformControlCharacters(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(value);
}

const noIdentifierControls = (value) => !hasIdentifierControlCharacters(value);
const noFreeformControls = (value) => !hasFreeformControlCharacters(value);

const idSchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.id)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u)
  .refine(noIdentifierControls, "Control characters are not allowed.");
const tokenSchema = z
  .string()
  .min(16)
  .max(BROWSER_CONTRACT_LIMITS.token)
  .regex(/^\S+$/u)
  .refine(noIdentifierControls, "Control characters are not allowed.");
const payloadHashSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/u);
const selectorSchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.selector)
  .refine(noIdentifierControls, "Control characters are not allowed.");
const boundedTextSchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.text)
  .refine(noFreeformControls, "Control characters are not allowed.");
const keySchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.key)
  .refine(noIdentifierControls, "Control characters are not allowed.");
const sessionNameSchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.sessionName)
  .refine(noIdentifierControls, "Control characters are not allowed.");
const cssSchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.css)
  .refine(noFreeformControls, "Control characters are not allowed.");
const scriptSchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.script)
  .refine(noFreeformControls, "Control characters are not allowed.");
const timeoutSchema = z.number().int().min(0).max(BROWSER_CONTRACT_LIMITS.timeoutMs);
const browserUrlSchema = z
  .string()
  .min(1)
  .max(BROWSER_CONTRACT_LIMITS.url)
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:")
        && parsed.username === ""
        && parsed.password === ""
      );
    } catch {
      return false;
    }
  }, "Only credential-free HTTP(S) URLs are allowed.");
const browserOwnerSchema = z
  .object({
    kind: z.enum(["mcp", "workflow", "nia"]),
    id: idSchema,
  })
  .strict();

const browserTargetDescriptorSchema = z.union([
  z.object({ kind: z.literal("ref"), ref: idSchema }).strict(),
  z.object({ kind: z.literal("selector"), selector: selectorSchema }).strict(),
]);

const browserActionRequestSchema = z.union([
  z.object({ action: z.literal("get_state") }).strict(),
  z.object({ action: z.literal("open"), url: browserUrlSchema }).strict(),
  z.object({ action: z.literal("acquire_control") }).strict(),
  z.object({ action: z.literal("release_control") }).strict(),
  z.object({ action: z.literal("close") }).strict(),
  z.object({ action: z.literal("focus") }).strict(),
  z.object({ action: z.literal("navigate"), url: browserUrlSchema }).strict(),
  z.object({ action: z.literal("wait"), milliseconds: timeoutSchema }).strict(),
  z.object({
    action: z.literal("wait_for"),
    target: browserTargetDescriptorSchema,
    timeoutMs: timeoutSchema.optional(),
  }).strict(),
  z.object({ action: z.literal("read"), target: browserTargetDescriptorSchema.optional() }).strict(),
  z.object({
    action: z.literal("screenshot"),
    target: browserTargetDescriptorSchema.optional(),
    publication: z.literal("evidence").optional(),
  }).strict(),
  z.object({ action: z.literal("query"), target: browserTargetDescriptorSchema }).strict(),
  z.object({
    action: z.literal("console"),
    level: z.enum(["all", "debug", "info", "warning", "error"]).optional(),
  }).strict(),
  z.object({ action: z.literal("act"), variant: z.literal("click"), target: browserTargetDescriptorSchema }).strict(),
  z.object({
    action: z.literal("act"),
    variant: z.literal("type"),
    target: browserTargetDescriptorSchema,
    text: boundedTextSchema,
  }).strict(),
  z.object({
    action: z.literal("act"),
    variant: z.literal("scroll"),
    deltaX: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    deltaY: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  }).strict().superRefine((value, context) => {
    if ((!value.deltaX && !value.deltaY) || (value.deltaX === undefined && value.deltaY === undefined)) {
      context.addIssue({
        code: "custom",
        message: "A non-zero scroll delta is required.",
      });
    }
  }),
  z.object({ action: z.literal("act"), variant: z.literal("key"), key: keySchema }).strict(),
  z.object({
    action: z.literal("style"),
    target: browserTargetDescriptorSchema,
    css: cssSchema,
  }).strict(),
  z.object({
    action: z.literal("execute_js"),
    source: scriptSchema,
  }).strict(),
  z.object({ action: z.literal("session_save"), name: sessionNameSchema }).strict(),
  z.object({ action: z.literal("session_load"), name: sessionNameSchema }).strict(),
]);
const ALLOWED_OPERATIONS_BY_ACTION = Object.freeze({
  get_state: Object.freeze(["read"]),
  open: Object.freeze(["navigate"]),
  acquire_control: Object.freeze(["attach"]),
  release_control: Object.freeze(["attach"]),
  close: Object.freeze(["attach"]),
  focus: Object.freeze(["attach"]),
  navigate: Object.freeze(["navigate"]),
  wait: Object.freeze(["read"]),
  wait_for: Object.freeze(["read"]),
  read: Object.freeze(["read"]),
  screenshot: Object.freeze(["read", "publish"]),
  query: Object.freeze(["read"]),
  console: Object.freeze(["read"]),
  act: Object.freeze(["click", "type", "scroll", "key"]),
  style: Object.freeze(["style"]),
  execute_js: Object.freeze(["eval"]),
  session_save: Object.freeze(["session"]),
  session_load: Object.freeze(["session"]),
});

const browserCommandEnvelopeSchema = z
  .object({
    windowId: idSchema,
    tabId: idSchema,
    navigationGeneration: z.number().int().nonnegative(),
    controlEpoch: z.number().int().nonnegative(),
    owner: browserOwnerSchema,
    leaseToken: tokenSchema,
    action: browserToolActionSchema,
    authorityOperation: browserAuthorityOperationSchema,
    target: browserTargetDescriptorSchema.optional(),
    payloadHash: payloadHashSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!ALLOWED_OPERATIONS_BY_ACTION[value.action].includes(value.authorityOperation)) {
      context.addIssue({
        code: "custom",
        path: ["authorityOperation"],
        message: "Authority operation does not match the main-owned action mapping.",
      });
    }
  });

const browserCommandContextSchema = z.object({
  windowId: idSchema,
  tabId: idSchema,
  navigationGeneration: z.number().int().nonnegative(),
  controlEpoch: z.number().int().nonnegative(),
  owner: browserOwnerSchema,
  leaseToken: tokenSchema,
  payloadHash: payloadHashSchema.optional(),
}).strict();

function parseBrowserToolAction(value) {
  return browserToolActionSchema.parse(value);
}

function parseBrowserAuthorityOperation(value) {
  return browserAuthorityOperationSchema.parse(value);
}

function deriveBrowserAuthorityOperation(input) {
  const request = browserActionRequestSchema.parse(input);
  switch (request.action) {
    case "get_state":
    case "wait":
    case "wait_for":
    case "read":
    case "query":
    case "console":
      return "read";
    case "screenshot":
      return request.publication === "evidence" ? "publish" : "read";
    case "open":
    case "navigate":
      return "navigate";
    case "acquire_control":
    case "release_control":
    case "close":
    case "focus":
      return "attach";
    case "act":
      return request.variant;
    case "style":
      return "style";
    case "execute_js":
      return "eval";
    case "session_save":
    case "session_load":
      return "session";
    default:
      throw new TypeError("Unsupported browser action.");
  }
}

function createBrowserCommandEnvelope(contextInput, requestInput) {
  const context = browserCommandContextSchema.parse(contextInput);
  const request = browserActionRequestSchema.parse(requestInput);
  const candidate = {
    ...context,
    action: request.action,
    authorityOperation: deriveBrowserAuthorityOperation(request),
    ...(request.target ? { target: request.target } : {}),
  };
  return browserCommandEnvelopeSchema.parse(candidate);
}

function parseBrowserCommandEnvelope(value) {
  return browserCommandEnvelopeSchema.parse(value);
}

const SAFE_METADATA_FIELDS = Object.freeze({
  action: "string",
  approvalId: "string",
  destination: "string",
  operation: "string",
  windowId: "string",
  tabId: "string",
  origin: "string",
  sessionId: "string",
  capability: "string",
  workflowId: "string",
  retryAfterMs: "number",
});
const SENSITIVE_METADATA_PATTERN = /(?:bearer|cookie|credential|lease|password|secret|token|sk-)/iu;
const OPAQUE_APPROVAL_TARGET_PATTERN = /^target-[0-9a-f]{24}$/u;
const MAX_AMBIGUOUS_TARGETS = 32;
const MAX_SAFE_TARGET_TITLE_LENGTH = 512;

function sanitizeMetadataString(key, value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > BROWSER_CONTRACT_LIMITS.metadataValue
    || hasIdentifierControlCharacters(value)
  ) return undefined;

  if (key === "origin" || key === "destination") {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
      if (url.username !== "" || url.password !== "") return undefined;
      if (key === "origin") return url.origin;
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return undefined;
    }
  }
  if (key === "approvalId") return idSchema.safeParse(value).success ? value : undefined;
  if (SENSITIVE_METADATA_PATTERN.test(value)) return undefined;

  if (key === "action") {
    const result = browserToolActionSchema.safeParse(value);
    return result.success ? result.data : undefined;
  }
  if (key === "operation") {
    const result = browserAuthorityOperationSchema.safeParse(value);
    return result.success ? result.data : undefined;
  }
  return idSchema.safeParse(value).success ? value : undefined;
}

function sanitizeApprovalTarget(input) {
  try {
    const parsed = browserTargetDescriptorSchema.safeParse(input);
    if (!parsed.success) return undefined;
    const target = parsed.data;
    if (target.kind !== "ref" || !OPAQUE_APPROVAL_TARGET_PATTERN.test(target.ref)) return undefined;
    return Object.freeze({ kind: "ref", ref: target.ref });
  } catch {
    return undefined;
  }
}

function readOwnValue(input, key) {
  try {
    return input[key];
  } catch {
    return undefined;
  }
}

function sanitizeSafeTargetUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > BROWSER_CONTRACT_LIMITS.url) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function sanitizeAmbiguousTarget(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
    const windowId = readOwnValue(input, "windowId");
    const tabId = readOwnValue(input, "tabId");
    const title = readOwnValue(input, "title");
    const url = sanitizeSafeTargetUrl(readOwnValue(input, "url"));
    if (
      !idSchema.safeParse(windowId).success
      || !idSchema.safeParse(tabId).success
      || typeof title !== "string"
      || title.length > MAX_SAFE_TARGET_TITLE_LENGTH
      || hasIdentifierControlCharacters(title)
      || url === undefined
    ) return undefined;
    return Object.freeze({ tabId, title, url, windowId });
  } catch {
    return undefined;
  }
}

function sanitizeAmbiguousTargets(input) {
  try {
    if (!Array.isArray(input)) return undefined;
    const targets = [];
    const limit = Math.min(input.length, MAX_AMBIGUOUS_TARGETS);
    for (let index = 0; index < limit; index += 1) {
      const target = sanitizeAmbiguousTarget(readOwnValue(input, index));
      if (target) targets.push(target);
    }
    return targets.length > 0 ? Object.freeze(targets) : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeBrowserErrorMetadata(input, { allowTarget = false, allowTargets = false } = {}) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
    const safe = {};
    for (const [key, expectedType] of Object.entries(SAFE_METADATA_FIELDS)) {
      if ((key === "approvalId" || key === "destination") && !allowTarget) continue;
      const value = readOwnValue(input, key);
      if (typeof value !== expectedType) continue;
      if (expectedType === "string") {
        const sanitized = sanitizeMetadataString(key, value);
        if (sanitized !== undefined) safe[key] = sanitized;
      } else if (Number.isSafeInteger(value) && value >= 0 && value <= BROWSER_CONTRACT_LIMITS.timeoutMs) {
        safe[key] = value;
      }
    }
    if (allowTargets) {
      let rawTargets;
      try {
        rawTargets = input.targets;
      } catch {
        rawTargets = undefined;
      }
      const targets = sanitizeAmbiguousTargets(rawTargets);
      if (targets) safe.targets = targets;
    }
    if (allowTarget) {
      let rawTarget;
      try {
        rawTarget = input.target;
      } catch {
        rawTarget = undefined;
      }
      if (rawTarget !== undefined) {
        const target = sanitizeApprovalTarget(rawTarget);
        if (target) safe.target = target;
      }
    }
    return Object.keys(safe).length > 0 ? Object.freeze(safe) : undefined;
  } catch {
    return undefined;
  }
}

const CAPABILITY_HINTS_ZH = Object.freeze({
  "browser-automation-disabled":
    "浏览器自动化已关闭。请在「设置 → 集成 → 浏览器自动化」中启用 MCP 浏览器自动化。",
  "browser-automation":
    "浏览器安全门未通过，无法启用自动化。请更新到已验证的构建；不要尝试环境变量绕过。",
  "session-replay":
    "会话回放在当前生产能力中关闭（cookie / localStorage）。",
  "named-session-profiles":
    "命名会话配置在当前生产能力中关闭。",
  "cookie-replay":
    "Cookie 回放在当前生产能力中关闭。",
  "local-storage-replay":
    "localStorage 回放在当前生产能力中关闭。",
});

function resolvePublicErrorMessage(code, metadata) {
  if (
    code === "CAPABILITY_NOT_VERIFIED"
    && metadata
    && typeof metadata === "object"
    && typeof metadata.capability === "string"
  ) {
    const hint = CAPABILITY_HINTS_ZH[metadata.capability];
    if (typeof hint === "string") return hint;
  }
  return BROWSER_ERROR_MESSAGES_ZH[code];
}

function safeCapabilityError() {
  return {
    code: "CAPABILITY_NOT_VERIFIED",
    message: BROWSER_ERROR_MESSAGES_ZH.CAPABILITY_NOT_VERIFIED,
  };
}

class BrowserPublicError extends Error {
  constructor(code, metadata, cause) {
    const parsedCode = browserPublicErrorCodeSchema.parse(code);
    super(resolvePublicErrorMessage(parsedCode, metadata));
    this.name = "BrowserPublicError";
    this.code = parsedCode;
    Object.defineProperty(this, BROWSER_PUBLIC_ERROR_MARKER, {
      enumerable: false,
      value: true,
    });
    let safeMetadata;
    try {
      safeMetadata = sanitizeBrowserErrorMetadata(metadata, {
        allowTarget: parsedCode === "APPROVAL_REQUIRED",
        allowTargets: parsedCode === "AMBIGUOUS_TARGET",
      });
    } catch {
      safeMetadata = undefined;
    }
    if (safeMetadata) this.metadata = safeMetadata;
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: false,
        enumerable: false,
        value: cause,
        writable: false,
      });
    }
  }

  toJSON() {
    return serializeBrowserError(this);
  }
}

function createBrowserPublicError(code, metadata, cause) {
  return new BrowserPublicError(code, metadata, cause);
}

function serializeBrowserError(error) {
  try {
    let isPublic = false;
    try {
      isPublic = Boolean(error && error[BROWSER_PUBLIC_ERROR_MARKER] === true);
    } catch {
      return safeCapabilityError();
    }
    if (!isPublic) return safeCapabilityError();

    // Read code and metadata independently so a hostile metadata getter cannot
    // erase a valid public code or force an information-leaking throw.
    let codeValue;
    try {
      codeValue = error.code;
    } catch {
      return safeCapabilityError();
    }

    const codeResult = browserPublicErrorCodeSchema.safeParse(codeValue);
    if (!codeResult.success) return safeCapabilityError();
    const code = codeResult.data;

    let metadataValue;
    try {
      metadataValue = error.metadata;
    } catch {
      metadataValue = undefined;
    }

    const metadata = sanitizeBrowserErrorMetadata(metadataValue, {
      allowTarget: code === "APPROVAL_REQUIRED",
      allowTargets: code === "AMBIGUOUS_TARGET",
    });
    return {
      code,
      message: resolvePublicErrorMessage(code, metadataValue),
      ...(metadata ? { metadata } : {}),
    };
  } catch {
    return safeCapabilityError();
  }
}
exports.BROWSER_TOOL_ACTIONS = BROWSER_TOOL_ACTIONS;
exports.BROWSER_AUTHORITY_OPERATIONS = BROWSER_AUTHORITY_OPERATIONS;
exports.BROWSER_PUBLIC_ERROR_CODES = BROWSER_PUBLIC_ERROR_CODES;
exports.BROWSER_ERROR_MESSAGES_ZH = BROWSER_ERROR_MESSAGES_ZH;
exports.BROWSER_CONTRACT_LIMITS = BROWSER_CONTRACT_LIMITS;
exports.browserToolActionSchema = browserToolActionSchema;
exports.browserAuthorityOperationSchema = browserAuthorityOperationSchema;
exports.browserPublicErrorCodeSchema = browserPublicErrorCodeSchema;
exports.browserOwnerSchema = browserOwnerSchema;
exports.browserTargetDescriptorSchema = browserTargetDescriptorSchema;
exports.browserActionRequestSchema = browserActionRequestSchema;
exports.browserCommandEnvelopeSchema = browserCommandEnvelopeSchema;
exports.parseBrowserToolAction = parseBrowserToolAction;
exports.parseBrowserAuthorityOperation = parseBrowserAuthorityOperation;
exports.deriveBrowserAuthorityOperation = deriveBrowserAuthorityOperation;
exports.createBrowserCommandEnvelope = createBrowserCommandEnvelope;
exports.parseBrowserCommandEnvelope = parseBrowserCommandEnvelope;
exports.BrowserPublicError = BrowserPublicError;
exports.createBrowserPublicError = createBrowserPublicError;
exports.serializeBrowserError = serializeBrowserError;
exports.sanitizeBrowserApprovalTarget = sanitizeApprovalTarget;
