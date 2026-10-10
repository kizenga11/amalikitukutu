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
  fetchTeacherByAuth,
  fetchTeachingAssignments,
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

function mean(values: number[]): number | null {
  return values.length === 0 ? null : round1(values.reduce((a, b) => a + b, 0) / values.length);
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

function trendArrow(trend: Trend): string {
  switch (trend) {
    case "up": return "▲";
    case "down": return "▼";
    case "new": return "＋";
    default: return "—";
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

interface SubjectStudentCompareRow {
  student_id: string;
  fullName: string;
  className: string;
  streamName: string;
  gender: string;
  currentScore: number | null;
  currentGrade: string;
  previousScore: number | null;
  previousGrade: string;
  delta: number | null;
  trend: Trend;
}

export default function CompareResults({ role, teacherId }: { role?: string; teacherId?: string }) {
  const isTeacher = role === "Teacher" || Boolean(teacherId);

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
  const [pageOrientation, setPageOrientation] = useState<"portrait" | "landscape">("landscape");

  const [teacherSubjectIds, setTeacherSubjectIds] = useState<Set<string>>(new Set());
  const [pickedSubjectIds, setPickedSubjectIds] = useState<string[] | null>(null);
  const [selectedSubjectForDetail, setSelectedSubjectForDetail] = useState<string | null>(null);

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
    if (!teacherId) return;
    let active = true;
    (async () => {
      try {
        const teacher = await fetchTeacherByAuth(teacherId);
        if (!teacher) return;
        const assignments = await fetchTeachingAssignments(teacher.id);
        if (active) setTeacherSubjectIds(new Set(assignments.map((a) => a.subject_id)));
      } catch {
        // Teacher scope unavailable - fall back to whole-school data.
      }
    })();
    return () => {
      active = false;
    };
  }, [teacherId]);

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
        fullName: `${row.student.first_name}${row.student.middle_name ? ` ${row.student.middle_name}` : ""} ${row.student.last_name}`,
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

  const mySubjectRows = useMemo(
    () => (isTeacher ? subjectRows.filter((row) => teacherSubjectIds.has(row.subject_id)) : subjectRows),
    [subjectRows, teacherSubjectIds, isTeacher],
  );

  const allMySubjectIds = useMemo(() => mySubjectRows.map((row) => row.subject_id), [mySubjectRows]);

  const selectedSubjectIds = useMemo(() => {
    if (pickedSubjectIds === null) return new Set(allMySubjectIds);
    const valid = pickedSubjectIds.filter((id) => allMySubjectIds.includes(id));
    return new Set(valid);
  }, [pickedSubjectIds, allMySubjectIds]);

  const visibleSubjects = useMemo(
    () => mySubjectRows.filter((row) => selectedSubjectIds.has(row.subject_id)),
    [mySubjectRows, selectedSubjectIds],
  );



  function toggleSubject(id: string) {
    setPickedSubjectIds((prev) => {
      const base = prev ?? allMySubjectIds;
      const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
      if (next.length === 1) setSelectedSubjectForDetail(next[0]);
      if (next.length === 0) setSelectedSubjectForDetail(null);
      return next;
    });
  }

  const teacherStats = useMemo(() => {
    let up = 0;
    let down = 0;
    let same = 0;
    let fresh = 0;
    const currentAvgs: number[] = [];
    const previousAvgs: number[] = [];
    for (const row of visibleSubjects) {
      if (row.current?.avg != null) currentAvgs.push(row.current.avg);
      if (row.previous?.avg != null) previousAvgs.push(row.previous.avg);
      if (row.delta === null) fresh += 1;
      else if (row.delta > 0) up += 1;
      else if (row.delta < 0) down += 1;
      else same += 1;
    }
    return {
      up,
      down,
      same,
      fresh,
      currentAvg: mean(currentAvgs),
      previousAvg: mean(previousAvgs),
    };
  }, [visibleSubjects]);

  const subjectStudentRows = useMemo<SubjectStudentCompareRow[]>(() => {
    if (!selectedSubjectForDetail || !currentReport) return [];
    const prevById = new Map((previousReport?.students ?? []).map((row) => [row.student.student_id, row]));
    const rows: SubjectStudentCompareRow[] = currentReport.students.map((row) => {
      const currentSr = row.student.subjects.find((s) => s.subject_id === selectedSubjectForDetail);
      const prev = prevById.get(row.student.student_id);
      const prevSr = prev?.student.subjects.find((s) => s.subject_id === selectedSubjectForDetail);
      const currentScore = currentSr?.total_score ?? null;
      const previousScore = prevSr?.total_score ?? null;
      const delta = currentScore !== null && previousScore !== null ? round1(currentScore - previousScore) : null;
      const trend: Trend = !prevSr ? (currentScore !== null ? "new" : "same") : delta === null ? "same" : delta > 0 ? "up" : delta < 0 ? "down" : "same";
      return {
        student_id: row.student.student_id,
        fullName: `${row.student.first_name}${row.student.middle_name ? ` ${row.student.middle_name}` : ""} ${row.student.last_name}`,
        className: studentClassMap.get(row.student.student_id) ?? "—",
        streamName: row.student.stream_name === "—" ? "Unassigned" : row.student.stream_name,
        gender: genderLabel(row.student.gender),
        currentScore,
        currentGrade: currentSr?.grade ?? "—",
        previousScore,
        previousGrade: prevSr?.grade ?? "—",
        delta,
        trend,
      };
    });
    rows.sort((a, b) => (b.currentScore ?? -1) - (a.currentScore ?? -1));
    return rows;
  }, [selectedSubjectForDetail, currentReport, previousReport, studentClassMap]);

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

  const noData = !currentReport || !currentExam;
  const teacherNoSubjects = isTeacher && marksLoading === false && mySubjectRows.length === 0;

  return (
    <div className={`result-page cmp-page${pageOrientation === "landscape" ? " print-landscape" : ""}`}>
      <div className="page-head result-controls">
        <div>
          <h2 className="page-title">Compare Exams</h2>
          <p className="page-sub">
            {isTeacher
              ? "Compare your subjects across two exams — averages, grades, competency and pass rates."
              : "Compare two exams — whole school, subjects and students (improved and declined)."}
          </p>
        </div>
        <div className="print-tools no-print">
          <div className="result-mode-tabs print-orientation" role="group" aria-label="Print orientation">
            <button type="button" className={`ex-tab${pageOrientation === "portrait" ? " ex-tab--active" : ""}`} onClick={() => setPageOrientation("portrait")}>Portrait</button>
            <button type="button" className={`ex-tab${pageOrientation === "landscape" ? " ex-tab--active" : ""}`} onClick={() => setPageOrientation("landscape")}>Landscape</button>
          </div>
          <button className="cm-btn cm-btn--ghost" onClick={() => window.print()} disabled={noData}>Print A4 / PDF</button>
        </div>
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
        {!isTeacher && (
          <label className="res-field"><span className="res-field-label">Form</span>
            <select className="res-select" value={kidatoFilter} onChange={(event) => setKidatoFilter(event.target.value)}>
              <option value="__all__">Whole School</option>
              {kidatos.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {!isTeacher && (
          <label className="res-field"><span className="res-field-label">Trend</span>
            <select className="res-select" value={trendFilter} onChange={(event) => setTrendFilter(event.target.value as "all" | "up" | "down")}>
              <option value="all">All</option>
              <option value="up">Improved</option>
              <option value="down">Declined</option>
            </select>
          </label>
        )}
      </div>

      {marksLoading ? <div className="me-loading"><Spinner size={20} /></div> : (
        noData ? (
          <div className="st-empty-state">Not enough exams for comparison. Make sure there are at least two exams.</div>
        ) : (
          <div className="result-paper">
            <header className="result-header cmp-report-header">
              <div className="cmp-header-top">
                <img className="cmp-header-logo" src="/assets/logo.png" alt="School logo" />
                <div className="cmp-header-school">
                  <div className="cmp-header-council">{schoolInfo?.council ? `${schoolInfo.council}${schoolInfo.district ? ` — ${schoolInfo.district}` : ""}` : schoolInfo?.district || "DISTRICT COUNCIL"}</div>
                  <h1>{schoolInfo?.name || "School"}</h1>
                  <div className="cmp-header-address">{schoolInfo?.address ? `P.O. Box ${schoolInfo.address.replace(/^P\.?O\.?\s*Box\s*/i, "")}` : "P.O. Box"}</div>
                </div>
              </div>
              <div className="cmp-header-title">
                <h2>{isTeacher ? "MY SUBJECTS COMPARISON REPORT" : "EXAMINATIONS COMPARISON REPORT"}</h2>
                <div className="cmp-header-period">
                  {previousExam ? `${previousExam.name.toUpperCase()} ${yearOf(previousExam.start_date)}` : "—"} VS {currentExam.name.toUpperCase()} {yearOf(currentExam.start_date)}
                </div>
              </div>
              <div className="cmp-header-meta">
                <span>{isTeacher ? `${visibleSubjects.length} subject${visibleSubjects.length === 1 ? "" : "s"}` : `Cohort: ${kidatoFilter !== "__all__" ? kidatoFilter : "Whole School"}`}</span>
                <span>{isTeacher ? "Subject Teacher" : "Academic Office"}</span>
                <span>Issued: {shortDate(new Date().toISOString())}</span>
              </div>
            </header>

            {isTeacher ? (
              <section className="result-section">
                <h3>Overview</h3>
                <div className="cmp-summary-grid">
                  <div className="result-summary-grid">
                    <div><span>Current Average</span><strong>{displayNumber(teacherStats.currentAvg)}%</strong></div>
                    <div><span>Previous Average</span><strong>{displayNumber(teacherStats.previousAvg)}%</strong></div>
                    <div><span>Change</span><strong className={deltaClass(avgDelta(teacherStats.currentAvg, teacherStats.previousAvg))}>{displayDelta(avgDelta(teacherStats.currentAvg, teacherStats.previousAvg))}</strong></div>
                    <div><span>Subjects</span><strong>{visibleSubjects.length}</strong></div>
                  </div>
                  <div className="result-summary-grid">
                    <div><span>Improved</span><strong className="cmp-trend-up">{teacherStats.up}</strong></div>
                    <div><span>Declined</span><strong className="cmp-trend-down">{teacherStats.down}</strong></div>
                    <div><span>No Change</span><strong>{teacherStats.same}</strong></div>
                    <div><span>New</span><strong>{teacherStats.fresh}</strong></div>
                  </div>
                </div>
              </section>
            ) : (
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
            )}

            {isTeacher && (
              <section className="result-section cmp-picker no-print">
                <div className="cmp-picker-head">
                  <h3>Choose Subjects to Compare</h3>
                  <div className="cmp-picker-actions">
                    <button type="button" className="cmp-picker-btn" onClick={() => setPickedSubjectIds(null)}>All</button>
                    <button type="button" className="cmp-picker-btn" onClick={() => setPickedSubjectIds([])}>Clear</button>
                  </div>
                </div>
                {mySubjectRows.length === 0 ? (
                  <p className="cmp-empty">None of your subjects were registered in these exams.</p>
                ) : (
                  <>
                    <div className="cmp-subject-chips">
                      {mySubjectRows.map((row) => {
                        const active = selectedSubjectIds.has(row.subject_id);
                        const detailActive = selectedSubjectForDetail === row.subject_id;
                        return (
                          <button
                            key={row.subject_id}
                            type="button"
                            className={`cmp-subject-chip${active ? " cmp-subject-chip--active" : ""}${detailActive ? " cmp-subject-chip--detail" : ""}`}
                            onClick={() => toggleSubject(row.subject_id)}
                            aria-pressed={active}
                          >
                            <span className="cmp-chip-code">{row.subject_code}</span>
                            <span className="cmp-chip-name">{row.subject_name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="cmp-picker-hint">{visibleSubjects.length} of {mySubjectRows.length} subjects selected</p>
                  </>
                )}
              </section>
            )}

            <section className="result-section">
              <h3>{isTeacher ? "My Subjects Comparison" : "Subject Comparison"}</h3>
              {teacherNoSubjects ? (
                <p className="cmp-empty">You have no subject assignments registered in these exams.</p>
              ) : visibleSubjects.length === 0 ? (
                <p className="cmp-empty">{isTeacher ? "Select at least one subject above to compare." : "No subjects found."}</p>
              ) : (
                <div className="cmp-subject-grid">
                  {visibleSubjects.map((row) => (
                    <article
                      className={`cmp-subject-card${selectedSubjectForDetail === row.subject_id ? " cmp-subject-card--active" : ""}`}
                      key={row.subject_id}
                      onClick={() => setSelectedSubjectForDetail(selectedSubjectForDetail === row.subject_id ? null : row.subject_id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedSubjectForDetail(selectedSubjectForDetail === row.subject_id ? null : row.subject_id))}
                    >
                      <div className="cmp-subject-card-head">
                        <div className="cmp-subject-title">
                          <span className="cmp-subject-code">{row.subject_code}</span>
                          <span className="cmp-subject-name">{row.subject_name}</span>
                        </div>
                        <span className={`cmp-subject-tag${row.delta === null ? "" : row.delta > 0 ? " cmp-subject-tag--up" : row.delta < 0 ? " cmp-subject-tag--down" : ""}`}>
                          {row.delta === null ? "New" : displayDelta(row.delta)}
                        </span>
                      </div>
                      <div className="cmp-compare-cols">
                        <div className="cmp-compare-col">
                          <span className="cmp-col-label">Current</span>
                          <span className="cmp-col-value">{displayNumber(row.current?.avg ?? null)}</span>
                          <span className="cmp-col-sub">Grade {row.current?.grade ?? "—"} · {row.current?.competency ?? "—"}</span>
                          <span className="cmp-col-sub">Passed {row.current?.passed ?? 0}/{row.current?.sat ?? 0}</span>
                        </div>
                        <div className="cmp-compare-col">
                          <span className="cmp-col-label">Previous</span>
                          <span className="cmp-col-value">{displayNumber(row.previous?.avg ?? null)}</span>
                          <span className="cmp-col-sub">Grade {row.previous?.grade ?? "—"} · {row.previous?.competency ?? "—"}</span>
                          <span className="cmp-col-sub">Passed {row.previous?.passed ?? 0}/{row.previous?.sat ?? 0}</span>
                        </div>
                      </div>
                      {isTeacher && selectedSubjectForDetail === row.subject_id && (
                        <p className="cmp-subject-hint">Per-student comparison below</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {!isTeacher && previousReport && (
              <section className="result-section">
                <h3>Division Comparison</h3>
                <div className="cmp-division-grid">
                  {divisionRows.map((row) => (
                    <div className="cmp-division-card" key={row.division}>
                      <span className="cmp-division-label">{row.label}</span>
                      <div className="cmp-division-values">
                        <strong>{row.current}</strong>
                        <span className="cmp-division-prev">was {row.previous}</span>
                      </div>
                      <span className={`cmp-division-delta ${deltaClass(row.delta)}`}>{row.delta > 0 ? `▲ +${row.delta}` : row.delta < 0 ? `▼ ${row.delta}` : "—"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!isTeacher && (
              <section className="result-section">
                <h3>Student Comparison</h3>
                {filteredStudents.length === 0 ? (
                  <p className="cmp-empty">No students match this selection.</p>
                ) : (
                  <div className="cmp-student-list">
                    {filteredStudents.map((row) => (
                      <article className="cmp-student-row" key={row.student_id}>
                        <div className="cmp-student-main">
                          <span className="cmp-student-name">{row.fullName}</span>
                          <span className="cmp-student-meta">{row.className} — {row.streamName} · {row.gender}</span>
                        </div>
                        <div className="cmp-student-metrics">
                          <div className="cmp-student-metric"><span>Current</span><strong>{displayNumber(row.current?.avg ?? null)}</strong></div>
                          <div className="cmp-student-metric"><span>Previous</span><strong>{displayNumber(row.previous?.avg ?? null)}</strong></div>
                          <div className="cmp-student-metric"><span>Change</span><strong className={deltaClass(row.delta)}>{displayDelta(row.delta)}</strong></div>
                          <div className="cmp-student-metric"><span>Rank</span><strong>{row.current?.rank || "—"}{row.previous ? ` ← ${row.previous.rank || "—"}` : ""}</strong></div>
                          <div className="cmp-student-metric"><span>Trend</span><strong className={row.trend === "up" ? "cmp-trend-up" : row.trend === "down" ? "cmp-trend-down" : ""}>{trendArrow(row.trend)} {trendLabel(row.trend)}</strong></div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {isTeacher && selectedSubjectForDetail && (
              <section className="result-section">
                <h3>Comparison by Student — {mySubjectRows.find((s) => s.subject_id === selectedSubjectForDetail)?.subject_name || ""}</h3>
                {subjectStudentRows.length === 0 ? (
                  <p className="cmp-empty">No students found for this subject.</p>
                ) : (
                  <div className="cmp-student-list cmp-student-list--subject">
                    {subjectStudentRows.map((row) => (
                      <article className="cmp-student-row" key={row.student_id}>
                        <div className="cmp-student-main">
                          <span className="cmp-student-name">{row.fullName}</span>
                          <span className="cmp-student-meta">{row.className} — {row.streamName} · {row.gender}</span>
                        </div>
                        <div className="cmp-student-metrics">
                          <div className="cmp-student-metric"><span>Current</span><strong>{displayNumber(row.currentScore)}</strong><small className="cmp-metric-sub">({row.currentGrade})</small></div>
                          <div className="cmp-student-metric"><span>Previous</span><strong>{displayNumber(row.previousScore)}</strong><small className="cmp-metric-sub">({row.previousGrade})</small></div>
                          <div className="cmp-student-metric"><span>Change</span><strong className={deltaClass(row.delta)}>{displayDelta(row.delta)}</strong></div>
                          <div className="cmp-student-metric"><span>Trend</span><strong className={row.trend === "up" ? "cmp-trend-up" : row.trend === "down" ? "cmp-trend-down" : ""}>{trendArrow(row.trend)} {trendLabel(row.trend)}</strong></div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            <footer className="result-footer">
              {isTeacher ? "Issued by Subject Teacher" : "This report was issued by the Academic Office"} | Date: {shortDate(new Date().toISOString())}
            </footer>
          </div>
        )
      )}
    </div>
  );
}
