"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  buildClassResults,
  buildSchoolReport,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  DEFAULT_COMPETENCY_THRESHOLDS,
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

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function displayNumber(value: number | null): string {
  return value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function subjectGrades(subjects: { subject_code: string; grade: string }[]): string {
  return subjects.map((subject) => `${subject.subject_code}-${subject.grade}`).join(" ");
}

function subjectMarks(subjects: { subject_code: string; total_score: number | null }[]): string {
  return subjects
    .map((subject) => `${subject.subject_code}-${subject.total_score === null ? "ABS" : displayNumber(subject.total_score)}`)
    .join(" ");
}

function genderLabel(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.startsWith("f") ? "F" : normalized.startsWith("m") ? "M" : value;
}

export default function ResultPage({ role }: { role?: string }) {
  const [exams, setExams] = useState<DbExamRow[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStream, setSelectedStream] = useState("__all__");
  const [viewMode, setViewMode] = useState<"grades" | "marks">("grades");
  const [marksData, setMarksData] = useState<ExamMarksData | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [settings, setSettings] = useState<GradingSettings>({
    gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    divisionRanges: DEFAULT_DIVISION_RANGES,
    competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
  });
  const [loading, setLoading] = useState(true);
  const [marksLoading, setMarksLoading] = useState(false);
  const [error, setError] = useState("");
  const [pageOrientation, setPageOrientation] = useState<"portrait" | "landscape">("portrait");

  const isAdmin = role !== undefined && role !== "Teacher";

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchExams({ search: "", page: 1, pageSize: 100 }),
      fetchGradingSettings(),
      fetchSchoolInfo(),
    ])
      .then(([examResult, grading, info]) => {
        if (!active) return;
        const eligible = examResult.rows.filter((exam) => exam.status !== "draft");
        setExams(eligible);
        setSettings(grading);
        setSchoolInfo(info);
        setSelectedExamId(eligible[0]?.id ?? "");
      })
      .catch(() => active && setError("Could not load result settings from the database."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedExamId) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setMarksLoading(true);
      setError("");
      try {
        const data = await fetchExamMarks(selectedExamId);
        if (!active) return;
        setMarksData(data);
        setSelectedClassId((current) => data.classes.some((item) => item.class_id === current) ? current : data.classes[0]?.class_id ?? "");
        setSelectedStream("__all__");
      } catch {
        if (active) setError("Could not load marks for the selected exam.");
      } finally {
        if (active) setMarksLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedExamId]);

  const exam = exams.find((item) => item.id === selectedExamId) ?? null;
  const classRow = marksData?.classes.find((item) => item.class_id === selectedClassId) ?? null;
  const streams = useMemo(() => {
    if (!classRow) return [];
    const values = new Map<string, string>();
    classRow.students.forEach((student) => values.set(student.stream_id ?? "__none__", student.stream_name === "—" ? "Unassigned" : student.stream_name));
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classRow]);

  const report = useMemo(() => {
    if (!classRow || !marksData) return null;
    const classResults = buildClassResults(classRow, marksData.marks, settings.gradeBoundaries, settings.divisionRanges);
    const students = selectedStream === "__all__"
      ? classResults.students
      : classResults.students.filter((student) => (student.stream_id ?? "__none__") === selectedStream);
    return buildSchoolReport([{ ...classResults, students }], settings);
  }, [classRow, marksData, selectedStream, settings]);

  if (loading) return <div className="me-loading"><Spinner size={20} /></div>;
  if (error) return <div className="st-empty-state">{error}</div>;
  if (!exam || !marksData) return <div className="st-empty-state">No exams are available for result viewing.</div>;

  const generated = new Date().toLocaleString();
  const heading = `${exam.name} ${displayDate(exam.start_date)}`.toUpperCase();

  return (
    <div className={`result-page${pageOrientation === "landscape" ? " print-landscape" : ""}`}>
      <div className="page-head result-controls">
        <div className="no-print">
          <h2 className="page-title">Result</h2>
          <p className="page-sub">Official examination results and subject performance summary.</p>
        </div>
        <div className="print-tools no-print">
          <div className="result-mode-tabs print-orientation" role="group" aria-label="Print orientation">
            <button type="button" className={`ex-tab${pageOrientation === "portrait" ? " ex-tab--active" : ""}`} onClick={() => setPageOrientation("portrait")}>Portrait</button>
            <button type="button" className={`ex-tab${pageOrientation === "landscape" ? " ex-tab--active" : ""}`} onClick={() => setPageOrientation("landscape")}>Landscape</button>
          </div>
          <button className="cm-btn cm-btn--ghost" onClick={() => window.print()}>Print / Export PDF</button>
        </div>
      </div>

      <div className="res-toolbar no-print">
        <label className="res-field"><span className="res-field-label">Exam</span><select className="res-select" value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>{exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="res-field"><span className="res-field-label">Class / Form</span><select className="res-select" value={selectedClassId} onChange={(event) => { setSelectedClassId(event.target.value); setSelectedStream("__all__"); }}>{marksData.classes.map((item) => <option key={item.class_id} value={item.class_id}>{item.class_name}</option>)}</select></label>
        <label className="res-field"><span className="res-field-label">Stream</span><select className="res-select" value={selectedStream} onChange={(event) => setSelectedStream(event.target.value)}><option value="__all__">General / All streams</option>{streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></label>
        <div className="res-field result-mode-toggle" role="group" aria-label="Result view mode">
          <span className="res-field-label">View</span>
          <div className="result-mode-tabs">
            <button type="button" className={`ex-tab${viewMode === "grades" ? " ex-tab--active" : ""}`} onClick={() => setViewMode("grades")}>Grades</button>
            <button type="button" className={`ex-tab${viewMode === "marks" ? " ex-tab--active" : ""}`} onClick={() => setViewMode("marks")}>Marks</button>
          </div>
        </div>
      </div>

      {marksLoading ? <div className="me-loading"><Spinner size={20} /></div> : !classRow || !report ? <div className="st-empty-state">No students found in this selection.</div> : (
        <div className="result-paper">
          <header className="result-header">
            <div>{schoolInfo?.council ? `${schoolInfo.council}${schoolInfo.district ? ` — ${schoolInfo.district}` : ""}` : schoolInfo?.district || "Council"}</div>
            <h1>{schoolInfo?.name || "School"}</h1>
            <div>{schoolInfo?.address ? `P.O. Box ${schoolInfo.address.replace(/^P\.?O\.?\s*Box\s*/i, "")}` : "P.O. Box"}</div>
            <h2>{heading}</h2>
            <div className="result-header-meta">{classRow.class_name}{selectedStream !== "__all__" ? ` — ${streams.find((stream) => stream.id === selectedStream)?.name ?? ""}` : ""}</div>
          </header>

          <section className="result-section">
            <h3 className="result-division-heading">Division Summary</h3>
            <div className="result-table-wrap result-division-wrap"><table className="result-table result-division-table"><thead><tr><th>Div</th><th>Boys</th><th>Girls</th><th>Total</th></tr></thead><tbody>{report.divisions.map((row) => <tr key={row.division}><td>{row.division}</td><td>{row.boys}</td><td>{row.girls}</td><td>{row.boys + row.girls}</td></tr>)}<tr className="result-division-incomplete"><td>Incomplete</td><td>{report.students.filter((row) => row.student.incomplete && genderLabel(row.student.gender) === "M").length}</td><td>{report.students.filter((row) => row.student.incomplete && genderLabel(row.student.gender) === "F").length}</td><td>{report.students.filter((row) => row.student.incomplete).length}</td></tr></tbody></table></div>
          </section>

          <section className="result-summary-grid">
            <div><span>Average (%)</span><strong>{displayNumber(report.summary.average)}</strong></div>
            <div><span>Grade</span><strong>{report.summary.grade}</strong></div>
            <div><span>Students</span><strong>{report.summary.students}</strong></div>
            <div><span>School GPA</span><strong>{displayNumber(report.summary.gpa)}</strong></div>
          </section>

          <section className="result-section">
            <h3>Students&apos; Results</h3>
            <div className="result-table-wrap"><table className="result-table result-students-table"><thead><tr><th>#</th><th>Student Name</th><th>Sex</th><th>Avg</th><th>Grade</th><th>Pts</th><th>Div</th><th>Subjects ({viewMode === "grades" ? "Grades" : "Marks"})</th></tr></thead><tbody>{report.students.map((row) => <tr key={row.student.student_id}><td>{row.rank || "—"}</td><td>{row.student.first_name}{row.student.middle_name ? ` ${row.student.middle_name}` : ""} {row.student.last_name}</td><td>{genderLabel(row.student.gender)}</td><td>{displayNumber(row.avg)}</td><td>{row.grade}</td><td>{row.student.incomplete ? "—" : row.student.total_points}</td><td>{row.divisionCode}</td><td className="result-subjects">{viewMode === "grades" ? subjectGrades(row.student.subjects) : subjectMarks(row.student.subjects)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="result-section">
            <h3>Subject Performance Summary</h3>
            <div className="result-table-wrap"><table className="result-table result-subject-table"><thead><tr><th rowSpan={2}>#</th><th rowSpan={2}>Subject</th><th colSpan={3}>A</th><th colSpan={3}>B</th><th colSpan={3}>C</th><th colSpan={3}>D</th><th colSpan={3}>F</th><th rowSpan={2}>Avg</th><th rowSpan={2}>Grade</th><th rowSpan={2}>REG</th><th rowSpan={2}>SAT</th><th rowSpan={2}>PASS</th><th rowSpan={2}>GPA</th><th rowSpan={2}>Competency</th></tr><tr>{["A", "B", "C", "D", "F"].map((grade) => [<th key={`${grade}-f`} className="result-gender-th">F</th>, <th key={`${grade}-m`} className="result-gender-th">M</th>, <th key={`${grade}-t`} className="result-gender-th">T</th>])}</tr></thead><tbody>{report.subjects.map((subject, index) => <tr key={subject.subject_id}><td>{index + 1}</td><td><strong>{subject.subject_code}</strong> — {subject.subject_name}</td>{["A", "B", "C", "D", "F"].map((grade) => { const f = subject.countsF[grade] ?? 0; const m = subject.countsM[grade] ?? 0; return [<td key={`${grade}-f`} className="result-gender-cells">{f}</td>, <td key={`${grade}-m`} className="result-gender-cells">{m}</td>, <td key={`${grade}-t`} className="result-gender-cells">{f + m}</td>]; })}<td>{displayNumber(subject.avg)}</td><td>{subject.grade}</td><td>{subject.registered}</td><td>{subject.sat}</td><td>{subject.passed}</td><td>{displayNumber(subject.gpa)}</td><td>{subject.competency}</td></tr>)}</tbody></table></div>
          </section>

          <footer className="result-footer">Generated: {generated}</footer>
        </div>
      )}
      {isAdmin && <span className="sr-only">Grading thresholds are managed in Academic Settings.</span>}
    </div>
  );
}
