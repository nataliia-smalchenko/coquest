"use client";

import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import type { Node } from "@tiptap/pm/model";
import type { ViewMutationRecord } from "@tiptap/pm/view";
import { applyHljsInlineColors } from "@/lib/hljsColors";
import { CODE_LANGUAGES, lowlight } from "./codeHighlight";

// Selector styles
const SELECT_STYLE = [
  "position: absolute",
  "top: 8px",
  "right: 10px",
  "font-size: 11px",
  "font-family: system-ui, sans-serif",
  "border: 1px solid #d1d5db",
  "border-radius: 6px",
  "padding: 3px 22px 3px 8px",
  "color: #374151",
  "background-color: white",
  "cursor: pointer",
  "z-index: 1",
  "outline: none",
  "appearance: none",
  "-webkit-appearance: none",
  "box-shadow: 0 1px 2px rgba(0,0,0,0.06)",
  `background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1l4 4 4-4'/%3E%3C/svg%3E")`,
  "background-repeat: no-repeat",
  "background-position: right 6px center",
].join("; ");

// Extension
export const CodeBlockWithSelector = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode: Node = initialNode;

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "position: relative; margin: 0.75rem 0;";

      const pre = document.createElement("pre");
      pre.style.cssText = "margin: 0;";
      pre.style.setProperty("padding-right", "110px", "important");

      const code = document.createElement("code");
      pre.appendChild(code);
      wrapper.appendChild(pre);

      // Language selector
      const select = document.createElement("select");
      select.setAttribute("contenteditable", "false");
      select.style.cssText = SELECT_STYLE;

      for (const { value, label } of CODE_LANGUAGES) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
      }
      select.value = initialNode.attrs.language ?? "";

      select.addEventListener("change", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            language: select.value || null,
          }),
        );
      });
      select.addEventListener("mousedown", (e) => e.stopPropagation());
      select.addEventListener("click", (e) => e.stopPropagation());

      wrapper.appendChild(select);

      // Watch for ProseMirror adding/updating hljs decoration spans,
      // then apply inline colors (bypasses CSS purging by Tailwind).
      const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "childList")) {
          applyHljsInlineColors(code);
        }
      });
      observer.observe(code, {
        childList: true,
        subtree: true,
        attributes: false,
      });

      // Apply on first render (decorations may already be present)
      setTimeout(() => applyHljsInlineColors(code), 0);

      return {
        dom: wrapper,
        contentDOM: code,

        update(newNode: Node) {
          if (newNode.type.name !== initialNode.type.name) return false;
          currentNode = newNode;
          const lang = newNode.attrs.language ?? "";
          if (select.value !== lang) select.value = lang;
          return true;
        },

        stopEvent(event: Event) {
          return select.contains(event.target as globalThis.Node);
        },

        // Prevent ProseMirror from reconciling the inline styles we added
        ignoreMutation(record: ViewMutationRecord) {
          return (
            record.type === "attributes" &&
            (record.target as Element).tagName === "SPAN"
          );
        },

        destroy() {
          observer.disconnect();
        },
      };
    };
  },
}).configure({ lowlight });
