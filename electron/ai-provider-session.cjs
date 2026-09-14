"use strict";

const AI_PROVIDER_ACCEPT_LANGUAGES = "en-US,en;q=0.9";
const AI_PROVIDER_PERMISSION_CHECK_ALLOWLIST = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "deprecated-sync-clipboard-read",
  "fileSystem",
  "fullscreen",
  "media",
  "notifications",
  "openExternal",
  "pointerLock",
  "storage-access",
  "top-level-storage-access",
]);
const AI_PROVIDER_PERMISSION_REQUEST_ALLOWLIST = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "fileSystem",
  "fullscreen",
  "media",
  "notifications",
  "openExternal",
  "pointerLock",
  "storage-access",
  "top-level-storage-access",
]);
const configuredProviderPartitions = new Set();

function normalizeOrigin(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function getAiProviderTrustedOrigins(provider) {
  const trustedOrigins = new Set();
  const candidates = [
    provider?.url,
    ...(Array.isArray(provider?.trustedOrigins) ? provider.trustedOrigins : []),
  ];

  candidates.forEach((candidate) => {
    const normalizedOrigin = normalizeOrigin(candidate);

    if (normalizedOrigin) {
      trustedOrigins.add(normalizedOrigin);
    }
  });

  return trustedOrigins;
}

function isTrustedProviderOrigin(trustedOrigins, ...candidates) {
  return candidates.some((candidate) => {
    const normalizedOrigin = normalizeOrigin(candidate);
    return Boolean(normalizedOrigin && trustedOrigins.has(normalizedOrigin));
  });
}

function buildBrowserLikeUserAgent(options = {}) {
  const chromeVersion =
    typeof options.chromeVersion === "string" && options.chromeVersion.trim()
      ? options.chromeVersion.trim()
      : process.versions.chrome || "131.0.0.0";
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  let platformToken = "Windows NT 10.0; Win64; x64";

  if (platform === "darwin") {
    platformToken = arch === "arm64"
      ? "Macintosh; ARM Mac OS X 14_0"
      : "Macintosh; Intel Mac OS X 10_15_7";
  } else if (platform === "linux") {
    platformToken = arch === "arm64" ? "X11; Linux aarch64" : "X11; Linux x86_64";
  }

  return `Mozilla/5.0 (${platformToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

function getCurrentWebContentsUrl(webContents) {
  try {
    return webContents?.getURL?.() ?? null;
  } catch {
    return null;
  }
}

function shouldAllowProviderPermission({
  details,
  permission,
  requestingOrigin,
  trustedOrigins,
  webContents,
}, allowlist) {
  if (!allowlist.has(permission)) {
    return false;
  }

  return isTrustedProviderOrigin(
    trustedOrigins,
    requestingOrigin,
    details?.embeddingOrigin,
    details?.origin,
    details?.requestingOrigin,
    details?.requestingUrl,
    details?.securityOrigin,
    getCurrentWebContentsUrl(webContents),
  );
}

function installAiProviderSessionSupport(provider, options = {}) {
  const partition = provider?.partition;

  if (typeof partition !== "string" || !partition.trim()) {
    throw new Error("AI provider partition is required.");
  }

  const getSession =
    options.getSession ??
    ((targetPartition) => {
      const { session } = require("electron");
      return session.fromPartition(targetPartition);
    });
  const logger = typeof options.logger === "function" ? options.logger : () => undefined;
  const configuredPartitions =
    options.configuredPartitions ?? configuredProviderPartitions;
  const providerSession = getSession(partition);

  if (!providerSession) {
    throw new Error(`Unable to resolve AI provider session for partition: ${partition}`);
  }

  if (configuredPartitions.has(partition)) {
    return providerSession;
  }

  const trustedOrigins = getAiProviderTrustedOrigins(provider);
  const userAgent = options.userAgent ?? buildBrowserLikeUserAgent();

  if (typeof providerSession.setUserAgent === "function") {
    providerSession.setUserAgent(userAgent, AI_PROVIDER_ACCEPT_LANGUAGES);
  }

  if (typeof providerSession.setPermissionCheckHandler === "function") {
    providerSession.setPermissionCheckHandler(
      (webContents, permission, requestingOrigin, details) =>
        shouldAllowProviderPermission(
          {
            details,
            permission,
            requestingOrigin,
            trustedOrigins,
            webContents,
          },
          AI_PROVIDER_PERMISSION_CHECK_ALLOWLIST,
        ),
    );
  }

  if (typeof providerSession.setPermissionRequestHandler === "function") {
    providerSession.setPermissionRequestHandler(
      (webContents, permission, callback, details) => {
        const isAllowed = shouldAllowProviderPermission(
          {
            details,
            permission,
            requestingOrigin: details?.requestingOrigin,
            trustedOrigins,
            webContents,
          },
          AI_PROVIDER_PERMISSION_REQUEST_ALLOWLIST,
        );

        logger(
          `ai-provider-permission provider=${provider.id} permission=${permission} allowed=${isAllowed} origin=${details?.requestingOrigin ?? details?.origin ?? "null"}`,
        );
        callback(isAllowed);
      },
    );
  }

  if (typeof providerSession.on === "function") {
    providerSession.on("file-system-access-restricted", (_event, details, callback) => {
      const isAllowed = isTrustedProviderOrigin(trustedOrigins, details?.origin);

      logger(
        `ai-provider-file-system-access provider=${provider.id} allowed=${isAllowed} origin=${details?.origin ?? "null"} path=${details?.path ?? "null"}`,
      );
      callback(isAllowed ? "allow" : "deny");
    });
  }

  configuredPartitions.add(partition);
  return providerSession;
}

module.exports = {
  AI_PROVIDER_ACCEPT_LANGUAGES,
  AI_PROVIDER_PERMISSION_CHECK_ALLOWLIST,
  AI_PROVIDER_PERMISSION_REQUEST_ALLOWLIST,
  buildBrowserLikeUserAgent,
  getAiProviderTrustedOrigins,
  installAiProviderSessionSupport,
  isTrustedProviderOrigin,
};
