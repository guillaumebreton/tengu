import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });
marked.use({ renderer: { checkbox: ({ checked }) => checked ? "☑ " : "☐ " } });

export function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "img"],
  });

  return <div
    class="markdown"
    dangerouslySetInnerHTML={{ __html: html }}
    ref={(element) => {
      for (const link of element?.querySelectorAll("a[href]") ?? []) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    }}
  />;
}
