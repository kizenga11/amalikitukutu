"use client";

import "./combined-results.css";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/loading";
import { supabase } from "@/lib/supabase";
import { fetchSchoolInfo, type SchoolInfo } from "@/lib/school-api";
import { DEFAULT_GRADE_BOUNDARIES, computeGradeAndPoints } from "@/lib/grading";
import type { ExamReport, ExamStudentRow, ExamSubjectCell } from "@/lib/combined-results";

interface StreamOption {
  id: string;
  name: string;
}

interface FormOption {
  class_id: string;
  class_name: string;
  form_level: number;
  streams: StreamOption[];
}

interface ExamOption {
  id: string;
  name: string;
  start_date: string;
}

interface StudentOption {
  id: string;
  name: string;
  stream_id: string | null;
  stream_name: string;
}

interface ReportPayload {
  className: string;
  formLevel: number | null;
  year: string;
  exams: ExamOption[];
  reports: ExamReport[];
  generatedAt: string;
}

function displayNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function divisionCode(division: string, incomplete: boolean): string {
  if (incomplete) return "INC";
  if (!division) return "—";
  const match = division.match(/(?:Division\s+)?(.+)$/i);
  return match ? match[1] : division;
}

export default function CombinedResults() {
  const [token, setToken] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);

  const [years, setYears] = useState<{ id: string; label: string }[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");

  const [year, setYear] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");

  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const apiGet = useCallback(
    async (params: Record<string, string>): Promise<Response> => {
      const query = new URLSearchParams(params).toString();
      return fetch(`/api/combined-results?${query}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
        cache: "no-store",
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
        const response = await fetch("/api/combined-results?action=options", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        const data2 = (await response.json()) as { years?: { id: string; label: string }[]; forms?: FormOption[]; error?: string };
        if (!active) return;
        if (!response.ok) {
          setOptionsError(data2.error ?? "Could not load forms.");
        } else {
          setYears(data2.years ?? []);
          setForms(data2.forms ?? []);
          setYear(data2.years?.[data2.years.length - 1]?.id ?? "");
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
    if (!year || !classId || !token) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoadingExams(true);
      try {
        const response = await apiGet({ action: "exams", year, classId });
        const data = (await response.json()) as { exams?: ExamOption[]; error?: string };
        if (!active) return;
        if (!response.ok) {
          setExams([]);
          setSelectedExamIds([]);
          setMessage(data.error ?? "");
        } else {
          const list = data.exams ?? [];
          setExams(list);
          setSelectedExamIds(list.map((exam) => exam.id));
          setMessage("");
        }
      } catch {
        if (active) {
          setExams([]);
          setSelectedExamIds([]);
          setMessage("Could not load exams.");
        }
      } finally {
        if (active) setLoadingExams(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [year, classId, token, apiGet]);

  useEffect(() => {
    if (!classId || !token) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoadingStudents(true);
      try {
        const params: Record<string, string> = { action: "students", classId };
        if (streamId) params.streamId = streamId;
        const response = await apiGet(params);
        const data = (await response.json()) as { students?: StudentOption[]; error?: string };
        if (!active) return;
        if (!response.ok) {
          setStudents([]);
          setSelectedStudentIds([]);
          setMessage(data.error ?? "");
        } else {
          const list = data.students ?? [];
          setStudents(list);
          setSelectedStudentIds(list.map((student) => student.id));
        }
      } catch {
        if (active) {
          setStudents([]);
          setSelectedStudentIds([]);
          setMessage("Could not load students.");
        }
      } finally {
        if (active) setLoadingStudents(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [classId, streamId, token, apiGet]);

  const selectedForm = forms.find((form) => form.class_id === classId) ?? null;

  function resetReport() {
    setPayload(null);
    setMessage("");
  }

  function clearExams() {
    setExams([]);
    setSelectedExamIds([]);
  }

  function clearStudents() {
    setStudents([]);
    setSelectedStudentIds([]);
  }

  function toggleExam(id: string) {
    setSelectedExamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    resetReport();
  }

  function toggleAllExams(checked: boolean) {
    setSelectedExamIds(checked ? exams.map((exam) => exam.id) : []);
    resetReport();
  }

  function toggleStudent(id: string) {
    setSelectedStudentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    resetReport();
  }

  function toggleAllStudents(checked: boolean) {
    setSelectedStudentIds(checked ? filteredStudents.map((student) => student.id) : []);
    resetReport();
  }

  const studentTerm = studentSearch.trim().toLowerCase();
  const filteredStudents: StudentOption[] = studentTerm
    ? students.filter((student) => student.name.toLowerCase().includes(studentTerm))
    : students;

  async function runReport() {
    if (!year || !classId || selectedExamIds.length === 0 || selectedStudentIds.length === 0) {
      setMessage("Select a form, at least one exam and at least one student.");
      return;
    }
    setRunning(true);
    setMessage("");
    try {
      const response = await apiGet({
        action: "report",
        year,
        classId,
        examIds: selectedExamIds.join(","),
        studentIds: selectedStudentIds.join(","),
      });
      const data = (await response.json()) as ReportPayload & { error?: string };
      if (!response.ok) {
        setPayload(null);
        setMessage(data.error ?? "Could not build the report.");
        return;
      }
      setPayload(data);
    } catch {
      setPayload(null);
      setMessage("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  function scoreFor(row: ExamStudentRow, subjectId: string): number | null {
    return row.subjects.find((s) => s.subject_id === subjectId)?.score ?? null;
  }

  function extreme(row: ExamStudentRow, mode: "best" | "worst"): ExamSubjectCell | null {
    let pick: ExamSubjectCell | null = null;
    for (const subject of row.subjects) {
      if (subject.score === null) continue;
      if (!pick || (mode === "best" ? subject.score > (pick.score as number) : subject.score < (pick.score as number))) {
        pick = subject;
      }
    }
    return pick;
  }

  function totalFor(row: ExamStudentRow): number {
    if (typeof row.total_marks === "number") return row.total_marks;
    return row.subjects.reduce((sum, subject) => (subject.score === null ? sum : sum + subject.score), 0);
  }

  function gradeFor(row: ExamStudentRow): string {
    if (row.grade && row.grade !== "—") return row.grade;
    if (row.average === null) return "—";
    return computeGradeAndPoints(row.average, DEFAULT_GRADE_BOUNDARIES).grade;
  }

  function positionLabel(row: ExamStudentRow, total: number): string {
    return row.position != null ? `${row.position}/${total}` : "—";
  }

  function exportCsv() {
    if (!payload) return;
    const lines: (string | number)[][] = [];
    payload.reports.forEach((report, reportIndex) => {
      if (reportIndex > 0) lines.push([]);
      lines.push([`${report.exam_name} — ${shortDate(report.start_date)}`]);
      lines.push([
        "Pos",
        "Name",
        "Stream",
        ...report.columns.map((s) => s.code),
        "Average",
        "Points",
        "Division",
      ]);
      report.students.forEach((row) => {
        lines.push([
          positionLabel(row, report.summary.students),
          row.name,
          row.stream_name,
          ...report.columns.map((s) => displayNumber(scoreFor(row, s.subject_id))),
          displayNumber(row.average),
          row.total_points ?? "—",
          divisionCode(row.division, row.incomplete),
        ]);
      });
    });
    const csv = lines
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `exam-results-${payload.year}-${payload.className.replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loadingOptions) {
    return <div className="me-loading"><Spinner size={20} /></div>;
  }

  if (optionsError) {
    return (
      <div className="cr-page">
        <p className="cr-message" role="alert">{optionsError}</p>
      </div>
    );
  }

  const allExamsSelected = exams.length > 0 && selectedExamIds.length === exams.length;
  const allStudentsSelected = filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.includes(s.id));

  return (
    <div className="cr-page">
      <div className="page-head">
        <div>
          <h2 className="cr-title">Exam Results</h2>
          <p className="page-sub">
            Pick one or more students and one or more exams. Each exam is shown on its own table with the subjects the
            student sat, the marks, average, division and position.
          </p>
        </div>
      </div>

      <div className="cr-controls">
        <div className="cr-controls-row">
          <label className="cr-field">
            <span>Academic year</span>
            <select value={year} onChange={(event) => { setYear(event.target.value); clearExams(); resetReport(); }}>
              <option value="">Select year</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </label>

          <label className="cr-field">
            <span>Form / class</span>
            <select value={classId} onChange={(event) => { setClassId(event.target.value); setStreamId(""); clearExams(); clearStudents(); resetReport(); }}>
              <option value="">Select form</option>
              {forms.map((form) => <option key={form.class_id} value={form.class_id}>{form.class_name}</option>)}
            </select>
          </label>

          <label className="cr-field">
            <span>Stream</span>
            <select value={streamId} onChange={(event) => { setStreamId(event.target.value); clearStudents(); resetReport(); }} disabled={!selectedForm}>
              <option value="">All streams</option>
              {selectedForm?.streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
            </select>
          </label>
        </div>

        <div className="cr-picker-grid">
          <div className="cr-picker">
            <div className="cr-picker-head">
              <h3>Exams <span className="cr-count">{selectedExamIds.length}/{exams.length}</span></h3>
              <label className="cr-check cr-check--all">
                <input type="checkbox" checked={allExamsSelected} onChange={(event) => toggleAllExams(event.target.checked)} disabled={exams.length === 0} />
                <span>Select all</span>
              </label>
            </div>
            {loadingExams ? (
              <div className="me-loading"><Spinner size={18} /></div>
            ) : exams.length === 0 ? (
              <p className="cr-hint">No exams with results for this year and form.</p>
            ) : (
              <div className="cr-list">
                {exams.map((exam) => (
                  <label key={exam.id} className="cr-check">
                    <input type="checkbox" checked={selectedExamIds.includes(exam.id)} onChange={() => toggleExam(exam.id)} />
                    <span className="cr-check-name">{exam.name}</span>
                    <em>{shortDate(exam.start_date)}</em>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="cr-picker">
            <div className="cr-picker-head">
              <h3>Students <span className="cr-count">{selectedStudentIds.length}/{students.length}</span></h3>
              <label className="cr-check cr-check--all">
                <input type="checkbox" checked={allStudentsSelected} onChange={(event) => toggleAllStudents(event.target.checked)} disabled={filteredStudents.length === 0} />
                <span>Select all</span>
              </label>
            </div>
            <input
              className="cr-search"
              type="search"
              placeholder="Search student"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
            {loadingStudents ? (
              <div className="me-loading"><Spinner size={18} /></div>
            ) : students.length === 0 ? (
              <p className="cr-hint">No students found for this form.</p>
            ) : (
              <div className="cr-list">
                {filteredStudents.map((student) => (
                  <label key={student.id} className="cr-check">
                    <input type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                    <span className="cr-check-name">{student.name}</span>
                    <em>{student.stream_name}</em>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <button className="cm-btn cm-btn--primary cr-run-btn" type="button" onClick={runReport} disabled={running || selectedExamIds.length === 0 || selectedStudentIds.length === 0}>
          {running ? "Building…" : "Show Results"}
        </button>
      </div>

      {message ? <p className="cr-message" role="alert">{message}</p> : null}

      {payload && payload.reports.length > 0 ? (
        <div className="result-paper cr-paper">
          <header className="result-header cr-report-header">
            <div className="cr-header-top">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cr-header-logo" src={schoolInfo?.schoolLogo || "/assets/logo.png"} alt="School logo" />
              <div>
                <h1>{schoolInfo?.name || "School"}</h1>
                <div className="cr-header-address">
                  {schoolInfo?.council ? `${schoolInfo.council}${schoolInfo.district ? ` — ${schoolInfo.district}` : ""}` : schoolInfo?.district || "COUNCIL"}
                </div>
              </div>
            </div>
            <h2>EXAMINATION RESULTS</h2>
            <div className="cr-header-period">
              {payload.year} · {payload.className}
              {streamId && selectedForm?.streams.find((s) => s.id === streamId) ? ` · ${selectedForm.streams.find((s) => s.id === streamId)?.name}` : ""}
            </div>
            <div className="cr-header-exams">
              {payload.reports.length} exam{payload.reports.length === 1 ? "" : "s"}: {payload.reports.map((report) => report.exam_name).join(" | ")}
            </div>
          </header>

          <div className="cr-toolbar no-print">
            <button className="cm-btn cm-btn--ghost cm-btn--sm" type="button" onClick={exportCsv}>Export CSV</button>
            <button className="cm-btn cm-btn--ghost cm-btn--sm" type="button" onClick={() => window.print()}>Print</button>
          </div>

          {payload.reports.map((report) => (
            <section className="cr-section" key={report.exam_id}>
              <div className="cr-exam-head">
                <h3>{report.exam_name}</h3>
                <span>{shortDate(report.start_date)}</span>
              </div>

              <div className="cr-ssum-list">
                {report.students.map((row) => {
                  const best = extreme(row, "best");
                  const worst = extreme(row, "worst");
                  return (
                    <div className="cr-ssum" key={row.student_id}>
                      <div className="cr-ssum-name">{row.name}</div>
                      <div className="cr-ssum-grid">
                        <div><span>Average</span><strong>{displayNumber(row.average)}</strong></div>
                        <div><span>Grade</span><strong>{gradeFor(row)}</strong></div>
                        <div><span>Division</span><strong>{divisionCode(row.division, row.incomplete)}</strong></div>
                        <div><span>Points</span><strong>{row.total_points ?? "—"}</strong></div>
                        <div><span>Total</span><strong>{displayNumber(totalFor(row))}</strong></div>
                        <div><span>Position</span><strong>{positionLabel(row, report.summary.students)}</strong></div>
                        <div><span>Highest</span><strong title={best?.name}>{best ? `${best.code} ${displayNumber(best.score)}` : "—"}</strong></div>
                        <div><span>Lowest</span><strong title={worst?.name}>{worst ? `${worst.code} ${displayNumber(worst.score)}` : "—"}</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cr-cards">
                {report.students.map((row) => (
                  <div key={row.student_id} className="cr-card">
                    <div className="cr-card-head">
                      <span className="cr-card-pos">{positionLabel(row, report.summary.students)}</span>
                      <span className="cr-card-name">{row.name}</span>
                      <span className="cr-card-div">{divisionCode(row.division, row.incomplete)}</span>
                    </div>
                    <div className="cr-card-grid">
                      <div><span>Stream</span><strong>{row.stream_name || "—"}</strong></div>
                      <div><span>Subjects</span><strong>{row.sat_subjects}</strong></div>
                      <div><span>Average</span><strong>{displayNumber(row.average)}</strong></div>
                      <div><span>Points</span><strong>{row.total_points ?? "—"}</strong></div>
                    </div>
                    {row.subjects.length > 0 ? (
                      <div className="cr-card-subjects">
                        {row.subjects.map((subject) => (
                          <span key={subject.subject_id} className="cr-chip">
                            <em>{subject.code}</em>
                            <strong>{subject.score === null ? (subject.is_absent ? "ABS" : "—") : displayNumber(subject.score)}</strong>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="cr-table-wrap">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th className="cr-col-name">Name</th>
                      {report.columns.map((subject) => <th key={subject.subject_id} title={subject.name}>{subject.code}</th>)}
                      <th className="cr-col-num">Avg</th>
                      <th className="cr-col-num">Pts</th>
                      <th className="cr-col-num">Total</th>
                      <th>Div</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students.map((row) => (
                      <tr key={row.student_id}>
                        <td className="cr-col-name">{row.name}</td>
                        {report.columns.map((subject) => {
                          const cell = row.subjects.find((s) => s.subject_id === subject.subject_id);
                          const value = cell && cell.score === null && cell.is_absent ? "ABS" : displayNumber(cell?.score ?? null);
                          return <td key={subject.subject_id} className="cr-col-num">{value}</td>;
                        })}
                        <td className="cr-col-num"><strong>{displayNumber(row.average)}</strong></td>
                        <td className="cr-col-num">{row.total_points ?? "—"}</td>
                        <td className="cr-col-num">{displayNumber(totalFor(row))}</td>
                        <td>{divisionCode(row.division, row.incomplete)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
