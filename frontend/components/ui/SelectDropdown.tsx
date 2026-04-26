"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectDropdownProps {
  options: SelectOption[];
  /** Selected value — enables value-select mode (checkmark, highlighted item) */
  value?: string;
  /** Called when user picks an option */
  onSelect: (value: string) => void;
  /** Text shown in trigger when nothing is selected */
  placeholder?: string;
  /** Label rendered above the trigger */
  label?: string;
  /** Icon shown inside the trigger button (left side) */
  triggerIcon?: React.ReactNode;
  /** Fully custom trigger content (replaces default label/icon layout) */
  triggerLabel?: React.ReactNode;
  /** "outlined" = white bordered button (default), "primary" = blue filled button */
  variant?: "outlined" | "primary";
}

export function SelectDropdown({
  options,
  value,
  onSelect,
  placeholder = "",
  label,
  triggerIcon,
  triggerLabel,
  variant = "outlined",
}: SelectDropdownProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleScroll = () => {
      if (openRef.current) {
        setRect(btnRef.current?.getBoundingClientRect() ?? null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const handleToggle = () => {
    const r = btnRef.current?.getBoundingClientRect() ?? null;
    setRect(r);
    setOpen((v) => !v);
  };

  const handleSelect = (val: string) => {
    onSelect(val);
    setOpen(false);
  };

  const isPrimary = variant === "primary";

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {label && (
        <label
          htmlFor={`select-dropdown-${uid}`}
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: 600,
            color: "#6b7280",
            marginBottom: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </label>
      )}

      <button
        ref={btnRef}
        id={`select-dropdown-${uid}`}
        type="button"
        onClick={handleToggle}
        style={{
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          border: isPrimary ? "none" : "1.5px solid",
          borderColor: open ? "#2563eb" : "#e5e7eb",
          borderRadius: "10px",
          padding: isPrimary ? "8px 16px" : "8px 12px",
          fontSize: "13px",
          fontWeight: isPrimary ? 600 : 400,
          color: isPrimary ? "white" : "#111827",
          background: isPrimary ? (open ? "#1d4ed8" : "#2563eb") : "white",
          cursor: "pointer",
          textAlign: "left",
          transition: "border-color 0.15s, background-color 0.15s",
          boxSizing: "border-box",
        }}
        onMouseEnter={(e) => {
          if (isPrimary)
            (e.currentTarget as HTMLButtonElement).style.background = "#1d4ed8";
        }}
        onMouseLeave={(e) => {
          if (isPrimary)
            (e.currentTarget as HTMLButtonElement).style.background = open
              ? "#1d4ed8"
              : "#2563eb";
        }}
      >
        {triggerLabel ?? (
          <>
            {triggerIcon && (
              <span style={{ flexShrink: 0, display: "flex" }}>
                {triggerIcon}
              </span>
            )}
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: selectedOption
                  ? isPrimary
                    ? "white"
                    : "#111827"
                  : "#9ca3af",
              }}
            >
              {selectedOption?.label ?? placeholder}
            </span>
          </>
        )}
        <ChevronDown
          size={14}
          color={isPrimary ? "white" : "#9ca3af"}
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            marginLeft: triggerLabel ? undefined : "auto",
          }}
        />
      </button>

      {open && rect && (
        <div
          style={{
            position: "fixed",
            top: rect.bottom + 4,
            left: rect.left,
            minWidth: rect.width,
            maxHeight: "240px",
            overflowY: "auto",
            background: "white",
            border: "1.5px solid #e5e7eb",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 1000,
            padding: "4px",
          }}
        >
          {options.map((opt) => {
            const active = value !== undefined && value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "none",
                  background: active ? "#eff6ff" : "transparent",
                  color: active ? "#2563eb" : "#374151",
                  fontSize: "13px",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  boxSizing: "border-box",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "transparent";
                }}
              >
                {opt.icon && (
                  <span
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      color: active ? "#2563eb" : "#9ca3af",
                    }}
                  >
                    {opt.icon}
                  </span>
                )}
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </span>
                {active && (
                  <Check
                    size={13}
                    style={{ marginLeft: "auto", flexShrink: 0 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
