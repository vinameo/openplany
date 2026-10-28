import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";
import { safeUrlTransform } from "./safeUrlTransform";

describe("safeUrlTransform", () => {
  it("allows absolute http, https, and mailto URLs", () => {
    expect(safeUrlTransform("https://example.com/page")).toBe(
      "https://example.com/page",
    );
    expect(safeUrlTransform("http://example.com")).toBe("http://example.com");
    expect(safeUrlTransform("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
  });

  it("rejects javascript:, relative, protocol-relative, and irc schemes", () => {
    expect(safeUrlTransform("javascript:alert(1)")).toBe("");
    expect(safeUrlTransform("/relative/path")).toBe("");
    expect(safeUrlTransform("//evil.example.com")).toBe("");
    expect(safeUrlTransform("irc:chat.freenode.net")).toBe("");
    expect(safeUrlTransform("data:text/html,test")).toBe("");
  });
});

describe("MarkdownPreview", () => {
  function renderPreview(source: string, emptyText?: string) {
    return render(
      <AppUiProvider>
        <MarkdownPreview source={source} emptyText={emptyText} />
      </AppUiProvider>,
    );
  }

  it("renders empty state when source is empty or only whitespace (AC-21)", () => {
    const { rerender } = renderPreview("");
    expect(screen.getByText("Nothing to preview")).toBeInTheDocument();

    rerender(
      <AppUiProvider>
        <MarkdownPreview source={"   \n\t  "} />
      </AppUiProvider>,
    );
    expect(screen.getByText("Nothing to preview")).toBeInTheDocument();
  });

  it("renders custom emptyText when provided", () => {
    renderPreview("", "No content yet");
    expect(screen.getByText("No content yet")).toBeInTheDocument();
  });

  it("renders GFM formatting: heading, list, table, task list, code block, strikethrough (AC-21)", () => {
    const markdown = [
      "# Heading 1",
      "",
      "- Item 1",
      "- Item 2",
      "",
      "| Col A | Col B |",
      "| --- | --- |",
      "| Val 1 | Val 2 |",
      "",
      "- [x] Task done",
      "- [ ] Task pending",
      "",
      "~~strikethrough text~~",
      "",
      "```typescript",
      "const answer = 42;",
      "```",
    ].join("\n");

    renderPreview(markdown);

    expect(
      screen.getByRole("heading", { level: 1, name: "Heading 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Val 1")).toBeInTheDocument();
    expect(screen.getByText("Val 2")).toBeInTheDocument();
    expect(screen.getByText("Task done")).toBeInTheDocument();
    expect(screen.getByText("Task pending")).toBeInTheDocument();
    expect(screen.getByText("strikethrough text")).toBeInTheDocument();
    expect(screen.getByText(/const answer = 42;/)).toBeInTheDocument();
  });

  it("renders raw HTML tags and generic types as literal text without executing script (AC-21)", () => {
    const markdown = [
      "<script>alert(1)</script>",
      "",
      "<img src=x onerror=alert(1)>",
      "",
      "Array<string>",
    ].join("\n");

    const { container } = renderPreview(markdown);

    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.textContent).toContain("Array<string>");

    // Verify no script or img elements were inserted in the DOM
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("renders images as plain alt text without creating <img> tags or network requests (AC-21)", () => {
    renderPreview("![photo description](https://example.com/photo.png)");

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("photo description")).toBeInTheDocument();
  });

  it("renders http and https links opening in new tab with required rel attributes (AC-21)", () => {
    renderPreview("[Safe Link](https://example.com)");

    const link = screen.getByRole("link", { name: "Safe Link" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("renders untrusted links as plain text without <a> tag (AC-21)", () => {
    const markdown = [
      "[bad link](javascript:alert(1))",
      "",
      "[rel link](/internal/path)",
      "",
      "[proto link](//evil.example.com)",
      "",
      "[irc link](irc:chat)",
    ].join("\n");

    renderPreview(markdown);

    // None should be links
    expect(screen.queryByRole("link")).toBeNull();

    // All should be rendered as plain text
    expect(screen.getByText("bad link")).toBeInTheDocument();
    expect(screen.getByText("rel link")).toBeInTheDocument();
    expect(screen.getByText("proto link")).toBeInTheDocument();
    expect(screen.getByText("irc link")).toBeInTheDocument();
  });

  it("renders 50,000 character description efficiently (R-06)", () => {
    // Generate 50,000 characters of diverse markdown
    const line =
      "## Section heading\n\nThis is a sample paragraph with **bold**, *italic*, and `code`.\n\n";
    const repeatCount = Math.ceil(50000 / line.length);
    const hugeMarkdown = line.repeat(repeatCount).slice(0, 50000);

    const start = performance.now();
    renderPreview(hugeMarkdown);
    const duration = performance.now() - start;

    // R-06 benchmark: records render time for 50,000 char description
    expect(duration).toBeLessThan(1500);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(
      0,
    );
  });
});
