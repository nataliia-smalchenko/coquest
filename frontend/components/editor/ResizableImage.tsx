"use client";

import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";

// Explicit list of classes for Tailwind to scan (prevents JIT purging of dynamically generated classes)
// img-mw-100 img-mw-200 img-mw-300 img-mw-400 img-mw-500 img-mw-532
// img-w-25 img-w-50 img-w-75 img-w-100

const SIZE_PRESETS = [100, 200, 300, 400, 500, 532];

function ResizableImageView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const width: number = node.attrs.width ?? 532;
  const src: string = node.attrs.src ?? "";
  const alt: string = node.attrs.alt ?? "";

  return (
    <NodeViewWrapper>
      <div
        style={{
          width: "100%",
          maxWidth: width === 532 ? "100%" : `${width}px`,
          position: "relative",
          display: "inline-block",
        }}
        contentEditable={false}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            width: "100%",
            display: "block",
            borderRadius: "6px",
            outline: selected ? "2px solid #2563eb" : "none",
            outlineOffset: "2px",
          }}
        />
        {selected && (
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: "2px",
              background: "rgba(17,24,39,0.82)",
              borderRadius: "8px",
              padding: "4px 6px",
              backdropFilter: "blur(4px)",
            }}
          >
            {SIZE_PRESETS.map((size) => (
              <button
                key={size}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ width: size })}
                style={{
                  color: width === size ? "#fff" : "rgba(255,255,255,0.5)",
                  background:
                    width === size ? "rgba(255,255,255,0.18)" : "transparent",
                  border: "none",
                  borderRadius: "5px",
                  padding: "2px 7px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s",
                }}
              >
                {size}px
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 532,
        parseHTML: (el) => {
          // Match: class="img-mw-300"
          const classMwMatch = (el.getAttribute("class") ?? "").match(
            /\bimg-mw-(\d+)\b/,
          );
          if (classMwMatch) return parseInt(classMwMatch[1]);
          // Old format: class="img-w-50"
          const classWMatch = (el.getAttribute("class") ?? "").match(
            /\bimg-w-(\d+)\b/,
          );
          if (classWMatch) {
            const w = parseInt(classWMatch[1]);
            if (w <= 25) return 200;
            if (w <= 50) return 300;
            if (w <= 75) return 400;
            return 532;
          }
          // Legacy style-based format: style="width: 50%"
          const styleMatch = (el.getAttribute("style") ?? "").match(
            /width:\s*(\d+)%/,
          );
          if (styleMatch) {
            const w = parseInt(styleMatch[1]);
            if (w <= 25) return 200;
            if (w <= 50) return 300;
            if (w <= 75) return 400;
            return 532;
          }
          return 532;
        },
        renderHTML: (attrs) => ({
          class: `img-mw-${attrs.width ?? 532}`,
        }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
