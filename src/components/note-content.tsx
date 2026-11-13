"use client";

import { useMemo } from "react";
import { normalizeNoteHtml } from "@/lib/study-notes-shared";
import "./note-content.css";

/**
 * Shared renderer for study-note rich text.
 *
 * The teacher dashboard and the student portal must use the same renderer so a
 * note that looks arranged for the teacher (headings, lists, tables, spacing)
 * also looks arranged for the student.
 */
export default function NoteContent({
  html,
  emptyText = "No content.",
  className = "",
}: {
  html: string | null | undefined;
  emptyText?: string;
  className?: string;
}) {
  const content = useMemo(() => normalizeNoteHtml(html), [html]);
  return (
    <div
      className={`note-content${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: content || `<p>${emptyText}</p>` }}
    />
  );
}
