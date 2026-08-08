"use strict";

const { shell, WebContentsView } = require("electron");
const {
  buildBrowserLikeUserAgent,
  installAiProviderSessionSupport,
} = require("./ai-provider-session.cjs");
const { AI_PROVIDERS, getAiProviderById } = require("./ai-provider-config.cjs");

const AUTH_WINDOW_HEIGHT = 760;
const AUTH_WINDOW_WIDTH = 520;
const PROVIDER_BROWSER_USER_AGENT = buildBrowserLikeUserAgent();

function createDefaultLayoutState(providers) {
  return {
    activeProvider: providers[0]?.id ?? "chatgpt",
    activeView: "provider",
    bounds: null,
    isOpen: false,
  };
}

function isPopupUrlRoutableInApp(targetUrl) {
  return typeof targetUrl === "string" && /^https?:\/\//i.test(targetUrl);
}

function isWindowDestroyed(window) {
  return Boolean(window && typeof window.isDestroyed === "function" && window.isDestroyed());
}

function getWindowContentView(window) {
  if (!window || isWindowDestroyed(window)) {
    return null;
  }

  try {
    return window.contentView ?? null;
  } catch {
    return null;
  }
}

function hasRenderableBounds(bounds) {
  return Boolean(
    bounds &&
      typeof bounds.width === "number" &&
      typeof bounds.height === "number" &&
      bounds.width > 0 &&
      bounds.height > 0,
  );
}

function createPopupWindowOptions(ownerWindow, partition) {
  return {
    autoHideMenuBar: true,
    height: AUTH_WINDOW_HEIGHT,
    modal: Boolean(ownerWindow),
    parent: ownerWindow ?? undefined,
    show: false,
    width: AUTH_WINDOW_WIDTH,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition,
      sandbox: true,
    },
  };
}

function configureManagedWebContents(webContents, ownerWindow, partition, openExternal) {
  if (!webContents || typeof webContents.setWindowOpenHandler !== "function") {
    return;
  }

  webContents.setWindowOpenHandler(({ url }) => {
    if (!isPopupUrlRoutableInApp(url)) {
      if (typeof openExternal === "function") {
        void openExternal(url);
      }

      return { action: "deny" };
    }

    return {
      action: "allow",
      overrideBrowserWindowOptions: createPopupWindowOptions(ownerWindow, partition),
    };
  });

  if (typeof webContents.on !== "function") {
    return;
  }

  webContents.on("did-create-window", (childWindow) => {
    configurePopupWindow(childWindow, partition, openExternal);
  });
}

function configurePopupWindow(popupWindow, partition, openExternal) {
  if (!popupWindow) {
    return;
  }

  if (typeof popupWindow.removeMenu === "function") {
    popupWindow.removeMenu();
  }

  if (typeof popupWindow.once === "function") {
    popupWindow.once("ready-to-show", () => {
      if (typeof popupWindow.isDestroyed === "function" && popupWindow.isDestroyed()) {
        return;
      }

      if (typeof popupWindow.show === "function") {
        popupWindow.show();
      }
    });
  }

  configureManagedWebContents(popupWindow.webContents, popupWindow, partition, openExternal);
}

function createProviderView(provider) {
  return new WebContentsView({
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: provider.partition,
      sandbox: true,
    },
  });
}

function configureProviderWebContents(webContents, provider, logger) {
  if (!webContents) {
    return;
  }

  if (typeof webContents.setBackgroundThrottling === "function") {
    webContents.setBackgroundThrottling(false);
  }

  if (typeof webContents.setUserAgent === "function") {
    webContents.setUserAgent(PROVIDER_BROWSER_USER_AGENT);
  }

  if (typeof webContents.on !== "function") {
    return;
  }

  webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (errorCode === -3 || isMainFrame === false) {
        return;
      }

      logger(
        `ai-provider-load-failed provider=${provider.id} code=${errorCode} url=${validatedUrl ?? provider.url} message=${errorDescription ?? ""}`,
      );
    },
  );

  webContents.on("render-process-gone", (_event, details) => {
    logger(
      `ai-provider-render-process-gone provider=${provider.id} reason=${details?.reason ?? "unknown"} exitCode=${details?.exitCode ?? "null"}`,
    );

    try {
      if (typeof webContents.isDestroyed === "function" && webContents.isDestroyed()) {
        return;
      }

      if (typeof webContents.loadURL === "function") {
        void webContents.loadURL(provider.url);
      }
    } catch {
      // Reloading during teardown is best-effort only.
    }
  });
}

function createAiViewManager(options) {
  const providers = Array.isArray(options?.providers) && options.providers.length > 0
    ? options.providers
    : AI_PROVIDERS;
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const window = options?.window ?? null;
  const createView = options?.createView ?? createProviderView;
  const logger = typeof options?.logger === "function" ? options.logger : () => undefined;
  const openExternal = options?.openExternal ?? ((targetUrl) => shell.openExternal(targetUrl));
  const prepareProviderSession =
    options?.prepareProviderSession ??
    (options?.createView
      ? null
      : (provider) => installAiProviderSessionSupport(provider, { logger }));
  const viewsByProviderId = new Map();
  let attachedProviderId = null;
  let attachedView = null;
  let layoutState = createDefaultLayoutState(providers);

  function getProvider(id) {
    const provider = providerById.get(id) ?? getAiProviderById(id);

    if (!provider) {
      throw new Error(`Unknown AI provider: ${id}`);
    }

    return provider;
  }

  function getOrCreateView(providerId) {
    const existingView = viewsByProviderId.get(providerId);

    if (existingView) {
      return existingView;
    }

    const provider = getProvider(providerId);
    prepareProviderSession?.(provider);
    const view = createView(provider);

    if (!view?.webContents || typeof view.webContents.loadURL !== "function") {
      throw new Error(`Invalid AI view created for provider: ${providerId}`);
    }

    configureManagedWebContents(view.webContents, window, provider.partition, openExternal);
    configureProviderWebContents(view.webContents, provider, logger);
    view.webContents.loadURL(provider.url);
    viewsByProviderId.set(providerId, view);
    return view;
  }

  function removeAttachedView() {
    const contentView = getWindowContentView(window);

    if (!attachedView || !contentView?.removeChildView) {
      attachedView = null;
      attachedProviderId = null;
      return;
    }

    try {
      contentView.removeChildView(attachedView);
    } catch {
      // Window teardown can destroy the underlying content view before cleanup runs.
    }

    attachedView = null;
    attachedProviderId = null;
  }

  function attachProviderView(providerId) {
    const contentView = getWindowContentView(window);

    if (!contentView?.addChildView) {
      return null;
    }

    const view = getOrCreateView(providerId);

    if (attachedView !== view) {
      removeAttachedView();
      contentView.addChildView(view);
      attachedView = view;
      attachedProviderId = providerId;
    }

    if (hasRenderableBounds(layoutState.bounds) && typeof view.setBounds === "function") {
      try {
        view.setBounds(layoutState.bounds);
      } catch {
        return null;
      }
    }

    return view;
  }

  function shouldRenderProvider(layoutStateSnapshot) {
    return Boolean(
      layoutStateSnapshot.isOpen &&
        layoutStateSnapshot.activeView === "provider",
    );
  }

  function syncLayout(nextLayoutState) {
    const providerId = nextLayoutState?.activeProvider ?? layoutState.activeProvider;
    getProvider(providerId);

    layoutState = {
      ...layoutState,
      ...nextLayoutState,
      activeProvider: providerId,
    };

    if (!shouldRenderProvider(layoutState)) {
      removeAttachedView();
      return layoutState;
    }

    if (!hasRenderableBounds(layoutState.bounds)) {
      if (attachedProviderId !== layoutState.activeProvider) {
        removeAttachedView();
      }

      return layoutState;
    }

    attachProviderView(layoutState.activeProvider);
    return layoutState;
  }

  return {
    dispose() {
      removeAttachedView();
      viewsByProviderId.clear();
    },
    getWebContents(providerId) {
      return viewsByProviderId.get(providerId)?.webContents ?? null;
    },
    getState() {
      return {
        ...layoutState,
      };
    },
    syncLayout,
  };
}

module.exports = {
  createAiViewManager,
};
