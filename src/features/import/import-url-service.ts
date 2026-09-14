/**
 * Client-side URL import service.
 * Extracts the /api/import-url fetch call so that components don't
 * contain raw network code.
 */

export type ImportUrlResult = {
  text: string;
  title: string;
};

type ImportUrlResponse = {
  message?: string;
  text?: string;
  title?: string;
};

export async function importTextFromUrl(url: string): Promise<ImportUrlResult> {
  const response = await fetch("/api/import-url", {
    body: JSON.stringify({ url }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const payload = (await response.json()) as ImportUrlResponse;

  if (!response.ok || !payload.text) {
    throw new Error(payload.message ?? "导入链接正文失败。");
  }

  return {
    text: payload.text,
    title: payload.title ?? "导入文章",
  };
}
