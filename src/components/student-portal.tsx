"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LineChart } from "@/components/charts";
import {
  studentStatusLabel,
  type AssignmentSummary,
  type StudentAssignmentStatus,
} from "@/lib/assignments-shared";
import {
  fetchStudentAssignments,
  fetchStudentMe,
  fetchStudentNotes,
  fetchStudentResults,
  logoutStudentReliably,
  StudentApiError,
  type StudentMe,
  type StudentResultsResponse,
  type StudentTopicViewItem,
} from "@/lib/student-portal-api";
import type { StudentExamResult } from "@/lib/student-results-server";
import StudentAssignmentView from "@/components/student-assignment-view";
import StudentNotesTab from "@/components/student-notes-tab";
import StudentConfirmDialog from "@/components/student-confirm-dialog";
import StudentNoticeDialog from "@/components/student-notice-dialog";
import StudentLogoutOverlay from "@/components/student-logout-overlay";
import "./student-portal.css";

type Tab = "home" | "results" | "assignments" | "notes";

const HOLIDAY_MESSAGE =
  "🏖️ Uko likizo: soma kila siku, wasaidie wazazi nyumbani, epuka makundi mabaya, tumia simu kwa busara, jitunze kiafya na ujiandae kurudi shule kwa wakati. 📚 Na jiandae kwa opening test itakayoanza tarehe 11 January 2027. Likizo njema na salama!";

function HolidayMarquee() {
  return (
    <div className="sp-marquee" role="note">
      <div className="sp-marquee-track">
        <span>{HOLIDAY_MESSAGE}</span>
        <span aria-hidden="true">{HOLIDAY_MESSAGE}</span>
      </div>
    </div>
  );
}

function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function statusOrder(status: StudentAssignmentStatus): number {
  if (status === "not_done") return 0;
  if (status === "submitted" || status === "late") return 1;
  return 2;
}

export default function StudentPortal() {
  const router = useRouter();
  const [me, setMe] = useState<StudentMe | null>(null);
  const [exams, setExams] = useState<StudentExamResult[]>([]);
  const [activeYearExams, setActiveYearExams] = useState<StudentExamResult[]>([]);
  const [resultsYear, setResultsYear] = useState("");
  const [resultsActiveYear, setResultsActiveYear] = useState("");
  const [resultsYears, setResultsYears] = useState<string[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [noteTopics, setNoteTopics] = useState<StudentTopicViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "pending" | "done">("all");
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadAssignments = useCallback(async () => {
    try {
      const data = await fetchStudentAssignments();
      setAssignments(data.assignments);
    } catch (err) {
      if (err instanceof StudentApiError && err.status === 401) {
        router.replace("/student/login");
        return;
      }
      setError(
        err instanceof StudentApiError
          ? err.message
          : "Could not load assignments.",
      );
    }
  }, [router]);

  const loadResultsYear = useCallback(
    async (year: string) => {
      setResultsLoading(true);
      try {
        const data: StudentResultsResponse = await fetchStudentResults(year);
        setExams(data.exams);
        setResultsYear(data.year);
        setResultsActiveYear(data.activeYear);
        setResultsYears(data.years);
      } catch (err) {
        if (err instanceof StudentApiError && err.status === 401) {
          router.replace("/student/login");
          return;
        }
        setError(
          err instanceof StudentApiError
            ? err.message
            : "Could not load results for that year.",
        );
      } finally {
        setResultsLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchStudentMe();
        if (cancelled) return;
        if (profile.mustChangePassword) {
          router.replace("/student/change-password");
          return;
        }
        setMe(profile);

        const [resultsResult, assignmentsResult, notesResult] = await Promise.allSettled([
          fetchStudentResults(),
          fetchStudentAssignments(),
          fetchStudentNotes(),
        ]);
        if (cancelled) return;

        if (resultsResult.status === "fulfilled") {
          setExams(resultsResult.value.exams);
          setActiveYearExams(resultsResult.value.exams);
          setResultsYear(resultsResult.value.year);
          setResultsActiveYear(resultsResult.value.activeYear);
          setResultsYears(resultsResult.value.years);
        } else if (
          resultsResult.reason instanceof StudentApiError &&
          resultsResult.reason.status === 401
        ) {
          router.replace("/student/login");
          return;
        }

        if (assignmentsResult.status === "fulfilled") {
          setAssignments(assignmentsResult.value.assignments);
        }
        if (notesResult.status === "fulfilled") {
          setNoteTopics(notesResult.value.topics);
        }

        if (resultsResult.status === "rejected" || assignmentsResult.status === "rejected" || notesResult.status === "rejected") {
          const reason =
            resultsResult.status === "rejected"
              ? resultsResult.reason
              : assignmentsResult.status === "rejected"
                ? assignmentsResult.reason
                : (notesResult as PromiseRejectedResult).reason;
          setError(
            reason instanceof StudentApiError
              ? reason.message
              : "Some information could not be loaded.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof StudentApiError && err.status === 401) {
          router.replace("/student/login");
          return;
        }
        setError(
          err instanceof StudentApiError
            ? err.message
            : "Could not load your information. Please try again.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    if (loggingOut) return;
    setConfirmingLogout(false);
    setLoggingOut(true);
    // Show progress immediately, but never wait forever for a slow sign-out.
    await logoutStudentReliably();
    router.replace("/student/login");
    router.refresh();
  }

  const fullName = me
    ? me.student.fullName ||
      [me.student.firstName, me.student.middleName, me.student.lastName]
        .filter(Boolean)
        .join(" ")
    : "";

  const initials = (me?.student.firstName?.[0] ?? "") + (me?.student.lastName?.[0] ?? "");

  const latestExam = useMemo(() => {
    if (activeYearExams.length === 0) return null;
    const withResults = activeYearExams.filter(
      (exam) => exam.hasMarks && exam.average !== null,
    );
    const pool = withResults.length > 0 ? withResults : activeYearExams;
    return [...pool].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    )[0];
  }, [activeYearExams]);

  const pendingAssignments = assignments.filter(
    (assignment) => assignment.submissionStatus === "not_done",
  );

  if (loading) {
    return (
      <div className="sp-standalone sp-standalone--loading">
        <style>{`
          .sp-standalone--loading{position:relative;overflow:hidden;background:radial-gradient(1100px 620px at 12% -10%,rgba(52,211,153,.22),transparent 60%),radial-gradient(900px 540px at 102% 112%,rgba(45,212,191,.18),transparent 56%),linear-gradient(160deg,#04120d 0%,#0a2a1e 46%,#051510 100%)}
          .sp-standalone--loading::before{content:"";position:absolute;inset:-25%;background-image:radial-gradient(rgba(167,243,208,.16) 1px,transparent 1px);background-size:26px 26px;mask-image:radial-gradient(circle at 50% 45%,#000 0%,transparent 68%);-webkit-mask-image:radial-gradient(circle at 50% 45%,#000 0%,transparent 68%);animation:spLoadDrift 24s linear infinite;pointer-events:none}
          .sp-standalone--loading::after{content:"";position:absolute;width:520px;height:520px;left:-170px;bottom:-230px;border-radius:50%;background:radial-gradient(circle,rgba(16,185,129,.3),transparent 65%);filter:blur(12px);animation:spLoadFloat 9s ease-in-out infinite;pointer-events:none}
          .sp-load-card{position:relative;z-index:1;width:min(430px,100%);padding:2.7rem 2rem 2.1rem;text-align:center;border-radius:28px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.035));backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 30px 80px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.18);overflow:hidden;animation:spLoadCardIn .7s cubic-bezier(.22,1,.36,1) both}
          .sp-load-card::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.14) 48%,transparent 64%);transform:translateX(-130%);animation:spLoadSheen 4s ease-in-out infinite;pointer-events:none}
          .sp-load-orb{position:relative;width:112px;height:112px;margin:0 auto 1.35rem;display:grid;place-items:center}
          .sp-load-orb::before{content:"";position:absolute;inset:-6px;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 52%,rgba(167,243,208,.92) 72%,rgba(52,211,153,.15) 88%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));animation:spLoadSpin 2.6s linear infinite}
          .sp-load-orb::after{content:"";position:absolute;inset:8px;border-radius:50%;background:radial-gradient(circle,rgba(52,211,153,.38),transparent 68%);filter:blur(8px);animation:spLoadPulse 2.8s ease-in-out infinite}
          .sp-load-logo{position:relative;z-index:1;width:86px;height:86px;border-radius:50%;background:#fff;padding:10px;object-fit:contain;box-shadow:0 12px 34px rgba(0,0,0,.4),0 0 0 6px rgba(255,255,255,.06)}
          .sp-load-kicker{margin:0;font-size:.68rem;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:#6ee7b7}
          .sp-load-title{margin:.4rem 0 0;font-size:1.42rem;line-height:1.25;font-weight:800;letter-spacing:-.02em;background:linear-gradient(92deg,#ffffff 20%,#d1fae5 55%,#6ee7b7 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
          .sp-load-dots{display:inline-flex;gap:3px;margin-left:2px;vertical-align:baseline}
          .sp-load-dots i{width:5px;height:5px;border-radius:999px;background:#6ee7b7;display:inline-block;animation:spLoadDot 1.2s ease-in-out infinite}
          .sp-load-dots i:nth-child(2){animation-delay:.15s}
          .sp-load-dots i:nth-child(3){animation-delay:.3s}
          .sp-load-swap{position:relative;height:1.35rem;margin:.85rem 0 1.15rem;font-size:.8rem;color:rgba(209,250,229,.78)}
          .sp-load-swap span{position:absolute;inset:0;opacity:0;transform:translateY(8px);animation:spLoadSwap 9s ease-in-out infinite}
          .sp-load-swap span:nth-child(2){animation-delay:3s}
          .sp-load-swap span:nth-child(3){animation-delay:6s}
          .sp-load-track{position:relative;height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.35)}
          .sp-load-bar{position:absolute;top:0;bottom:0;width:42%;border-radius:999px;background:linear-gradient(90deg,rgba(16,185,129,0),#34d399 35%,#a7f3d0 65%,rgba(16,185,129,0));animation:spLoadBar 1.9s cubic-bezier(.65,0,.35,1) infinite}
          .sp-load-note{margin:.95rem 0 0;font-size:.72rem;color:rgba(226,240,233,.5)}
          @keyframes spLoadSpin{to{transform:rotate(360deg)}}
          @keyframes spLoadPulse{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.06)}}
          @keyframes spLoadCardIn{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
          @keyframes spLoadSheen{0%,62%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
          @keyframes spLoadDrift{to{background-position:26px 26px}}
          @keyframes spLoadFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(30px,-24px,0)}}
          @keyframes spLoadDot{0%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}
          @keyframes spLoadSwap{0%{opacity:0;transform:translateY(8px)}4%,27%{opacity:1;transform:none}33%,100%{opacity:0;transform:translateY(-8px)}}
          @keyframes spLoadBar{0%{left:-45%}60%{left:58%}100%{left:105%}}
          @media (max-width:480px){.sp-load-card{padding:2.1rem 1.25rem 1.7rem;border-radius:22px}.sp-load-title{font-size:1.22rem}.sp-load-orb{width:96px;height:96px;margin-bottom:1.1rem}.sp-load-logo{width:74px;height:74px}}
          @media (prefers-reduced-motion:reduce){.sp-standalone--loading::before,.sp-standalone--loading::after,.sp-load-card,.sp-load-card::after,.sp-load-orb::before,.sp-load-orb::after,.sp-load-bar,.sp-load-dots i,.sp-load-swap span{animation:none}.sp-load-swap span:first-child{opacity:1;transform:none}}
        `}</style>
        <div className="sp-load-card" role="status" aria-live="polite" aria-label="Loading your portal">
          <div className="sp-load-orb" aria-hidden="true">
            <Image src="/assets/logo.png" alt="" width={86} height={86} className="sp-load-logo" priority />
          </div>
          <p className="sp-load-kicker">Amali Kitukutu</p>
          <h1 className="sp-load-title">
            Loading your portal
            <span className="sp-load-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </h1>
          <div className="sp-load-swap" aria-hidden="true">
            <span>Preparing your dashboard</span>
            <span>Fetching your subjects</span>
            <span>Checking your assignments</span>
          </div>
          <div className="sp-load-track" aria-hidden="true">
            <span className="sp-load-bar" />
          </div>
          <p className="sp-load-note">This only takes a moment.</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="sp-standalone">
        <div className="sp-card sp-card--narrow">
          <div className="sp-alert sp-alert--error">
            {error || "Could not load your information."}
          </div>
          <Link className="sp-btn sp-btn--primary" href="/student/login">
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-shell">
      <header className="sp-topbar">
        <div className="sp-brand">
          <Image src="/assets/logo.png" alt="Amali Kitukutu logo" width={40} height={40} sizes="40px" />
          <div>
            <strong>Amali Kitukutu</strong>
            <span>Student Portal</span>
          </div>
        </div>

        <nav className="sp-tabs" aria-label="Portal sections">
          <button
            type="button"
            className={tab === "home" && !openAssignment ? "sp-tab sp-tab--active" : "sp-tab"}
            onClick={() => {
              setOpenAssignment(null);
              setTab("home");
            }}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={tab === "results" && !openAssignment ? "sp-tab sp-tab--active" : "sp-tab"}
            onClick={() => {
              setOpenAssignment(null);
              setTab("results");
            }}
          >
            Results
          </button>
          <button
            type="button"
            className={tab === "assignments" && !openAssignment ? "sp-tab sp-tab--active" : "sp-tab"}
            onClick={() => {
              setOpenAssignment(null);
              setTab("assignments");
            }}
          >
            Assignments
            {pendingAssignments.length > 0 && (
              <span className="sp-tab-badge">{pendingAssignments.length}</span>
            )}
          </button>
          <button
            type="button"
            className={tab === "notes" && !openAssignment ? "sp-tab sp-tab--active" : "sp-tab"}
            onClick={() => {
              setOpenAssignment(null);
              setTab("notes");
            }}
          >
            Notes
          </button>
        </nav>

        <div className="sp-userbox">
          <div className="sp-avatar">{initials.toUpperCase()}</div>
          <div className="sp-userbox-text">
            <strong>{fullName}</strong>
            <span>{me.student.registrationNo}</span>
          </div>
          <div className="sp-userbox-actions">
            <Link className="sp-link" href="/student/change-password">
              Change password
            </Link>
            <button
              type="button"
              className="sp-link sp-link--danger"
              onClick={() => setConfirmingLogout(true)}
              disabled={loggingOut}
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      </header>

      <main className="sp-main">
        <StudentNoticeDialog
          open={Boolean(error)}
          tone="error"
          title="Something went wrong"
          message={error}
          onClose={() => setError("")}
        />

        {openAssignment ? (
          <StudentAssignmentView
            assignmentId={openAssignment}
            onBack={() => setOpenAssignment(null)}
            onUpdated={() => void loadAssignments()}
          />
        ) : (
          <>
            {tab === "home" && (
              <div className="sp-stack">
                <HolidayMarquee />

                <section className="sp-hero">
                  <div className="sp-hero-avatar">{initials.toUpperCase()}</div>
                  <div className="sp-hero-body">
                    <span className="sp-eyebrow">Welcome back</span>
                    <h1>{fullName}</h1>
                    <p>
                      {me.student.registrationNo} · {me.student.className || "Class"} ·{" "}
                      {me.student.streamName || "Stream"}
                    </p>
                  </div>
                  <div className="sp-hero-actions">
                    <button
                      type="button"
                      className="sp-btn sp-btn--hero"
                      onClick={() => setTab("results")}
                    >
                      View results
                    </button>
                    <button
                      type="button"
                      className="sp-btn sp-btn--hero"
                      onClick={() => setTab("assignments")}
                    >
                      Assignments
                      {pendingAssignments.length > 0 && (
                        <span className="sp-hero-badge">{pendingAssignments.length}</span>
                      )}
                    </button>
                  </div>
                </section>

                <section className="sp-stats">
                  <article className="sp-stat">
                    <span>Published exams</span>
                    <strong>{activeYearExams.length}</strong>
                    <small>
                      {activeYearExams[0]
                        ? `Year ${activeYearExams[0].year}`
                        : resultsActiveYear
                          ? `No exams for ${resultsActiveYear} yet`
                          : "No exams yet"}
                    </small>
                  </article>
                  <article className="sp-stat">
                    <span>Latest exam average</span>
                    <strong>
                      {latestExam?.average === null || latestExam?.average === undefined
                        ? "—"
                        : `${latestExam.average}%`}
                    </strong>
                    <small>{latestExam ? latestExam.name : "No results yet"}</small>
                  </article>
                  <article className="sp-stat">
                    <span>Assignments to do</span>
                    <strong>{pendingAssignments.length}</strong>
                    <small>
                      {pendingAssignments.length === 0
                        ? "All done"
                        : "Open an assignment to submit"}
                    </small>
                  </article>
                </section>

                <div className="sp-home-grid">
                  <section className="sp-card">
                    <div className="sp-section-head">
                      <h2>Your profile</h2>
                    </div>
                    <dl className="sp-profile-grid">
                      <div>
                        <dt>Full name</dt>
                        <dd>{fullName}</dd>
                      </div>
                      <div>
                        <dt>Registration No.</dt>
                        <dd>{me.student.registrationNo || "—"}</dd>
                      </div>
                      <div>
                        <dt>Class / Form</dt>
                        <dd>{me.student.className || "—"}</dd>
                      </div>
                      <div>
                        <dt>Stream</dt>
                        <dd>{me.student.streamName || "—"}</dd>
                      </div>
                      <div>
                        <dt>Gender</dt>
                        <dd>{me.student.gender === "Male" ? "Male" : me.student.gender === "Female" ? "Female" : me.student.gender || "—"}</dd>
                      </div>
                      <div>
                        <dt>Phone</dt>
                        <dd>{me.student.phone || "—"}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="sp-card">
                    <div className="sp-section-head">
                      <h2>Your subjects</h2>
                      <span className="sp-chip">{me.subjects.length} subjects</span>
                    </div>
                    {me.subjects.length === 0 ? (
                      <p className="sp-muted">No subjects have been set for you yet.</p>
                    ) : (
                      <ul className="sp-subject-list">
                        {me.subjects.map((subject) => (
                          <li key={subject.id} className="sp-subject-item">
                            <div className="sp-subject-name">
                              <strong>{subject.name}</strong>
                              <span className="sp-muted"> {subject.code}</span>
                            </div>
                            <div className="sp-subject-teacher">
                              {subject.teachers.length === 0 ? (
                                <span className="sp-muted">No teacher assigned</span>
                              ) : (
                                subject.teachers.map((teacher, index) => (
                                  <span key={`${teacher.name}-${index}`}>
                                    {teacher.name}
                                    {teacher.phone ? (
                                      <>
                                        {" · "}
                                        <a href={`tel:${teacher.phone.replace(/\s+/g, "")}`}>
                                          {teacher.phone}
                                        </a>
                                      </>
                                    ) : null}
                                  </span>
                                ))
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                <section className="sp-card">
                  <div className="sp-section-head">
                    <h2>Assignments</h2>
                    <button
                      type="button"
                      className="sp-link"
                      onClick={() => setTab("assignments")}
                    >
                      View all
                    </button>
                  </div>
                  {assignments.length === 0 ? (
                    <p className="sp-muted">No assignments right now.</p>
                  ) : (
                    <div className="sp-assignment-list">
                      {[...assignments]
                        .sort((a, b) => statusOrder(a.submissionStatus) - statusOrder(b.submissionStatus))
                        .slice(0, 4)
                        .map((assignment) => (
                          <AssignmentRow
                            key={assignment.id}
                            assignment={assignment}
                            onOpen={() => setOpenAssignment(assignment.id)}
                          />
                        ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {tab === "results" && (
              <ResultsTab
                exams={exams}
                subjectsInfo={me.subjects}
                year={resultsYear}
                activeYear={resultsActiveYear}
                years={resultsYears}
                loading={resultsLoading}
                className={me.student.className}
                onYearChange={(year) => void loadResultsYear(year)}
              />
            )}

            {tab === "assignments" && (
              <div className="sp-stack">
                <div className="sp-section-head">
                  <div>
                    <h1 className="sp-page-title">Assignments</h1>
                    <p className="sp-muted">
                      Assignments set for your subject, class and stream.
                    </p>
                  </div>
                </div>

                <div className="sp-filter-bar" role="group" aria-label="Filter assignments">
                  {(
                    [
                      ["all", "All"],
                      ["pending", "Pending"],
                      ["done", "Submitted"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        assignmentFilter === value
                          ? "sp-chip sp-chip--button sp-chip--active"
                          : "sp-chip sp-chip--button"
                      }
                      onClick={() => setAssignmentFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {assignments.length === 0 ? (
                  <div className="sp-card">
                    <p className="sp-muted">No assignments right now.</p>
                  </div>
                ) : (
                  <div className="sp-assignment-list">
                    {assignments
                      .filter((assignment) => {
                        if (assignmentFilter === "pending") {
                          return assignment.submissionStatus === "not_done";
                        }
                        if (assignmentFilter === "done") {
                          return assignment.submissionStatus !== "not_done";
                        }
                        return true;
                      })
                      .map((assignment) => (
                        <AssignmentRow
                          key={assignment.id}
                          assignment={assignment}
                          onOpen={() => setOpenAssignment(assignment.id)}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}

            {tab === "notes" && <StudentNotesTab topics={noteTopics} />}
          </>
        )}
      </main>

      <StudentConfirmDialog
        open={confirmingLogout}
        title="Log out of the portal?"
        message="You will need your registration number and password to sign in again."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        tone="danger"
        onConfirm={() => void handleLogout()}
        onCancel={() => setConfirmingLogout(false)}
      />
      {loggingOut && <StudentLogoutOverlay />}
    </div>
  );
}

function AssignmentRow({
  assignment,
  onOpen,
}: {
  assignment: AssignmentSummary;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="sp-assignment-card" onClick={onOpen}>
      <div className="sp-assignment-card-main">
        <span className="sp-assignment-subject">
          {assignment.subjectName}
          <span>
            {assignment.className} {assignment.streamName} · Term {assignment.term} ·{" "}
            {assignment.academicYearId}
          </span>
        </span>
        <strong>{assignment.title}</strong>
        <span className="sp-muted">
          Deadline: {assignment.deadline ? formatDate(assignment.deadline, true) : "None"}
        </span>
      </div>
      <div className="sp-assignment-card-side">
        <span className={`sp-status sp-status--${assignment.submissionStatus}`}>
          {studentStatusLabel[assignment.submissionStatus]}
        </span>
        {assignment.submissionStatus === "marked" && (
          <span className="sp-mark">
            {assignment.awardedMarks ?? 0} / {assignment.totalMarks}
          </span>
        )}
        {assignment.isLate && <span className="sp-late">Late</span>}
      </div>
    </button>
  );
}

function ResultsTab({
  exams,
  subjectsInfo,
  year,
  activeYear,
  years,
  loading,
  className,
  onYearChange,
}: {
  exams: StudentExamResult[];
  subjectsInfo: StudentMe["subjects"];
  year: string;
  activeYear: string;
  years: string[];
  loading: boolean;
  className: string;
  onYearChange: (year: string) => void;
}) {
  const sortedExams = useMemo(
    () =>
      [...exams].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      ),
    [exams],
  );

  const [selectedExamId, setSelectedExamId] = useState("");
  const activeExam =
    sortedExams.find((exam) => exam.id === selectedExamId) ?? sortedExams[0] ?? null;
  const activeExamId = activeExam?.id ?? "";

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const exam of exams) {
      for (const subject of exam.subjects) {
        map.set(subject.subjectId, subject.name);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

  const [progressSubject, setProgressSubject] = useState("");
  const activeSubjectId = progressSubject || subjects[0]?.id || "";
  const activeSubject = subjects.find((subject) => subject.id === activeSubjectId);

  const teachersBySubject = useMemo(() => {
    const map = new Map<string, StudentMe["subjects"][number]["teachers"]>();
    for (const subject of subjectsInfo) {
      map.set(subject.id, subject.teachers);
    }
    return map;
  }, [subjectsInfo]);

  const progressPoints = useMemo(() => {
    if (!activeSubjectId) return [];
    return [...exams]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map((exam) => {
        const subject = exam.subjects.find((row) => row.subjectId === activeSubjectId);
        if (!subject || subject.score === null) return null;
        return { label: shortDate(exam.startDate), value: Math.round(subject.score) };
      })
      .filter((point): point is { label: string; value: number } => point !== null);
  }, [exams, activeSubjectId]);

  return (
    <div className="sp-stack">
      <div className="sp-section-head">
        <div>
          <h1 className="sp-page-title">Results</h1>
          <p className="sp-muted">
            {sortedExams.length > 0
              ? `${sortedExams.length} published exam${
                  sortedExams.length === 1 ? "" : "s"
                } for ${year || "this year"}. Choose an exam to view its results.`
              : `Academic year ${year || activeYear}.`}
          </p>
        </div>
        <label className="sp-inline-field">
          <span>Academic year</span>
          <select
            className="sp-select"
            value={year}
            onChange={(event) => onYearChange(event.target.value)}
            disabled={loading}
          >
            {(years.length > 0 ? years : [year].filter(Boolean)).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sortedExams.length === 0 ? (
        <div className="sp-card">
          <p className="sp-muted">
            {loading
              ? "Loading results…"
              : year === activeYear
                ? `No exams have been set for ${
                    className || "your class"
                  } in ${year} yet. Choose a previous academic year above to see earlier results.`
                : `No published results for ${year}.`}
          </p>
        </div>
      ) : (
        <>
          <div className="sp-exam-picker" role="tablist" aria-label="Published exams">
            {sortedExams.map((exam) => (
              <button
                key={exam.id}
                type="button"
                role="tab"
                aria-selected={exam.id === activeExamId}
                className={
                  exam.id === activeExamId
                    ? "sp-exam-option sp-exam-option--active"
                    : "sp-exam-option"
                }
                onClick={() => setSelectedExamId(exam.id)}
              >
                <strong>{exam.name}</strong>
                <span>
                  {formatDate(exam.startDate)} · Term {exam.term}
                </span>
                <span className="sp-exam-option-meta">
                  {exam.hasMarks
                    ? exam.average === null
                      ? "Marks recorded"
                      : `${exam.average}% average`
                    : "Results pending"}
                </span>
              </button>
            ))}
          </div>

          {activeExam && (
            <article className="sp-result-card">
              <header className="sp-result-head">
                <div>
                  <h2>{activeExam.name}</h2>
                  <p className="sp-muted">
                    {formatDate(activeExam.startDate)} – {formatDate(activeExam.endDate)} · Term{" "}
                    {activeExam.term} · {activeExam.year}
                  </p>
                </div>
                <div className="sp-result-summary">
                  <div>
                    <span>Average</span>
                    <strong>
                      {activeExam.average === null ? "—" : `${activeExam.average}%`}
                    </strong>
                  </div>
                  <div>
                    <span>Division</span>
                    <strong>{activeExam.incomplete ? "—" : activeExam.division || "—"}</strong>
                  </div>
                  <div>
                    <span>Points</span>
                    <strong>{activeExam.points ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Class position</span>
                    <strong>
                      {activeExam.classPosition
                        ? `${activeExam.classPosition} / ${activeExam.classSize}`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Stream position</span>
                    <strong>
                      {activeExam.streamPosition
                        ? `${activeExam.streamPosition} / ${activeExam.streamSize}`
                        : "—"}
                    </strong>
                  </div>
                </div>
              </header>

              {activeExam.hasMarks && activeExam.incomplete && (
                <div className="sp-alert sp-alert--warn">
                  Results are incomplete — some subjects have no marks.
                </div>
              )}

              {!activeExam.hasMarks && (
                <div className="sp-alert sp-alert--warn">
                  Marks for this exam have not been entered yet. Please check again later.
                </div>
              )}

              {activeExam.hasMarks && (
                <div className="sp-table-wrap">
                  <table className="sp-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Theory</th>
                        <th>Practical</th>
                        <th>Total</th>
                        <th>Grade</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeExam.subjects.map((subject) => {
                        const teachers = teachersBySubject.get(subject.subjectId) ?? [];
                        return (
                          <tr key={subject.subjectId}>
                            <td>
                              <strong>{subject.name}</strong>
                              <span className="sp-muted"> {subject.code}</span>
                            </td>
                            <td>
                              {teachers.length === 0 ? (
                                <span className="sp-muted">Not assigned</span>
                              ) : (
                                <span className="sp-teacher-cell">
                                  {teachers.map((teacher, index) => (
                                    <span key={`${teacher.name}-${index}`}>
                                      {teacher.name}
                                      {teacher.phone ? (
                                        <>
                                          {" · "}
                                          <a href={`tel:${teacher.phone.replace(/\s+/g, "")}`}>
                                            {teacher.phone}
                                          </a>
                                        </>
                                      ) : null}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </td>
                            <td>{subject.isAbsent ? "Absent" : subject.theory ?? "—"}</td>
                            <td>{subject.isAbsent ? "—" : subject.practical ?? "—"}</td>
                            <td>
                              {subject.isAbsent
                                ? "Absent"
                                : subject.score === null
                                  ? "—"
                                  : subject.score}
                            </td>
                            <td>
                              <span
                                className={`sp-grade sp-grade--${(
                                  subject.grade || "F"
                                ).toLowerCase()}`}
                              >
                                {subject.grade || "—"}
                              </span>
                            </td>
                            <td>{subject.points ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          )}
        </>
      )}

      {sortedExams.length > 0 && (
        <section className="sp-card">
          <div className="sp-section-head">
            <div>
              <h2>Progress by subject</h2>
              <p className="sp-muted">Your score in each exam for the selected subject.</p>
            </div>
            <label className="sp-inline-field">
              <span>Subject</span>
              <select
                className="sp-select"
                value={activeSubjectId}
                onChange={(event) => setProgressSubject(event.target.value)}
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {progressPoints.length >= 2 ? (
            <div className="sp-chart">
              <LineChart points={progressPoints} unit="%" />
            </div>
          ) : (
            <p className="sp-muted">
              {activeSubject
                ? `At least two exams with ${activeSubject.name} marks are needed to draw a chart.`
                : "Not enough data to draw a chart."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
