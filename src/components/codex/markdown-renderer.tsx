import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { openExternalLink } from "@/actions/shell";
import "highlight.js/styles/github-dark.css";

type CopyButtonProps = {
  code: string;
};

function CopyButton({ code }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy code to clipboard"
      className="absolute top-2 right-2 rounded px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Code blocks with copy button
        pre({ children, ...props }) {
          // Extract text content from the code element
          const codeEl =
            children &&
            typeof children === "object" &&
            "props" in (children as React.ReactElement)
              ? (children as React.ReactElement)
              : null;
          const codeText =
            typeof codeEl?.props?.children === "string"
              ? codeEl.props.children
              : "";

          return (
            <div className="relative group">
              <pre {...props}>{children}</pre>
              <CopyButton code={codeText} />
            </div>
          );
        },
        // Links open in system browser
        a({ href, children, ...props }) {
          return (
            <a
              {...props}
              href={href}
              onClick={(e) => {
                if (href) {
                  e.preventDefault();
                  openExternalLink(href);
                }
              }}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
