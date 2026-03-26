import { all, createLowlight } from "lowlight";

// Shared lowlight instance — used only by teacher-side Tiptap editors.
// Registers every language from highlight.js; bundle impact stays on teacher pages only.
export const lowlight = createLowlight(all);

export const CODE_LANGUAGES = [
  { value: "", label: "auto" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "php", label: "PHP" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
];
