"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchExamMarks,
  fetchExams,
  fetchGradingSettings,
  saveGradingSettings,
  type DbExamRow,
  type ExamMarksData,
  type ExamStatus,
} from "@/lib/school-api";
import {
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  DEFAULT_COMPETENCY_THRESHOLDS,
  buildClassResults,
  rankResults,
  type DivisionRange,
  type GradeBoundary,
  type GradingSettings,
} from "@/lib/grading";
import { Spinner } from "@/components/loading";

const ELIGIBLE_STATUSES: ExamStatus[] = ["processing", "published"];

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function gradeClass(grade: string): string {
  const clean = grade.replace(/[^A-Z0-9]/gi, "");
  return clean || "ABS";
}

export default function ResultsManagement({ role }: { role?: string }) {
  const isAdmin = role !== undefined && role !== "Teacher";

  const [exams, setExams] = useState<DbExamRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStream, setSelectedStream] = useState<string>("__all__");

  const [marksData, setMarksData] = useState<ExamMarksData | null>(null);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksError, setMarksError] = useState(false);

  const [settings, setSettings] = useState<GradingSettings>({
    gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    divisionRanges: DEFAULT_DIVISION_RANGES,
    competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Load the (processing/published) exam list + grading settings once.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setDbError(false);
      try {
        const [examRes, grading] = await Promise.all([
          fetchExams({ search: "", page: 1, pageSize: 100 }),
          fetchGradingSettings(),
        ]);
        if (!active) return;
        setExams(examRes.rows);
        setTotal(examRes.total);
        setSettings(grading);
        const first = examRes.rows.find((ex) => ELIGIBLE_STATUSES.includes(ex.status));
        if (first) setSelectedExamId(first.id);
      } catch {
        if (!active) return;
        setDbError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load marks for the selected exam and pick the first class.
  useEffect(() => {
    if (!selectedExamId) return;
    let active = true;
    (async () => {
      setMarksLoading(true);
      setMarksError(false);
      setMarksData(null);
      try {
        const data = await fetchExamMarks(selectedExamId);
        if (!active) return;
        setMarksData(data);
        setSelectedClassId((prev) =>
          data.classes.some((c) => c.class_id === prev)
            ? prev
            : data.classes[0]?.class_id ?? "",
        );
        setSelectedStream("__all__");
      } catch {
        if (!active) return;
        setMarksError(true);
      } finally {
        if (active) setMarksLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedExamId]);

  const eligibleExams = useMemo(
    () => exams.filter((ex) => ELIGIBLE_STATUSES.includes(ex.status)),
    [exams],
  );

  const classRow = useMemo(() => {
    if (!marksData) return null;
    return marksData.classes.find((c) => c.class_id === selectedClassId) ?? null;
  }, [marksData, selectedClassId]);

  const classResults = useMemo(() => {
    if (!classRow || !marksData) return null;
    return buildClassResults(classRow, marksData.marks, settings.gradeBoundaries, settings.divisionRanges);
  }, [classRow, marksData, settings]);

  const streams = useMemo(() => {
    if (!classRow) return [];
    const map = new Map<string, { key: string; name: string; count: number }>();
    for (const st of classRow.students) {
      const key = st.stream_id ?? "__none__";
      const name = st.stream_name && st.stream_name !== "\u2014" ? st.stream_name : "Unassigned";
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { key, name, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classRow]);

  const filteredStudents = useMemo(() => {
    if (!classResults) return [];
    if (selectedStream === "__all__") return classResults.students;
    return classResults.students.filter((s) => (s.stream_id ?? "__none__") === selectedStream);
  }, [classResults, selectedStream]);

  const ranked = useMemo(() => rankResults(filteredStudents), [filteredStudents]);
  const incompleteRows = useMemo(
    () =>
      filteredStudents
        .filter((s) => s.incomplete)
        .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
        .map((student) => ({ student, rank: 0 })),
    [filteredStudents],
  );
  const displayRows = [...ranked, ...incompleteRows];

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    let incomplete = 0;
    for (const s of filteredStudents) {
      if (s.incomplete) {
        incomplete += 1;
        continue;
      }
      counts[s.division] = (counts[s.division] ?? 0) + 1;
    }
    return { counts, incomplete };
  }, [filteredStudents]);

  const divisionStyleKeys = useMemo(() => {
    const map = new Map<string, string>();
    settings.divisionRanges.forEach((r, i) => map.set(r.division, `res-chip--${i + 1}`));
    return map;
  }, [settings]);

  const summaryChips = settings.divisionRanges
    .map((r, i) => ({
      key: r.division,
      label: r.division,
      count: summary.counts[r.division] ?? 0,
      color: `res-chip--${i + 1}`,
    }))
    .filter((c) => c.count > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Results</h2>
          <p className="page-sub">
            NECTA CSEE O-level progressive results computed from exam marks using the NECTA grading scale.
          </p>
        </div>
        <div className="page-head-right">
          {total > 0 && (
            <span className="active-chip">
              {eligibleExams.length} Result{eligibleExams.length !== 1 ? "s" : ""}
            </span>
          )}
          {isAdmin && (
            <button className="cm-btn cm-btn--ghost" onClick={() => setSettingsOpen((v) => !v)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: ".9rem", height: ".9rem" }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2h1v3" />
                <path d="M12 19v3" />
                <path d="M2 12h3" />
                <path d="M19 12h3" />
              </svg>
              Grading Settings
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="me-loading"><Spinner size={20} /></div>
      ) : dbError ? (
        <div className="st-empty-state">
          Could not load results data from the database.
          <div><button className="cm-btn cm-btn--ghost st-retry" onClick={() => window.location.reload()}>Retry</button></div>
        </div>
      ) : eligibleExams.length === 0 ? (
        <div className="st-empty-state">
          No exams have been processed or published yet. Results appear here once an exam is marked as processing or published.
        </div>
      ) : (
        <>
          <div className="res-toolbar">
            <label className="res-field">
              <span className="res-field-label">Exam</span>
              <span className="res-select-wrap">
                <select className="res-select" value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)}>
                  {eligibleExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} {" \u2014 "} {ex.status.charAt(0).toUpperCase() + ex.status.slice(1)}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            {marksData && classRow && (
              <label className="res-field">
                <span className="res-field-label">Class</span>
                <span className="res-select-wrap">
                  <select
                    className="res-select"
                    value={selectedClassId}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      setSelectedStream("__all__");
                    }}
                  >
                    {marksData.classes.map((c) => (
                      <option key={c.class_id} value={c.class_id}>
                        {c.class_name} ({c.students.length})
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            )}

            {streams.length > 1 && (
              <label className="res-field">
                <span className="res-field-label">Stream</span>
                <span className="res-select-wrap">
                  <select className="res-select" value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)}>
                    <option value="__all__">All streams</option>
                    {streams.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name} ({s.count})
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            )}
          </div>

          {marksLoading ? (
            <div className="me-loading"><Spinner size={20} /></div>
          ) : marksError || !marksData ? (
            <div className="st-empty-state">Could not load marks for this exam.</div>
          ) : !classRow ? (
            <div className="st-empty-state">No classes found in this exam.</div>
          ) : (
            <>
              {summaryChips.length > 0 || summary.incomplete > 0 ? (
                <div className="res-summary">
                  {summaryChips.map((c) => (
                    <span key={c.key} className={`res-chip ${c.color}`}>
                      <strong>{c.count}</strong> {c.label}
                    </span>
                  ))}
                  {summary.incomplete > 0 && (
                    <span className="res-chip res-chip--inc">
                      <strong>{summary.incomplete}</strong> Incomplete
                    </span>
                  )}
                </div>
              ) : null}

              {displayRows.length === 0 ? (
                <div className="st-empty-state">No students found in this selection.</div>
              ) : (
                <div className="res-wrap">
                  <table className="sm-table res-table">
                    <thead>
                      <tr>
                        <th className="res-col-rank">#</th>
                        <th className="res-col-student">Student</th>
                        {classRow.subjects.map((s) => (
                          <th
                            key={s.id}
                            className="res-col-subj"
                            title={`${s.name}${s.has_practical ? " \u2014 Theory 50 + Practical 50" : " \u2014 Theory 100"}`}
                          >
                            {s.code}
                          </th>
                        ))}
                        <th className="res-col-total">Points</th>
                        <th className="res-col-div">Division</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((item) => {
                        const st = item.student;
                        return (
                          <tr key={st.student_id} className={st.incomplete ? "res-row-incomplete" : ""}>
                            <td className="res-col-rank">{item.rank === 0 ? "\u2014" : `#${item.rank}`}</td>
                            <td className="res-col-student">
                              <div className="res-student-name">
                                {st.first_name} {st.last_name}
                                {st.middle_name ? ` ${st.middle_name}` : ""}
                              </div>
                              <div className="res-student-meta">
                                {st.stream_name && st.stream_name !== "\u2014" ? st.stream_name : "Unassigned"}
                              </div>
                            </td>
                            {classRow.subjects.map((subj) => {
                              const sr = st.subjects.find((s) => s.subject_id === subj.id);
                              if (!sr || sr.total_score === null) {
                                return (
                                  <td key={subj.id} className="res-subj res-subj-na">
                                    {sr?.is_absent ? <span className="res-grd grd-ABS">ABS</span> : "\u2014"}
                                  </td>
                                );
                              }
                              return (
                                <td key={subj.id} className="res-subj">
                                  <span className="res-subj-score">{formatScore(sr.total_score)}</span>
                                  <span className={`res-grd grd-${gradeClass(sr.grade)}`}>{sr.grade}</span>
                                </td>
                              );
                            })}
                            <td className="res-col-total">
                              {st.incomplete ? "\u2014" : st.total_points}
                            </td>
                            <td className="res-col-div">
                              {st.incomplete ? (
                                <span className="res-chip res-chip--inc">Incomplete</span>
                              ) : (
                                <span className={`res-chip ${divisionStyleKeys.get(st.division) ?? "res-chip--inc"}`}>
                                  {st.division}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {isAdmin && settingsOpen && (
        <GradingSettingsEditor
          settings={settings}
          message={saveMsg}
          onMessage={setSaveMsg}
          onSave={async (next) => {
            try {
              await saveGradingSettings(next);
              setSettings(next);
              setSaveMsg("Saved \u2014 results recalculated.");
            } catch {
              setSaveMsg("Could not save. Database unavailable.");
              throw new Error("save-failed");
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}

function GradingSettingsEditor({
  settings,
  message,
  onMessage,
  onSave,
  onClose,
}: {
  settings: GradingSettings;
  message: string | null;
  onMessage: (m: string | null) => void;
  onSave: (next: GradingSettings) => Promise<void>;
  onClose: () => void;
}) {
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>(() =>
    settings.gradeBoundaries.map((b) => ({ ...b })),
  );
  const [ranges, setRanges] = useState<DivisionRange[]>(() =>
    settings.divisionRanges.map((r) => ({ ...r })),
  );
  const [saving, setSaving] = useState(false);

  function updateBoundary(i: number, patch: Partial<GradeBoundary>) {
    setBoundaries((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  function updateRange(i: number, patch: Partial<DivisionRange>) {
    setRanges((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    if (saving) return;
    for (const b of boundaries) {
      if (!b.grade.trim()) {
        onMessage("Every grade row needs a grade label.");
        return;
      }
      if (!Number.isFinite(b.min) || !Number.isFinite(b.max)) {
        onMessage("Grade bounds must be numbers.");
        return;
      }
      if (b.min > b.max) {
        onMessage(`Grade ${b.grade}: min cannot exceed max.`);
        return;
      }
      if (!Number.isFinite(b.points)) {
        onMessage("Points must be a number.");
        return;
      }
    }
    for (const r of ranges) {
      if (!r.division.trim()) {
        onMessage("Every division row needs a label.");
        return;
      }
      if (!Number.isFinite(r.min) || (r.max !== null && !Number.isFinite(r.max))) {
        onMessage("Division bounds must be numbers (upper bound can be empty).");
        return;
      }
      if (r.max !== null && r.min > r.max) {
        onMessage(`Division ${r.division}: min cannot exceed max.`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        gradeBoundaries: boundaries.map((b) => ({ ...b, grade: b.grade.trim() })),
        divisionRanges: ranges.map((r) => ({ ...r, division: r.division.trim() })),
        competencyThresholds: settings.competencyThresholds,
      });
      setSaving(false);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="res-settings panel">
      <div className="res-settings-head">
        <div>
          <h3 className="panel-title">NECTA Grading Scale</h3>
          <p className="panel-sub">
            Configure the grade boundaries and division ranges used to compute results. A student needs at least 7 scored subjects to qualify for a division.
          </p>
        </div>
        <button className="cm-icon-btn" title="Close grading settings" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div className="res-settings-sec">
        <div className="res-settings-sec-title">Grade boundaries (score range {"\u2192"} grade and points)</div>
        <table className="res-bound-table">
          <thead>
            <tr>
              <th>Score from</th>
              <th>Score to</th>
              <th>Grade</th>
              <th>Points</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {boundaries.map((b, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="res-bound-input"
                    type="number" min={0} max={100} step="any"
                    value={b.min}
                    onChange={(e) => updateBoundary(i, { min: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="res-bound-input"
                    type="number" min={0} max={100} step="any"
                    value={b.max}
                    onChange={(e) => updateBoundary(i, { max: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="res-bound-input"
                    type="text"
                    value={b.grade}
                    onChange={(e) => updateBoundary(i, { grade: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="res-bound-input"
                    type="number" min={1} step="any"
                    value={b.points}
                    onChange={(e) => updateBoundary(i, { points: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button
                    className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger"
                    title="Remove row"
                    onClick={() => setBoundaries((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="cm-btn cm-btn--ghost cm-btn--sm"
          onClick={() => setBoundaries((p) => [...p, { min: 0, max: 0, grade: "", points: 5 }])}
        >
          + Add grade row
        </button>
      </div>

      <div className="res-settings-sec">
        <div className="res-settings-sec-title">Division ranges (total points of best 7 subjects {"\u2192"} division, empty upper bound = no limit)</div>
        <table className="res-bound-table">
          <thead>
            <tr>
              <th>Points from</th>
              <th>Points to</th>
              <th>Division</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ranges.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="res-bound-input"
                    type="number" min={0} step="any"
                    value={r.min}
                    onChange={(e) => updateRange(i, { min: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="res-bound-input"
                    type="number" min={0} step="any"
                    value={r.max ?? ""}
                    placeholder="No limit"
                    onChange={(e) => updateRange(i, { max: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="res-bound-input"
                    type="text"
                    value={r.division}
                    onChange={(e) => updateRange(i, { division: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger"
                    title="Remove row"
                    onClick={() => setRanges((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="cm-btn cm-btn--ghost cm-btn--sm"
          onClick={() => setRanges((p) => [...p, { min: 0, max: null, division: "" }])}
        >
          + Add division row
        </button>
      </div>

      <div className="res-settings-actions">
        <span className={`res-settings-status${message ? " res-settings-status--ok" : ""}`}>
          {message ?? "Changes apply immediately after saving."}
        </span>
        <button className="cm-btn cm-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save scale"}
        </button>
      </div>
    </div>
  );
}