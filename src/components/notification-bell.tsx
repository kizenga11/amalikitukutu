"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  fetchSmartNotifications,
  NotificationsApiError,
} from "@/lib/notifications-api";
import {
  NOTIFICATION_KIND_LABELS,
  type NotificationTarget,
  type NotificationsResponse,
  type SmartNotification,
  type SmartNotificationKind,
} from "@/lib/notifications-types";
import "./notifications.css";

const POLL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Filter = "all" | "logins" | "assignments";

const SEEN_PREFIX = "amali.notifications.seen.";

function readSeen(userId: string): string | null {
  try {
    return window.localStorage.getItem(`${SEEN_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function writeSeen(userId: string, value: string): void {
  try {
    window.localStorage.setItem(`${SEEN_PREFIX}${userId}`, value);
  } catch {
    // Storage may be unavailable (private mode); the badge simply resets.
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
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

function errorMessage(error: unknown): string {
  if (error instanceof NotificationsApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not load notifications.";
}

function KindIcon({ kind }: { kind: SmartNotificationKind }) {
  const paths: Record<SmartNotificationKind, React.ReactNode> = {
    login_failed: (
      <>
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v3" />
      </>
    ),
    unknown_login: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </>
    ),
    submission: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="m9 15 2 2 4-4" />
      </>
    ),
    assignment: (
      <>
        <path d="m3 11 18-5v12L3 13v-2z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
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
  canOpen,
  onOpen,
}: {
  notification: SmartNotification;
  nowIso: string;
  highlighted: boolean;
  canOpen: boolean;
  onOpen: () => void;
}) {
  const body = (
    <>
      <span
        className={`notif-icon notif-icon--${notification.severity}`}
        aria-hidden="true"
      >
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
          {NOTIFICATION_KIND_LABELS[notification.kind]}
          {notification.count > 1 ? ` · ${notification.count} events` : ""}
          {" · "}
          {absoluteTime(notification.timestamp)}
        </span>
      </span>
      {highlighted && <span className="notif-unread-dot" aria-label="Unread" />}
    </>
  );

  if (!canOpen) {
    return <li className="notif-item">{body}</li>;
  }

  return (
    <li>
      <button type="button" className="notif-item notif-item--clickable" onClick={onOpen}>
        {body}
      </button>
    </li>
  );
}

export default function NotificationBell({
  userId,
  onNavigate,
  allowedTargets = ["studentlogins", "assignments"],
}: {
  userId: string;
  onNavigate: (target: NotificationTarget, notification: SmartNotification) => void;
  allowedTargets?: NotificationTarget[];
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSmartNotifications();
      setData(result);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSeenAt(readSeen(userId));
      void load();
    }, 0);
    const poll = setInterval(() => {
      void load();
    }, POLL_MS);
    const onFocus = () => {
      void load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, userId]);

  const cutoff = useMemo(() => {
    if (seenAt) return seenAt;
    if (!data) return null;
    // First visit: treat the last 24 hours as new instead of flooding the
    // badge with two weeks of history.
    return new Date(timeOf(data.generatedAt) - DAY_MS).toISOString();
  }, [seenAt, data]);

  const unreadIds = useMemo(() => {
    if (!data || !cutoff) return [];
    return data.notifications
      .filter((item) => timeOf(item.timestamp) > timeOf(cutoff))
      .map((item) => item.id);
  }, [data, cutoff]);

  const unreadCount = unreadIds.length;

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "logins") {
      return data.notifications.filter(
        (item) => item.kind === "login_failed" || item.kind === "unknown_login",
      );
    }
    if (filter === "assignments") {
      return data.notifications.filter(
        (item) => item.kind === "submission" || item.kind === "assignment",
      );
    }
    return data.notifications;
  }, [data, filter]);

  function markAllRead() {
    if (!data) return;
    setHighlightIds(new Set(unreadIds));
    setSeenAt(data.generatedAt);
    writeSeen(userId, data.generatedAt);
  }

  function togglePanel() {
    if (!open) {
      if (data) {
        setHighlightIds(new Set(unreadIds));
        setSeenAt(data.generatedAt);
        writeSeen(userId, data.generatedAt);
      }
      setOpen(true);
      return;
    }
    setOpen(false);
    setHighlightIds(new Set());
  }

  function closePanel() {
    setOpen(false);
    setHighlightIds(new Set());
  }

  function openNotification(notification: SmartNotification) {
    closePanel();
    if (notification.target && allowedTargets.includes(notification.target)) {
      onNavigate(notification.target, notification);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setHighlightIds(new Set());
      }
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
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
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
          <div
            className="notif-panel"
            role="dialog"
            aria-modal="false"
            aria-label="Notifications"
          >
            <div className="notif-head">
              <div>
                <h3 className="notif-title">Notifications</h3>
                <p className="notif-sub">
                  {summary
                    ? `${summary.failedAttempts} failed sign-in${
                        summary.failedAttempts === 1 ? "" : "s"
                      } · ${summary.submissions} submission${
                        summary.submissions === 1 ? "" : "s"
                      } · ${summary.assignments} new assignment${
                        summary.assignments === 1 ? "" : "s"
                      }`
                    : "Loading school alerts…"}
                </p>
              </div>
              {loading && <Spinner size={16} />}
            </div>

            {summary && (
              <div className="notif-chips">
                <span className="notif-chip notif-chip--warn">
                  {summary.loginFailed} sign-in alert
                  {summary.loginFailed === 1 ? "" : "s"}
                </span>
                {summary.blocked > 0 && (
                  <span className="notif-chip notif-chip--danger">
                    {summary.blocked} locked out now
                  </span>
                )}
                <span className="notif-chip">{summary.submissions} submissions</span>
                <span className="notif-chip">{summary.assignments} assignments</span>
              </div>
            )}

            <div className="notif-tabs" role="tablist" aria-label="Notification filters">
              {(
                [
                  ["all", "All"],
                  ["logins", "Sign-ins"],
                  ["assignments", "Assignments"],
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
                  <p>No alerts here. All quiet for now.</p>
                </div>
              ) : (
                <ul className="notif-list">
                  {filtered.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      nowIso={nowIso}
                      highlighted={highlightIds.has(notification.id)}
                      canOpen={
                        Boolean(notification.target) &&
                        allowedTargets.includes(notification.target as NotificationTarget)
                      }
                      onOpen={() => openNotification(notification)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="notif-foot">
              <span className="notif-foot-note">
                {!data
                  ? "Could not load alerts"
                  : unreadCount > 0
                    ? `${unreadCount} unread`
                    : "You are up to date"}
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
                  Mark all read
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
