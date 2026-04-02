import DOMPurify from "dompurify";

// Allowed tags produced by Tiptap editors in this project.
// Images are allowed because teachers upload them via Cloudinary (trusted URLs).

// `style` is intentionally excluded to prevent CSS-injection attacks.
// Image sizing use CSS classes instead (see TextAlignWithClass
// and ResizableImage extensions, and the corresponding rules in globals.css).
const CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "img",
    "pre",
    "code",
    "span",
  ],
  // `style` omitted: prevents CSS-injection attacks (UI redress, data exfiltration).
  ALLOWED_ATTR: ["src", "alt", "class"],
  // Strip any javascript: or data: URLs in src
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") return dirty; // SSR: DOMPurify needs DOM
  // biome-ignore lint/suspicious/noExplicitAny: dompurify config type mismatch between bundled versions
  return (DOMPurify as any).sanitize(dirty, CONFIG) as string;
}
