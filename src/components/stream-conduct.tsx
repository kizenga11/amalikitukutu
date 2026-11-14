"use client";

import "./stream-teacher.css";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import AutoGrowTextarea from "@/components/auto-grow-textarea";
import {
  fetchStreamConduct,
  saveStreamConduct,
  type StreamConductStudent,
  type StreamTeacherTerm,
} from "@/lib/stream-teacher-api";

interface Props {
  streamId: string;
  year: string;
  term: StreamTeacherTerm;
}

interface ConductDraft {
  conduct: string;
  remarks: string;
}

function fullName(student: StreamConductStudent): string {
  return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");
}

export default function StreamConduct({ streamId, year, term }: Props) {
  const [students, setStudents] = useState<StreamConductStudent[]>([]);
  const [stream, setStream] = useState<{ name: string; class_name: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ConductDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      setMessage("");
      try {
        const data = await fetchStreamConduct(streamId, year, term);
        if (!active) return;
        setStudents(data.students);
        setStream({ name: data.stream.name, class_name: data.stream.class_name });
        const next: Record<string, ConductDraft> = {};
        for (const student of data.students) {
          next[student.id] = { conduct: student.conduct, remarks: student.remarks };
        }
        setDrafts(next);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load conduct and behaviour.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [streamId, year, term]);

  const filled = useMemo(
    () => students.filter((student) => (drafts[student.id]?.conduct ?? "").trim() && (drafts[student.id]?.remarks ?? "").trim()).length,
    [drafts, students],
  );

  function update(studentId: string, patch: Partial<ConductDraft>) {
    setDrafts((current) => {
      const existing = current[studentId] ?? { conduct: "", remarks: "" };
      return { ...current, [studentId]: { ...existing, ...patch } };
    });
  }

  async function persist(studentIds: string[], key: string) {
    setSaving(key);
    setError("");
    setMessage("");
    try {
      await saveStreamConduct(
        streamId,
        year,
        term,
        studentIds.map((studentId) => ({
          studentId,
          conduct: drafts[studentId]?.conduct ?? "",
          remarks: drafts[studentId]?.remarks ?? "",
        })),
      );
      setMessage("Conduct and behaviour saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save conduct and behaviour.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="me-loading"><Spinner size={20} /></div>;
  }

  return (
    <div className="stream-teacher-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Conduct & Behaviour</h2>
          <p className="page-sub">
            {stream ? `${stream.class_name} - ${stream.name}` : "Your stream"} · Term {term} · {filled}/{students.length} filled
          </p>
        </div>
        <div className="page-head-right">
          <button
            className="cm-btn cm-btn--ghost"
            onClick={() => persist(students.map((student) => student.id), "all")}
            disabled={saving !== null || students.length === 0}
          >
            {saving === "all" ? "Saving..." : "Save All"}
          </button>
        </div>
      </div>

      <div className="stream-note">
        Fill in conduct and behaviour for each student. The <strong>Auto-assign</strong> button is a placeholder and does not work yet.
      </div>

      <div className="stream-toolbar">
        <span className="term-chip">Year {year} · Term {term}</span>
        <div className="stream-toolbar-actions">
          <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled title="Coming later">Auto-assign (coming soon)</button>
        </div>
      </div>

      {error && <div className="stream-note" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}
      {message && <div className="stream-note" style={{ borderColor: "#a7f3d0", background: "#ecfdf5", color: "#047857" }}>{message}</div>}

      <datalist id="stream-conduct-options">
        <option value="Excellent" />
        <option value="Good" />
        <option value="Average" />
        <option value="Poor" />
      </datalist>

      {students.length === 0 ? (
        <div className="st-empty-state">No students in this stream.</div>
      ) : (
        <div className="sm-table-wrap">
          <table className="sm-table stream-table">
            <thead>
              <tr>
                <th>Student</th>
                <th style={{ width: "18%" }}>Conduct</th>
                <th>Behaviour / Remarks</th>
                <th className="stream-cell-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const draft = drafts[student.id] ?? { conduct: "", remarks: "" };
                return (
                  <tr key={student.id}>
                    <td>
                      <div className="st-student-name">{fullName(student)}</div>
                      <div className="st-student-sub">{student.registration_no || "—"}</div>
                    </td>
                    <td>
                      <input
                        className="cm-input cm-input--sm"
                        list="stream-conduct-options"
                        value={draft.conduct}
                        onChange={(event) => update(student.id, { conduct: event.target.value })}
                        placeholder="e.g. Good"
                        disabled={saving !== null}
                      />
                    </td>
                    <td>
                      <AutoGrowTextarea
                        className="stream-remarks-input"
                        minRows={2}
                        value={draft.remarks}
                        onChange={(event) => update(student.id, { remarks: event.target.value })}
                        placeholder="Write behaviour or remarks..."
                        disabled={saving !== null}
                      />
                    </td>
                    <td className="stream-cell-center">
                      <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => persist([student.id], student.id)} disabled={saving !== null}>
                        {saving === student.id ? "..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
