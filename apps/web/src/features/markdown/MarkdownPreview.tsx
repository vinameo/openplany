import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrlTransform } from "./safeUrlTransform";
import classes from "./markdown.module.css";

export interface MarkdownPreviewProps {
  source: string;
  emptyText?: string;
  className?: string;
}

export function MarkdownPreview({
  source,
  emptyText,
  className,
}: MarkdownPreviewProps) {
  const { t } = useTranslation();

  if (!source || source.trim() === "") {
    return (
      <div className={`${classes.previewContainer} ${className ?? ""}`}>
        <span className={classes.emptyText}>
          {emptyText ?? t("workItem:markdown.nothingToPreview")}
        </span>
      </div>
    );
  }

  return (
    <div className={`${classes.previewContainer} ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrlTransform}
        components={{
          img: ({ alt }) => <span>{alt ?? ""}</span>,
          a: ({ href, children }) => {
            if (!href) {
              return <span>{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                {children}
              </a>
            );
          },
          table: ({ children, ...props }) => (
            <div className={classes.tableWrapper}>
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
