"use client";

import "./stream-teacher.css";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  fetchStreamStudents,
  updateStreamStudent,
  type StreamStudent,
} from "@/lib/stream-teacher-api";

interface Props {
  streamId: string;
  year: string;
}

interface EditForm {
  id: string;
  registration_no: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  phone: string;
}

function fullName(student: StreamStudent): string {
  return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");
}

export default function StreamStudents({ streamId, year }: Props) {
  const [students, setStudents] = useState<StreamStudent[]>([]);
  const [stream, setStream] = useState<{ name: string; class_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchStreamStudents(streamId, year);
        if (!active) return;
        setStudents(data.students);
        setStream({ name: data.stream.name, class_name: data.stream.class_name });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load students.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [streamId, year]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((student) =>
      [student.first_name, student.middle_name, student.last_name, student.registration_no, student.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [students, search]);

  function openEdit(student: StreamStudent) {
    setEditing({
      id: student.id,
      registration_no: student.registration_no ?? "",
      first_name: student.first_name,
      middle_name: student.middle_name ?? "",
      last_name: student.last_name,
      gender: student.gender,
      phone: student.phone ?? "",
    });
    setError("");
    setMessage("");
  }

  async function save() {
    if (!editing || saving) return;
    if (!editing.first_name.trim() || !editing.last_name.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await updateStreamStudent(editing.id, streamId, year, {
        registration_no: editing.registration_no.trim() || null,
        first_name: editing.first_name.trim(),
        middle_name: editing.middle_name.trim() || null,
        last_name: editing.last_name.trim(),
        gender: editing.gender,
        phone: editing.phone.trim() || null,
      });
      setStudents((current) => current.map((student) => (student.id === result.student.id ? result.student : student)));
      setEditing(null);
      setMessage("Student details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the student.");
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
          <h2 className="page-title">Stream Students</h2>
          <p className="page-sub">
            {stream ? `${stream.class_name} - ${stream.name}` : "Your stream"} · {students.length} students
          </p>
        </div>
      </div>

      <div className="stream-note">
        You can edit details for students in your stream. Adding, deleting, moving streams and bulk registration are not allowed here.
      </div>

      {error && <div className="stream-note" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}
      {message && <div className="stream-note" style={{ borderColor: "#a7f3d0", background: "#ecfdf5", color: "#047857" }}>{message}</div>}

      <div className="stream-toolbar">
        <input
          className="stream-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, registration number or phone..."
        />
        <span className="term-chip">{visible.length} shown</span>
      </div>

      {visible.length === 0 ? (
        <div className="st-empty-state">No students match your search.</div>
      ) : (
        <div className="sm-table-wrap">
          <table className="sm-table stream-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Registration No.</th>
                <th>Gender</th>
                <th>Phone</th>
                <th className="stream-cell-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => (
                <tr key={student.id}>
                  <td>
                    <div className="st-student">
                      <span className={`st-avatar${student.gender.toLowerCase().startsWith("f") ? " st-avatar--female" : ""}`}>
                        {student.first_name.charAt(0)}{student.last_name.charAt(0)}
                      </span>
                      <div>
                        <div className="st-student-name">{fullName(student)}</div>
                        <div className="st-student-sub">{student.stream_name}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="st-regno">{student.registration_no || "—"}</span></td>
                  <td>
                    <span className={`st-badge ${student.gender.toLowerCase().startsWith("f") ? "st-badge--female" : "st-badge--male"}`}>
                      {student.gender}
                    </span>
                  </td>
                  <td>{student.phone || "—"}</td>
                  <td className="stream-cell-center">
                    <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => openEdit(student)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="cm-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="sm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sm-modal-head">
              <h3 className="sm-modal-title">Edit Student</h3>
              <p className="sm-modal-sub">Update only the allowed student details.</p>
            </div>
            <div className="sm-form-grid">
              <label className="sm-field">
                <span className="sm-field-label">Registration No.</span>
                <input className="sm-input" value={editing.registration_no} onChange={(event) => setEditing({ ...editing, registration_no: event.target.value })} />
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Gender</span>
                <select className="sm-input" value={editing.gender} onChange={(event) => setEditing({ ...editing, gender: event.target.value })}>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </label>
              <label className="sm-field">
                <span className="sm-field-label">First Name</span>
                <input className="sm-input" value={editing.first_name} onChange={(event) => setEditing({ ...editing, first_name: event.target.value })} />
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Middle Name</span>
                <input className="sm-input" value={editing.middle_name} onChange={(event) => setEditing({ ...editing, middle_name: event.target.value })} />
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Last Name</span>
                <input className="sm-input" value={editing.last_name} onChange={(event) => setEditing({ ...editing, last_name: event.target.value })} />
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Phone</span>
                <input className="sm-input" value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} />
              </label>
            </div>
            <div className="sm-modal-actions">
              <button className="cm-btn cm-btn--ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="cm-btn cm-btn--primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
