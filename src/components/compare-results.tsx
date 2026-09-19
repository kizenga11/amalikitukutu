"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  buildClassResults,
  buildSchoolReport,
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  type GradingSettings,
} from "@/lib/grading";
import {
  fetchExamMarks,
  fetchExams,
  fetchGradingSettings,
  fetchSchoolInfo,
  type DbExamRow,
  type ExamMarksData,
  type SchoolInfo,
} from "@/lib/school-api";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function displayNumber(value: number | null): string {
  return value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function displayDelta(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "▲ +" : value < 0 ? "▼ " : ""}${displayNumber(Math.abs(value))}`;
}

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function yearOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : String(date.getFullYear());
}

function genderLabel(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.startsWith("f") ? "F" : normalized.startsWith("m") ? "M" : value;
}

const FORM_RANK: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

function formRank(value: string): number {
  const match = value.match(/Form\s+([IVX]+)/i);
  return match ? FORM_RANK[match[1].toUpperCase()] ?? 9 : 9;
}

function formLevelOf(className: string): string {
  const match = className.match(/Form\s+([IVX]+)/i);
  return match ? `Form ${match[1].toUpperCase()}` : className;
}

function avgDelta(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : round1(a - b);
}

function deltaClass(delta: number | null): string {
  if (delta === null) return "";
  return delta > 0 ? "cmp-trend-up" : delta < 0 ? "cmp-trend-down" : "";
}

type Trend = "up" | "down" | "same" | "new";

function trendLabel(trend: Trend): string {
  switch (trend) {
    case "up": return "Improved";
    case "down": return "Declined";
    case "new": return "New";
    default: return "No change";
  }
}

interface ExamSnapshot {
  avg: number | null;
  grade: string;
  rank: number;
  gpa: number | null;
  divisionCode: string;
  points: number | null;
}

interface StudentCompareRow {
  student_id: string;
  fullName: string;
  className: string;
  streamName: string;
  gender: string;
  current: ExamSnapshot | null;
  previous: ExamSnapshot | null;
  delta: number | null;
  rankDelta: number | null;
  trend: Trend;
}

interface SubjectCompareRow {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  current: { avg: number | null; grade: string; competency: string; passed: number; sat: number } | null;
  previous: { avg: number | null; grade: string; competency: string; passed: number; sat: number } | null;
  delta: number | null;
}

export default function CompareResults() {
  const [exams, setExams] = useState<DbExamRow[]>([]);
  const [currentExamId, setCurrentExamId] = useState("");
  const [previousExamId, setPreviousExamId] = useState("");
  const [marksByExam, setMarksByExam] = useState<Record<string, ExamMarksData>>({});
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [settings, setSettings] = useState<GradingSettings>({
    gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    divisionRanges: DEFAULT_DIVISION_RANGES,
    competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kidatoFilter, setKidatoFilter] = useState("__all__");
  const [trendFilter, setTrendFilter] = useState<"all" | "up" | "down">("all");

  const sortedExams = useMemo(
    () => [...exams].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [exams],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchExams({ search: "", page: 1, pageSize: 100 }),
      fetchGradingSettings(),
      fetchSchoolInfo(),
    ])
      .then(([examResult, grading, info]) => {
        if (!active) return;
        const eligible = examResult.rows
          .filter((exam) => exam.status !== "draft")
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
        setExams(eligible);
        setSettings(grading);
        setSchoolInfo(info);
        if (eligible.length >= 2) {
          setCurrentExamId(eligible[eligible.length - 1].id);
          setPreviousExamId(eligible[eligible.length - 2].id);
        } else if (eligible.length === 1) {
          setCurrentExamId(eligible[0].id);
        }
      })
      .catch(() => active && setError("Could not load exam data from the database."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const ids = [currentExamId, previousExamId].filter(Boolean);
    if (ids.length === 0) return;
    let active = true;
    (async () => {
      const entries: [string, ExamMarksData][] = [];
      for (const id of ids) {
        try {
          entries.push([id, await fetchExamMarks(id)]);
        } catch {
          // Skip exams whose marks cannot be loaded.
        }
      }
      if (active) setMarksByExam((current) => ({ ...current, ...Object.fromEntries(entries) }));
    })();
    return () => {
      active = false;
    };
  }, [currentExamId, previousExamId]);

  function changeCurrent(id: string) {
    setCurrentExamId(id);
    const index = sortedExams.findIndex((item) => item.id === id);
    const previous = index > 0 ? sortedExams[index - 1].id : "";
    setPreviousExamId(previous);
    setKidatoFilter("__all__");
  }

  const currentExam = exams.find((item) => item.id === currentExamId) ?? null;
  const previousExam = exams.find((item) => item.id === previousExamId) ?? null;
  const currentData = currentExamId ? marksByExam[currentExamId] : null;
  const previousData = previousExamId ? marksByExam[previousExamId] : null;
  const marksLoading = (Boolean(currentExamId) && !currentData) || (Boolean(previousExamId) && !previousData);

  const currentReport = useMemo(() => {
    if (!currentData) return null;
    const classes = currentData.classes.map((classRow) =>
      buildClassResults(classRow, currentData.marks, settings.gradeBoundaries, settings.divisionRanges),
    );
    return buildSchoolReport(classes, settings);
  }, [currentData, settings]);

  const previousReport = useMemo(() => {
    if (!previousData) return null;
    const classes = previousData.classes.map((classRow) =>
      buildClassResults(classRow, previousData.marks, settings.gradeBoundaries, settings.divisionRanges),
    );
    return buildSchoolReport(classes, settings);
  }, [previousData, settings]);

  const studentClassMap = useMemo(() => {
    const map = new Map<string, string>();
    currentData?.classes.forEach((cls) => cls.students.forEach((student) => map.set(student.student_id, cls.class_name)));
    return map;
  }, [currentData]);

  const classNames = useMemo(
    () => Array.from(new Set(studentClassMap.values())).sort((a, b) => a.localeCompare(b)),
    [studentClassMap],
  );

  const kidatos = useMemo(() => {
    const values = new Set<string>();
    classNames.forEach((name) => values.add(formLevelOf(name)));
    return Array.from(values).sort((a, b) => formRank(a) - formRank(b) || a.localeCompare(b));
  }, [classNames]);

  const studentRows = useMemo<StudentCompareRow[]>(() => {
    if (!currentReport) return [];
    const prevById = new Map((previousReport?.students ?? []).map((row) => [row.student.student_id, row]));
    const rows: StudentCompareRow[] = currentReport.students.map((row) => {
      const prev = prevById.get(row.student.student_id);
      const current: ExamSnapshot = {
        avg: row.avg,
        grade: row.grade,
        rank: row.rank,
        gpa: row.gpa,
        divisionCode: row.divisionCode,
        points: row.student.total_points,
      };
      const previous: ExamSnapshot | null = prev
        ? { avg: prev.avg, grade: prev.grade, rank: prev.rank, gpa: prev.gpa, divisionCode: prev.divisionCode, points: prev.student.total_points }
        : null;
      const delta = current.avg !== null && previous !== null && previous.avg !== null
        ? round1(current.avg - previous.avg)
        : null;
      const rankDelta = previous !== null && current.avg !== null && previous.avg !== null
        ? previous.rank - current.rank
        : null;
      const trend: Trend = !previous ? "new" : delta === null ? "same" : delta > 0 ? "up" : delta < 0 ? "down" : "same";
      return {
        student_id: row.student.student_id,
        fullName: `${row.student.last_name}, ${row.student.first_name}${row.student.middle_name ? ` ${row.student.middle_name}` : ""}`,
        className: studentClassMap.get(row.student.student_id) ?? "—",
        streamName: row.student.stream_name === "—" ? "Unassigned" : row.student.stream_name,
        gender: genderLabel(row.student.gender),
        current,
        previous,
        delta,
        rankDelta,
        trend,
      };
    });
    rows.sort((a, b) => {
      const ad = a.delta ?? -Infinity;
      const bd = b.delta ?? -Infinity;
      if (ad !== bd) return bd - ad;
      return (b.current?.avg ?? -1) - (a.current?.avg ?? -1);
    });
    return rows;
  }, [currentReport, previousReport, studentClassMap]);

  const filteredStudents = studentRows.filter((row) => {
    if (kidatoFilter !== "__all__" && formLevelOf(row.className) !== kidatoFilter) return false;
    if (trendFilter === "up" && row.trend !== "up") return false;
    if (trendFilter === "down" && row.trend !== "down") return false;
    return true;
  });

  const counts = useMemo(() => {
    let up = 0;
    let down = 0;
    let fresh = 0;
    studentRows.forEach((row) => {
      if (row.trend === "up") up += 1;
      else if (row.trend === "down") down += 1;
      else if (row.trend === "new") fresh += 1;
    });
    return { up, down, fresh, total: studentRows.length };
  }, [studentRows]);

  const subjectRows = useMemo<SubjectCompareRow[]>(() => {
    if (!currentReport) return [];
    const prevById = new Map((previousReport?.subjects ?? []).map((row) => [row.subject_id, row]));
    const rows = currentReport.subjects.map((row) => {
      const prev = prevById.get(row.subject_id);
      const delta = row.avg !== null && prev?.avg != null ? round1(row.avg - prev.avg) : null;
      return {
        subject_id: row.subject_id,
        subject_code: row.subject_code,
        subject_name: row.subject_name,
        current: { avg: row.avg, grade: row.grade, competency: row.competency, passed: row.passed, sat: row.sat },
        previous: prev ? { avg: prev.avg, grade: prev.grade, competency: prev.competency, passed: prev.passed, sat: prev.sat } : null,
        delta,
      };
    });
    rows.sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));
    return rows;
  }, [currentReport, previousReport]);

  const divisionRows = useMemo(() => {
    if (!currentReport) return [];
    const prevById = new Map((previousReport?.divisions ?? []).map((row) => [row.division, row.boys + row.girls]));
    const rows = currentReport.divisions.map((row) => ({
      division: row.division,
      label: row.label,
      current: row.boys + row.girls,
      previous: prevById.get(row.division) ?? 0,
      delta: (row.boys + row.girls) - (prevById.get(row.division) ?? 0),
    }));
    const prevInc = previousReport?.students.filter((s) => s.student.incomplete).length ?? 0;
    const curInc = currentReport.students.filter((s) => s.student.incomplete).length;
    rows.push({ division: "INC", label: "Incomplete", current: curInc, previous: prevInc, delta: curInc - prevInc });
    return rows;
  }, [currentReport, previousReport]);

  if (loading) return <div className="me-loading"><Spinner size={20} /></div>;
  if (error) return <div className="st-empty-state">{error}</div>;

  return (
    <div className="result-page cmp-page">
      <div className="page-head result-controls">
        <div>
          <h2 className="page-title">Compare Exams</h2>
          <p className="page-sub">Compare two exams — whole school, subjects and students (improved and declined).</p>
        </div>
        <button className="cm-btn cm-btn--ghost no-print" onClick={() => window.print()}>Print A4 / PDF</button>
      </div>

      <div className="res-toolbar no-print">
        <label className="res-field"><span className="res-field-label">Exam</span>
          <select className="res-select" value={currentExamId} onChange={(event) => changeCurrent(event.target.value)}>
            {exams.map((item) => <option key={item.id} value={item.id}>{item.name} ({shortDate(item.start_date)})</option>)}
          </select>
        </label>
        <label className="res-field"><span className="res-field-label">Previous Exam</span>
          <select className="res-select" value={previousExamId} onChange={(event) => setPreviousExamId(event.target.value)}>
            <option value="">—</option>
            {exams.filter((item) => item.id !== currentExamId).map((item) => <option key={item.id} value={item.id}>{item.name} ({shortDate(item.start_date)})</option>)}
          </select>
        </label>
        <label className="res-field"><span className="res-field-label">Form</span>
          <select className="res-select" value={kidatoFilter} onChange={(event) => setKidatoFilter(event.target.value)}>
            <option value="__all__">Whole School</option>
            {kidatos.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="res-field"><span className="res-field-label">Trend</span>
          <select className="res-select" value={trendFilter} onChange={(event) => setTrendFilter(event.target.value as "all" | "up" | "down")}>
            <option value="all">All</option>
            <option value="up">Improved</option>
            <option value="down">Declined</option>
          </select>
        </label>
      </div>

      {marksLoading ? <div className="me-loading"><Spinner size={20} /></div> : (
        !currentReport || !currentExam ? (
          <div className="st-empty-state">Not enough exams for comparison. Make sure there are at least two exams.</div>
        ) : (
          <div className="result-paper">
            <header className="result-header">
              <div>{schoolInfo?.council ? `${schoolInfo.council}${schoolInfo.district ? ` — ${schoolInfo.district}` : ""}` : schoolInfo?.district || "DISTRICT COUNCIL"}</div>
              <h1>{schoolInfo?.name || "School"}</h1>
              <div>{schoolInfo?.address ? `P.O. Box ${schoolInfo.address.replace(/^S\.?L\.?\s*P\.?\s*\bBox\b.*/i, "").replace(/^P\.?O\.?\s*Box\s*/i, "").trim()}` : "P.O. Box"}</div>
              <h2>EXAM COMPARISON</h2>
              <div className="result-header-meta">
                {previousExam ? `${previousExam.name.toUpperCase()} ${yearOf(previousExam.start_date)}` : "—"} vs{" "}
                {currentExam.name.toUpperCase()} {yearOf(currentExam.start_date)}
                {kidatoFilter !== "__all__" ? ` — ${kidatoFilter}` : ""}
              </div>
            </header>

            <section className="result-section">
              <h3>School Summary</h3>
              <div className="cmp-summary-grid">
                <div className="result-summary-grid">
                  <div><span>Current Average</span><strong>{displayNumber(currentReport.summary.average)}%</strong></div>
                  <div><span>Previous Average</span><strong>{displayNumber(previousReport?.summary.average ?? null)}%</strong></div>
                  <div><span>Change</span><strong className={deltaClass(avgDelta(currentReport.summary.average, previousReport?.summary.average ?? null))}>{displayDelta(avgDelta(currentReport.summary.average, previousReport?.summary.average ?? null))}</strong></div>
                  <div><span>School GPA</span><strong>{displayNumber(currentReport.summary.gpa)}</strong></div>
                </div>
                <div className="result-summary-grid">
                  <div><span>Students</span><strong>{counts.total}</strong></div>
                  <div><span>Improved</span><strong className="cmp-trend-up">{counts.up}</strong></div>
                  <div><span>Declined</span><strong className="cmp-trend-down">{counts.down}</strong></div>
                  <div><span>New</span><strong>{counts.fresh}</strong></div>
                </div>
              </div>
            </section>

            {previousReport && (
              <section className="result-section">
                <h3>Students Improved / Declined</h3>
                <div className="cmp-counts">
                  <div className="cmp-count cmp-count--up"><span className="cmp-count-value">{counts.up}</span><span className="cmp-count-label">Improved</span></div>
                  <div className="cmp-count cmp-count--down"><span className="cmp-count-value">{counts.down}</span><span className="cmp-count-label">Declined</span></div>
                  <div className="cmp-count"><span className="cmp-count-value">{counts.fresh}</span><span className="cmp-count-label">New</span></div>
                </div>
              </section>
            )}

            <section className="result-section">
              <h3>Subject Comparison</h3>
              <div className="result-table-wrap">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Subject</th>
                      <th>Current Avg</th>
                      <th>Previous Avg</th>
                      <th>Change</th>
                      <th>Current Grade</th>
                      <th>Previous Grade</th>
                      <th>Current Competency</th>
                      <th>Previous Competency</th>
                      <th>Current Passed</th>
                      <th>Previous Passed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map((row, index) => (
                      <tr key={row.subject_id}>
                        <td>{index + 1}</td>
                        <td className="result-subjects"><strong>{row.subject_code}</strong> — {row.subject_name}</td>
                        <td>{displayNumber(row.current?.avg ?? null)}</td>
                        <td>{displayNumber(row.previous?.avg ?? null)}</td>
                        <td><span className={deltaClass(row.delta)}>{displayDelta(row.delta)}</span></td>
                        <td>{row.current?.grade ?? "—"}</td>
                        <td>{row.previous?.grade ?? "—"}</td>
                        <td>{row.current?.competency ?? "—"}</td>
                        <td>{row.previous?.competency ?? "—"}</td>
                        <td>{row.current?.passed ?? "—"}</td>
                        <td>{row.previous?.passed ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {previousReport && (
              <section className="result-section">
                <h3>Division Comparison</h3>
                <div className="result-table-wrap"><table className="result-table">
                  <thead>
                    <tr><th>Division</th><th>Current</th><th>Previous</th><th>Change</th></tr>
                  </thead>
                  <tbody>
                    {divisionRows.map((row) => (
                      <tr key={row.division}>
                        <td>{row.label}</td>
                        <td>{row.current}</td>
                        <td>{row.previous}</td>
                        <td><span className={deltaClass(row.delta)}>{row.delta > 0 ? `+${row.delta}` : row.delta}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}

            <section className="result-section">
              <h3>Student Comparison</h3>
              <div className="result-table-wrap">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Class / Stream</th>
                      <th>Sex</th>
                      <th>Current Avg</th>
                      <th>Previous Avg</th>
                      <th>Change</th>
                      <th>Current Rank</th>
                      <th>Previous Rank</th>
                      <th>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length === 0 && (
                      <tr><td colSpan={9} className="result-subjects">No students match this selection.</td></tr>
                    )}
                    {filteredStudents.map((row) => (
                      <tr key={row.student_id}>
                        <td className="result-subjects">{row.fullName}</td>
                        <td>{row.className} — {row.streamName}</td>
                        <td>{row.gender}</td>
                        <td>{displayNumber(row.current?.avg ?? null)}</td>
                        <td>{displayNumber(row.previous?.avg ?? null)}</td>
                        <td><span className={deltaClass(row.delta)}>{displayDelta(row.delta)}</span></td>
                        <td>{row.current?.rank || "—"}</td>
                        <td>{row.previous?.rank || "—"}</td>
                        <td>
                          {row.trend === "up" ? "▲" : row.trend === "down" ? "▼" : row.trend === "new" ? "＋" : "—"} {trendLabel(row.trend)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="result-footer">This report was issued by the Academic Office | Date: {shortDate(new Date().toISOString())}</footer>
          </div>
        )
      )}
    </div>
  );
}