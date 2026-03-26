// Shared GitHub-theme color map for hljs token classes.
// Used both in the editor (MutationObserver approach) and in
// read-only display (after hljs.highlightElement).

export const HLJS_COLORS: Record<
  string,
  { color: string; italic?: boolean; bold?: boolean }
> = {
  "hljs-comment": { color: "#6a737d", italic: true },
  "hljs-quote": { color: "#6a737d", italic: true },
  "hljs-keyword": { color: "#d73a49" },
  "hljs-selector-tag": { color: "#d73a49" },
  "hljs-literal": { color: "#d73a49" },
  "hljs-section": { color: "#d73a49" },
  "hljs-link": { color: "#d73a49" },
  "hljs-string": { color: "#032f62" },
  "hljs-name": { color: "#032f62" },
  "hljs-addition": { color: "#032f62" },
  "hljs-attribute": { color: "#032f62" },
  "hljs-template-variable": { color: "#032f62" },
  "hljs-variable": { color: "#032f62" },
  "hljs-template-tag": { color: "#032f62" },
  "hljs-type": { color: "#032f62" },
  "hljs-symbol": { color: "#032f62" },
  "hljs-bullet": { color: "#032f62" },
  "hljs-regexp": { color: "#032f62" },
  "hljs-number": { color: "#005cc5" },
  "hljs-deletion": { color: "#005cc5" },
  "hljs-title": { color: "#6f42c1", bold: true },
  "hljs-built_in": { color: "#e36209" },
  "hljs-doctag": { color: "#e36209" },
  "hljs-meta": { color: "#e36209" },
  "hljs-tag": { color: "#22863a" },
  "hljs-attr": { color: "#6f42c1" },
  "hljs-subst": { color: "inherit" },
};

/** Applies inline color styles to all hljs token spans inside `container`. */
export function applyHljsInlineColors(container: HTMLElement): void {
  for (const span of container.querySelectorAll<HTMLElement>("span[class]")) {
    for (const cls of span.classList) {
      const s = HLJS_COLORS[cls];
      if (s) {
        span.style.color = s.color;
        if (s.italic) span.style.fontStyle = "italic";
        if (s.bold) span.style.fontWeight = "600";
        break;
      }
    }
  }
}
