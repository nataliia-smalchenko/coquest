import { applyHljsInlineColors } from "./hljsColors";

// biome-ignore lint/suspicious/noExplicitAny: highlight.js core typings
let hljs: any = null;

async function getHljs() {
  if (hljs) return hljs as typeof import("highlight.js/lib/core").default;

  const [core, js, ts, python, xml, css, sql, json, bash, java, cpp] =
    await Promise.all([
      import("highlight.js/lib/core"),
      import("highlight.js/lib/languages/javascript"),
      import("highlight.js/lib/languages/typescript"),
      import("highlight.js/lib/languages/python"),
      import("highlight.js/lib/languages/xml"),
      import("highlight.js/lib/languages/css"),
      import("highlight.js/lib/languages/sql"),
      import("highlight.js/lib/languages/json"),
      import("highlight.js/lib/languages/bash"),
      import("highlight.js/lib/languages/java"),
      import("highlight.js/lib/languages/cpp"),
    ]);

  hljs = core.default;
  hljs.registerLanguage("javascript", js.default);
  hljs.registerLanguage("typescript", ts.default);
  hljs.registerLanguage("python", python.default);
  hljs.registerLanguage("html", xml.default);
  hljs.registerLanguage("xml", xml.default);
  hljs.registerLanguage("css", css.default);
  hljs.registerLanguage("sql", sql.default);
  hljs.registerLanguage("json", json.default);
  hljs.registerLanguage("bash", bash.default);
  hljs.registerLanguage("java", java.default);
  hljs.registerLanguage("cpp", cpp.default);

  return hljs as typeof import("highlight.js/lib/core").default;
}

/** Applies syntax highlighting to all un-highlighted <pre><code> blocks inside `container`. */
export async function applyHighlighting(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>(
    "pre code:not([data-hl])",
  );
  if (!blocks.length) return;

  const h = await getHljs();
  blocks.forEach((block) => {
    block.setAttribute("data-hl", "1");
    h.highlightElement(block);
    // hljs adds class-based spans; Tailwind purges those rules at build time,
    // so apply inline colors directly to guarantee they render.
    applyHljsInlineColors(block);
  });
}
