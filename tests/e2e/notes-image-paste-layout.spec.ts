import { expect, test, type Page } from "@playwright/test";
import { installLocalNotesBridge } from "./notes-bridge";

async function outerLayout(page: Page) {
  return page.locator(".ProseMirror").evaluate(element => {
    const ancestors = [];
    for (let node = element.parentElement; node; node = node.parentElement) {
      ancestors.push({
        name: node.className || node.tagName,
        top: node.scrollTop,
        left: node.scrollLeft,
        height: node.clientHeight,
        scrollHeight: node.scrollHeight,
      });
    }
    return ancestors;
  });
}

for (const variant of [
  { width: 1440, height: 900, theme: "mint" },
  { width: 1160, height: 700, theme: "night" },
]) {
  test(`contains PNG paste and assistant layout at ${variant.width}×${variant.height} (${variant.theme})`, async ({ page }) => {
    await installLocalNotesBridge(page);
    await page.addInitScript(theme => {
      localStorage.setItem("auris.notes.reading-theme", theme);
    }, variant.theme);
    await page.setViewportSize(variant);
    await page.goto("/notes?resumeNoteId=pronunciation-sprint");
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible();
    await expect(page.getByRole("region", { name: "笔记助手" })).toBeHidden();
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2200;
      canvas.height = 1600;
      const source = canvas.toDataURL("image/png");
      const desktop = window.shadowingDesktop!;
      const originalSave = desktop.vault!.saveFile;
      desktop.vault!.saveFile = async (path, content) => {
        if (typeof content === "string") return originalSave(path, content);
      };
      // This text-only fixture has no Electron media protocol. Supply raster
      // bytes after insertion, retaining asynchronous intrinsic-size changes.
      // Never modify ProseMirror's internal separator images.
      const observer = new MutationObserver(() => {
        document.querySelectorAll<HTMLImageElement>('.ProseMirror img[alt="pasted"]').forEach(img => {
          if (img.src !== source) img.src = source;
        });
      });
      observer.observe(document.querySelector(".ProseMirror")!, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["src"],
      });
    });
    for (let i = 0; i < 3; i++) {
      await editor.evaluate(async element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        (element as HTMLElement).focus({ preventScroll: true });
        const canvas = document.createElement("canvas");
        canvas.width = 2200;
        canvas.height = 1600;
        const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
        const clipboardData = new DataTransfer();
        clipboardData.items.add(new File([blob], "pasted.png", { type: "image/png" }));
        element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
      });
      const images = editor.locator('img[alt="pasted"]');
      await expect(images).toHaveCount(i + 1);
      await expect.poll(() => images.last().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(2200);
      await page.keyboard.press("ArrowRight");
    }
    const layout = await outerLayout(page);
    expect(layout.filter(node => [
      "notes-v2__minimal-canvas", "notes-v2-page", "desktop-app-frame__viewport",
    ].includes(node.name) && node.scrollHeight > node.height)).toEqual([]);
    expect(layout.filter(node => !node.name.includes("editor-host") && (node.top !== 0 || node.left !== 0))).toEqual([]);
    expect(layout.find(node => node.name.includes("editor-host"))!.scrollHeight).toBeGreaterThan(variant.height);
    const toolbar = page.locator(".notes-v2__corner-cluster--right");
    expect((await toolbar.boundingBox())!.y + (await toolbar.boundingBox())!.height).toBe(variant.height);
    // Even explicit programmatic scroll attempts cannot reveal a second page.
    await page.locator(".notes-v2-page").evaluate(element => { element.scrollTop = 500; });
    expect(await page.locator(".notes-v2-page").evaluate(element => element.scrollTop)).toBe(0);

    // Opening/closing the existing assistant keeps exactly one mounted session
    // and never changes the document's layout. No provider is installed here.
    await page.keyboard.press("ControlOrMeta+j");
    const picker = page.getByRole("dialog", { name: "Nia 动作选择器" });
    await expect(picker).toBeVisible();
    await picker.getByRole("combobox").fill("layout regression test");
    await picker.getByRole("combobox").press("Enter");
    const assistant = page.getByRole("region", { name: "笔记助手" });
    await expect(assistant).toBeVisible();
    await expect(page.locator(".nia-panel")).toHaveCount(1);
    await expect(assistant).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "关闭笔记助手" }).click();
    await expect(assistant).toBeHidden();
    await expect(editor).toBeFocused();
    await expect(page.locator(".nia-panel")).toHaveCount(1);
    expect(await outerLayout(page)).toEqual(layout);
  });
}
