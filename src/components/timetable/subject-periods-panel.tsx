"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  classSlotOpen,
  patternLabel,
  priorityLabel,
  type TimetableAssignment,
} from "@/lib/timetable";
import { useTimetable, type TimetableClientData } from "./timetable-context";
import { Spinner } from "@/components/loading";

export default function SubjectPeriodsPanel() {
  const { data, loading, error } = useTimetable();
  if (loading) return <div className="tt-state"><Spinner /> Loading subject periods…</div>;
  if (error) return <div className="tt-state tt-state--error">{error}</div>;
  if (!data) return <div className="tt-state">No timetable data yet.</div>;
  return <SubjectPeriodsBody data={data} />;
}

function SubjectPeriodsBody({ data }: { data: TimetableClientData }) {
  const [classId, setClassId] = useState(data.classes[0]?.id ?? "");
  const activeClass = data.classes.find((cls) => cls.id === classId) ?? data.classes[0];

  return (
    <div className="tt-panel-stack">
      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Subject periods</h2>
            <p>Pick a class, then set weekly periods and morning priority for every assigned subject.</p>
          </div>
          <label className="tt-field tt-field--tight">
            <span>Class</span>
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              {data.classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.label} · {cls.streamName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeClass && <SubjectPeriodsEditor key={activeClass.id} data={data} classId={activeClass.id} />}
      </section>

      <TeacherTotals data={data} classId={activeClass?.id ?? ""} />
    </div>
  );
}

function SubjectPeriodsEditor({
  data,
  classId,
}: {
  data: TimetableClientData;
  classId: string;
}) {
  const { refresh } = useTimetable();
  const assignments = useMemo(
    () =>
      data.assignments
        .filter((assignment) => assignment.classId === classId)
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.teacherName.localeCompare(b.teacherName)),
    [data.assignments, classId],
  );

  const [rows, setRows] = useState<Record<string, { periods: number; priority: number }>>(() => {
    const map: Record<string, { periods: number; priority: number }> = {};
    for (const assignment of assignments) map[assignment.id] = { periods: assignment.periods, priority: assignment.priority };
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  const capacity = useMemo(
    () => data.slots.filter((slot) => classSlotOpen(classId, slot)).length,
    [data.slots, classId],
  );
  const assigned = useMemo(
    () => Object.values(rows).reduce((sum, row) => sum + Math.max(0, Number(row.periods) || 0), 0),
    [rows],
  );
  const over = assigned > capacity;

  function update(id: string, patch: Partial<{ periods: number; priority: number }>) {
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function save() {
    setSaving(true);
    setNotice("");
    setProblem("");
    try {
      const payload = assignments.map((assignment) => ({
        class_id: classId,
        subject_id: assignment.subjectId,
        assignment_id: assignment.id,
        periods: Math.max(0, Math.min(60, Math.round(Number(rows[assignment.id]?.periods) || 0))),
        morning_priority: Math.max(0, Math.min(3, Math.round(Number(rows[assignment.id]?.priority) || 0))),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("timetable_subject_periods")
        .upsert(payload, { onConflict: "class_id,assignment_id" });
      if (error) throw error;
      setNotice("Subject periods saved.");
      refresh();
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : "Could not save subject periods.");
    } finally {
      setSaving(false);
    }
  }

  const percent = capacity > 0 ? Math.min(100, Math.round((assigned / capacity) * 100)) : 0;

  return (
    <>
      <div className={`tt-capacity${over ? " is-over" : ""}`}>
        <div className="tt-capacity-head">
          <strong>{assigned} of {capacity} lesson slots used</strong>
          <span>{over ? `${assigned - capacity} over capacity` : `${capacity - assigned} slots stay FREE`}</span>
        </div>
        <div className="tt-capacity-track"><span style={{ width: `${percent}%` }} /></div>
      </div>

      {over && (
        <div className="tt-note tt-note--warn">
          This class has more periods than lesson slots. Reduce periods or add lesson slots before generating.
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="tt-empty">No subject has a teacher assigned to this class yet.</div>
      ) : (
        <div className="tt-table-wrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Periods / week</th>
                <th>Morning priority</th>
                <th>Pattern</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment: TimetableAssignment) => {
                const row = rows[assignment.id] ?? { periods: 0, priority: 0 };
                return (
                  <tr key={assignment.id}>
                    <td>
                      <strong>{assignment.subjectCode}</strong>
                      <div className="tt-muted">{assignment.subjectName}</div>
                    </td>
                    <td>{assignment.teacherName}</td>
                    <td>
                      <input
                        className="tt-number"
                        type="number"
                        min={0}
                        max={60}
                        value={row.periods}
                        onChange={(event) => update(assignment.id, { periods: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        className="tt-select"
                        value={row.priority}
                        onChange={(event) => update(assignment.id, { priority: Number(event.target.value) })}
                      >
                        {[0, 1, 2, 3].map((priority) => (
                          <option key={priority} value={priority}>{priorityLabel(priority)}</option>
                        ))}
                      </select>
                    </td>
                    <td>{patternLabel(row.periods)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="tt-actions tt-actions--between">
        <div className="tt-actions">
          <button type="button" className="cm-btn cm-btn--ghost" onClick={() => setRows(Object.fromEntries(assignments.map((a) => [a.id, { periods: 0, priority: 0 }])))}>
            Clear periods
          </button>
        </div>
        <button type="button" className="cm-btn cm-btn--primary" onClick={save} disabled={saving || assignments.length === 0}>
          {saving ? "Saving…" : "Save subject periods"}
        </button>
      </div>

      {notice && <div className="tt-note tt-note--ok">{notice}</div>}
      {problem && <div className="tt-note tt-note--error">{problem}</div>}
    </>
  );
}

function TeacherTotals({ data, classId }: { data: TimetableClientData; classId: string }) {
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const assignment of data.assignments) {
      map.set(assignment.teacherId, (map.get(assignment.teacherId) ?? 0) + assignment.periods);
    }
    const list = [...map].map(([teacherId, periods]) => ({
      teacherId,
      periods,
      name: data.teachers.find((teacher) => teacher.id === teacherId)?.name ?? "Teacher",
    }));
    return list.sort((a, b) => b.periods - a.periods || a.name.localeCompare(b.name));
  }, [data.assignments, data.teachers]);

  return (
    <section className="tt-card">
      <div className="tt-card-head">
        <div>
          <h2>Teacher totals</h2>
          <p>Saved weekly periods across all classes. Compare this with the teaching-load sheet.</p>
        </div>
      </div>
      {totals.length === 0 ? (
        <div className="tt-empty">No periods saved yet.</div>
      ) : (
        <div className="tt-table-wrap">
          <table className="tt-table tt-table--compact">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Periods / week</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((entry) => (
                <tr key={entry.teacherId}>
                  <td>{entry.name}</td>
                  <td><strong>{entry.periods}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tt-muted">Class in view: {data.classes.find((cls) => cls.id === classId)?.label ?? "—"}</p>
    </section>
  );
}
