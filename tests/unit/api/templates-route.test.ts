import { GET } from "@/app/api/templates/route";

describe("GET /api/templates", () => {
  it("returns starter templates", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      templates: Array<{ title: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.templates.length).toBeGreaterThan(0);
  });
});
