# Mobile App Conversion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current Next.js shadowing product into an iPhone + Android app using a shared codebase, while preserving all existing functionality and adding the platform abstractions needed for mobile-native recording, storage, notifications, sharing, and subscription readiness.

**Architecture:** Keep the existing Next.js routes, components, and feature logic as the primary product surface, then add a Capacitor shell and a platform services layer. Browser behavior should keep working on the web, while mobile builds should route device-sensitive capabilities through narrow adapters so the same UI can run inside iOS and Android containers without dropping features.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Capacitor, native iOS/Android targets, browser storage plus mobile storage adapters

---

## File Structure

### New files to create

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\capacitor.config.ts`
  - Capacitor app configuration shared by iOS and Android targets.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\runtime.ts`
  - Platform/runtime detection helpers.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notifications\notification-service.ts`
  - Unified notification contract and platform selector.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notifications\web-notification-service.ts`
  - Browser notification implementation.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notifications\native-notification-service.ts`
  - Capacitor-backed notification implementation.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\files\file-export-service.ts`
  - Unified JSON export/share service.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\files\web-file-export-service.ts`
  - Browser download implementation.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\files\native-file-export-service.ts`
  - Mobile export/share implementation.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notes\mobile-notes-storage.ts`
  - Mobile notes storage implementation.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\services.ts`
  - Shared factory for platform-selected services.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\billing.types.ts`
  - Billing and entitlement model contracts.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\billing-service.ts`
  - Billing abstraction and platform selector.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\web-billing-service.ts`
  - No-op / unsupported billing implementation for web.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\native-billing-service.ts`
  - Mobile billing bridge scaffold.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\api\billing\entitlements\route.ts`
  - Server endpoint for returning normalized entitlement state.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\platform\runtime.test.ts`
  - Runtime detection regression tests.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\platform\notification-service.test.ts`
  - Notification selection and contract tests.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\platform\file-export-service.test.ts`
  - Export/share contract tests.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\notes\mobile-notes-storage.test.ts`
  - Mobile notes persistence tests.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\billing\billing-service.test.ts`
  - Billing service selection tests.

### Existing files to modify

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\package.json`
  - Add Capacitor/mobile scripts and required dependencies.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
  - Route notification and export behavior through platform services.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\voice-recorder-panel.tsx`
  - Keep existing browser flow but prepare for runtime-aware recorder integration.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\notes\notes-shell.tsx`
  - Select web or mobile notes storage without removing functionality.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\notes\local-notes-store.ts`
  - Add platform-aware notes storage selection.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\notes\note-types.ts`
  - Extend storage capabilities if needed for mobile import/export support.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\recordings\local-recording-store.ts`
  - Add backend override or selector for mobile-friendly implementations.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\settings\training-settings-store.ts`
  - Keep contract stable while allowing mobile-backed storage later.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\layout.tsx`
  - Add mobile-friendly metadata and viewport configuration if needed.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\README.md`
  - Document mobile build and verification steps.

### Native/platform directories expected after setup

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\ios`
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\android`

### Constraints

- Preserve current web behavior while introducing mobile support.
- Keep files focused and avoid large cross-cutting conditionals inside UI components.
- Use TDD for each new abstraction or behavior change.
- The workspace is not a Git repository, so commit steps must be skipped unless Git is initialized later.

## Implementation Tasks

### Task 1: Add Runtime Detection and Lock It with Tests

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\platform\runtime.test.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\runtime.ts`

- [ ] **Step 1: Write failing tests for platform/runtime detection**

```ts
it("treats the browser as web by default", async () => {
  const runtime = createRuntimeDetector({
    hasWindow: true,
    isCapacitorNativePlatform: false,
  });

  expect(runtime.platform).toBe("web");
});

it("treats native capacitor containers as mobile apps", async () => {
  const runtime = createRuntimeDetector({
    hasWindow: true,
    isCapacitorNativePlatform: true,
    platform: "ios",
  });

  expect(runtime.platform).toBe("ios");
  expect(runtime.isNativeApp).toBe(true);
});
```

- [ ] **Step 2: Run the runtime test and verify it fails**

Run: `npm run test -- tests/unit/platform/runtime.test.ts`

Expected: FAIL because the runtime module does not exist yet.

- [ ] **Step 3: Implement the minimal runtime detection module**

```ts
export type AppPlatform = "android" | "ios" | "web";

export function detectRuntime(): RuntimeInfo {
  // derive web vs native app runtime in one place
}
```

- [ ] **Step 4: Re-run the runtime test and verify it passes**

Run: `npm run test -- tests/unit/platform/runtime.test.ts`

Expected: PASS.

### Task 2: Add Notification and Export Platform Services

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\platform\notification-service.test.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\platform\file-export-service.test.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notifications\notification-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notifications\web-notification-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notifications\native-notification-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\files\file-export-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\files\web-file-export-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\files\native-file-export-service.ts`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`

- [ ] **Step 1: Write failing tests for notification service selection**

```ts
it("uses web notifications in the browser", async () => {
  const service = createNotificationService({
    runtime: { isNativeApp: false, platform: "web" },
  });

  expect(service.kind).toBe("web");
});

it("uses native notifications inside mobile app containers", async () => {
  const service = createNotificationService({
    runtime: { isNativeApp: true, platform: "ios" },
  });

  expect(service.kind).toBe("native");
});
```

- [ ] **Step 2: Write failing tests for JSON export routing**

```ts
it("uses browser downloads on web", async () => {
  const service = createFileExportService({
    runtime: { isNativeApp: false, platform: "web" },
  });

  expect(service.kind).toBe("web");
});

it("uses native share/export on mobile", async () => {
  const service = createFileExportService({
    runtime: { isNativeApp: true, platform: "android" },
  });

  expect(service.kind).toBe("native");
});
```

- [ ] **Step 3: Run the focused platform service tests and verify they fail**

Run: `npm run test -- tests/unit/platform/notification-service.test.ts tests/unit/platform/file-export-service.test.ts`

Expected: FAIL because the service modules do not exist yet.

- [ ] **Step 4: Implement notification and file export services with stable contracts**

```ts
export type NotificationService = {
  kind: "native" | "web";
  notifyTrainingReady: (title: string) => Promise<void>;
};

export type FileExportService = {
  kind: "native" | "web";
  exportJson: (filename: string, payload: unknown) => Promise<void>;
};
```

- [ ] **Step 5: Update `workspace-shell.tsx` to use the new services instead of direct browser APIs**

Run: replace direct `Notification` and Blob download helpers with injected or imported platform services.

- [ ] **Step 6: Re-run the focused service tests**

Run: `npm run test -- tests/unit/platform/notification-service.test.ts tests/unit/platform/file-export-service.test.ts`

Expected: PASS.

### Task 3: Add Mobile Notes Storage Without Breaking Web Notes

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\notes\mobile-notes-storage.test.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\notes\mobile-notes-storage.ts`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\notes\local-notes-store.ts`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\notes\notes-shell.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\notes\note-types.ts`

- [ ] **Step 1: Write failing tests for a mobile notes storage implementation**

```ts
it("lists, creates, saves, and deletes note pages through the mobile storage contract", async () => {
  const storage = createMobileNotesStorage(fakeFilesystemBackend);

  const page = await storage.createPage();
  await storage.savePage({ ...page, markdownBody: "# hello" });

  const pages = await storage.listPages();

  expect(pages).toHaveLength(1);
  expect((await storage.getPage(page.id))?.markdownBody).toContain("hello");
});
```

- [ ] **Step 2: Run the mobile notes storage test and verify it fails**

Run: `npm run test -- tests/unit/notes/mobile-notes-storage.test.ts`

Expected: FAIL because the mobile notes storage implementation does not exist yet.

- [ ] **Step 3: Implement a mobile notes storage backend that matches the current `NotesStorage` semantics**

Run: keep page summaries, timestamps, and markdown body behavior aligned with the web storage contract.

- [ ] **Step 4: Update notes storage selection so web keeps directory-backed storage and mobile uses app-local storage**

Run: add a runtime-aware selector in `local-notes-store.ts`.

- [ ] **Step 5: Update `NotesShell` only as needed to surface mobile-compatible wording or behavior**

Run: preserve note editor/library functionality and keep the UI contract intact.

- [ ] **Step 6: Re-run notes tests**

Run: `npm run test -- tests/unit/notes/mobile-notes-storage.test.ts tests/unit/notes`

Expected: PASS.

### Task 4: Add Billing and Entitlement Scaffolding

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\unit\billing\billing-service.test.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\billing.types.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\billing-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\web-billing-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\billing\native-billing-service.ts`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\api\billing\entitlements\route.ts`

- [ ] **Step 1: Write failing tests for billing service selection and entitlement normalization**

```ts
it("marks web billing as unsupported", async () => {
  const service = createBillingService({
    runtime: { isNativeApp: false, platform: "web" },
  });

  await expect(service.getProducts()).resolves.toEqual([]);
});

it("exposes native billing inside mobile app containers", async () => {
  const service = createBillingService({
    runtime: { isNativeApp: true, platform: "ios" },
  });

  expect(service.kind).toBe("native");
});
```

- [ ] **Step 2: Run the billing test and verify it fails**

Run: `npm run test -- tests/unit/billing/billing-service.test.ts`

Expected: FAIL because the billing modules do not exist yet.

- [ ] **Step 3: Implement minimal billing contracts and a normalized entitlement endpoint**

Run: keep the first pass intentionally narrow:
- product listing contract
- purchase restoration hook
- entitlement fetch contract
- unsupported web behavior that fails clearly instead of silently

- [ ] **Step 4: Re-run the billing tests**

Run: `npm run test -- tests/unit/billing/billing-service.test.ts`

Expected: PASS.

### Task 5: Add Capacitor Tooling and Native Shell Configuration

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\package.json`
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\capacitor.config.ts`
- Generate: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\ios`
- Generate: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\android`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\README.md`

- [ ] **Step 1: Add failing build/setup expectation by attempting Capacitor config resolution**

Run: `npx cap doctor`

Expected: FAIL before dependencies/config are added.

- [ ] **Step 2: Add Capacitor dependencies and mobile scripts**

```json
{
  "scripts": {
    "mobile:build:web": "next build --webpack",
    "mobile:sync": "cap sync",
    "mobile:open:ios": "cap open ios",
    "mobile:open:android": "cap open android"
  }
}
```

- [ ] **Step 3: Create `capacitor.config.ts` with app id, app name, and web asset configuration**

```ts
const config: CapacitorConfig = {
  appId: "com.shadowingstudio.app",
  appName: "Shadowing Studio",
  webDir: "out-or-mobile-webdir",
};
```

- [ ] **Step 4: Initialize or sync iOS and Android shells**

Run: `npx cap add ios`

Run: `npx cap add android`

Expected: native directories are created successfully.

- [ ] **Step 5: Document mobile development and verification commands**

Run: update `README.md` with the exact local workflow.

### Task 6: Run Regression Tests and Full Verification

**Files:**
- Verify all files changed in Tasks 1-5

- [ ] **Step 1: Run the focused new tests**

Run: `npm run test -- tests/unit/platform/runtime.test.ts tests/unit/platform/notification-service.test.ts tests/unit/platform/file-export-service.test.ts tests/unit/notes/mobile-notes-storage.test.ts tests/unit/billing/billing-service.test.ts`

Expected: PASS.

- [ ] **Step 2: Run relevant existing component and unit tests covering affected product areas**

Run: `npm run test -- tests/component/workspace tests/component/notes tests/unit/notes tests/unit/recordings`

Expected: PASS.

- [ ] **Step 3: Run lint if available**

Run: `npm run lint`

Expected: PASS, or note clearly if the current Next.js lint command is unsupported in this project setup.

- [ ] **Step 4: Run a production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Run Capacitor verification**

Run: `npx cap doctor`

Run: `npx cap sync`

Expected: PASS.

- [ ] **Step 6: Manual verification**

Checklist:
- Web login, workspace, notes, and assessment still work.
- JSON export works on web.
- Notes still persist on web.
- Mobile runtime selects native notification/export/billing/notes services.
- Native shells are generated and synchronized successfully.

- [ ] **Step 7: Review the final diff and perform a self-review pass**

Run: inspect changed files for:
- missing functionality
- accidental behavior regressions
- unhandled errors
- missing tests
- mobile-specific edge cases

- [ ] **Step 8: Commit if Git becomes available**

```bash
git add .
git commit -m "feat: add mobile app support with capacitor"
```

If `git status` reports that this is not a repository, skip this step.

## Risks and Mitigations

- **Risk:** Capacitor expects a web asset flow that differs from the current Next.js server-first dev setup.
  - **Mitigation:** validate the build path early and keep the mobile scripts explicit.
- **Risk:** Mobile notes storage diverges from current notes semantics.
  - **Mitigation:** test the storage contract directly and keep `NotesShell` largely unchanged.
- **Risk:** Native capability scaffolding is added without preserving web behavior.
  - **Mitigation:** select implementations through platform services and run existing web tests after every major step.
- **Risk:** Billing scaffolding appears complete but is only partial.
  - **Mitigation:** keep the first billing pass explicit about unsupported behavior and verify the contract with tests.

## Review Notes

- Plan-document subagent review was skipped because this session does not have explicit user permission to delegate work to subagents.
