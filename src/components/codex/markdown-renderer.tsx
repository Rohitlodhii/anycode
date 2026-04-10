import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { openExternalLink } from "@/actions/shell";
import { cn } from "@/utils/tailwind";
import "highlight.js/styles/github-dark.css";

function CopyButton({ code }: { code: string }) {
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
      className="absolute top-2 right-2 rounded px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
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
    <div className={cn("prose-chat", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Code blocks with copy button
          pre({ children, ...props }) {
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
          // Inline code
          code({ children, className: codeClass, ...props }) {
            // If it's inside a pre (has language class), let rehype-highlight handle it
            const isBlock = codeClass?.startsWith("language-");
            if (isBlock) {
              return <code className={codeClass} {...props}>{children}</code>;
            }
            return <code {...props}>{children}</code>;
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
          // Lists
          ul({ children, ...props }) {
            return <ul {...props}>{children}</ul>;
          },
          ol({ children, ...props }) {
            return <ol {...props}>{children}</ol>;
          },
          li({ children, ...props }) {
            return <li {...props}>{children}</li>;
          },
          // Headings
          h1({ children, ...props }) {
            return <h1 {...props}>{children}</h1>;
          },
          h2({ children, ...props }) {
            return <h2 {...props}>{children}</h2>;
          },
          h3({ children, ...props }) {
            return <h3 {...props}>{children}</h3>;
          },
          // Blockquote
          blockquote({ children, ...props }) {
            return <blockquote {...props}>{children}</blockquote>;
          },
          // Table
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto">
                <table {...props}>{children}</table>
              </div>
            );
          },
          // Strong / em
          strong({ children, ...props }) {
            return <strong {...props}>{children}</strong>;
          },
          em({ children, ...props }) {
            return <em {...props}>{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
