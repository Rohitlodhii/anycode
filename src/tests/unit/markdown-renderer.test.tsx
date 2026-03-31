import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "@/components/codex/markdown-renderer";

// Mock the shell action so IPC is not needed in tests
vi.mock("@/actions/shell", () => ({
  openExternalLink: vi.fn(),
}));

describe("MarkdownRenderer", () => {
  it("renders headings", () => {
    const { container } = render(<MarkdownRenderer content="# Heading 1" />);
    expect(container.querySelector("h1")).toBeInTheDocument();
    expect(container.querySelector("h1")?.textContent).toBe("Heading 1");
  });

  it("renders h2 and h3 headings", () => {
    const { container } = render(
      <MarkdownRenderer content={"## Heading 2\n### Heading 3"} />
    );
    expect(container.querySelector("h2")).toBeInTheDocument();
    expect(container.querySelector("h3")).toBeInTheDocument();
  });

  it("renders bold text", () => {
    const { container } = render(
      <MarkdownRenderer content="**bold text**" />
    );
    expect(container.querySelector("strong")).toBeInTheDocument();
    expect(container.querySelector("strong")?.textContent).toBe("bold text");
  });

  it("renders italic text", () => {
    const { container } = render(
      <MarkdownRenderer content="_italic text_" />
    );
    expect(container.querySelector("em")).toBeInTheDocument();
    expect(container.querySelector("em")?.textContent).toBe("italic text");
  });

  it("renders inline code", () => {
    const { container } = render(
      <MarkdownRenderer content="Use `const x = 1` here" />
    );
    expect(container.querySelector("code")).toBeInTheDocument();
    expect(container.querySelector("code")?.textContent).toBe("const x = 1");
  });

  it("renders fenced code blocks", () => {
    const { container } = render(
      <MarkdownRenderer content={"```js\nconst x = 1;\n```"} />
    );
    expect(container.querySelector("pre")).toBeInTheDocument();
    expect(container.querySelector("pre code")).toBeInTheDocument();
  });

  it("renders blockquotes", () => {
    const { container } = render(
      <MarkdownRenderer content="> This is a quote" />
    );
    expect(container.querySelector("blockquote")).toBeInTheDocument();
  });

  it("renders unordered lists", () => {
    const { container } = render(
      <MarkdownRenderer content={"- item one\n- item two"} />
    );
    expect(container.querySelector("ul")).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders ordered lists", () => {
    const { container } = render(
      <MarkdownRenderer content={"1. first\n2. second"} />
    );
    expect(container.querySelector("ol")).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const { container } = render(<MarkdownRenderer content={md} />);
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelector("th")).toBeInTheDocument();
    expect(container.querySelector("td")).toBeInTheDocument();
  });

  it("renders a copy button for code blocks", () => {
    render(<MarkdownRenderer content={"```js\nconsole.log('hi');\n```"} />);
    expect(
      screen.getByRole("button", { name: /copy code to clipboard/i })
    ).toBeInTheDocument();
  });

  it("copy button copies code to clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);

    render(<MarkdownRenderer content={"```\nhello world\n```"} />);
    const copyBtn = screen.getByRole("button", { name: /copy code to clipboard/i });
    await user.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("hello world\n");
    });
  });

  it("copy button shows 'Copied!' after click", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(<MarkdownRenderer content={"```\nsome code\n```"} />);
    const copyBtn = screen.getByRole("button", { name: /copy code to clipboard/i });
    await user.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy code to clipboard/i }).textContent).toBe("Copied!");
    });
  });

  it("applies custom className", () => {
    const { container } = render(
      <MarkdownRenderer content="hello" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
