"use client";

import "./stream-teacher.css";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import AutoGrowTextarea from "@/components/auto-grow-textarea";
import {
  buildClassResults,
  buildSchoolReport,
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  type GradingSettings,
  type StudentReportRow,
} from "@/lib/grading";
import { fetchGradingSettings } from "@/lib/school-api";
import {
  fetchStreamReports,
  saveStreamConduct,
  type ScopedExamMarks,
  type StreamExam,
  type StreamTeacherTerm,
} from "@/lib/stream-teacher-api";

interface Props {
  streamId: string;
  year: string;
  term: StreamTeacherTerm;
}

interface ReviewState {
  row: StudentReportRow;
  conduct: string;
  remarks: string;
}

function displayNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function studentName(row: StudentReportRow): string {
  return [row.student.first_name, row.student.middle_name, row.student.last_name].filter(Boolean).join(" ");
}

export default function StreamReports({ streamId, year, term }: Props) {
  const [exams, setExams] = useState<StreamExam[]>([]);
  const [examId, setExamId] = useState("");
  const [data, setData] = useState<ScopedExamMarks | null>(null);
  const [conduct, setConduct] = useState<Record<string, { conduct: string; remarks: string; source: string; updated_at: string | null }>>({});
  const [settings, setSettings] = useState<GradingSettings>({
    gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    divisionRanges: DEFAULT_DIVISION_RANGES,
    competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
  });
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [grading, result] = await Promise.all([
          fetchGradingSettings().catch(() => null),
          fetchStreamReports(streamId, year, term),
        ]);
        if (!active) return;
        if (grading) setSettings(grading);
        setExams(result.exams);
        setConduct(result.conduct);
        setExamId(result.exams[0]?.id ?? "");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load reports.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [streamId, year, term]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!examId) {
        if (active) setData(null);
        return;
      }
      setLoadingReport(true);
      setError("");
      try {
        const result = await fetchStreamReports(streamId, year, term, examId);
        if (!active) return;
        setExams(result.exams);
        setData(result.data);
        setConduct(result.conduct);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load exam reports.");
      } finally {
        if (active) setLoadingReport(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [examId, streamId, year, term]);

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

  function openReview(row: StudentReportRow) {
    const record = conduct[row.student.student_id];
    setReview({
      row,
      conduct: record?.conduct ?? "",
      remarks: record?.remarks ?? "",
    });
    setError("");
    setMessage("");
  }

  async function saveReview() {
    if (!review || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveStreamConduct(streamId, year, term, [
        {
          studentId: review.row.student.student_id,
          conduct: review.conduct,
          remarks: review.remarks,
        },
      ]);
      setConduct((current) => ({
        ...current,
        [review.row.student.student_id]: {
          conduct: review.conduct,
          remarks: review.remarks,
          source: "manual",
          updated_at: new Date().toISOString(),
        },
      }));
      setReview(null);
      setMessage("Report remarks saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save remarks.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="me-loading"><Spinner size={20} /></div>;
  }

  return (
    <div className="stream-teacher-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Stream Reports</h2>
          <p className="page-sub">Review reports, edit class teacher remarks and see report status for Term {term}.</p>
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
      {message && <div className="stream-note" style={{ borderColor: "#a7f3d0", background: "#ecfdf5", color: "#047857" }}>{message}</div>}

      {exams.length === 0 ? (
        <div className="st-empty-state">No published exams for your class yet.</div>
      ) : loadingReport ? (
        <div className="me-loading"><Spinner size={20} /></div>
      ) : !report || !data ? (
        <div className="st-empty-state">No reports to show for this exam.</div>
      ) : (
        <div className="sm-table-wrap">
          <table className="sm-table stream-table">
            <thead>
              <tr>
                <th className="stream-cell-center">Position</th>
                <th>Student</th>
                <th className="stream-cell-center">Average</th>
                <th className="stream-cell-center">Grade</th>
                <th className="stream-cell-center">Division</th>
                <th className="stream-cell-center">Conduct</th>
                <th>Remarks</th>
                <th className="stream-cell-center">Status</th>
                <th className="stream-cell-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {report.students.map((row) => {
                const record = conduct[row.student.student_id];
                const hasMarks = row.avg !== null;
                const ready = hasMarks && Boolean(record?.conduct?.trim()) && Boolean(record?.remarks?.trim());
                return (
                  <tr key={row.student.student_id}>
                    <td className="stream-cell-center"><strong>{row.rank || "—"}</strong></td>
                    <td>
                      <div className="st-student-name">{studentName(row)}</div>
                      <div className="st-student-sub">{row.student.stream_name}</div>
                    </td>
                    <td className="stream-cell-center">{displayNumber(row.avg)}</td>
                    <td className="stream-cell-center"><strong>{row.grade}</strong></td>
                    <td className="stream-cell-center">{row.divisionCode}</td>
                    <td className="stream-cell-center">{record?.conduct || "—"}</td>
                    <td>{record?.remarks || "—"}</td>
                    <td className="stream-cell-center">
                      <span className={`stream-status ${!hasMarks ? "stream-status--empty" : ready ? "stream-status--ready" : "stream-status--draft"}`}>
                        {!hasMarks ? "No marks" : ready ? "Ready" : "Draft"}
                      </span>
                    </td>
                    <td className="stream-cell-center">
                      <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => openReview(row)}>Review</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {review && (
        <div className="cm-modal-backdrop" onClick={() => setReview(null)}>
          <div className="sm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sm-modal-head">
              <h3 className="sm-modal-title">Report for {studentName(review.row)}</h3>
              <p className="sm-modal-sub">
                Position {review.row.rank || "—"} · Average {displayNumber(review.row.avg)} · Grade {review.row.grade} · Division {review.row.divisionCode}
              </p>
            </div>

            <div className="stream-review-grid">
              {review.row.student.subjects.map((subject) => (
                <div key={subject.subject_id} className="stream-review-subject">
                  <strong>{subject.subject_code}</strong>
                  <div>{subject.is_absent ? "ABS" : displayNumber(subject.total_score)} · {subject.grade}</div>
                </div>
              ))}
            </div>

            <div className="sm-form-grid">
              <label className="sm-field">
                <span className="sm-field-label">Conduct</span>
                <input className="sm-input" value={review.conduct} onChange={(event) => setReview({ ...review, conduct: event.target.value })} />
              </label>
              <label className="sm-field" style={{ gridColumn: "1 / -1" }}>
                <span className="sm-field-label">Class Teacher Remarks</span>
                <AutoGrowTextarea
                  className="stream-modal-textarea"
                  minRows={4}
                  value={review.remarks}
                  onChange={(event) => setReview({ ...review, remarks: event.target.value })}
                  placeholder="Write remarks to appear on the report..."
                />
              </label>
            </div>

            <div className="sm-modal-actions">
              <button className="cm-btn cm-btn--ghost" onClick={() => setReview(null)} disabled={saving}>Cancel</button>
              <button className="cm-btn cm-btn--primary" onClick={saveReview} disabled={saving}>{saving ? "Saving..." : "Save Remarks"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
