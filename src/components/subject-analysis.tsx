"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart } from "@/components/charts";
import { Spinner } from "@/components/loading";
import {
  buildClassResults,
  buildSubjectAnalysis,
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  type GradingSettings,
  type SubjectAnalysis,
} from "@/lib/grading";
import {
  fetchExamMarks,
  fetchExams,
  fetchGradingSettings,
  fetchSchoolInfo,
  fetchTeacherByAuth,
  fetchTeachingAssignments,
  type DbExamRow,
  type ExamMarksData,
  type SchoolInfo,
  type TeachingAssignment,
} from "@/lib/school-api";

function displayNumber(value: number | null, suffix = ""): string {
  if (value === null) return "—";
  return `${Number.isInteger(value) ? String(value) : value.toFixed(1)}${suffix}`;
}

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function genderLabel(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.startsWith("f") ? "F" : normalized.startsWith("m") ? "M" : value;
}

interface ExamClassOption {
  class_id: string;
  class_name: string;
  subjects: { id: string; code: string; name: string; has_practical: boolean }[];
}

export default function SubjectAnalysis({ authUserId }: { authUserId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [noTeacher, setNoTeacher] = useState(false);
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [exams, setExams] = useState<DbExamRow[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [settings, setSettings] = useState<GradingSettings>({
    gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    divisionRanges: DEFAULT_DIVISION_RANGES,
    competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
  });

  const [selectedExamId, setSelectedExamId] = useState("");
  const [marksData, setMarksData] = useState<ExamMarksData | null>(null);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksError, setMarksError] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [pageOrientation, setPageOrientation] = useState<"portrait" | "landscape">("portrait");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      setNoTeacher(false);
      try {
        const teacher = await fetchTeacherByAuth(authUserId);
        if (!active) return;
        if (!teacher) {
          setNoTeacher(true);
          setLoading(false);
          return;
        }
        const [teacherAssignments, examResult, grading, info] = await Promise.all([
          fetchTeachingAssignments(teacher.id),
          fetchExams({ search: "", page: 1, pageSize: 100 }),
          fetchGradingSettings(),
          fetchSchoolInfo(),
        ]);
        if (!active) return;
        const eligible = examResult.rows
          .filter((exam) => exam.status !== "draft")
          .sort((a, b) => b.start_date.localeCompare(a.start_date));
        setAssignments(teacherAssignments);
        setExams(eligible);
        setSelectedExamId(eligible[0]?.id ?? "");
        setMarksLoading(eligible.length > 0);
        setSettings(grading);
        setSchoolInfo(info);
        setLoading(false);
      } catch {
        if (!active) return;
        setLoadError("Could not load your teaching data from the database.");
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!selectedExamId) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setMarksData(null);
      setMarksError("");
      setMarksLoading(true);
      try {
        const data = await fetchExamMarks(selectedExamId);
        if (!active) return;
        setMarksData(data);
      } catch {
        if (active) setMarksError("Could not load marks for the selected exam.");
      } finally {
        if (active) setMarksLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedExamId]);

  const teacherPairs = useMemo(
    () => new Set(assignments.map((a) => `${a.subject_id}:${a.class_id}`)),
    [assignments],
  );

  const classOptions = useMemo<ExamClassOption[]>(() => {
    if (!marksData) return [];
    return marksData.classes
      .map((cls) => ({
        class_id: cls.class_id,
        class_name: cls.class_name,
        subjects: cls.subjects.filter((subject) => teacherPairs.has(`${subject.id}:${cls.class_id}`)),
      }))
      .filter((cls) => cls.subjects.length > 0);
  }, [marksData, teacherPairs]);

  const { activeClassId, activeSubjectId, classOption, subjectOptions, subjectMeta } = useMemo(() => {
    const cls = classOptions.find((item) => item.class_id === selectedClassId) ?? classOptions[0] ?? null;
    const subjects = cls?.subjects ?? [];
    const subject = subjects.find((item) => item.id === selectedSubjectId) ?? subjects[0] ?? null;
    return {
      activeClassId: cls?.class_id ?? "",
      activeSubjectId: subject?.id ?? "",
      classOption: cls,
      subjectOptions: subjects,
      subjectMeta: subject,
    };
  }, [classOptions, selectedClassId, selectedSubjectId]);

  const exam = exams.find((item) => item.id === selectedExamId) ?? null;

  const analysis = useMemo<SubjectAnalysis | null>(() => {
    if (!marksData || !activeClassId || !activeSubjectId) return null;
    const classRow = marksData.classes.find((cls) => cls.class_id === activeClassId);
    if (!classRow) return null;
    const classResults = buildClassResults(
      classRow,
      marksData.marks,
      settings.gradeBoundaries,
      settings.divisionRanges,
    );
    return buildSubjectAnalysis(classResults, activeSubjectId, settings);
  }, [marksData, activeClassId, activeSubjectId, settings]);

  function changeExam(id: string) {
    setSelectedExamId(id);
    setSelectedClassId("");
    setSelectedSubjectId("");
    setMarksData(null);
    setMarksError("");
    setMarksLoading(Boolean(id));
  }

  if (loading) return <div className="me-loading"><Spinner size={20} /></div>;

  if (noTeacher) {
    return (
      <div className="db-empty">
        <h3>No teaching profile linked</h3>
        <p>Your account is not linked to a staff record, so subject analysis cannot be shown. Ask the headmaster to register you as a teacher.</p>
      </div>
    );
  }

  if (loadError) return <div className="st-empty-state">{loadError}</div>;

  if (assignments.length === 0) {
    return (
      <div className="db-empty">
        <h3>No teaching assignments yet</h3>
        <p>You have not been assigned any subjects yet. Ask the headmaster or academic officer to assign your teaching subjects.</p>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">Subject Analysis</h2>
            <p className="page-sub">Deep analysis of your subjects for a selected examination.</p>
          </div>
        </div>
        <div className="st-empty-state">No published exams are available yet. Exams appear here once they are registered and published.</div>
      </>
    );
  }

  const ready = Boolean(analysis) && Boolean(exam) && Boolean(subjectMeta);
  const showMarksLoading = marksLoading && !analysis;

  return (
    <div className={`result-page${pageOrientation === "landscape" ? " print-landscape" : ""}`}>
      <div className="page-head result-controls">
        <div className="no-print">
          <h2 className="page-title">Subject Analysis</h2>
          <p className="page-sub">Choose an exam, the form it was registered for and your subject to see its full analysis.</p>
        </div>
        <div className="print-tools no-print">
          <div className="result-mode-tabs print-orientation" role="group" aria-label="Print orientation">
            <button type="button" className={`ex-tab${pageOrientation === "portrait" ? " ex-tab--active" : ""}`} onClick={() => setPageOrientation("portrait")}>Portrait</button>
            <button type="button" className={`ex-tab${pageOrientation === "landscape" ? " ex-tab--active" : ""}`} onClick={() => setPageOrientation("landscape")}>Landscape</button>
          </div>
          <button className="cm-btn cm-btn--ghost" onClick={() => window.print()} disabled={!ready}>Print / Export PDF</button>
        </div>
      </div>

      <div className="res-toolbar no-print">
        <label className="res-field">
          <span className="res-field-label">Exam</span>
          <select className="res-select" value={selectedExamId} onChange={(event) => changeExam(event.target.value)}>
            {exams.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({shortDate(item.start_date)})</option>
            ))}
          </select>
        </label>
        <label className="res-field">
          <span className="res-field-label">Form / Class</span>
          <select className="res-select" value={activeClassId} onChange={(event) => setSelectedClassId(event.target.value)} disabled={classOptions.length === 0}>
            {classOptions.length === 0 && <option value="">No class with your subjects</option>}
            {classOptions.map((cls) => (
              <option key={cls.class_id} value={cls.class_id}>{cls.class_name}</option>
            ))}
          </select>
        </label>
        <label className="res-field">
          <span className="res-field-label">Subject</span>
          <select className="res-select" value={activeSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)} disabled={subjectOptions.length === 0}>
            {subjectOptions.length === 0 && <option value="">No subject registered</option>}
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>
            ))}
          </select>
        </label>
      </div>

      {marksError && <div className="st-empty-state">{marksError}</div>}

      {!marksError && showMarksLoading && <div className="me-loading"><Spinner size={20} /></div>}

      {!marksError && !showMarksLoading && !ready && (
        <div className="st-empty-state">
          {classOptions.length === 0 && !marksLoading
            ? "None of your subjects were registered for this exam in any form. Ask the academic office to include your subject when registering the exam."
            : "Select an exam, form and subject to see the analysis."}
        </div>
      )}

      {!marksError && ready && analysis && exam && subjectMeta && (
        <div className="result-paper">
          <header className="result-header">
            <div>{schoolInfo?.council ? `${schoolInfo.council}${schoolInfo.district ? ` — ${schoolInfo.district}` : ""}` : schoolInfo?.district || "Council"}</div>
            <h1>{schoolInfo?.name || "School"}</h1>
            <div>{schoolInfo?.address ? `P.O. Box ${schoolInfo.address.replace(/^P\.?O\.?\s*Box\s*/i, "")}` : "P.O. Box"}</div>
            <h2>SUBJECT ANALYSIS REPORT</h2>
            <div className="result-header-meta">
              {exam.name} · {classOption?.class_name} · {subjectMeta.code} — {subjectMeta.name}
            </div>
          </header>

          <section className="result-summary-grid">
            <div><span>Registered</span><strong>{analysis.registered}</strong></div>
            <div><span>Sat</span><strong>{analysis.sat}</strong></div>
            <div><span>Absent</span><strong>{analysis.absent}</strong></div>
            <div><span>Average</span><strong>{displayNumber(analysis.average)}</strong></div>
            <div><span>Subject Grade</span><strong>{analysis.grade}</strong></div>
            <div><span>GPA</span><strong>{displayNumber(analysis.gpa)}</strong></div>
            <div><span>Pass Rate</span><strong>{displayNumber(analysis.passRate, "%")}</strong></div>
            <div><span>Competency</span><strong>{analysis.competency}</strong></div>
          </section>

          <section className="result-summary-grid">
            <div><span>Passed</span><strong>{analysis.passed}</strong></div>
            <div><span>Failed</span><strong>{analysis.failed}</strong></div>
            <div><span>Pass Average</span><strong>{displayNumber(analysis.passAverage)}</strong></div>
            <div><span>Fail Average</span><strong>{displayNumber(analysis.failAverage)}</strong></div>
            <div><span>Highest</span><strong>{displayNumber(analysis.highest)}</strong></div>
            <div><span>Lowest</span><strong>{displayNumber(analysis.lowest)}</strong></div>
            <div><span>Boys Average</span><strong>{displayNumber(analysis.genders[0]?.average ?? null)}</strong></div>
            <div><span>Girls Average</span><strong>{displayNumber(analysis.genders[1]?.average ?? null)}</strong></div>
          </section>

          <section className="result-section">
            <h3>Grade Distribution</h3>
            <div className="result-table-wrap">
              <table className="result-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>Grade</th>
                    <th rowSpan={2}>Points</th>
                    <th colSpan={3}>Students</th>
                    <th rowSpan={2}>%</th>
                    <th rowSpan={2}>Avg Score</th>
                  </tr>
                  <tr>
                    <th className="result-gender-th">Boys</th>
                    <th className="result-gender-th">Girls</th>
                    <th className="result-gender-th">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.grades.map((row) => (
                    <tr key={row.grade}>
                      <td><strong>{row.grade}</strong></td>
                      <td>{row.points}</td>
                      <td>{row.boys}</td>
                      <td>{row.girls}</td>
                      <td>{row.count}</td>
                      <td>{displayNumber(row.percent, "%")}</td>
                      <td>{displayNumber(row.avg)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total</strong></td>
                    <td>—</td>
                    <td>{analysis.grades.reduce((sum, row) => sum + row.boys, 0)}</td>
                    <td>{analysis.grades.reduce((sum, row) => sum + row.girls, 0)}</td>
                    <td>{analysis.sat}</td>
                    <td>{analysis.sat > 0 ? "100%" : "—"}</td>
                    <td>{displayNumber(analysis.average)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="result-section">
            <h3>Grade Distribution (%)</h3>
            <BarChart
              data={analysis.grades.map((row) => ({ label: row.grade, value: row.percent ?? 0 }))}
              highlight={-1}
            />
          </section>

          <section className="result-section">
            <h3>Gender Analysis</h3>
            <div className="result-table-wrap">
              <table className="result-table">
                <thead>
                  <tr><th>Sex</th><th>Registered</th><th>Sat</th><th>Passed</th><th>Pass Rate</th><th>Average</th></tr>
                </thead>
                <tbody>
                  {analysis.genders.map((row) => (
                    <tr key={row.label}>
                      <td><strong>{row.label}</strong></td>
                      <td>{row.registered}</td>
                      <td>{row.sat}</td>
                      <td>{row.passed}</td>
                      <td>{displayNumber(row.passRate, "%")}</td>
                      <td>{displayNumber(row.average)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="result-section">
            <h3>Students ({analysis.sat} sat, {analysis.absent} absent)</h3>
            <div className="result-table-wrap">
              <table className="result-table">
                <thead>
                  <tr><th>#</th><th>Student</th><th>Sex</th><th>Stream</th><th>Mark</th><th>Grade</th><th>Points</th><th>Result</th></tr>
                </thead>
                <tbody>
                  {analysis.students.length === 0 && (
                    <tr><td colSpan={8} className="result-subjects">No student data for this subject in the selected exam.</td></tr>
                  )}
                  {analysis.students.map((row) => (
                    <tr key={row.student_id}>
                      <td>{row.rank ?? "—"}</td>
                      <td className="result-subjects">{row.name}</td>
                      <td>{genderLabel(row.gender)}</td>
                      <td>{row.stream === "—" ? "—" : row.stream}</td>
                      <td>{displayNumber(row.score)}</td>
                      <td>{row.grade}</td>
                      <td>{row.points ?? "—"}</td>
                      <td>{row.passed === null ? "ABS" : row.passed ? "PASS" : "FAIL"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="result-footer">
            Generated: {new Date().toLocaleString()} · {classOption?.class_name} · {subjectMeta.code} — {subjectMeta.name}
          </footer>
        </div>
      )}
    </div>
  );
}
