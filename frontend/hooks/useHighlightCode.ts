import { useEffect, useRef } from "react";

/**
 * Lazily loads highlight.js and applies syntax highlighting to `<pre><code>`
 * blocks inside the returned ref. Re-runs whenever `deps` change (typically
 * the rendered HTML string or the resource/question being displayed).
 */
export function useHighlightCode<T extends HTMLElement>(
  deps: unknown[],
): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !el.querySelector("pre code")) return;
    import("@/lib/highlightCode").then(({ applyHighlighting }) => {
      if (ref.current) applyHighlighting(ref.current);
    });
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps passed explicitly by the caller
  }, deps);

  return ref;
}
