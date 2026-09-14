import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAiViewManager } = require("../../../electron/ai-view-manager.cjs");

function createWindowDouble() {
  return {
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
  };
}

function createViewDouble() {
  return {
    setBounds: vi.fn(),
    webContents: {
      isDestroyed: vi.fn(() => false),
      loadURL: vi.fn(),
      on: vi.fn(),
      setBackgroundThrottling: vi.fn(),
      setUserAgent: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
  };
}

describe("ai-view-manager", () => {
  it("does not attach a provider view when the dock is closed", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: false,
    });

    expect(createView).not.toHaveBeenCalled();
    expect(windowDouble.contentView.addChildView).not.toHaveBeenCalled();
  });

  it("creates and attaches a provider view when the dock is open in provider mode", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    expect(createView).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "chatgpt",
        label: "ChatGPT",
        partition: "persist:shadowing-ai-chatgpt",
        url: "https://chatgpt.com",
      }),
    );
    expect(viewDouble.webContents.loadURL).toHaveBeenCalledWith("https://chatgpt.com");
    expect(viewDouble.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false);
    expect(viewDouble.webContents.setUserAgent).toHaveBeenCalledWith(
      expect.stringContaining("Chrome/"),
    );
    expect(viewDouble.setBounds).toHaveBeenCalledWith({
      height: 700,
      width: 560,
      x: 840,
      y: 40,
    });
    expect(windowDouble.contentView.addChildView).toHaveBeenCalledWith(viewDouble);
  });

  it("removes the attached view when the dock leaves provider mode", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });
    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "history",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    expect(windowDouble.contentView.removeChildView).toHaveBeenCalledWith(viewDouble);
  });

  it("preserves the last known bounds when follow-up updates omit them", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    viewDouble.setBounds.mockClear();
    windowDouble.contentView.addChildView.mockClear();
    windowDouble.contentView.removeChildView.mockClear();

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      isOpen: true,
    });

    expect(windowDouble.contentView.addChildView).not.toHaveBeenCalled();
    expect(windowDouble.contentView.removeChildView).not.toHaveBeenCalled();
    expect(viewDouble.setBounds).toHaveBeenCalledWith({
      height: 700,
      width: 560,
      x: 840,
      y: 40,
    });
  });

  it("keeps the current provider attached when bounds temporarily resolve to null", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          trustedOrigins: [],
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    windowDouble.contentView.removeChildView.mockClear();

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: null,
      isOpen: true,
    });

    expect(windowDouble.contentView.removeChildView).not.toHaveBeenCalled();
  });

  it("opens provider popup flows inside Electron with the shared provider partition", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      openExternal: vi.fn(),
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    expect(viewDouble.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const handler = viewDouble.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    const result = handler({
      url: "https://accounts.google.com/o/oauth2/v2/auth",
    });

    expect(result).toEqual(
      expect.objectContaining({
        action: "allow",
        overrideBrowserWindowOptions: expect.objectContaining({
          autoHideMenuBar: true,
          modal: true,
          parent: windowDouble,
          show: false,
          webPreferences: expect.objectContaining({
            contextIsolation: true,
            nodeIntegration: false,
            partition: "persist:shadowing-ai-chatgpt",
            sandbox: true,
          }),
        }),
      }),
    );
  });

  it("keeps non-http popup targets external", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);
    const openExternal = vi.fn();

    const manager = createAiViewManager({
      createView,
      openExternal,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    const handler = viewDouble.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    const result = handler({
      url: "mailto:support@example.com",
    });

    expect(result).toEqual({ action: "deny" });
    expect(openExternal).toHaveBeenCalledWith("mailto:support@example.com");
  });

  it("configures login popups recursively so nested auth windows stay in Electron", () => {
    const windowDouble = createWindowDouble();
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      openExternal: vi.fn(),
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    expect(viewDouble.webContents.on).toHaveBeenCalledWith(
      "did-create-window",
      expect.any(Function),
    );

    const handleDidCreateWindow = viewDouble.webContents.on.mock.calls.find(
      ([eventName]) => eventName === "did-create-window",
    )?.[1];

    const childWindowDouble = {
      once: vi.fn(),
      removeMenu: vi.fn(),
      webContents: {
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      },
    };

    handleDidCreateWindow?.(childWindowDouble);

    expect(childWindowDouble.removeMenu).toHaveBeenCalledTimes(1);
    expect(childWindowDouble.once).toHaveBeenCalledWith(
      "ready-to-show",
      expect.any(Function),
    );
    expect(childWindowDouble.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    expect(childWindowDouble.webContents.on).toHaveBeenCalledWith(
      "did-create-window",
      expect.any(Function),
    );
  });

  it("switches attached views when the active provider changes", () => {
    const windowDouble = createWindowDouble();
    const chatgptView = createViewDouble();
    const geminiView = createViewDouble();
    const createView = vi
      .fn()
      .mockImplementationOnce(() => chatgptView)
      .mockImplementationOnce(() => geminiView);

    const manager = createAiViewManager({
      createView,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
        {
          id: "gemini",
          label: "Gemini",
          partition: "persist:shadowing-ai-gemini",
          url: "https://gemini.google.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });
    manager.syncLayout({
      activeProvider: "gemini",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    expect(windowDouble.contentView.removeChildView).toHaveBeenCalledWith(chatgptView);
    expect(windowDouble.contentView.addChildView).toHaveBeenLastCalledWith(geminiView);
  });

  it("does not throw while disposing after the host window is already destroyed", () => {
    const windowDouble = {
      isDestroyed: vi.fn(() => true),
    };
    const viewDouble = createViewDouble();
    const createView = vi.fn(() => viewDouble);

    const manager = createAiViewManager({
      createView,
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          trustedOrigins: [],
          url: "https://chatgpt.com",
        },
      ],
      window: windowDouble,
    });

    manager.syncLayout({
      activeProvider: "chatgpt",
      activeView: "provider",
      bounds: { height: 700, width: 560, x: 840, y: 40 },
      isOpen: true,
    });

    expect(() => manager.dispose()).not.toThrow();
  });

  it("rejects unknown providers", () => {
    const manager = createAiViewManager({
      createView: vi.fn(),
      providers: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          partition: "persist:shadowing-ai-chatgpt",
          url: "https://chatgpt.com",
        },
      ],
      window: createWindowDouble(),
    });

    expect(() =>
      manager.syncLayout({
        activeProvider: "missing-provider",
        activeView: "provider",
        bounds: { height: 700, width: 560, x: 840, y: 40 },
        isOpen: true,
      }),
    ).toThrow(/Unknown AI provider/);
  });
});
