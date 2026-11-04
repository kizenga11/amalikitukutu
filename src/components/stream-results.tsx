"use client";

import "./stream-teacher.css";

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
import { fetchGradingSettings } from "@/lib/school-api";
import {
  fetchStreamResults,
  type ScopedExamMarks,
  type StreamExam,
} from "@/lib/stream-teacher-api";

interface Props {
  streamId: string;
  year: string;
}

function displayNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function StreamResults({ streamId, year }: Props) {
  const [exams, setExams] = useState<StreamExam[]>([]);
  const [examId, setExamId] = useState("");
  const [data, setData] = useState<ScopedExamMarks | null>(null);
  const [settings, setSettings] = useState<GradingSettings>({
    gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    divisionRanges: DEFAULT_DIVISION_RANGES,
    competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"grades" | "marks">("grades");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [grading, result] = await Promise.all([
          fetchGradingSettings().catch(() => null),
          fetchStreamResults(streamId, year),
        ]);
        if (!active) return;
        if (grading) setSettings(grading);
        setExams(result.exams);
        setExamId(result.exams[0]?.id ?? "");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load results.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [streamId, year]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!examId) {
        if (active) setData(null);
        return;
      }
      setLoadingMarks(true);
      setError("");
      try {
        const result = await fetchStreamResults(streamId, year, examId);
        if (!active) return;
        setExams(result.exams);
        setData(result.data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load exam marks.");
      } finally {
        if (active) setLoadingMarks(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [examId, streamId, year]);

  const report = useMemo(() => {
    if (!data) return null;
    const classResults = buildClassResults(
      data.classRow,
      data.marks,
      settings.gradeBoundaries,
      settings.divisionRanges,
    );
    return buildSchoolReport([classResults], settings);
  }, [data, settings]);

  if (loading) {
    return <div className="me-loading"><Spinner size={20} /></div>;
  }

  return (
    <div className="stream-teacher-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Stream Results</h2>
          <p className="page-sub">
            Results for all students in your stream across all exam subjects. Positions are within the stream.
          </p>
        </div>
        {exams.length > 0 && (
          <div className="page-head-right">
            <select className="cm-input cm-input--sm" value={examId} onChange={(event) => setExamId(event.target.value)}>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>{exam.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div className="stream-note" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}

      {exams.length === 0 ? (
        <div className="st-empty-state">No published exams for your class yet.</div>
      ) : loadingMarks ? (
        <div className="me-loading"><Spinner size={20} /></div>
      ) : !data || !report ? (
        <div className="st-empty-state">No marks to show for this exam.</div>
      ) : (
        <>
          <div className="stream-kpis">
            <div className="stream-kpi">
              <span>Stream</span>
              <strong>{data.classRow.class_name} - {data.classRow.students[0]?.stream_name ?? ""}</strong>
            </div>
            <div className="stream-kpi">
              <span>Students</span>
              <strong>{report.students.length}</strong>
            </div>
            <div className="stream-kpi">
              <span>Average</span>
              <strong>{displayNumber(report.summary.average)}</strong>
            </div>
            <div className="stream-kpi">
              <span>Grade</span>
              <strong>{report.summary.grade}</strong>
            </div>
          </div>

          <div className="stream-toolbar">
            <span className="term-chip">{data.exam.name}</span>
            <div className="stream-toolbar-actions">
              <button className={`cm-btn cm-btn--sm ${view === "grades" ? "cm-btn--primary" : "cm-btn--ghost"}`} onClick={() => setView("grades")}>Grades</button>
              <button className={`cm-btn cm-btn--sm ${view === "marks" ? "cm-btn--primary" : "cm-btn--ghost"}`} onClick={() => setView("marks")}>Marks</button>
            </div>
          </div>

          <div className="sm-table-wrap">
            <table className="sm-table stream-table stream-results-table">
              <thead>
                <tr>
                  <th className="stream-cell-center">Position</th>
                  <th>Student</th>
                  {data.classRow.subjects.map((subject) => (
                    <th key={subject.id} className="stream-cell-center">{subject.code}</th>
                  ))}
                  <th className="stream-cell-center">Total</th>
                  <th className="stream-cell-center">Average</th>
                  <th className="stream-cell-center">Grade</th>
                  <th className="stream-cell-center">Division</th>
                </tr>
              </thead>
              <tbody>
                {report.students.map((row) => {
                  const totalMarks = row.student.subjects.reduce((sum, subject) => sum + (subject.total_score ?? 0), 0);
                  return (
                    <tr key={row.student.student_id}>
                      <td className="stream-cell-center"><strong>{row.rank || "—"}</strong></td>
                      <td>
                        <div className="st-student-name">
                          {[row.student.first_name, row.student.middle_name, row.student.last_name].filter(Boolean).join(" ")}
                        </div>
                        <div className="st-student-sub">{row.student.stream_name}</div>
                      </td>
                      {data.classRow.subjects.map((subject) => {
                        const subjectRow = row.student.subjects.find((item) => item.subject_id === subject.id);
                        return (
                          <td key={subject.id} className="stream-cell-center">
                            {view === "grades"
                              ? subjectRow?.grade ?? "—"
                              : subjectRow?.is_absent
                                ? "ABS"
                                : displayNumber(subjectRow?.total_score ?? null)}
                          </td>
                        );
                      })}
                      <td className="stream-cell-center">{displayNumber(totalMarks)}</td>
                      <td className="stream-cell-center">{displayNumber(row.avg)}</td>
                      <td className="stream-cell-center"><strong>{row.grade}</strong></td>
                      <td className="stream-cell-center">{row.divisionCode}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
