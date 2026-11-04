"use client";

import "./stream-teacher.css";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  createStreamSubject,
  deleteStreamSubject,
  fetchStreamSubjects,
  updateStreamSubject,
  type StreamSubject,
} from "@/lib/stream-teacher-api";

interface Props {
  streamId: string;
  year: string;
}

interface SubjectForm {
  id: string | null;
  code: string;
  name: string;
  subject_type: string;
  has_practical: boolean;
}

const EMPTY_FORM: SubjectForm = {
  id: null,
  code: "",
  name: "",
  subject_type: "Compulsory",
  has_practical: false,
};

export default function StreamSubjects({ streamId, year }: Props) {
  const [subjects, setSubjects] = useState<StreamSubject[]>([]);
  const [stream, setStream] = useState<{ name: string; class_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<SubjectForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<StreamSubject | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchStreamSubjects(streamId, year);
        if (!active) return;
        setSubjects(data.subjects);
        setStream({ name: data.stream.name, class_name: data.stream.class_name });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load subjects.");
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
    if (!needle) return subjects;
    return subjects.filter((subject) => `${subject.code} ${subject.name}`.toLowerCase().includes(needle));
  }, [subjects, search]);

  async function save() {
    if (!form || saving) return;
    if (!form.code.trim() || !form.name.trim()) {
      setError("Subject code and name are required.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (form.id) {
        const result = await updateStreamSubject(form.id, streamId, year, {
          code: form.code.trim(),
          name: form.name.trim(),
          subject_type: form.subject_type,
          has_practical: form.has_practical,
        });
        setSubjects((current) => current.map((subject) => (subject.id === result.subject.id ? { ...result.subject, teachers: subject.teachers, canEdit: true } : subject)));
        setMessage("Subject updated.");
      } else {
        const result = await createStreamSubject(streamId, year, {
          code: form.code.trim(),
          name: form.name.trim(),
          subject_type: form.subject_type,
          has_practical: form.has_practical,
        });
        setSubjects((current) => [...current, result.subject].sort((a, b) => a.name.localeCompare(b.name)));
        setMessage("Subject added.");
      }
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the subject.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await deleteStreamSubject(deleting.id, streamId, year);
      setSubjects((current) => current.filter((subject) => subject.id !== deleting.id));
      setDeleting(null);
      setMessage("Subject deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the subject.");
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
          <h2 className="page-title">Stream Subjects</h2>
          <p className="page-sub">
            {stream ? `${stream.class_name} - ${stream.name}` : "Your stream"} · {subjects.length} subjects
          </p>
        </div>
        <div className="page-head-right">
          <button className="sm-add-btn" onClick={() => { setForm({ ...EMPTY_FORM }); setError(""); setMessage(""); }}>
            + Add Subject
          </button>
        </div>
      </div>

      <div className="stream-note">
        You can view all subjects in your stream and each subject teacher. Subjects shared by all streams (Both) are view-only here.
      </div>

      {error && <div className="stream-note" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}
      {message && <div className="stream-note" style={{ borderColor: "#a7f3d0", background: "#ecfdf5", color: "#047857" }}>{message}</div>}

      <div className="stream-toolbar">
        <input
          className="stream-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search subjects..."
        />
        <span className="term-chip">{visible.length} shown</span>
      </div>

      {visible.length === 0 ? (
        <div className="st-empty-state">No subjects found.</div>
      ) : (
        <div className="sm-table-wrap">
          <table className="sm-table stream-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject Name</th>
                <th>Type</th>
                <th>Stream</th>
                <th>Teacher</th>
                <th className="stream-cell-center">Vitendo</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((subject) => (
                <tr key={subject.id}>
                  <td><span className="sm-code">{subject.code}</span></td>
                  <td>
                    <span className="sm-name">{subject.name}</span>
                    <div className="st-student-sub">{subject.has_practical ? "Practical" : "Theory"}</div>
                  </td>
                  <td>
                    <span className={`sm-badge sm-badge--${subject.subject_type === "Compulsory" ? "compulsory" : "optional"}`}>
                      {subject.subject_type}
                    </span>
                  </td>
                  <td>
                    <span className={`sm-badge sm-badge--${subject.stream.toLowerCase()}`}>{subject.stream}</span>
                  </td>
                  <td>{subject.teachers.length > 0 ? subject.teachers.map((teacher) => teacher.name).join(", ") : "—"}</td>
                  <td className="stream-cell-center">
                    {subject.canEdit ? (
                      <div className="stream-actions" style={{ justifyContent: "center" }}>
                        <button
                          className="cm-btn cm-btn--ghost cm-btn--sm"
                          onClick={() => {
                            setForm({
                              id: subject.id,
                              code: subject.code,
                              name: subject.name,
                              subject_type: subject.subject_type,
                              has_practical: subject.has_practical,
                            });
                            setError("");
                            setMessage("");
                          }}
                        >
                          Edit
                        </button>
                        <button className="cm-btn cm-btn--ghost cm-btn--sm" style={{ color: "#dc2626" }} onClick={() => setDeleting(subject)}>
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="term-chip">Shared</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="cm-modal-backdrop" onClick={() => setForm(null)}>
          <div className="sm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sm-modal-head">
              <h3 className="sm-modal-title">{form.id ? "Edit Subject" : "Add Subject"}</h3>
              <p className="sm-modal-sub">This subject will belong to your stream only.</p>
            </div>
            <div className="sm-form-grid">
              <label className="sm-field">
                <span className="sm-field-label">Subject Code</span>
                <input className="sm-input sm-input--code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Subject Name</span>
                <input className="sm-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Type</span>
                <select className="sm-input" value={form.subject_type} onChange={(event) => setForm({ ...form, subject_type: event.target.value })}>
                  <option value="Compulsory">Compulsory</option>
                  <option value="Optional">Optional</option>
                </select>
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Practical</span>
                <select className="sm-input" value={form.has_practical ? "yes" : "no"} onChange={(event) => setForm({ ...form, has_practical: event.target.value === "yes" })}>
                  <option value="no">None</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
            <div className="sm-modal-actions">
              <button className="cm-btn cm-btn--ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button className="cm-btn cm-btn--primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="cm-modal-backdrop" onClick={() => setDeleting(null)}>
          <div className="cm-modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="cm-modal-title">Delete Subject</h3>
            <p className="cm-modal-text">Are you sure you want to delete <strong>{deleting.name}</strong>? Related marks may be affected.</p>
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" onClick={() => setDeleting(null)} disabled={saving}>Cancel</button>
              <button className="cm-btn cm-btn--danger" onClick={remove} disabled={saving}>{saving ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
