import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StructuredDataPreview } from "@/components/notes-v2/structured-data-preview";

describe("StructuredDataPreview", () => {
  it("renders nested structured values as a bounded accessible tree", () => {
    render(
      <StructuredDataPreview
        format="json"
        source='{"lesson":{"name":"Grammar","score":92},"complete":true}'
      />,
    );

    expect(screen.getByRole("tree", { name: "JSON 结构预览" })).toBeInTheDocument();
    expect(screen.getByText("lesson")).toBeInTheDocument();
    expect(screen.getByText("Grammar")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("shows parser failures without evaluating or hiding the source", () => {
    render(<StructuredDataPreview format="json" source='{"broken":}' />);

    expect(screen.getByRole("alert")).toHaveTextContent("结构预览无法解析");
  });

  it("adds a schema-aware summary while retaining the generic tree", () => {
    render(
      <StructuredDataPreview
        format="json"
        path="project/package.json"
        source='{"name":"auris","version":"1.0.0","scripts":{"test":"vitest"},"dependencies":{"react":"19"}}'
      />,
    );

    expect(
      screen.getByRole("region", { name: "识别到的结构类型" }),
    ).toHaveAttribute("data-schema", "package-json");
    expect(screen.getByText("Node.js package")).toBeInTheDocument();
    expect(screen.getAllByText("auris")).toHaveLength(2);
    expect(screen.getByRole("tree")).toBeInTheDocument();
  });

  it("detects workflow schemas from path and parsed shape", () => {
    render(
      <StructuredDataPreview
        format="yaml"
        path="project/.github/workflows/ci.yml"
        source={"name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest"}
      />,
    );

    expect(screen.getByText("GitHub Actions workflow")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "识别到的结构类型" }),
    ).toHaveAttribute("data-schema", "gha-workflow");
  });
});
