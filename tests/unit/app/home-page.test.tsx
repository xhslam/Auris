import HomePage from "@/app/page";
import ReviewPage from "@/app/review/page";
import { ReviewPageClient } from "@/components/review/review-page-client";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }),
}));

describe("Review homepage", () => {
  it("renders the existing Review workspace as the default homepage", async () => {
    const result = await HomePage({});
    expect(result.type).toBe(ReviewPageClient);
    expect(result.props).toEqual({ initialIntent: null, initialKnowledgePointId: null });
  });

  it("keeps create and knowledge point deep links on the homepage", async () => {
    const result = await HomePage({ searchParams: Promise.resolve({
      intent: ["create-knowledge-point", "ignored"], knowledgePointId: " point-1 ",
    }) });
    expect(result.props).toEqual({ initialIntent: "create-knowledge-point", initialKnowledgePointId: "point-1" });
  });

  it("bounds point IDs and ignores unknown intents", async () => {
    const result = await HomePage({ searchParams: Promise.resolve({
      intent: "unknown", knowledgePointId: "x".repeat(200),
    }) });
    expect(result.props).toEqual({ initialIntent: null, initialKnowledgePointId: "x".repeat(128) });
  });

  it("redirects the old Review route home", async () => {
    await expect(ReviewPage({})).rejects.toThrow("redirect:/");
    expect(redirect).toHaveBeenLastCalledWith("/");
  });

  it("preserves encoded values and repeated query parameters in legacy links", async () => {
    await expect(ReviewPage({ searchParams: Promise.resolve({
      intent: "create-knowledge-point", knowledgePointId: "数学 & #1", tag: ["a", "b"], missing: undefined,
    }) })).rejects.toThrow("redirect:");
    const target = vi.mocked(redirect).mock.calls.at(-1)?.[0];
    const url = new URL(target!, "http://localhost");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("intent")).toBe("create-knowledge-point");
    expect(url.searchParams.get("knowledgePointId")).toBe("数学 & #1");
    expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
    expect(url.searchParams.has("missing")).toBe(false);
  });
});
