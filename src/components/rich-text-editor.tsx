"use client";

import { useEffect, useRef } from "react";
import { richTextToPlain } from "@/lib/assignments-shared";

type Command =
  | "bold"
  | "italic"
  | "underline"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "justifyLeft"
  | "justifyCenter"
  | "justifyRight"
  | "removeFormat";

function ToolButton({
  label,
  title,
  onClick,
  disabled,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="rte-tool"
      aria-label={label}
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Start typing your answer here…",
  minHeight = 220,
  ariaLabel = "Answer",
}: {
  value: string;
  onChange: (html: string, text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastValue = useRef<string>("");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (value !== lastValue.current && element.innerHTML !== value) {
      element.innerHTML = value;
      lastValue.current = value;
    }
  }, [value]);

  function emit() {
    const element = ref.current;
    if (!element) return;
    lastValue.current = element.innerHTML;
    onChange(element.innerHTML, richTextToPlain(element.innerHTML));
  }

  function run(command: Command) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  function formatBlock(tag: "h2" | "h3" | "p" | "blockquote") {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand("formatBlock", false, tag);
    emit();
  }

  return (
    <div className={`rte ${disabled ? "rte--disabled" : ""}`}>
      <div className="rte-toolbar" role="toolbar" aria-label="Writing tools">
        <ToolButton label="Bold" title="Bold (Ctrl+B)" onClick={() => run("bold")} disabled={disabled}>
          <strong>B</strong>
        </ToolButton>
        <ToolButton label="Italic" title="Italic (Ctrl+I)" onClick={() => run("italic")} disabled={disabled}>
          <em>I</em>
        </ToolButton>
        <ToolButton label="Underline" title="Underline (Ctrl+U)" onClick={() => run("underline")} disabled={disabled}>
          <span style={{ textDecoration: "underline" }}>U</span>
        </ToolButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolButton label="Heading 2" title="Heading 2" onClick={() => formatBlock("h2")} disabled={disabled}>
          H2
        </ToolButton>
        <ToolButton label="Heading 3" title="Heading 3" onClick={() => formatBlock("h3")} disabled={disabled}>
          H3
        </ToolButton>
        <ToolButton label="Paragraph" title="Paragraph" onClick={() => formatBlock("p")} disabled={disabled}>
          ¶
        </ToolButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolButton label="Bulleted list" title="Bulleted list" onClick={() => run("insertUnorderedList")} disabled={disabled}>
          •–
        </ToolButton>
        <ToolButton label="Numbered list" title="Numbered list" onClick={() => run("insertOrderedList")} disabled={disabled}>
          1.
        </ToolButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolButton label="Align left" title="Align left" onClick={() => run("justifyLeft")} disabled={disabled}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
          </svg>
        </ToolButton>
        <ToolButton label="Align centre" title="Align centre" onClick={() => run("justifyCenter")} disabled={disabled}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
          </svg>
        </ToolButton>
        <ToolButton label="Align right" title="Align right" onClick={() => run("justifyRight")} disabled={disabled}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
          </svg>
        </ToolButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolButton label="Clear formatting" title="Clear formatting" onClick={() => run("removeFormat")} disabled={disabled}>
          Tx
        </ToolButton>
      </div>

      <div
        ref={ref}
        className="rte-page"
        contentEditable={!disabled}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
        suppressContentEditableWarning
      />
    </div>
  );
}
