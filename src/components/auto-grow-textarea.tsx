"use client";

import { useCallback, useEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * A textarea that grows with its content. Questions, feedback and remarks can
 * run to 50–60 lines, and squeezing that into a couple of visible rows makes it
 * hard to write, review or read before saving. The box follows the text instead
 * of hiding it behind an inner scrollbar.
 */
export default function AutoGrowTextarea({
  className,
  minRows = 3,
  value,
  onChange,
  style,
  onInput,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const fit = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    // scrollHeight is 0 while the field is hidden (e.g. inside a closed modal);
    // keep the rows-based height in that case instead of collapsing to nothing.
    if (element.scrollHeight > 0) {
      element.style.height = `${element.scrollHeight}px`;
    }
  }, []);

  // Grow when the value is set or replaced (including form loads and resets).
  useEffect(() => {
    fit();
  }, [value, fit]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={minRows}
      className={className}
      value={value}
      onChange={onChange}
      // Also grow while typing, so fields without controlled state follow too.
      onInput={(event) => {
        fit();
        onInput?.(event);
      }}
      style={{ ...style, overflowY: "hidden", resize: "none" }}
    />
  );
}