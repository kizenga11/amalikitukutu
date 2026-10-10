"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  fetchExamAttendance,
  fetchExams,
  fetchSchoolInfo,
  fetchTeacherByAuth,
  fetchTeachingAssignments,
  type DbExamRow,
  type ExamAttendanceData,
  type SchoolInfo,
  type TeachingAssignment,
} from "@/lib/school-api";
import {
  buildAttendanceSheets,
  listClassStreams,
  type AttendanceSheet,
} from "@/lib/exam-attendance";

type Step = "exam" | "class" | "stream" | "sheet";

const stepLabels: Record<Step, string> = {
  exam: "1. Choose Exam",
  class: "2. Choose Class",
  stream: "3. Choose Stream",
  sheet: "4. Sign-in Sheets",
};

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

function AttendanceSheetView({
  sheet,
  exam,
  schoolInfo,
}: {
  sheet: AttendanceSheet;
  exam: DbExamRow;
  schoolInfo: SchoolInfo | null;
}) {
  return (
    <article className="att-sheet">
      <header className="att-header">
        {schoolInfo?.unionLogo ? (
          <img className="att-logo" src={schoolInfo.unionLogo} alt="" />
        ) : (
          <span className="att-logo att-logo--placeholder" />
        )}
        <div className="att-header-info">
          <div className="att-council">
            {(schoolInfo?.council || schoolInfo?.district || "DISTRICT COUNCIL").toUpperCase()}
          </div>
          <div className="att-school">{(schoolInfo?.name || "SECONDARY SCHOOL").toUpperCase()}</div>
          {schoolInfo?.address && <div className="att-address">{schoolInfo.address}</div>}
          <div className="att-title">EXAMINATION ATTENDANCE SHEET</div>
          <div className="att-exam">{exam.name.toUpperCase()}</div>
        </div>
        {schoolInfo?.schoolLogo ? (
          <img className="att-logo" src={schoolInfo.schoolLogo} alt="" />
        ) : (
          <span className="att-logo att-logo--placeholder" />
        )}
      </header>

      <div className="att-meta">
        <span>Class: <strong>{sheet.class_name}</strong></span>
        <span>Stream: <strong>{sheet.stream_name}</strong></span>
        <span>Subject: <strong>{sheet.subject_name} ({sheet.subject_code})</strong></span>
        <span className="att-date">Date: <span className="att-date-line" /></span>
      </div>

      <table className="att-table">
        <thead>
          <tr>
            <th className="att-col-no">No</th>
            <th className="att-col-reg">Registration No</th>
            <th className="att-col-name">Student Name</th>
            <th className="att-col-sign">Signature</th>
            <th className="att-col-score">Marks</th>
          </tr>
        </thead>
        <tbody>
          {sheet.students.length === 0 && (
            <tr>
              <td colSpan={5} className="att-empty">
                No students for this subject in this stream.
              </td>
            </tr>
          )}
          {sheet.students.map((student) => (
            <tr key={student.student_id}>
              <td className="att-col-no">{student.no}</td>
              <td className="att-col-reg">{student.registration_no ?? "—"}</td>
              <td className="att-col-name">{student.full_name}</td>
              <td className="att-col-sign" />
              <td className="att-col-score" />
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="att-signatures">
        <div className="att-sig">
          <span className="att-sig-line" />
          <span>Subject Teacher</span>
        </div>
        <div className="att-sig">
          <span className="att-sig-line" />
          <span>Exam Supervisor</span>
        </div>
      </footer>
    </article>
  );
}

export default function ExamAttendance({ teacherId }: { teacherId?: string }) {
  const [exams, setExams] = useState<DbExamRow[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [attendance, setAttendance] = useState<ExamAttendanceData | null>(null);
  const [teacherAssignments, setTeacherAssignments] = useState<TeachingAssignment[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [error, setError] = useState("");

  const [step, setStep] = useState<Step>("exam");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [streamKey, setStreamKey] = useState<string>("all");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  const isTeacher = !!teacherId;

  useEffect(() => {
    let active = true;
    Promise.all([fetchExams({ search: "", page: 1, pageSize: 100 }), fetchSchoolInfo()])
      .then(([examResult, info]) => {
        if (!active) return;
        const eligible = isTeacher ? examResult.rows.filter((exam) => exam.status !== "draft") : examResult.rows;
        setExams([...eligible].sort((a, b) => b.start_date.localeCompare(a.start_date)));
        setSchoolInfo(info);
      })
      .catch(() => active && setError("Failed to load exams from the database."))
      .finally(() => active && setLoadingExams(false));
    return () => {
      active = false;
    };
  }, [isTeacher]);

  useEffect(() => {
    if (!teacherId) return;
    let active = true;
    fetchTeacherByAuth(teacherId)
      .then((teacher) => {
        if (!teacher) return;
        fetchTeachingAssignments(teacher.id)
          .then((rows) => active && setTeacherAssignments(rows))
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [teacherId]);

  function chooseExam(exam: DbExamRow) {
    setSelectedExamId(exam.id);
    setAttendance(null);
    setSelectedClassId("");
    setStreamKey("all");
    setSelectedSubjectId("");
    setError("");
    setLoadingSheets(true);
    fetchExamAttendance(exam.id)
      .then((data) => {
        setAttendance(data);
        setStep("class");
      })
      .catch(() => setError("Failed to load attendance data for this exam."))
      .finally(() => setLoadingSheets(false));
  }

  const selectedExam = exams.find((exam) => exam.id === selectedExamId) ?? null;

  // For teachers, only surface subjects they are assigned to in the class.
  // Admin users see the full exam.
  const scopedData = useMemo<ExamAttendanceData | null>(() => {
    if (!attendance) return null;
    if (!isTeacher) return attendance;
    const allowed = new Set(
      teacherAssignments.filter((a) => a.class_id === selectedClassId).map((a) => a.subject_id),
    );
    return {
      classes: attendance.classes.map((cls) =>
        cls.class_id === selectedClassId
          ? { ...cls, subjects: cls.subjects.filter((s) => allowed.has(s.subject_id)) }
          : cls,
      ),
    };
  }, [attendance, isTeacher, teacherAssignments, selectedClassId]);

  const selectedClass = useMemo(
    () => scopedData?.classes.find((cls) => cls.class_id === selectedClassId) ?? null,
    [scopedData, selectedClassId],
  );

  const streamOptions = useMemo(
    () => (scopedData && selectedClassId ? listClassStreams(scopedData, selectedClassId) : []),
    [scopedData, selectedClassId],
  );

  const sheets = useMemo(() => {
    if (!scopedData || !selectedClassId) return [];
    const stream = streamKey === "all" ? "all" : streamKey === "__none__" ? null : streamKey;
    return buildAttendanceSheets(scopedData, {
      classId: selectedClassId,
      stream,
      subjectId: selectedSubjectId || null,
    });
  }, [scopedData, selectedClassId, streamKey, selectedSubjectId]);

  const totalStudents = useMemo(
    () => sheets.reduce((sum, sheet) => sum + sheet.students.length, 0),
    [sheets],
  );

  function backToStep(next: Step) {
    setStep(next);
    if (next === "class") setSelectedClassId("");
    if (next === "stream" || next === "class") setSelectedSubjectId("");
  }

  function reset() {
    setAttendance(null);
    setSelectedExamId("");
    setSelectedClassId("");
    setStreamKey("all");
    setSelectedSubjectId("");
    setError("");
    setStep("exam");
  }

  return (
    <div className="att-page">
      <div className="page-head att-no-print">
        <div>
          <h2 className="page-title">Exam Attendance</h2>
          <p className="page-sub">
            Generate sign-in sheets for each subject and stream — ready to print or save as PDF.
          </p>
        </div>
        {selectedExam && step !== "exam" && (
          <div className="page-head-right">
            <span className="active-chip">{selectedExam.name}</span>
            <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={reset}>
              Change Exam
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="st-empty-state att-no-print">
          {error}
          <div>
            <button className="cm-btn cm-btn--ghost st-retry" onClick={reset}>
              Start Over
            </button>
          </div>
        </div>
      )}

      {!error && (
        <>
          {step !== "exam" && (
            <ol className="me-steps att-no-print">
              {(["exam", "class", "stream", "sheet"] as Step[]).map((current, i) => {
                const active = step === current;
                const done = (["exam", "class", "stream", "sheet"] as Step[]).indexOf(step) > i;
                return (
                  <li
                    key={current}
                    className={`me-step${active ? " me-step--active" : ""}${done ? " me-step--done" : ""}${i + 1 === 4 ? " me-step--last" : ""}`}
                  >
                    <span className="me-step-num">{done ? "\u2713" : i + 1}</span>
                    <span className="me-step-label">{stepLabels[current]}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {/* ── STEP: Choose exam ── */}
          {step === "exam" && (
            <>
              {loadingExams ? (
                <div className="me-loading">
                  <Spinner size={20} />
                </div>
              ) : exams.length === 0 ? (
                <div className="st-empty-state">No exams registered. Register an exam first.</div>
              ) : (
                <div className="me-grid att-no-print">
                  {exams.map((exam) => (
                    <button key={exam.id} className="me-card" onClick={() => chooseExam(exam)}>
                      <span className="me-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                          <rect x="9" y="3" width="6" height="4" rx="1" />
                          <path d="m9 14 2 2 4-4" />
                        </svg>
                      </span>
                      <span className="me-card-title">{exam.name}</span>
                      <span className="me-card-sub">
                        {formatDate(exam.start_date)} {'\u2192'} {formatDate(exam.end_date)} {'\u00B7'} {exam.class_count} classes
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {(loadingSheets || (step !== "exam" && !attendance)) && !error && (
            <div className="me-loading">
              <Spinner size={20} />
            </div>
          )}

          {/* ── STEP: Choose class ── */}
          {step === "class" && attendance && (
            <>
              <div className="me-grid att-no-print">
                {attendance.classes.length === 0 && <p className="me-empty">This exam has no classes.</p>}
                {attendance.classes.map((cls) => (
                  <button
                    key={cls.class_id}
                    className="me-card"
                    onClick={() => {
                      setSelectedClassId(cls.class_id);
                      setStreamKey("all");
                      setSelectedSubjectId("");
                      setStep("stream");
                    }}
                  >
                    <span className="me-card-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    </span>
                    <span className="me-card-title">{cls.class_name}</span>
                    <span className="me-card-sub">
                      {cls.students.length} students {'\u00B7'} {cls.subjects.length} subjects
                    </span>
                  </button>
                ))}
              </div>
              <div className="att-step-actions att-no-print">
                <button className="cm-btn cm-btn--ghost" onClick={() => backToStep("exam")}>
                  {'\u2190'} Exams
                </button>
              </div>
            </>
          )}

          {/* ── STEP: Choose stream ── */}
          {step === "stream" && selectedClass && (
            <>
              <div className="me-grid att-no-print">
                <button
                  className={`me-card me-card--wide${streamKey === "all" ? " me-card--selected" : ""}`}
                  onClick={() => {
                    setStreamKey("all");
                    setSelectedSubjectId("");
                    setStep("sheet");
                  }}
                >
                  <span className="me-card-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="14" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                  </span>
                  <span className="me-card-title">All Streams</span>
                  <span className="me-card-sub">Sheets for all streams in {selectedClass.class_name}</span>
                </button>

                {streamOptions.map((stream) => {
                  const key = stream.id ?? "__none__";
                  return (
                    <button
                      key={key}
                      className={`me-card${streamKey === key ? " me-card--selected" : ""}`}
                      onClick={() => {
                        setStreamKey(key);
                        setSelectedSubjectId("");
                        setStep("sheet");
                      }}
                    >
                      <span className="me-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="m16 11 2 2 4-4" />
                        </svg>
                      </span>
                      <span className="me-card-title">{stream.name}</span>
                      <span className="me-card-sub">{stream.count} students</span>
                    </button>
                  );
                })}
              </div>
              <div className="att-step-actions att-no-print">
                <button className="cm-btn cm-btn--ghost" onClick={() => backToStep("class")}>
                  {'\u2190'} Classes
                </button>
              </div>
            </>
          )}

          {/* ── STEP: Printable sheets ── */}
          {step === "sheet" && selectedClass && selectedExam && (
            <>
              <div className="att-toolbar att-no-print">
                <label className="att-field">
                  <span className="att-field-label">Stream</span>
                  <select
                    className="att-select"
                    value={streamKey}
                    onChange={(event) => {
                      setStreamKey(event.target.value);
                      setSelectedSubjectId("");
                    }}
                  >
                    <option value="all">All Streams</option>
                    {streamOptions.map((stream) => (
                      <option key={stream.id ?? "__none__"} value={stream.id ?? "__none__"}>
                        {stream.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="att-field">
                  <span className="att-field-label">Subject</span>
                  <select
                    className="att-select"
                    value={selectedSubjectId}
                    onChange={(event) => setSelectedSubjectId(event.target.value)}
                  >
                    <option value="">All Subjects</option>
                    {selectedClass.subjects.map((subject) => (
                      <option key={subject.subject_id} value={subject.subject_id}>
                        {subject.name} ({subject.code})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="att-toolbar-actions">
                  <span className="att-count">
                    {sheets.length} sheets {'\u00B7'} {totalStudents.toLocaleString()} students
                  </span>
                  <button className="cm-btn cm-btn--ghost" onClick={() => backToStep("stream")}>
                    {'\u2190'} Streams
                  </button>
                  <button
                    className="cm-btn cm-btn--primary"
                    disabled={sheets.length === 0}
                    onClick={() => window.print()}
                  >
                    Print / Save PDF
                  </button>
                </div>
              </div>

              {totalStudents > 1500 && (
                <p className="att-hint att-no-print">
                  Large number. For faster printing, choose a single <strong>subject</strong> or <strong>stream</strong>.
                </p>
              )}

              {sheets.length === 0 ? (
                <div className="st-empty-state att-no-print">
                  No students enrolled in the selected subject/stream.
                </div>
              ) : (
                <div className="att-sheets">
                  {sheets.map((sheet) => (
                    <AttendanceSheetView
                      key={sheet.key}
                      sheet={sheet}
                      exam={selectedExam}
                      schoolInfo={schoolInfo}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
