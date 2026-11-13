"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { richTextToPlain } from "@/lib/assignments-shared";

type Command =
  | "undo" | "redo" | "bold" | "italic" | "underline" | "strikeThrough"
  | "insertUnorderedList" | "insertOrderedList" | "justifyLeft" | "justifyCenter"
  | "justifyRight" | "subscript" | "superscript" | "removeFormat";

function countWords(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="rte-group">{children}</div>;
}

function Tool({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="rte-tool" aria-label={label} title={label} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Andika jibu lako hapa…",
  minHeight = 260,
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
  const [expanded, setExpanded] = useState(false);
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastValue.current && el.innerHTML !== value) {
      el.innerHTML = value || "";
      lastValue.current = value || "";
      const text = richTextToPlain(el.innerHTML);
      setWords(countWords(text));
      setChars(text.length);
    }
  }, [value]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [expanded]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    lastValue.current = html;
    const text = richTextToPlain(html);
    setWords(countWords(text));
    setChars(text.length);
    onChange(html, text);
  }

  function run(command: Command) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  function block(tag: "h2" | "h3" | "p" | "blockquote" | "pre") {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand("formatBlock", false, tag);
    emit();
  }

  function insertTable() {
    if (disabled) return;
    ref.current?.focus();
    const html = `<table style="border-collapse:collapse;width:100%;margin:8px 0"><thead><tr><th style="border:1px solid #94a3b8;padding:6px;background:#f1f5f9">Kichwa</th><th style="border:1px solid #94a3b8;padding:6px;background:#f1f5f9">Kichwa</th><th style="border:1px solid #94a3b8;padding:6px;background:#f1f5f9">Kichwa</th></tr></thead><tbody><tr><td style="border:1px solid #94a3b8;padding:6px">&nbsp;</td><td style="border:1px solid #94a3b8;padding:6px">&nbsp;</td><td style="border:1px solid #94a3b8;padding:6px">&nbsp;</td></tr><tr><td style="border:1px solid #94a3b8;padding:6px">&nbsp;</td><td style="border:1px solid #94a3b8;padding:6px">&nbsp;</td><td style="border:1px solid #94a3b8;padding:6px">&nbsp;</td></tr></tbody></table><p><br/></p>`;
    document.execCommand("insertHTML", false, html);
    emit();
  }

  const empty = !value || value === "<br>" || richTextToPlain(value).length === 0;

  return (
    <div className={`rte ${disabled ? "rte--disabled" : ""} ${expanded ? "rte--expanded" : ""} ${focused ? "rte--focused" : ""}`}>
      <style>{`
        .rte{border:1px solid #d7dce5;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}
        .rte--focused{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}
        .rte--expanded{position:fixed;inset:12px;z-index:60;display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(15,23,42,.25)}
        .rte-toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid #e5e7eb;background:rgba(255,255,255,.97);backdrop-filter:blur(6px)}
        .rte-group{display:flex;align-items:center;gap:2px;background:#f1f5f9;border-radius:8px;padding:2px}
        .rte-tool{display:grid;place-items:center;height:32px;min-width:32px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:#334155;cursor:pointer;font-size:13px;font-weight:600}
        .rte-tool:hover:not(:disabled){background:#fff;color:#0f172a}
        .rte-tool:disabled{opacity:.45;cursor:not-allowed}
        .rte-spacer{flex:1}
        .rte-page-wrap{background:linear-gradient(#f8fafc,#f1f5f9);padding:16px;flex:1;overflow:auto}
        .rte--expanded .rte-page-wrap{padding:20px}
        .rte-page{max-width:860px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:22px 28px;min-height:${minHeight}px;line-height:1.75;font-size:16px;color:#0f172a;outline:none;box-shadow:0 1px 2px rgba(15,23,42,.04)}
        .rte--expanded .rte-page{min-height:calc(100% - 8px)}
        .rte-page:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none}
        .rte-page h2{font-size:1.4rem;font-weight:700;margin:.6rem 0 .3rem}
        .rte-page h3{font-size:1.15rem;font-weight:700;margin:.5rem 0 .25rem}
        .rte-page p{margin:.35rem 0}
        .rte-page ul{list-style:disc;padding-left:1.5rem;margin:.4rem 0}
        .rte-page ol{list-style:decimal;padding-left:1.5rem;margin:.4rem 0}
        .rte-page blockquote{border-left:4px solid #c7d2fe;padding:.25rem .75rem;color:#334155;background:#f8fafc;margin:.5rem 0}
        .rte-page pre{background:#0f172a;color:#e2e8f0;padding:.75rem 1rem;border-radius:8px;overflow:auto;font-family:ui-monospace,monospace;font-size:.9rem}
        .rte-page table{width:100%;border-collapse:collapse;margin:.5rem 0}
        .rte-status{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid #e5e7eb;background:#fff;color:#64748b;font-size:12px}
        .rte--disabled .rte-page{background:#f8fafc;color:#334155}
      `}</style>

      {!disabled && (
        <div className="rte-toolbar" role="toolbar" aria-label="Zana za kuandika">
          <Group>
            <Tool label="Rudisha (Undo)" onClick={() => run("undo")}><Icon d="M9 14 4 9l5-5M4 9h10a5 5 0 0 1 5 5v2" /></Tool>
            <Tool label="Rudia (Redo)" onClick={() => run("redo")}><Icon d="m15 14 5-5-5-5M20 9H10a5 5 0 0 0-5 5v2" /></Tool>
          </Group>
          <Group>
            <Tool label="Kichwa H2" onClick={() => block("h2")}><span>H2</span></Tool>
            <Tool label="Kichwa H3" onClick={() => block("h3")}><span>H3</span></Tool>
            <Tool label="Aya" onClick={() => block("p")}><span>¶</span></Tool>
          </Group>
          <Group>
            <Tool label="Bold" onClick={() => run("bold")}><strong>B</strong></Tool>
            <Tool label="Italic" onClick={() => run("italic")}><em>I</em></Tool>
            <Tool label="Underline" onClick={() => run("underline")}><span style={{ textDecoration: "underline" }}>U</span></Tool>
            <Tool label="Piga mstari" onClick={() => run("strikeThrough")}><span style={{ textDecoration: "line-through" }}>S</span></Tool>
          </Group>
          <Group>
            <Tool label="Superscript (x²)" onClick={() => run("superscript")}>x²</Tool>
            <Tool label="Subscript (H₂O)" onClick={() => run("subscript")}>x₂</Tool>
          </Group>
          <Group>
            <Tool label="Pangilia kushoto" onClick={() => run("justifyLeft")}><Icon d="M4 6h16M4 10h10M4 14h16M4 18h10" /></Tool>
            <Tool label="Katikati" onClick={() => run("justifyCenter")}><Icon d="M4 6h16M7 10h10M4 14h16M7 18h10" /></Tool>
            <Tool label="Kulia" onClick={() => run("justifyRight")}><Icon d="M4 6h16M10 10h10M4 14h16M10 18h10" /></Tool>
          </Group>
          <Group>
            <Tool label="Orodha ya nukta" onClick={() => run("insertUnorderedList")}>•≡</Tool>
            <Tool label="Orodha ya namba" onClick={() => run("insertOrderedList")}>1.</Tool>
            <Tool label="Nukuu" onClick={() => block("blockquote")}>❝</Tool>
            <Tool label="Code" onClick={() => block("pre")}>{"</>"}</Tool>
          </Group>
          <Group>
            <Tool label="Ingiza jedwali" onClick={insertTable}>▦</Tool>
            <Tool label="Futa muundo" onClick={() => run("removeFormat")}>Tx</Tool>
          </Group>
          <span className="rte-spacer" />
          <Group>
            <Tool label={expanded ? "Punguza" : "Panua eneo la kuandika"} onClick={() => setExpanded((v) => !v)}>{expanded ? "⤡" : "⤢"}</Tool>
          </Group>
        </div>
      )}

      <div className="rte-page-wrap">
        <div
          ref={ref}
          className="rte-page"
          contentEditable={!disabled}
          role="textbox"
          aria-label={ariaLabel}
          aria-multiline="true"
          data-placeholder={placeholder}
          onInput={emit}
          onBlur={() => { setFocused(false); emit(); }}
          onFocus={() => setFocused(true)}
          suppressContentEditableWarning
        />
      </div>

      <div className="rte-status">
        <span>{disabled ? "Jibu limefungwa." : empty ? "Anza kuandika jibu lako." : "Unaandika… (inahifadhi kiotomatiki)"}</span>
        <span>{words} maneno · {chars} herufi{expanded ? " · Esc kupunguza" : ""}</span>
      </div>
    </div>
  );
}