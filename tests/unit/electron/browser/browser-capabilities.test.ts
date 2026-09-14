import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserCapabilities, EVAL_SCOPE } = require(
  "../../../../electron/browser/browser-capabilities.cjs",
);
const { createBrowserSecurityGates } = require(
  "../../../../electron/browser/browser-security-gates.cjs",
);

describe("browser capabilities", () => {
  it("keeps production open closed until compiled security gates are green", () => {
    const gates = createBrowserSecurityGates({
      adversarial: false,
      audit: true,
      crash: true,
      dialog: true,
      mode: true,
      reclaim: true,
      session: true,
      ux: true,
    });
    const capabilities = createBrowserCapabilities({ securityGates: gates });
    expect(capabilities.snapshot()).toMatchObject({
      automationToggleAvailable: false,
      production: false,
      securityReason: "phase4-security-incomplete:adversarial",
      securityVerified: false,
    });
    expect(() => capabilities.assertOpenAllowed()).toThrow(
      expect.objectContaining({
        code: "CAPABILITY_NOT_VERIFIED",
        metadata: expect.objectContaining({ capability: "browser-window" }),
      }),
    );
  });

  it("allows production open after gates verify and scopes eval to pristine AiSandbox", () => {
    let automationEnabled = false;
    const capabilities = createBrowserCapabilities({
      getAutomationEnabled: () => automationEnabled,
    });
    expect(capabilities.snapshot()).toMatchObject({
      automationEnabled: false,
      automationToggleAvailable: true,
      eval: expect.objectContaining({ enabled: true, scope: EVAL_SCOPE }),
      production: true,
      securityVerified: true,
      cookieReplay: false,
      namedProfiles: false,
    });
    expect(capabilities.assertOpenAllowed()).toBe(true);
    expect(() => capabilities.assertAutomationAllowed()).toThrow(
      expect.objectContaining({
        metadata: expect.objectContaining({ capability: "browser-automation-disabled" }),
      }),
    );
    automationEnabled = true;
    expect(capabilities.assertAutomationAllowed()).toBe(true);
    expect(() => capabilities.assertExecuteJsAllowed({
      automationMode: "Human",
      partitionPersistent: true,
    })).toThrow(expect.objectContaining({
      metadata: expect.objectContaining({ capability: "execute_js-mode" }),
    }));
    expect(capabilities.assertExecuteJsAllowed({
      automationMode: "AiSandbox",
      partitionPersistent: false,
      sessionInjected: false,
    })).toMatchObject({ scope: EVAL_SCOPE });
  });
});
