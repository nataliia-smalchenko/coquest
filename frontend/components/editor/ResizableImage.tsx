"use client";

import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";

const SIZE_PRESETS = [25, 50, 75, 100];

function ResizableImageView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const width: number = node.attrs.width ?? 100;
  const src: string = node.attrs.src ?? "";
  const alt: string = node.attrs.alt ?? "";

  return (
    <NodeViewWrapper>
      <div
        style={{
          width: `${width}%`,
          maxWidth: "100%",
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
                {size}%
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
        default: 100,
        parseHTML: (el) => {
          const style = el.getAttribute("style") ?? "";
          const match = style.match(/width:\s*(\d+)%/);
          return match ? parseInt(match[1]) : 100;
        },
        renderHTML: (attrs) => ({
          style: `width: ${attrs.width ?? 100}%; max-width: 100%; display: block;`,
        }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
