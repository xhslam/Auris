# Login Apple-Style Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the shared auth shell so the login page feels closer to Apple’s dark-site visual language, with subtler color, softer layering, and a tighter two-column composition.

**Architecture:** Keep the auth flow and component boundaries intact: `AuthShell` remains the structural layout wrapper, `AuthForm` keeps the logic and fields, and `globals.css` receives the major visual redesign. The implementation should focus on presentation only, using restrained grayscale gradients, lighter glass-like surfaces, and smaller inter-column spacing to create the approved “若隐若现” feel.

**Tech Stack:** Next.js 16, React 19, TypeScript, global CSS in `src/app/globals.css`, Vitest + Testing Library

---

## File Structure

### Existing files to modify

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
  - Rebalance story-area structure and tone without changing the shared shell responsibility.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-form.tsx`
  - Keep auth logic unchanged, but update control text presentation if needed to suit the new layout rhythm.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
  - Rebuild the auth-shell visual system, including background, spacing, card treatment, input presentation, and responsive tuning.

### Files to inspect for verification

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\login\page.tsx`
  - Confirm the login route still mounts the shared auth shell as expected.

### Potential test files to update or add

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-form.test.tsx`
  - If auth component tests exist or are needed, use them to protect rendering and submission behavior.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`
  - Add only if there is no current coverage and the redesign needs explicit rendering protection.

## Assumptions and Constraints

- Keep auth logic unchanged.
- Preserve the shared shell for both login and register pages.
- Do not add Apple branding or copy Apple’s exact layouts.
- The workspace is not currently a Git repository, so commit steps should be skipped unless Git becomes available.

## Implementation Tasks

### Task 1: Lock In Auth Shell Rendering Expectations

**Files:**
- Inspect or create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`
- Inspect or modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-form.test.tsx`
- Reference: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`

- [ ] **Step 1: Check whether auth component tests already exist**

Run: `Get-ChildItem tests\\component\\auth`

Expected: either existing auth tests appear, or the directory is missing.

- [ ] **Step 2: If no auth shell rendering test exists, add a small auth shell render test**

```tsx
it("renders the auth story area and form content together", () => {
  render(
    <AuthShell title="欢迎回来" subtitle="继续你的阅读练习">
      <form>
        <button type="submit">登录</button>
      </form>
    </AuthShell>,
  );

  expect(screen.getByRole("heading", { name: "欢迎回来" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
});
```

- [ ] **Step 3: If auth form tests exist, update them to use the current Chinese labels**

```tsx
screen.getByLabelText("手机号 / 邮箱");
screen.getByLabelText("密码");
screen.getByRole("button", { name: "登录" });
```

- [ ] **Step 4: Run the focused auth test file(s)**

Run: `npm run test -- tests/component/auth`

Expected: PASS, or FAIL only where outdated labels/structure need updating.

### Task 2: Rebalance the Auth Shell Layout and Content Weight

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Test: `tests/component/auth/auth-shell.test.tsx` if present

- [ ] **Step 1: Clean up any garbled copy in `AuthShell` while preserving the current content intent**

```tsx
const FEATURE_METRICS = [
  { title: "14,986", subtitle: "词汇覆盖" },
  { title: "10-30 秒", subtitle: "单词速记" },
  { title: "原文 + 译文", subtitle: "一屏对照阅读" },
  { title: "选中即查", subtitle: "阅读不中断" },
];
```

- [ ] **Step 2: Tighten the layout structure so the story area and card feel closer together**

```tsx
<main className="auth-shell">
  <section className="auth-shell__story">...</section>
  <section className="auth-shell__card">...</section>
</main>
```

- [ ] **Step 3: Reduce the left-side density by making the story content feel more editorial**

```tsx
<p className="auth-shell__story-copy">
  沉浸式双语阅读，像读纸书一样自然。
</p>
```

- [ ] **Step 4: Run auth-focused tests if present**

Run: `npm run test -- tests/component/auth`

Expected: PASS.

### Task 3: Rebuild the Visual System in `globals.css`

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Test: login route manually and via render tests

- [ ] **Step 1: Replace the auth-shell background with layered dark neutral gradients**

```css
.auth-shell {
  background:
    radial-gradient(circle at 18% 28%, rgba(255, 255, 255, 0.05), transparent 26%),
    radial-gradient(circle at 78% 74%, rgba(120, 140, 160, 0.08), transparent 24%),
    linear-gradient(180deg, #0b0c0f, #111216 42%, #0a0b0d 100%);
}
```

- [ ] **Step 2: Reduce the gap and rebalance the two-column widths**

```css
.auth-shell {
  grid-template-columns: minmax(320px, 1fr) minmax(420px, 500px);
  gap: 28px;
}
```

- [ ] **Step 3: Soften the story area typography and metrics**

```css
.auth-shell__story-copy {
  color: rgba(255, 255, 255, 0.72);
  font-size: 20px;
}
```

- [ ] **Step 4: Rework the auth card into a lighter translucent panel**

```css
.auth-shell__card-surface {
  background: rgba(19, 20, 24, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px);
}
```

- [ ] **Step 5: Restyle form controls and button to feel more restrained**

```css
.auth-shell__field input {
  background: rgba(255, 255, 255, 0.04);
}

.auth-shell__submit {
  background: linear-gradient(180deg, #f5f5f7, #d9dce1);
  color: #111216;
}
```

- [ ] **Step 6: Tune responsive breakpoints so the tighter desktop composition still collapses cleanly**

Run: inspect existing `@media (max-width: 1180px)` and `@media (max-width: 720px)` auth rules and update them to preserve the new spacing system.

### Task 4: Polish Auth Form Presentation Without Changing Logic

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-form.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Test: `tests/component/auth/auth-form.test.tsx` if present

- [ ] **Step 1: Normalize any garbled field labels and helper copy**

```tsx
<label htmlFor={`${mode}-account`}>手机号 / 邮箱</label>
<label htmlFor={`${mode}-password`}>密码</label>
```

- [ ] **Step 2: Keep helper copy but reduce visual noise through shorter, clearer wording if needed**

```tsx
<p className="auth-shell__helper">
  当前为 Demo 登录模式，输入的信息会暂存到本地数据里。
</p>
```

- [ ] **Step 3: Keep the same submit logic and route behavior**

Run: no logic changes should be introduced in `handleSubmit`.

- [ ] **Step 4: Re-run auth-focused tests**

Run: `npm run test -- tests/component/auth`

Expected: PASS.

### Task 5: Final Verification

**Files:**
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-form.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`

- [ ] **Step 1: Run auth-related tests**

Run: `npm run test -- tests/component/auth`

Expected: PASS, or skip only if the folder does not exist and note that clearly.

- [ ] **Step 2: Run the broader workspace/auth smoke suite if auth page rendering is covered elsewhere**

Run: `npm run test -- tests/component`

Expected: PASS, or narrow scope if the suite is too broad and unrelated.

- [ ] **Step 3: Run a production build smoke test**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Manually verify the login page in the browser**

Checklist:
- The page keeps a two-column layout on desktop.
- The two sides sit closer together than before.
- The background feels dark, grayscale, and atmospheric.
- The form card feels lighter and softer than before.
- Inputs and submit button remain readable and usable.
- Mobile still stacks cleanly without feeling heavy.

- [ ] **Step 5: Commit if Git becomes available**

```bash
git add src/components/auth/auth-shell.tsx \
  src/components/auth/auth-form.tsx \
  src/app/globals.css
git commit -m "feat: restyle auth shell with apple-inspired layout"
```

If `git status` reports that this is not a repository, skip this step.

## Risks and Mitigations

- **Risk:** The new grayscale palette could make the login card and background blend too much.
  - **Mitigation:** preserve silhouette through a faint border, controlled shadow, and sharper type contrast.
- **Risk:** Reducing column gap without adjusting widths could feel cramped.
  - **Mitigation:** tune `grid-template-columns` and `gap` together, not independently.
- **Risk:** Cleaning garbled copy while redesigning visuals could accidentally change auth behavior.
  - **Mitigation:** keep form logic untouched and verify with auth render/submission tests.

## Review Notes

- Plan-document subagent review was skipped because this session does not have explicit user permission to delegate work to subagents.
