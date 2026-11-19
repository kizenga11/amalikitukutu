"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import { fetchStudentNotifications } from "@/lib/student-portal-api";
import {
  STUDENT_NOTIFICATION_KIND_LABELS,
  STUDENT_NOTIFICATIONS_REFRESH_EVENT,
  type StudentNotification,
  type StudentNotificationKind,
  type StudentNotificationTarget,
  type StudentNotificationsResponse,
} from "@/lib/student-notifications-types";
import "./notifications.css";

const POLL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEEN_PREFIX = "amali.student.notifications.seen.";

type Filter = "all" | "assignments" | "notes";

function readSeen(studentId: string): string | null {
  try {
    return window.localStorage.getItem(`${SEEN_PREFIX}${studentId}`);
  } catch {
    return null;
  }
}

function writeSeen(studentId: string, value: string): void {
  try {
    window.localStorage.setItem(`${SEEN_PREFIX}${studentId}`, value);
  } catch {
    // Private browsing: the badge simply resets.
  }
}

function timeOf(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeTime(value: string, nowIso: string): string {
  const diff = Math.max(0, timeOf(nowIso) - timeOf(value));
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function absoluteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function KindIcon({ kind }: { kind: StudentNotificationKind }) {
  const paths: Record<StudentNotificationKind, React.ReactNode> = {
    assignment_published: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="m9 15 2 2 4-4" />
      </>
    ),
    assignment_rolled_back: (
      <>
        <path d="M3 8h11a5 5 0 0 1 0 10H8" />
        <path d="m7 4-4 4 4 4" />
      </>
    ),
    assignment_rework: (
      <>
        <path d="M12 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11l5 5v3" />
        <path d="M17 17l3 3 3-3" />
        <path d="M20 20v-6" />
      </>
    ),
    note_published: (
      <>
        <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
        <path d="M8 7h7M8 11h7M8 15h4" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

function NotificationRow({
  notification,
  nowIso,
  highlighted,
  onOpen,
}: {
  notification: StudentNotification;
  nowIso: string;
  highlighted: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button type="button" className="notif-item notif-item--clickable" onClick={onOpen}>
        <span className={`notif-icon notif-icon--${notification.severity}`} aria-hidden="true">
          <KindIcon kind={notification.kind} />
        </span>
        <span className="notif-item-main">
          <span className="notif-item-top">
            <span className="notif-item-title">{notification.title}</span>
            <span className="notif-item-time">
              {relativeTime(notification.timestamp, nowIso)}
            </span>
          </span>
          <span className="notif-item-message">{notification.message}</span>
          <span className="notif-item-meta">
            {STUDENT_NOTIFICATION_KIND_LABELS[notification.kind]}
            {" · "}
            {absoluteTime(notification.timestamp)}
          </span>
        </span>
        {highlighted && <span className="notif-unread-dot" aria-label="Unread" />}
      </button>
    </li>
  );
}

export default function StudentNotificationBell({
  studentId,
  onNavigate,
}: {
  studentId: string;
  onNavigate: (target: StudentNotificationTarget, notification?: StudentNotification) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StudentNotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchStudentNotifications());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSeenAt(readSeen(studentId));
      void load();
    }, 0);
    const poll = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onNoteOpened = () => void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(STUDENT_NOTIFICATIONS_REFRESH_EVENT, onNoteOpened);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(STUDENT_NOTIFICATIONS_REFRESH_EVENT, onNoteOpened);
    };
  }, [load, studentId]);

  const cutoff = useMemo(() => {
    if (seenAt) return seenAt;
    if (!data) return null;
    return new Date(timeOf(data.generatedAt) - DAY_MS).toISOString();
  }, [seenAt, data]);

  const unreadIds = useMemo(() => {
    if (!data || !cutoff) return [];
    return data.notifications
      .filter((item) => timeOf(item.timestamp) > timeOf(cutoff))
      .map((item) => item.id);
  }, [data, cutoff]);

  const unreadCount = unreadIds.length;
  const unreadNotes = data?.summary.unreadNotes ?? 0;

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "assignments") {
      return data.notifications.filter((item) => item.target === "assignments");
    }
    if (filter === "notes") {
      return data.notifications.filter((item) => item.target === "notes");
    }
    return data.notifications;
  }, [data, filter]);

  function markAllRead() {
    if (!data) return;
    setHighlightIds(new Set(unreadIds));
    setSeenAt(data.generatedAt);
    writeSeen(studentId, data.generatedAt);
  }

  function closePanel() {
    setOpen(false);
    setHighlightIds(new Set());
  }

  function togglePanel() {
    if (!open) {
      if (data) {
        setHighlightIds(new Set(unreadIds));
        setSeenAt(data.generatedAt);
        writeSeen(studentId, data.generatedAt);
      }
      setOpen(true);
      return;
    }
    closePanel();
  }

  function openNotification(notification: StudentNotification) {
    closePanel();
    onNavigate(notification.target, notification);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const summary = data?.summary;
  const nowIso = data?.generatedAt ?? new Date(0).toISOString();

  return (
    <div className="notif-wrap">
      <button
        type="button"
        className={`icon-btn notif-trigger${open ? " notif-trigger--open" : ""}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={togglePanel}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="icon"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="notif-backdrop" onClick={closePanel} role="presentation" />
          <div className="notif-panel" role="dialog" aria-modal="false" aria-label="Notifications">
            <div className="notif-head">
              <div>
                <h3 className="notif-title">Notifications</h3>
                <p className="notif-sub">
                  {summary
                    ? `${summary.newAssignments} new assignments · ${summary.newNotes} new notes · ${summary.rolledBack + summary.rework} returned`
                    : "Loading notifications…"}
                </p>
              </div>
              {loading && <Spinner size={16} />}
            </div>

            <div className="notif-chips">
              <span className="notif-chip notif-chip--warn">
                {summary?.unreadNotes ?? 0} unread notes
              </span>
              <span className="notif-chip">{summary?.newAssignments ?? 0} new assignments</span>
              <span className="notif-chip">{summary?.rolledBack ?? 0} returned</span>
              <span className="notif-chip">{summary?.rework ?? 0} returned for rework</span>
            </div>

            {unreadNotes > 0 && (
              <button
                type="button"
                className="sp-notif-notes"
                onClick={() => {
                  closePanel();
                  onNavigate("notes");
                }}
              >
                <span className="sp-notif-notes-icon" aria-hidden="true">📚</span>
                <span>
                  <strong>
                    {unreadNotes} unread {unreadNotes === 1 ? "note" : "notes"}
                  </strong>
                  <small>Click here to open them</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            )}

            <div className="notif-tabs" role="tablist" aria-label="Notification filters">
              {(
                [
                  ["all", "All"],
                  ["assignments", "Assignments"],
                  ["notes", "Notes"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={`notif-tab${filter === value ? " notif-tab--active" : ""}`}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="notif-list-wrap">
              {error && <div className="notif-error">{error}</div>}
              {loading && !data ? (
                <div className="notif-loading">
                  <Spinner size={20} />
                </div>
              ) : !data ? null : filtered.length === 0 ? (
                <div className="notif-empty">
                  <span className="notif-empty-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </span>
                  <p>No notifications here right now.</p>
                </div>
              ) : (
                <ul className="notif-list">
                  {filtered.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      nowIso={nowIso}
                      highlighted={highlightIds.has(notification.id)}
                      onOpen={() => openNotification(notification)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="notif-foot">
              <span className="notif-foot-note">
                {!data
                  ? "Notifications unavailable"
                  : unreadCount > 0
                    ? `${unreadCount} unread`
                    : "You’re all caught up"}
              </span>
              <div className="notif-foot-actions">
                <button
                  type="button"
                  className="notif-link"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="notif-link notif-link--primary"
                  onClick={markAllRead}
                  disabled={!unreadCount}
                >
                  Mark all as read
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
