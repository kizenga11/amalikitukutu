"use client";

import "./stream-teacher.css";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  fetchStreamTeacherAssignments,
  removeStreamTeacherAssignment,
  saveStreamTeacherAssignment,
  type StreamTeacherAssignmentOptions,
} from "@/lib/stream-teacher-api";

interface Props {
  year: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("sw-TZ", { day: "2-digit", month: "short", year: "numeric" });
}

export default function StreamTeacherAssignment({ year }: Props) {
  const [options, setOptions] = useState<StreamTeacherAssignmentOptions | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
        const data = await fetchStreamTeacherAssignments(year);
        if (!active) return;
        setOptions(data);
        const next: Record<string, string> = {};
        for (const assignment of data.assignments) next[assignment.stream_id] = assignment.teacher_id;
        setDrafts(next);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load stream teachers.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [year]);

  const assignmentsByStream = useMemo(() => {
    const map = new Map<string, NonNullable<StreamTeacherAssignmentOptions["assignments"]>[number]>();
    for (const assignment of options?.assignments ?? []) map.set(assignment.stream_id, assignment);
    return map;
  }, [options]);

  async function save(streamId: string) {
    const teacherId = drafts[streamId];
    if (!teacherId) {
      setError("Select a teacher first.");
      return;
    }
    setSaving(streamId);
    setError("");
    setMessage("");
    try {
      const result = await saveStreamTeacherAssignment(streamId, teacherId, year);
      setOptions((current) => (current ? { ...current, assignments: result.assignments } : current));
      setMessage("Stream teacher saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  async function remove(streamId: string) {
    setSaving(streamId);
    setError("");
    setMessage("");
    try {
      const result = await removeStreamTeacherAssignment(streamId, year);
      setOptions((current) => (current ? { ...current, assignments: result.assignments } : current));
      setDrafts((current) => ({ ...current, [streamId]: "" }));
      setMessage("Stream teacher removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="stream-teacher-page">
        <div className="me-loading"><Spinner size={20} /></div>
      </div>
    );
  }

  return (
    <div className="stream-teacher-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Stream Teachers</h2>
          <p className="page-sub">Choose one teacher for each stream for the {year} academic year.</p>
        </div>
        <div className="page-head-right">
          <span className="active-chip">Year {year}</span>
        </div>
      </div>

      {error && <div className="stream-note" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}
      {message && <div className="stream-note" style={{ borderColor: "#a7f3d0", background: "#ecfdf5", color: "#047857" }}>{message}</div>}

      {!options || options.streams.length === 0 ? (
        <div className="st-empty-state">No streams have been registered.</div>
      ) : (
        <div className="sm-table-wrap">
          <table className="sm-table stream-table">
            <thead>
              <tr>
                <th>Stream</th>
                <th>Current Teacher</th>
                <th>New Teacher</th>
                <th className="stream-cell-center">Vitendo</th>
              </tr>
            </thead>
            <tbody>
              {options.streams.map((stream) => {
                const current = assignmentsByStream.get(stream.id);
                const busy = saving === stream.id;
                return (
                  <tr key={stream.id}>
                    <td>
                      <div className="sm-name">{stream.class_name} - {stream.name}</div>
                      <div className="st-student-sub">Form {stream.form_level}</div>
                    </td>
                    <td>
                      {current ? (
                        <div className="stream-assignment-current">
                          <strong>{current.teacher_name || "Teacher"}</strong>
                          <div>Assigned: {formatDate(current.assigned_at)}</div>
                        </div>
                      ) : (
                        <span className="stream-status stream-status--empty">None</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="cm-input cm-input--sm"
                        value={drafts[stream.id] ?? ""}
                        onChange={(event) => setDrafts((prev) => ({ ...prev, [stream.id]: event.target.value }))}
                        disabled={busy}
                      >
                        <option value="">-- Select teacher --</option>
                        {options.teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="stream-cell-center">
                      <div className="stream-actions" style={{ justifyContent: "center" }}>
                        <button className="cm-btn cm-btn--primary cm-btn--sm" onClick={() => save(stream.id)} disabled={busy || !drafts[stream.id]}>
                          Save
                        </button>
                        {current && (
                          <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => remove(stream.id)} disabled={busy}>
                            Remove
                          </button>
                        )}
                      </div>
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
