import DOMPurify from "dompurify";

// Allowed tags produced by Tiptap editors in this project.
// Images are allowed because teachers upload them via Cloudinary (trusted URLs).
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
  ALLOWED_ATTR: ["src", "alt", "style", "class"],
  // Strip any javascript: or data: URLs in src
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") return dirty; // SSR: DOMPurify needs DOM
  // biome-ignore lint/suspicious/noExplicitAny: dompurify config type mismatch between bundled versions
  return (DOMPurify as any).sanitize(dirty, CONFIG) as string;
}
