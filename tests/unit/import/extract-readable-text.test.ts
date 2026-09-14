import { extractReadableTextFromHtml } from "@/features/import/extract-readable-text";

describe("extractReadableTextFromHtml", () => {
  it("keeps the title and body paragraphs while dropping scripts and style noise", () => {
    const text = extractReadableTextFromHtml(`
      <html>
        <head>
          <title>Reader Article</title>
          <style>body { color: red; }</style>
          <script>console.log("ignore")</script>
        </head>
        <body>
          <main>
            <h1>Learning in context</h1>
            <p>Shadowing works best with natural rhythm.</p>
            <p>Read aloud, then repeat with confidence.</p>
          </main>
        </body>
      </html>
    `);

    expect(text).toContain("Reader Article");
    expect(text).toContain("Learning in context");
    expect(text).toContain("Shadowing works best with natural rhythm.");
    expect(text).toContain("Read aloud, then repeat with confidence.");
    expect(text).not.toContain("console.log");
    expect(text).not.toContain("color: red");
  });
});
