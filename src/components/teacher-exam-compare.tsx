"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import { supabase } from "@/lib/supabase";
import { fetchSchoolInfo, type SchoolInfo } from "@/lib/school-api";

interface SubjectMeta {
  id: string;
  code: string;
  name: string;
  has_practical: boolean;
}

interface FormOption {
  class_id: string;
  class_name: string;
  form_level: number;
  subjects: SubjectMeta[];
}

interface ExamOption {
  id: string;
  name: string;
  start_date: string;
  end_date?: string;
  status?: string;
}

interface ExamSummaryStats {
  sat: number;
  absent: number;
  mean: number | null;
  highest: number | null;
  lowest: number | null;
  passed: number;
  passRate: number | null;
  competency: string;
  gradeCounts: Record<string, number>;
}

interface CompareStudentRow {
  student_id: string;
  name: string;
  stream: string;
  gender: string;
  scoreA: number | null;
  gradeA: string;
  scoreB: number | null;
  gradeB: string;
  diff: number | null;
  status: "improved" | "dropped" | "same" | "absent";
}

interface ComparePayload {
  teacherName: string;
  className: string;
  formLevel: number | null;
  subject: SubjectMeta | null;
  examA: { id: string; name: string; start_date: string };
  examB: { id: string; name: string; start_date: string };
  gradeOrder: string[];
  summary: {
    a: ExamSummaryStats;
    b: ExamSummaryStats;
    meanDiff: number | null;
    verdict: "improved" | "dropped" | "same";
  };
  students: CompareStudentRow[];
  counts: { improved: number; dropped: number; unchanged: number; absent: number };
  generatedAt: string;
}

type SortField = "diff" | "name";
type SortDir = "asc" | "desc";

function displayNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function displayDiff(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${displayNumber(value)}`;
}

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_LABEL: Record<CompareStudentRow["status"], string> = {
  improved: "Improved",
  dropped: "Dropped",
  same: "No change",
  absent: "Absent",
};

const STATUS_SYMBOL: Record<CompareStudentRow["status"], string> = {
  improved: "▲",
  dropped: "▼",
  same: "=",
  absent: "—",
};

const VERDICT_LABEL: Record<ComparePayload["summary"]["verdict"], string> = {
  improved: "Improved",
  dropped: "Dropped",
  same: "Same",
};

export default function TeacherExamCompare({ teacherId }: { teacherId?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examAId, setExamAId] = useState("");
  const [examBId, setExamBId] = useState("");

  const [exams, setExams] = useState<ExamOption[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);

  const [result, setResult] = useState<ComparePayload | null>(null);
  const [comparing, setComparing] = useState(false);
  const [message, setMessage] = useState("");
  const [sortField, setSortField] = useState<SortField>("diff");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const selectedForm = forms.find((form) => form.class_id === classId) ?? null;
  const subjectOptions = selectedForm?.subjects ?? [];

  const apiGet = useCallback(
    async (params: Record<string, string>): Promise<Response> => {
      const query = new URLSearchParams(params).toString();
      return fetch(`/api/teacher-compare?${query}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    },
    [token],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const sessionToken = data.session?.access_token ?? null;
      if (!active) return;
      setToken(sessionToken);
      if (!sessionToken) {
        setOptionsError("Your session has expired. Please sign in again.");
        setLoadingOptions(false);
        return;
      }
      try {
        const response = await fetch("/api/teacher-compare?action=options", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        const payload = (await response.json()) as { forms?: FormOption[]; error?: string };
        if (!active) return;
        if (!response.ok) {
          setOptionsError(payload.error ?? "Could not load your data.");
        } else {
          setForms(payload.forms ?? []);
        }
      } catch {
        if (active) setOptionsError("Could not reach the server.");
      } finally {
        if (active) setLoadingOptions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchSchoolInfo()
      .then((info) => setSchoolInfo(info))
      .catch(() => setSchoolInfo(null));
  }, []);

  useEffect(() => {
    if (!classId || !subjectId || !token) {
      setExams([]);
      return;
    }
    let active = true;
    setLoadingExams(true);
    (async () => {
      try {
        const response = await apiGet({ action: "exams", classId, subjectId });
        const payload = (await response.json()) as { exams?: ExamOption[]; error?: string };
        if (!active) return;
        if (!response.ok) {
          setExams([]);
          setMessage(payload.error ?? "");
        } else {
          const list = payload.exams ?? [];
          setExams(list);
          setMessage("");
          if (list.length >= 2) {
            setExamAId(list[list.length - 2].id);
            setExamBId(list[list.length - 1].id);
          } else if (list.length === 1) {
            setExamAId(list[0].id);
            setExamBId("");
          } else {
            setExamAId("");
            setExamBId("");
          }
        }
      } catch {
        if (active) {
          setExams([]);
          setMessage("Could not load exams.");
        }
      } finally {
        if (active) setLoadingExams(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [classId, subjectId, token, apiGet]);

  const clearResult = useCallback(() => {
    setResult(null);
    setMessage("");
  }, []);

  function changeForm(id: string) {
    setClassId(id);
    setSubjectId("");
    setExamAId("");
    setExamBId("");
    setExams([]);
    clearResult();
  }

  function changeSubject(id: string) {
    setSubjectId(id);
    setExamAId("");
    setExamBId("");
    clearResult();
  }

  function changeExamA(id: string) {
    setExamAId(id);
    if (id === examBId) setExamBId("");
    clearResult();
  }

  function changeExamB(id: string) {
    setExamBId(id);
    if (id === examAId) setExamAId("");
    clearResult();
  }

  async function runCompare() {
    if (!classId || !subjectId || !examAId || !examBId) {
      setMessage("Select a form, subject, Exam A and Exam B.");
      return;
    }
    if (examAId === examBId) {
      setMessage("Exam A and Exam B must be different.");
      return;
    }
    setComparing(true);
    setMessage("");
    try {
      const response = await apiGet({ action: "compare", classId, subjectId, examA: examAId, examB: examBId });
      const payload = (await response.json()) as ComparePayload & { error?: string };
      if (!response.ok) {
        setResult(null);
        setMessage(payload.error ?? "Could not compare.");
        return;
      }
      setResult(payload);
      setSortField("diff");
      setSortDir("asc");
    } catch {
      setResult(null);
      setMessage("Could not reach the server.");
    } finally {
      setComparing(false);
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedStudents = useMemo(() => {
    if (!result) return [];
    const rows = [...result.students];
    rows.sort((a, b) => {
      if (sortField === "name") {
        const cmp = a.name.localeCompare(b.name);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const ad = a.diff;
      const bd = b.diff;
      if (ad === null && bd === null) return a.name.localeCompare(b.name);
      if (ad === null) return 1;
      if (bd === null) return -1;
      const cmp = ad - bd;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [result, sortField, sortDir]);

  const streamSummary = useMemo(() => {
    if (!result) return "";
    const streams = Array.from(new Set(result.students.map((s) => s.stream).filter((s) => s && s !== "—")));
    if (streams.length === 0) return "";
    return streams.length === 1 ? streams[0] : "All Streams";
  }, [result]);

  if (loadingOptions) {
    return <div className="me-loading"><Spinner size={20} /></div>;
  }

  if (optionsError) {
    return <div className="st-empty-state">{optionsError}</div>;
  }

  const noAssignments = forms.length === 0;
  const canCompare = Boolean(classId && subjectId && examAId && examBId && examAId !== examBId);

  return (
    <div className="result-page tcmp-page">
      <div className="page-head result-controls no-print">
        <div>
          <h2 className="page-title">Compare Exams</h2>
          <p className="page-sub">Select a form, subject, Exam A and Exam B to see how your students changed.</p>
        </div>
        {result ? (
          <div className="print-tools">
            <button className="cm-btn cm-btn--primary tcmp-print-btn" type="button" onClick={() => window.print()}>
              Print
            </button>
          </div>
        ) : null}
      </div>

      {noAssignments ? (
        <div className="st-empty-state">You have no subject/form assignments. Contact the academics office.</div>
      ) : (
        <>
          <div className="tcmp-controls no-print">
            <label className="res-field">
              <span className="res-field-label">Form</span>
              <select className="res-select" value={classId} onChange={(event) => changeForm(event.target.value)}>
                <option value="">— Select form —</option>
                {forms.map((form) => (
                  <option key={form.class_id} value={form.class_id}>{form.class_name}</option>
                ))}
              </select>
            </label>

            <label className="res-field">
              <span className="res-field-label">Subject</span>
              <select
                className="res-select"
                value={subjectId}
                onChange={(event) => changeSubject(event.target.value)}
                disabled={!classId}
              >
                <option value="">— Select subject —</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>
                ))}
              </select>
            </label>

            <label className="res-field">
              <span className="res-field-label">Exam A (earlier)</span>
              <select
                className="res-select"
                value={examAId}
                onChange={(event) => changeExamA(event.target.value)}
                disabled={!subjectId || loadingExams}
              >
                <option value="">— Select —</option>
                {exams.filter((exam) => exam.id !== examBId).map((exam) => (
                  <option key={exam.id} value={exam.id}>{exam.name} ({shortDate(exam.start_date)})</option>
                ))}
              </select>
            </label>

            <label className="res-field">
              <span className="res-field-label">Exam B (later)</span>
              <select
                className="res-select"
                value={examBId}
                onChange={(event) => changeExamB(event.target.value)}
                disabled={!subjectId || loadingExams}
              >
                <option value="">— Select —</option>
                {exams.filter((exam) => exam.id !== examAId).map((exam) => (
                  <option key={exam.id} value={exam.id}>{exam.name} ({shortDate(exam.start_date)})</option>
                ))}
              </select>
            </label>

            <button
              className="cm-btn cm-btn--primary tcmp-compare-btn"
              type="button"
              onClick={runCompare}
              disabled={!canCompare || comparing}
            >
              {comparing ? "Comparing…" : "Compare"}
            </button>
          </div>

          {loadingExams ? <div className="me-loading"><Spinner size={20} /></div> : null}

          {message ? <p className="tcmp-message no-print" role="alert">{message}</p> : null}

          {!result && !comparing && !loadingExams && subjectId && exams.length === 0 ? (
            <div className="st-empty-state">No exams with results for this form and subject.</div>
          ) : null}

          {result ? (
            <div className="result-paper tcmp-paper">
              <header className="result-header tcmp-report-header">
                <div className="tcmp-header-top">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="tcmp-header-logo" src={schoolInfo?.schoolLogo || "/assets/logo.png"} alt="School logo" />
                  <div className="tcmp-header-school">
                    <div className="tcmp-header-council">
                      {schoolInfo?.council ? `${schoolInfo.council}${schoolInfo.district ? ` — ${schoolInfo.district}` : ""}` : schoolInfo?.district || "COUNCIL"}
                    </div>
                    <h1>{schoolInfo?.name || "School"}</h1>
                    <div className="tcmp-header-address">
                      {schoolInfo?.address ? `S.L.P ${schoolInfo.address.replace(/^P\.?O\.?\s*Box\s*/i, "")}` : "S.L.P"}
                    </div>
                  </div>
                </div>
                <div className="tcmp-header-title">
                  <h2>EXAM COMPARISON</h2>
                  <div className="tcmp-header-period">
                    {result.examA.name.toUpperCase()} VS {result.examB.name.toUpperCase()}
                  </div>
                </div>
                <div className="tcmp-header-meta">
                  <span>{result.className}</span>
                  {streamSummary ? <span>Stream: {streamSummary}</span> : null}
                  <span>{result.subject ? `${result.subject.code} · ${result.subject.name}` : "—"}</span>
                  <span>Teacher: {result.teacherName}</span>
                  <span>Date: {shortDate(result.generatedAt)}</span>
                </div>
              </header>

              <section className="result-section">
                <h3>Class Summary</h3>
                <div className={`tcmp-verdict tcmp-verdict--${result.summary.verdict}`}>
                  <span className="tcmp-verdict-label">Verdict</span>
                  <strong className={`tcmp-verdict-value cmp-trend-${result.summary.verdict === "improved" ? "up" : result.summary.verdict === "dropped" ? "down" : "same"}`}>
                    {result.summary.verdict === "improved" ? "▲ " : result.summary.verdict === "dropped" ? "▼ " : "= "}
                    {VERDICT_LABEL[result.summary.verdict]}
                  </strong>
                </div>

                <div className="tcmp-metric-grid">
                  {[
                    { label: "Students Examined", a: displayNumber(result.summary.a.sat), b: displayNumber(result.summary.b.sat), diff: result.summary.b.sat - result.summary.a.sat },
                    { label: "Mean Score", a: displayNumber(result.summary.a.mean), b: displayNumber(result.summary.b.mean), diff: result.summary.meanDiff },
                    { label: "Highest Score", a: displayNumber(result.summary.a.highest), b: displayNumber(result.summary.b.highest), diff: result.summary.a.highest !== null && result.summary.b.highest !== null ? Math.round((result.summary.b.highest - result.summary.a.highest) * 10) / 10 : null },
                    { label: "Lowest Score", a: displayNumber(result.summary.a.lowest), b: displayNumber(result.summary.b.lowest), diff: result.summary.a.lowest !== null && result.summary.b.lowest !== null ? Math.round((result.summary.b.lowest - result.summary.a.lowest) * 10) / 10 : null },
                    { label: "Pass Rate (%)", a: result.summary.a.passRate !== null ? `${displayNumber(result.summary.a.passRate)}` : "—", b: result.summary.b.passRate !== null ? `${displayNumber(result.summary.b.passRate)}` : "—", diff: result.summary.a.passRate !== null && result.summary.b.passRate !== null ? Math.round((result.summary.b.passRate - result.summary.a.passRate) * 10) / 10 : null },
                    { label: "Students Passed", a: displayNumber(result.summary.a.passed), b: displayNumber(result.summary.b.passed), diff: result.summary.b.passed - result.summary.a.passed },
                  ].map((metric) => (
                    <div className="tcmp-metric" key={metric.label}>
                      <span className="tcmp-metric-label">{metric.label}</span>
                      <div className="tcmp-metric-values">
                        <span><em>A</em> {metric.a}</span>
                        <span><em>B</em> {metric.b}</span>
                      </div>
                      <span className={`tcmp-metric-diff ${metric.diff === null ? "" : metric.diff > 0 ? "cmp-trend-up" : metric.diff < 0 ? "cmp-trend-down" : ""}`}>
                        {displayDiff(metric.diff)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="tcmp-counts">
                  <span className="tcmp-count tcmp-count--up">▲ Improved: <strong>{result.counts.improved}</strong></span>
                  <span className="tcmp-count tcmp-count--down">▼ Dropped: <strong>{result.counts.dropped}</strong></span>
                  <span className="tcmp-count tcmp-count--same">= No change: <strong>{result.counts.unchanged}</strong></span>
                  <span className="tcmp-count">— Absent: <strong>{result.counts.absent}</strong></span>
                </div>
              </section>

              <section className="result-section">
                <h3>Grade Distribution</h3>
                <div className="tcmp-table-wrap tcmp-grade-wrap">
                  <table className="tcmp-table tcmp-grade-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>{result.examA.name}</th>
                        <th>{result.examB.name}</th>
                        <th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.gradeOrder.map((grade) => {
                        const aCount = result.summary.a.gradeCounts[grade] ?? 0;
                        const bCount = result.summary.b.gradeCounts[grade] ?? 0;
                        const delta = bCount - aCount;
                        return (
                          <tr key={grade}>
                            <td><span className={`res-grd grd-${grade}`}>{grade}</span></td>
                            <td className="tcmp-num">{aCount}</td>
                            <td className="tcmp-num">{bCount}</td>
                            <td className={`tcmp-num ${delta > 0 ? "cmp-trend-up" : delta < 0 ? "cmp-trend-down" : ""}`}>{delta > 0 ? `+${delta}` : delta}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="result-section">
                <h3>Student Comparison</h3>
                {sortedStudents.length === 0 ? (
                  <p className="cmp-empty">No students for this subject.</p>
                ) : (
                  <>
                    <div className="tcmp-cards">
                      {sortedStudents.map((row, index) => (
                        <div key={row.student_id} className={`tcmp-card${row.status === "absent" ? " tcmp-card--absent" : ""}`}>
                          <div className="tcmp-card-head">
                            <span className="tcmp-card-no">{index + 1}</span>
                            <span className="tcmp-card-name">{row.name}</span>
                            <span className={`tcmp-status tcmp-status--${row.status}`}>
                              <span className="tcmp-status-sym">{STATUS_SYMBOL[row.status]}</span>
                              <span className="tcmp-status-text">{STATUS_LABEL[row.status]}</span>
                            </span>
                          </div>
                          <div className="tcmp-card-grid">
                            <div className="tcmp-card-cell">
                              <span className="tcmp-card-label">{result.examA.name}</span>
                              <span className="tcmp-card-score">
                                {displayNumber(row.scoreA)}
                                {row.scoreA !== null && <span className={`res-grd grd-${row.gradeA}`}>{row.gradeA}</span>}
                              </span>
                            </div>
                            <div className="tcmp-card-cell">
                              <span className="tcmp-card-label">{result.examB.name}</span>
                              <span className="tcmp-card-score">
                                {displayNumber(row.scoreB)}
                                {row.scoreB !== null && <span className={`res-grd grd-${row.gradeB}`}>{row.gradeB}</span>}
                              </span>
                            </div>
                            <div className="tcmp-card-cell">
                              <span className="tcmp-card-label">Difference</span>
                              <span className={`tcmp-card-diff ${row.diff === null ? "" : row.diff > 0 ? "cmp-trend-up" : row.diff < 0 ? "cmp-trend-down" : ""}`}>{displayDiff(row.diff)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="tcmp-table-wrap tcmp-desktop-table">
                      <table className="tcmp-table">
                      <thead>
                        <tr>
                          <th className="tcmp-col-no">No.</th>
                          <th className="tcmp-col-name">
                            <button type="button" className="tcmp-sort no-print" onClick={() => toggleSort("name")}>
                              Name {sortField === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                            </button>
                            <span className="tcmp-sort-print">Name</span>
                          </th>
                          <th>Score A</th>
                          <th>Grade A</th>
                          <th>Score B</th>
                          <th>Grade B</th>
                          <th>
                            <button type="button" className="tcmp-sort no-print" onClick={() => toggleSort("diff")}>
                              Difference {sortField === "diff" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                            </button>
                            <span className="tcmp-sort-print">Difference</span>
                          </th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStudents.map((row, index) => (
                          <tr key={row.student_id} className={row.status === "absent" ? "tcmp-row-absent" : ""}>
                            <td className="tcmp-col-no">{index + 1}</td>
                            <td className="tcmp-col-name">
                              <span className="tcmp-student-name">{row.name}</span>
                            </td>
                            <td className="tcmp-num">{displayNumber(row.scoreA)}</td>
                            <td className="tcmp-grade-cell">{row.scoreA !== null ? <span className={`res-grd grd-${row.gradeA}`}>{row.gradeA}</span> : "—"}</td>
                            <td className="tcmp-num">{displayNumber(row.scoreB)}</td>
                            <td className="tcmp-grade-cell">{row.scoreB !== null ? <span className={`res-grd grd-${row.gradeB}`}>{row.gradeB}</span> : "—"}</td>
                            <td className={`tcmp-num ${row.diff === null ? "" : row.diff > 0 ? "cmp-trend-up" : row.diff < 0 ? "cmp-trend-down" : ""}`}>{displayDiff(row.diff)}</td>
                            <td className={`tcmp-status tcmp-status--${row.status}`}>
                              <span className="tcmp-status-sym">{STATUS_SYMBOL[row.status]}</span>
                              <span className="tcmp-status-text">{STATUS_LABEL[row.status]}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
              </section>

              <footer className="result-footer">
                Generated by Subject Teacher | Date: {shortDate(result.generatedAt)}
              </footer>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
