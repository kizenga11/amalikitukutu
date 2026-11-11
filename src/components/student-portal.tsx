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
  fetchStudentResults,
  logoutStudent,
  StudentApiError,
  type StudentMe,
} from "@/lib/student-portal-api";
import type { StudentExamResult } from "@/lib/student-results-server";
import StudentAssignmentView from "@/components/student-assignment-view";
import "./student-portal.css";

type Tab = "home" | "results" | "assignments";

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
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "pending" | "done">("all");

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

        const [resultsResult, assignmentsResult] = await Promise.allSettled([
          fetchStudentResults(),
          fetchStudentAssignments(),
        ]);
        if (cancelled) return;

        if (resultsResult.status === "fulfilled") {
          setExams(resultsResult.value.exams);
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

        if (resultsResult.status === "rejected" || assignmentsResult.status === "rejected") {
          const reason =
            resultsResult.status === "rejected"
              ? resultsResult.reason
              : (assignmentsResult as PromiseRejectedResult).reason;
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
    try {
      await logoutStudent();
    } catch {
      // Ignore network errors while logging out.
    }
    router.replace("/student/login");
  }

  const fullName = me
    ? me.student.fullName ||
      [me.student.firstName, me.student.middleName, me.student.lastName]
        .filter(Boolean)
        .join(" ")
    : "";

  const initials = (me?.student.firstName?.[0] ?? "") + (me?.student.lastName?.[0] ?? "");

  const latestExam = useMemo(() => {
    if (exams.length === 0) return null;
    return [...exams].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    )[0];
  }, [exams]);

  const pendingAssignments = assignments.filter(
    (assignment) => assignment.submissionStatus === "not_done",
  );

  if (loading) {
    return (
      <div className="sp-standalone">
        <div className="sp-card sp-card--narrow">
          <p className="sp-muted">Loading your portal…</p>
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
          <Image src="/assets/logo.png" alt="Nembo ya Amali Kitukutu" width={40} height={40} sizes="40px" />
          <div>
            <strong>Amali Kitukutu</strong>
            <span>Student Portal</span>
          </div>
        </div>

        <nav className="sp-tabs" aria-label="Sehemu za portal">
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
            <button type="button" className="sp-link sp-link--danger" onClick={() => void handleLogout()}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="sp-main">
        {error && <div className="sp-alert sp-alert--error">{error}</div>}

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
                </section>

                <section className="sp-stats">
                  <article className="sp-stat">
                    <span>Published exams</span>
                    <strong>{exams.length}</strong>
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

                  <div className="sp-subjects">
                    <h3>Your subjects</h3>
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
                  </div>
                </section>

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
              <ResultsTab exams={exams} subjectsInfo={me.subjects} />
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
          </>
        )}
      </main>
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
}: {
  exams: StudentExamResult[];
  subjectsInfo: StudentMe["subjects"];
}) {
  const sortedExams = useMemo(
    () =>
      [...exams].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      ),
    [exams],
  );

  const [selectedExamId, setSelectedExamId] = useState("");
  const activeExamId = selectedExamId || sortedExams[0]?.id || "";
  const activeExam = sortedExams.find((exam) => exam.id === activeExamId) ?? null;

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

  if (exams.length === 0) {
    return (
      <div className="sp-card">
        <h1 className="sp-page-title">Results</h1>
        <p className="sp-muted">
          No published results yet. Results will appear here once the school publishes them.
        </p>
      </div>
    );
  }

  return (
    <div className="sp-stack">
      <div className="sp-section-head">
        <div>
          <h1 className="sp-page-title">Results</h1>
          <p className="sp-muted">
            All exams published for your class. Choose an exam to view its results.
          </p>
        </div>
        <label className="sp-inline-field">
          <span>Exam</span>
          <select
            className="sp-select"
            value={activeExamId}
            onChange={(event) => setSelectedExamId(event.target.value)}
          >
            {sortedExams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} · {formatDate(exam.startDate)} · Term {exam.term} · {exam.year}
              </option>
            ))}
          </select>
        </label>
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

          {activeExam.incomplete && (
            <div className="sp-alert sp-alert--warn">
              Results are incomplete — some subjects have no marks.
            </div>
          )}

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
                        {subject.isAbsent ? "Absent" : subject.score === null ? "—" : subject.score}
                      </td>
                      <td>
                        <span className={`sp-grade sp-grade--${(subject.grade || "F").toLowerCase()}`}>
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
        </article>
      )}

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
    </div>
  );
}
