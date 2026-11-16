"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  fetchLoginFailures,
  fetchStudentActivity,
  fetchStudentLogins,
  resetStudentPasswordToDefault,
  StudentAccountsApiError,
} from "@/lib/student-accounts-api";
import {
  LOGIN_FAILURE_HINTS,
  LOGIN_FAILURE_LABELS,
  type LoginAttemptItem,
  type LoginFailuresResponse,
  type StudentActivityResponse,
  type StudentLoginRow,
  type StudentLoginsResponse,
} from "@/lib/student-accounts-types";
import "./student-logins.css";

const PAGE_SIZE = 25;

type Tab = "students" | "failures";
type Toast = { kind: "success" | "error"; message: string };
type DetailTarget = Pick<
  StudentLoginRow,
  "studentId" | "fullName" | "registrationNo" | "className" | "streamName" | "hasAccount"
>;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeAgo(value: string | null | undefined): string {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function classLabel(row: { className: string; streamName: string }): string {
  return [row.className, row.streamName].filter(Boolean).join(" · ");
}

function resultMessage(error: unknown, fallback: string): string {
  if (error instanceof StudentAccountsApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function SummaryCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "muted" | "info";
}) {
  return (
    <div className={`sl-stat sl-stat--${tone}`}>
      <span className="sl-stat-value">{value.toLocaleString()}</span>
      <span className="sl-stat-label">{label}</span>
      {hint && <span className="sl-stat-hint">{hint}</span>}
    </div>
  );
}

function Pill({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: "success" | "warning" | "danger" | "muted" | "info";
  title?: string;
}) {
  return (
    <span className={`sl-pill sl-pill--${tone}`} title={title}>
      {children}
    </span>
  );
}

function PasswordCell({ row }: { row: StudentLoginRow }) {
  if (!row.hasAccount) return <span className="sl-cell-sub">—</span>;
  if (row.mustChangePassword) {
    return (
      <div className="sl-cell-stack">
        <Pill tone="warning">Default</Pill>
        <span className="sl-cell-sub">Must change at next sign-in</span>
      </div>
    );
  }
  return (
    <div className="sl-cell-stack">
      <Pill tone="success">Changed</Pill>
      <span className="sl-cell-sub">{formatDateTime(row.passwordChangedAt)}</span>
    </div>
  );
}

function AttemptLine({ attempt }: { attempt: LoginAttemptItem }) {
  const failed = !attempt.success;
  const reason = attempt.failureReason;
  return (
    <li className={`sl-event${failed ? " sl-event--failed" : " sl-event--ok"}`}>
      <span className="sl-event-dot" aria-hidden="true" />
      <div className="sl-event-main">
        <div className="sl-event-title">
          {failed ? LOGIN_FAILURE_LABELS[reason ?? "wrong_password"] : "Signed in successfully"}
        </div>
        <div className="sl-event-note">
          {formatDateTime(attempt.attemptedAt)} · {formatTimeAgo(attempt.attemptedAt)}
          {attempt.ipAddress ? ` · IP ${attempt.ipAddress}` : ""}
        </div>
        {failed && reason && (
          <div className="sl-event-hint">{LOGIN_FAILURE_HINTS[reason]}</div>
        )}
      </div>
    </li>
  );
}

export default function StudentLogins() {
  const [tab, setTab] = useState<Tab>("students");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudentLoginsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [failSearchInput, setFailSearchInput] = useState("");
  const [failSearch, setFailSearch] = useState("");
  const [failPage, setFailPage] = useState(1);
  const [failures, setFailures] = useState<LoginFailuresResponse | null>(null);
  const [failLoading, setFailLoading] = useState(false);
  const [failError, setFailError] = useState("");

  const [selected, setSelected] = useState<DetailTarget | null>(null);
  const [activity, setActivity] = useState<StudentActivityResponse | null>(null);
  const [activityLoadedAt, setActivityLoadedAt] = useState(() => Date.now());
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");

  const [resetTarget, setResetTarget] = useState<DetailTarget | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFailSearch(failSearchInput.trim());
      setFailPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [failSearchInput]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchStudentLogins({
        search,
        filter,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(result);
    } catch (err) {
      setError(resultMessage(err, "Could not load student logins."));
    } finally {
      setLoading(false);
    }
  }, [search, filter, page]);

  const loadFailures = useCallback(async () => {
    setFailLoading(true);
    setFailError("");
    try {
      const result = await fetchLoginFailures({
        search: failSearch,
        page: failPage,
        pageSize: PAGE_SIZE,
      });
      setFailures(result);
    } catch (err) {
      setFailError(resultMessage(err, "Could not load failed sign-in attempts."));
    } finally {
      setFailLoading(false);
    }
  }, [failSearch, failPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (tab !== "failures") return;
    const timer = setTimeout(() => {
      void loadFailures();
    }, 0);
    return () => clearTimeout(timer);
  }, [tab, loadFailures]);

  const openDetails = useCallback(async (target: DetailTarget) => {
    setSelected(target);
    setActivity(null);
    setActivityError("");
    setActivityLoading(true);
    try {
      setActivity(await fetchStudentActivity(target.studentId));
      setActivityLoadedAt(Date.now());
    } catch (err) {
      setActivityError(resultMessage(err, "Could not load the login history."));
    } finally {
      setActivityLoading(false);
    }
  }, []);

  async function handleReset() {
    if (!resetTarget || resetting) return;
    setResetting(true);
    setResetError("");
    try {
      const result = await resetStudentPasswordToDefault(resetTarget.studentId);
      const who = resetTarget.registrationNo ?? resetTarget.fullName;
      setToast({
        kind: "success",
        message: result.created
          ? `Portal account created for ${who}. Default password: ${result.defaultPassword}`
          : `${who}: password reset to the default (${result.defaultPassword}). The student must choose a new password at next sign-in.`,
      });
      setResetTarget(null);
      setSelected(null);
      await load();
      if (tab === "failures") await loadFailures();
    } catch (err) {
      setResetError(resultMessage(err, "Could not reset the password."));
    } finally {
      setResetting(false);
    }
  }

  const summary = data?.summary;
  const rows = data?.students ?? [];
  const pagination = data?.pagination;

  const summaryCards = useMemo(
    () => (
      <div className="sl-summary">
        <SummaryCard
          label="Students"
          value={summary?.students ?? 0}
          hint={summary ? `${summary.withoutAccount} without account` : undefined}
        />
        <SummaryCard
          label="Never signed in"
          value={summary?.neverLoggedIn ?? 0}
          tone="muted"
        />
        <SummaryCard
          label="Using default password"
          value={summary?.defaultPassword ?? 0}
          tone="warning"
        />
        <SummaryCard
          label="Password changed"
          value={summary?.changedPassword ?? 0}
          tone="success"
        />
        <SummaryCard
          label="Failed attempts (24h)"
          value={summary?.failedAttempts24h ?? 0}
          hint={summary ? `${summary.failedStudents24h} students` : undefined}
          tone="danger"
        />
        <SummaryCard
          label="Blocked now"
          value={summary?.blocked ?? 0}
          hint="6+ failures in 15 min"
          tone="danger"
        />
        <SummaryCard
          label="Active sessions"
          value={summary?.activeSessions ?? 0}
          tone="info"
        />
      </div>
    ),
    [summary],
  );

  return (
    <div className="sl-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Student Logins</h2>
          <p className="page-sub">
            See when each student signed in, why a sign-in failed, and reset one
            student&apos;s password back to the school default.
          </p>
        </div>
        <div className="page-head-right">
          <button
            type="button"
            className="cm-btn cm-btn--ghost cm-btn--sm"
            disabled={tab === "students" ? loading : failLoading}
            onClick={() => {
              if (tab === "students") void load();
              else void loadFailures();
            }}
          >
            {(tab === "students" ? loading : failLoading) ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="sl-note">
        <strong>Kumbuka:</strong> ukibonyeza <em>Reset</em> kwa mwanafunzi mmoja tu,
        password yake inarudi kwenye default ya shule na atalazimika kuweka mpya
        akiingia. Password za wanafunzi wengine haziguzwi.
      </div>

      <div className="sl-tabs" role="tablist" aria-label="Student login views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "students"}
          className={`sl-tab${tab === "students" ? " sl-tab--active" : ""}`}
          onClick={() => setTab("students")}
        >
          Students
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "failures"}
          className={`sl-tab${tab === "failures" ? " sl-tab--active" : ""}`}
          onClick={() => setTab("failures")}
        >
          Failed sign-ins
        </button>
      </div>

      {tab === "students" && (
        <>
          {summaryCards}

          <div className="st-toolbar">
            <div className="sm-search-bar sl-search" style={{ marginBottom: 0 }}>
              <svg
                className="sm-search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="sm-search"
                placeholder="Search by name or registration no. (e.g. S7811/0020)"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="st-filter__wrap">
              <select
                className="st-filter"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter students"
              >
                <option value="all">All students</option>
                <option value="never">Never signed in</option>
                <option value="default">Using default password</option>
                <option value="changed">Password changed</option>
                <option value="failed">Failed in last 24h</option>
                <option value="blocked">Blocked now</option>
                <option value="missing">No portal account</option>
              </select>
            </div>
          </div>

          {error && <div className="sl-error">{error}</div>}

          {loading && !data ? (
            <div className="sl-loading">
              <Spinner size={22} />
            </div>
          ) : (
            <>
              <div className="sm-table-wrap">
                <table className="sm-table sl-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Account</th>
                      <th>Password</th>
                      <th>Last sign-in</th>
                      <th>Last activity</th>
                      <th>Failed attempts</th>
                      <th className="sl-actions-head">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="st-empty-state">
                          No students match this search or filter.
                        </td>
                      </tr>
                    )}
                    {rows.map((row) => (
                      <tr
                        key={row.studentId}
                        className={row.blocked ? "sl-row--blocked" : undefined}
                      >
                        <td>
                          <div className="st-student">
                            <span
                              className={`st-avatar${
                                row.gender === "Female" ? " st-avatar--female" : ""
                              }`}
                            >
                              {initials(row.fullName)}
                            </span>
                            <div>
                              <div className="st-student-name">{row.fullName}</div>
                              <div className="st-student-sub">
                                <span className="st-regno">
                                  {row.registrationNo ?? "—"}
                                </span>
                                {classLabel(row) ? ` · ${classLabel(row)}` : ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {!row.hasAccount ? (
                            <Pill tone="muted">No account</Pill>
                          ) : row.isActive ? (
                            <Pill tone="success">Active</Pill>
                          ) : (
                            <Pill tone="danger">Disabled</Pill>
                          )}
                        </td>
                        <td>
                          <PasswordCell row={row} />
                        </td>
                        <td>
                          {row.lastLoginAt ? (
                            <div className="sl-cell-stack">
                              <span className="sl-cell-main">
                                {formatDateTime(row.lastLoginAt)}
                              </span>
                              <span className="sl-cell-sub">
                                {formatTimeAgo(row.lastLoginAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="sl-cell-sub">Never</span>
                          )}
                        </td>
                        <td>
                          {row.lastSeenAt ? (
                            <div className="sl-cell-stack">
                              <span className="sl-cell-main">
                                {formatTimeAgo(row.lastSeenAt)}
                              </span>
                              <span className="sl-cell-sub">
                                {row.activeSessions > 0
                                  ? `${row.activeSessions} active session${
                                      row.activeSessions === 1 ? "" : "s"
                                    }`
                                  : "No active session"}
                              </span>
                            </div>
                          ) : (
                            <span className="sl-cell-sub">—</span>
                          )}
                        </td>
                        <td>
                          <div className="sl-failures">
                            {row.blocked && <Pill tone="danger">Blocked</Pill>}
                            {row.failures24h > 0 && (
                              <span className="sl-fail-count sl-fail-count--hot">
                                {row.failures24h} in 24h
                              </span>
                            )}
                            <span className="sl-cell-sub">
                              {row.failures30d} in 30 days
                            </span>
                            {row.lastFailure?.failureReason && (
                              <span
                                className="sl-cell-sub"
                                title={
                                  LOGIN_FAILURE_HINTS[row.lastFailure.failureReason]
                                }
                              >
                                Last: {LOGIN_FAILURE_LABELS[row.lastFailure.failureReason]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="sl-actions">
                            <button
                              type="button"
                              className="cm-btn cm-btn--ghost cm-btn--sm"
                              onClick={() => void openDetails(row)}
                            >
                              History
                            </button>
                            <button
                              type="button"
                              className="cm-btn cm-btn--danger cm-btn--sm"
                              onClick={() => {
                                setResetError("");
                                setResetTarget(row);
                              }}
                            >
                              {row.hasAccount ? "Reset" : "Create"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination && pagination.total > 0 && (
                <div className="st-pagination">
                  <span className="st-pagination-info">
                    Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                    {Math.min(
                      pagination.page * pagination.pageSize,
                      pagination.total,
                    )}{" "}
                    of {pagination.total}
                  </span>
                  <div className="st-pagination-controls">
                    <button
                      type="button"
                      className="cm-btn cm-btn--ghost cm-btn--sm"
                      disabled={pagination.page <= 1 || loading}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="cm-btn cm-btn--ghost cm-btn--sm"
                      disabled={pagination.page >= pagination.totalPages || loading}
                      onClick={() =>
                        setPage((current) =>
                          Math.min(pagination.totalPages, current + 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "failures" && (
        <>
          <div className="sl-summary sl-summary--compact">
            <SummaryCard
              label="Failed attempts (24h)"
              value={failures?.summary.failedAttempts24h ?? 0}
              hint={
                failures
                  ? `${failures.summary.distinctStudents24h} students affected`
                  : undefined
              }
              tone="danger"
            />
            <SummaryCard
              label="Failed attempts (7 days)"
              value={failures?.summary.failedAttempts7d ?? 0}
              tone="warning"
            />
            <SummaryCard
              label="Wrong registration no. (24h)"
              value={failures?.summary.unknownRegistration24h ?? 0}
              tone="warning"
            />
            <SummaryCard
              label="Wrong password (24h)"
              value={failures?.summary.wrongPassword24h ?? 0}
              tone="muted"
            />
          </div>

          <div className="st-toolbar">
            <div className="sm-search-bar sl-search" style={{ marginBottom: 0 }}>
              <svg
                className="sm-search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="sm-search"
                placeholder="Search failed attempts by registration no. or name"
                value={failSearchInput}
                onChange={(event) => setFailSearchInput(event.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

          {failError && <div className="sl-error">{failError}</div>}

          {failLoading && !failures ? (
            <div className="sl-loading">
              <Spinner size={22} />
            </div>
          ) : (
            <>
              <div className="sm-table-wrap">
                <table className="sm-table sl-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Registration entered</th>
                      <th>Student</th>
                      <th>Reason</th>
                      <th>IP</th>
                      <th className="sl-actions-head">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(failures?.attempts.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={6} className="st-empty-state">
                          No failed sign-in attempts in the last 30 days.
                        </td>
                      </tr>
                    )}
                    {failures?.attempts.map((attempt) => (
                      <tr key={`${attempt.id}-${attempt.attemptedAt}`}>
                        <td>
                          <div className="sl-cell-stack">
                            <span className="sl-cell-main">
                              {formatDateTime(attempt.attemptedAt)}
                            </span>
                            <span className="sl-cell-sub">
                              {formatTimeAgo(attempt.attemptedAt)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="st-regno">{attempt.registrationNo}</span>
                        </td>
                        <td>
                          {attempt.studentId ? (
                            <div className="sl-cell-stack">
                              <span className="sl-cell-main">
                                {attempt.studentName}
                              </span>
                              <span className="sl-cell-sub">
                                {[attempt.className, attempt.streamName]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </div>
                          ) : (
                            <Pill tone="muted">Not found</Pill>
                          )}
                        </td>
                        <td>
                          {attempt.failureReason && (
                            <div className="sl-cell-stack">
                              <Pill
                                tone={
                                  attempt.failureReason === "unknown_registration"
                                    ? "warning"
                                    : attempt.failureReason === "wrong_password"
                                      ? "info"
                                      : "danger"
                                }
                              >
                                {LOGIN_FAILURE_LABELS[attempt.failureReason]}
                              </Pill>
                              <span className="sl-cell-sub">
                                {LOGIN_FAILURE_HINTS[attempt.failureReason]}
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="sl-cell-sub">
                            {attempt.ipAddress ?? "—"}
                          </span>
                        </td>
                        <td>
                          <div className="sl-actions">
                            {attempt.studentId && (
                              <button
                                type="button"
                                className="cm-btn cm-btn--ghost cm-btn--sm"
                                onClick={() =>
                                  void openDetails({
                                    studentId: attempt.studentId as string,
                                    fullName: attempt.studentName ?? "Student",
                                    registrationNo: attempt.registrationNo,
                                    className: attempt.className ?? "",
                                    streamName: attempt.streamName ?? "",
                                    hasAccount:
                                      attempt.failureReason !== "account_missing",
                                  })
                                }
                              >
                                History
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {failures && failures.pagination.total > 0 && (
                <div className="st-pagination">
                  <span className="st-pagination-info">
                    Showing{" "}
                    {(failures.pagination.page - 1) * failures.pagination.pageSize + 1}–
                    {Math.min(
                      failures.pagination.page * failures.pagination.pageSize,
                      failures.pagination.total,
                    )}{" "}
                    of {failures.pagination.total}
                  </span>
                  <div className="st-pagination-controls">
                    <button
                      type="button"
                      className="cm-btn cm-btn--ghost cm-btn--sm"
                      disabled={failures.pagination.page <= 1 || failLoading}
                      onClick={() =>
                        setFailPage((current) => Math.max(1, current - 1))
                      }
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="cm-btn cm-btn--ghost cm-btn--sm"
                      disabled={
                        failures.pagination.page >= failures.pagination.totalPages ||
                        failLoading
                      }
                      onClick={() =>
                        setFailPage((current) =>
                          Math.min(failures.pagination.totalPages, current + 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {selected && (
        <div
          className="sl-modal-backdrop"
          onClick={() => setSelected(null)}
          role="presentation"
        >
          <div
            className="sl-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Login history for ${selected.fullName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sl-modal-head">
              <div>
                <h3 className="sl-modal-title">{selected.fullName}</h3>
                <p className="sl-modal-sub">
                  {selected.registrationNo ?? "—"}
                  {classLabel(selected) ? ` · ${classLabel(selected)}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="sl-close"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="sl-modal-body">
              {activityError && <div className="sl-error">{activityError}</div>}
              {activityLoading && (
                <div className="sl-loading">
                  <Spinner size={20} />
                </div>
              )}

              {!activityLoading && activity && (
                <>
                  <div className="sl-detail-grid">
                    <div className="sl-detail-item">
                      <span className="sl-detail-label">Account</span>
                      <span className="sl-detail-value">
                        {activity.account
                          ? activity.account.isActive
                            ? "Active"
                            : "Disabled"
                          : "No portal account"}
                      </span>
                    </div>
                    <div className="sl-detail-item">
                      <span className="sl-detail-label">Password</span>
                      <span className="sl-detail-value">
                        {!activity.account
                          ? "—"
                          : activity.account.mustChangePassword
                            ? "Default (must change)"
                            : "Changed by student"}
                      </span>
                      <span className="sl-detail-hint">
                        {activity.account?.passwordChangedAt
                          ? `Changed ${formatDateTime(activity.account.passwordChangedAt)}`
                          : activity.account
                            ? "Not changed yet"
                            : ""}
                      </span>
                    </div>
                    <div className="sl-detail-item">
                      <span className="sl-detail-label">Last sign-in</span>
                      <span className="sl-detail-value">
                        {formatDateTime(activity.account?.lastLoginAt ?? null)}
                      </span>
                      <span className="sl-detail-hint">
                        {formatTimeAgo(activity.account?.lastLoginAt ?? null)}
                      </span>
                    </div>
                    <div className="sl-detail-item">
                      <span className="sl-detail-label">Active sessions</span>
                      <span className="sl-detail-value">
                        {
                          activity.sessions.filter(
                            (session) =>
                              new Date(session.expiresAt).getTime() >
                              activityLoadedAt,
                          ).length
                        }
                      </span>
                    </div>
                    <div className="sl-detail-item">
                      <span className="sl-detail-label">Account created</span>
                      <span className="sl-detail-value">
                        {formatDateTime(activity.account?.createdAt ?? null)}
                      </span>
                    </div>
                    <div className="sl-detail-item">
                      <span className="sl-detail-label">Last account update</span>
                      <span className="sl-detail-value">
                        {formatDateTime(activity.account?.updatedAt ?? null)}
                      </span>
                    </div>
                  </div>

                  <h4 className="sl-section-title">
                    Login history ({activity.attempts.length})
                  </h4>
                  {activity.attempts.length === 0 ? (
                    <p className="sl-empty-note">
                      No sign-in attempts recorded in the last 30 days.
                    </p>
                  ) : (
                    <ul className="sl-timeline">
                      {activity.attempts.slice(0, 60).map((attempt) => (
                        <AttemptLine
                          key={`${attempt.id}-${attempt.attemptedAt}`}
                          attempt={attempt}
                        />
                      ))}
                    </ul>
                  )}

                  <h4 className="sl-section-title">
                    Sessions ({activity.sessions.length})
                  </h4>
                  {activity.sessions.length === 0 ? (
                    <p className="sl-empty-note">No sessions recorded.</p>
                  ) : (
                    <ul className="sl-timeline">
                      {activity.sessions.slice(0, 10).map((session) => {
                        const expired =
                          new Date(session.expiresAt).getTime() <=
                          activityLoadedAt;
                        return (
                          <li
                            key={session.id}
                            className={`sl-event${
                              expired ? " sl-event--muted" : " sl-event--ok"
                            }`}
                          >
                            <span className="sl-event-dot" aria-hidden="true" />
                            <div className="sl-event-main">
                              <div className="sl-event-title">
                                {expired ? "Session ended" : "Active session"}
                              </div>
                              <div className="sl-event-note">
                                Started {formatDateTime(session.createdAt)} · last
                                seen {formatDateTime(session.lastSeenAt)}
                                {session.ipAddress ? ` · IP ${session.ipAddress}` : ""}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="sl-modal-foot">
              <button
                type="button"
                className="cm-btn cm-btn--ghost cm-btn--sm"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="cm-btn cm-btn--danger cm-btn--sm"
                onClick={() => {
                  setResetError("");
                  setResetTarget({
                    ...selected,
                    hasAccount: activity ? Boolean(activity.account) : selected.hasAccount,
                  });
                }}
              >
                {(activity ? Boolean(activity.account) : selected.hasAccount)
                  ? "Reset to default password"
                  : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div
          className="cm-modal-backdrop"
          onClick={() => {
            if (!resetting) setResetTarget(null);
          }}
          role="presentation"
        >
          <div
            className="cm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm password reset"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="cm-modal-title">
              {resetTarget.hasAccount
                ? "Reset password to the school default?"
                : "Create a portal account?"}
            </h3>
            <p className="cm-modal-text">
              {resetTarget.hasAccount
                ? `This restores the default password (Kitukutu_TECH) for ${resetTarget.fullName} (${resetTarget.registrationNo ?? "no reg. no."}). Any active session will be signed out and the student must choose a new password at next sign-in.`
                : `This creates a portal account with the default password (Kitukutu_TECH) for ${resetTarget.fullName} (${resetTarget.registrationNo ?? "no reg. no."}). The student must choose a new password at first sign-in.`}
            </p>
            <p className="cm-modal-text sl-modal-warning">
              Only this student is affected. No other student password is changed.
            </p>
            {resetError && <div className="sl-error">{resetError}</div>}
            <div className="cm-modal-actions">
              <button
                type="button"
                className="cm-btn cm-btn--ghost"
                disabled={resetting}
                onClick={() => setResetTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cm-btn cm-btn--danger"
                disabled={resetting}
                onClick={() => void handleReset()}
              >
                {resetting
                  ? "Resetting…"
                  : resetTarget.hasAccount
                    ? "Reset password"
                    : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div
            className={`toast toast--${toast.kind === "success" ? "success" : "warning"}`}
            onClick={() => setToast(null)}
            role="status"
          >
            <span className="toast-msg">{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={(event) => {
                event.stopPropagation();
                setToast(null);
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
