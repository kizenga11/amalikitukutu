"use client";

import { useEffect } from "react";
import "./student-portal.css";

export type StudentNoticeTone = "success" | "error" | "warn" | "info";

export default function StudentNoticeDialog({
  open,
  title,
  message,
  tone = "info",
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  tone?: StudentNoticeTone;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sp-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sp-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sp-notice-title"
        aria-describedby="sp-notice-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="sp-notice-title">{title}</h2>
        <div id="sp-notice-message" className={`sp-alert sp-alert--${tone}`} style={{ margin: 0 }}>
          {message}
        </div>
        <div className="sp-modal-actions">
          <button type="button" className="sp-btn sp-btn--primary" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
