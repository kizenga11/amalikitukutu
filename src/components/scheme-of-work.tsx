"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchLearningActivities,
  fetchMainCompetences,
  fetchSpecificCompetences,
  fetchTeacherScope,
  type DbMainCompetence,
  type DbSpecificCompetence,
  type TeacherScope,
} from "@/lib/lesson-plan-api";
import { fetchSchoolInfo, fetchTeacherByAuth } from "@/lib/school-api";
import {
  createSow,
  deleteSow,
  exportSow,
  fetchMySows,
  fetchSow,
  updateSow,
  type SowDetail,
  type SowRowInfo,
} from "@/lib/scheme-of-work-api";
import type { SowRow } from "@/lib/scheme-of-work-docx";
import { ListRowSkeleton, Spinner } from "@/components/loading";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TERMS = ["Term I", "Term II", "Term III"];

const STREAMS = ["A", "B", "C", "D"];

const HEADERS = [
  { key: "mainCompetence", label: "Main Competences", className: "sow-col-main" },
  { key: "specificCompetence", label: "Specific Competences", className: "sow-col-spec" },
  { key: "mainLearningActivity", label: "Main Learning Activity", className: "sow-col-mact" },
  { key: "specificLearningActivity", label: "Specific Learning Activity", className: "sow-col-sact" },
  { key: "month", label: "Month", className: "sow-col-month" },
  { key: "week", label: "Week", className: "sow-col-week" },
  { key: "periods", label: "Periods", className: "sow-col-periods" },
  { key: "methods", label: "Methods", className: "sow-col-methods" },
  { key: "resources", label: "Resources", className: "sow-col-res" },
  { key: "remarks", label: "Remarks", className: "sow-col-remarks" },
] as const;

type SowField = (typeof HEADERS)[number]["key"];

interface RenderedRow extends SowRow {
  type: "row";
  mainSpan: number;
  specSpan: number;
}

interface RenderedBreak {
  type: "break";
  row: SowRow;
  index: number;
}

type RenderedEntry = RenderedRow | RenderedBreak;

function groupStarts(rows: SowRow[], key: "mainCompetence" | "specificCompetence"): number[] {
  const starts: number[] = [];
  let previousValue: string | undefined;
  let previousWasBreak = true;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.type === "break") {
      previousWasBreak = true;
      continue;
    }
    const value = r[key] ?? "";
    if (previousWasBreak || value !== previousValue) {
      starts.push(i);
    }
    previousValue = value;
    previousWasBreak = false;
  }
  return starts;
}

function mergeLayout(rows: SowRow[]): RenderedEntry[] {
  const mainStarts = new Set(groupStarts(rows, "mainCompetence"));
  const specStarts = new Set(groupStarts(rows, "specificCompetence"));

  const dataIndices = rows.flatMap((r, i) => (r.type === "break" ? [] : [i]));
  const mainStartFor = new Map<number, number>();
  const specStartFor = new Map<number, number>();
  for (let pos = 0; pos < dataIndices.length; pos++) {
    const i = dataIndices[pos];
    if (pos === 0) {
      mainStartFor.set(i, i);
      specStartFor.set(i, i);
    } else {
      const prev = dataIndices[pos - 1];
      mainStartFor.set(i, mainStarts.has(i) ? i : (mainStartFor.get(prev) ?? i));
      specStartFor.set(i, specStarts.has(i) ? i : (specStartFor.get(prev) ?? i));
    }
  }

  const mainCount = new Map<number, number>();
  const specCount = new Map<number, number>();
  for (const i of dataIndices) {
    const ms = mainStartFor.get(i) ?? i;
    const ss = specStartFor.get(i) ?? i;
    mainCount.set(ms, (mainCount.get(ms) ?? 0) + 1);
    specCount.set(ss, (specCount.get(ss) ?? 0) + 1);
  }

  const out: RenderedEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type === "break") {
      out.push({ type: "break", row: rows[i], index: i });
      continue;
    }
    const ms = mainStartFor.get(i) ?? i;
    const ss = specStartFor.get(i) ?? i;
    out.push({
      type: "row",
      mainCompetence: i === ms ? rows[i].mainCompetence ?? "" : "",
      specificCompetence: i === ss ? rows[i].specificCompetence ?? "" : "",
      mainLearningActivity: rows[i].mainLearningActivity ?? "",
      specificLearningActivity: rows[i].specificLearningActivity ?? "",
      month: rows[i].month ?? "",
      week: rows[i].week ?? "",
      periods: rows[i].periods ?? "",
      methods: rows[i].methods ?? "",
      resources: rows[i].resources ?? "",
      remarks: rows[i].remarks ?? "",
      mainSpan: mainCount.get(ms) ?? 1,
      specSpan: specCount.get(ss) ?? 1,
    });
  }
  return out;
}

function Cell({
  value,
  onChange,
  rows = 1,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      data-placeholder={placeholder}
      className={`sow-cell ${className ?? ""}`}
      style={{ minHeight: `${rows * 1.5}em` }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ").trim();
        if (next !== value) onChange(next);
      }}
    />
  );
}

export default function SchemeOfWorkPage({ authUserId }: { authUserId: string }) {
  const [scope, setScope] = useState<TeacherScope | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const [subjectId, setSubjectId] = useState("");
  const [formId, setFormId] = useState("");
  const [stream, setStream] = useState("");
  const [term, setTerm] = useState(TERMS[0]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState("");

  const [rows, setRows] = useState<SowRow[]>([]);
  const [builtFrom, setBuiltFrom] = useState("");
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [list, setList] = useState<SowRowInfo[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadedSubject = scope?.subjects.find((s) => s.id === subjectId);
  const loadedForm = scope?.forms.find((f) => f.id === formId);

  const reloadList = useCallback(async () => {
    try {
      const items = await fetchMySows(authUserId);
      setList(items);
    } catch {
      // keep existing list
    }
  }, [authUserId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [school, teacher] = await Promise.all([fetchSchoolInfo(), fetchTeacherByAuth(authUserId)]);
        if (!cancelled) {
          setSchoolName(school.name);
          const name =
            [teacher?.first_name, teacher?.middle_name, teacher?.last_name].filter(Boolean).join(" ") ||
            teacher?.name ||
            "";
          setTeacherName(name);
        }
      } catch {
        // optional
      }
      try {
        const sc = await fetchTeacherScope(authUserId);
        if (!cancelled) setScope(sc);
      } catch {
        if (!cancelled) {
          setDbError(true);
          setScope({ subjects: [], forms: [] });
        }
      }
      try {
        await reloadList();
      } catch {
        // optional
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (timersRef.current) clearTimeout(timersRef.current);
    };
  }, [authUserId, reloadList]);

  function clearMessage() {
    setErr("");
    setOkMsg("");
  }

  function groupStartIndex(rows: SowRow[], key: "mainCompetence" | "specificCompetence", rawIndex: number): number {
    const starts = groupStarts(rows, key);
    for (let k = starts.length - 1; k >= 0; k--) {
      if (starts[k] <= rawIndex) return starts[k];
    }
    return rawIndex;
  }

  function updateRowValue(rawIndex: number, field: SowField, value: string) {
    setRows((current) => {
      const next = current.map((r) => ({ ...r }));
      const targets: number[] = [];
      if (field === "mainCompetence" || field === "specificCompetence") {
        const start = groupStartIndex(next, field, rawIndex);
        for (let i = start; i < next.length; i++) {
          if (next[i].type === "break") break;
          targets.push(i);
        }
      } else {
        targets.push(rawIndex);
      }
      for (const t of targets) next[t][field] = value;
      return next;
    });
  }

  function addRowAfter(index: number) {
    setRows((current) => {
      const next = current.map((r) => ({ ...r }));
      next.splice(index + 1, 0, { type: "row" });
      return next;
    });
  }

  function addBreakAfter(index: number) {
    setRows((current) => {
      const next = current.map((r) => ({ ...r }));
      next.splice(index + 1, 0, { type: "break", breakText: "" });
      return next;
    });
  }

  function deleteRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  async function buildCurriculum() {
    clearMessage();
    if (!subjectId || !formId) {
      setErr("Select a subject and a class first.");
      return;
    }
    setBuilding(true);
    try {
      const mains: DbMainCompetence[] = await fetchMainCompetences(subjectId, formId);

      const specifics: DbSpecificCompetence[] = (
        await Promise.all(mains.map((m) => fetchSpecificCompetences(m.id)))
      ).flat();

      const specByMain = new Map<string, DbSpecificCompetence[]>();
      mains.forEach((m) => specByMain.set(m.id, []));
      specifics.forEach((s) => specByMain.get(s.main_competence_id)?.push(s));

      const built: SowRow[] = [];
      for (const m of mains) {
        const specList = specByMain.get(m.id) ?? [];
        for (const s of specList) {
          const acts = await fetchLearningActivities(s.id);
          if (acts.length === 0) {
            built.push({
              type: "row",
              mainCompetence: `${m.code}. ${m.title}`,
              specificCompetence: `${s.code}. ${s.title}`,
              specificLearningActivity: "",
              month: "",
              week: "",
              periods: "",
              methods: "",
              resources: "",
              remarks: "",
            });
            continue;
          }
          acts.forEach((a, ai) => {
            built.push({
              type: "row",
              mainCompetence: ai === 0 ? `${m.code}. ${m.title}` : "",
              specificCompetence: ai === 0 ? `${s.code}. ${s.title}` : "",
              specificLearningActivity: a.activity_description,
              month: "",
              week: "",
              periods: a.periods_allocated != null ? String(a.periods_allocated) : "",
              methods: a.suggested_methods ?? "",
              resources: a.resources ?? "",
              remarks: "",
            });
          });
        }
        built.push({ type: "break", breakText: "" });
      }
      if (built.length > 0 && built[built.length - 1].type === "break") {
        built.pop();
      }

      setRows(built);
      setBuiltFrom(`${loadedSubject?.name ?? ""} — ${loadedForm?.name ?? ""}`);
      setTitle(`Scheme of Work — ${loadedSubject?.name ?? ""} (${loadedForm?.name ?? ""}${stream ? ` ${stream}` : ""})`);
      setCurrentId(null);
    } catch {
      setErr("Could not load the syllabus curriculum for this subject and class.");
    } finally {
      setBuilding(false);
    }
  }

  async function saveSow() {
    clearMessage();
    if (rows.length === 0) {
      setErr("Build the scheme of work first.");
      return;
    }
    if (!subjectId || !formId) {
      setErr("Select a subject and a class first.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        sow_data: rows,
        title: title || null,
        class_stream: stream || null,
        term: term || null,
        year: year || null,
      };
      if (currentId) {
        await updateSow(currentId, payload);
        setOkMsg("Scheme of work updated.");
      } else {
        const created = await createSow({
          subject_id: subjectId,
          form: loadedForm?.name ?? formId,
          class_stream: stream || null,
          term: term || null,
          year: year || null,
          title: title || null,
          sow_data: rows,
          status: "draft",
        });
        setCurrentId(created.id);
        setOkMsg("Scheme of work saved.");
      }
      await reloadList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the scheme of work.");
    } finally {
      setSaving(false);
    }
  }

  async function loadDetail(detail: SowDetail) {
    setRows((detail.sow_data ?? []).map((r) => ({ ...r })));
    setSubjectId(detail.subject_id);
    setFormId(detail.form_id ?? "");
    setStream(detail.class_stream ?? "A");
    setTerm(detail.term ?? TERMS[0]);
    setYear(detail.year ?? String(new Date().getFullYear()));
    setTitle(detail.title || "");
    setCurrentId(detail.id);
    setPreviewOpen(false);
    clearMessage();
  }

  async function openSaved(s: SowRowInfo) {
    try {
      const detail = await fetchSow(s.id);
      await loadDetail(detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open that scheme of work.");
    }
  }

  async function duplicate(s: SowRowInfo) {
    try {
      const detail = await fetchSow(s.id);
      setRows((detail.sow_data ?? []).map((r) => ({ ...r })));
      setSubjectId(detail.subject_id);
      setFormId(detail.form_id ?? "");
      setStream(detail.class_stream ?? "A");
      setTerm(detail.term ?? TERMS[0]);
      setYear(detail.year ?? String(new Date().getFullYear()));
      setTitle(`${detail.title || "Scheme of Work"} (copy)`);
      setCurrentId(null);
      setOkMsg("Duplicated into the editor — press Save to store a new copy.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not duplicate that scheme of work.");
    }
  }

  async function removeSaved(s: SowRowInfo) {
    if (!window.confirm("Delete this scheme of work permanently?")) return;
    try {
      await deleteSow(s.id);
      if (currentId === s.id) setCurrentId(null);
      await reloadList();
    } catch {
      setErr("Could not delete the scheme of work.");
    }
  }

  const rendered = mergeLayout(rows);

  if (loading) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">Scheme of Work</h2>
            <p className="page-sub">Build and manage schemes of work from the TIE syllabus.</p>
          </div>
        </div>
        <div className="sm-table-wrap td-loading"><ListRowSkeleton cols={4} /><ListRowSkeleton cols={4} /></div>
      </>
    );
  }

  if (dbError) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">Scheme of Work</h2>
            <p className="page-sub">Build and manage schemes of work from the TIE syllabus.</p>
          </div>
        </div>
        <div className="db-empty">
          <h3>Could not load your teaching scope</h3>
          <p>Contact the headmaster to assign your subjects and forms.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Scheme of Work</h2>
          <p className="page-sub">Build a termly scheme of work, then save, print or export it as a Word document.</p>
        </div>
        <div className="page-head-right">
          <span className="active-chip">● {teacherName || "Teacher"}</span>
        </div>
      </div>

      {okMsg && <p className="lp-note" role="status">{okMsg}</p>}
      {err && <p className="error-message" role="alert">{err}</p>}

      <div className="vp-grid sow-grid">
        <div className="vp-col vp-col--form">
          <div className="lp-card lp-create">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Scheme Builder</h3>
                <p className="panel-sub">{schoolName || "School"}</p>
              </div>
            </div>

            <div className="lp-grid lp-grid--1">
              <label className="st-field">
                <span className="st-field-label">Subject</span>
                <select className="st-input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setCurrentId(null); }}>
                  <option value="">Select subject…</option>
                  {(scope?.subjects ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="st-field">
                <span className="st-field-label">Class</span>
                <select className="st-input" value={formId} onChange={(e) => { setFormId(e.target.value); setCurrentId(null); }}>
                  <option value="">Select class…</option>
                  {(scope?.forms ?? []).map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
              <div className="lp-grid lp-grid--2">
                <label className="st-field">
                  <span className="st-field-label">Stream</span>
                  <select className="st-input" value={stream} onChange={(e) => setStream(e.target.value)}>
                    <option value="">None</option>
                    {STREAMS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="st-field">
                  <span className="st-field-label">Term</span>
                  <select className="st-input" value={term} onChange={(e) => setTerm(e.target.value)}>
                    {TERMS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="st-field">
                <span className="st-field-label">Year</span>
                <input className="st-input" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </label>
              <label className="st-field">
                <span className="st-field-label">Title</span>
                <input className="st-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
            </div>

            <div className="lp-actions">
              <button className="cm-btn cm-btn--primary" onClick={buildCurriculum} disabled={!subjectId || !formId || building}>
                {building && <Spinner />}
                {building ? "Building…" : rows.length > 0 ? "Rebuild from Curriculum" : "Load Curriculum & Build"}
              </button>
            </div>

            <div className="lp-sow-divider" />
            <div className="lp-actions">
              <button className="cm-btn cm-btn--primary" onClick={saveSow} disabled={rows.length === 0 || saving}>
                {saving && <Spinner />}
                {saving ? "Saving…" : currentId ? "Save Changes" : "Save Scheme of Work"}
              </button>
              <button className="cm-btn cm-btn--ghost" onClick={() => setPreviewOpen(true)} disabled={rows.length === 0}>
                Preview
              </button>
            </div>

            <div className="lp-actions">
              <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => { setRows([]); setCurrentId(null); setBuiltFrom(""); }} disabled={rows.length === 0}>
                Clear Table
              </button>
              <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => addBreakAfter(rows.length - 1)} disabled={rows.length === 0}>
                Add Break
              </button>
            </div>
          </div>

          {list.length > 0 && (
            <div className="lp-card lp-create sow-saved">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Saved Schemes</h3>
                  <p className="panel-sub">Click to load into the editor.</p>
                </div>
                <span className="panel-badge">{list.length}</span>
              </div>
              <div className="sow-saved-list">
                {list.map((s) => (
                  <div className="sow-saved-item" key={s.id}>
                    <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => void openSaved(s)}>
                      Open
                    </button>
                    <div className="sow-saved-meta">
                      <strong>{s.title}</strong>
                      <span>{s.subject_name} · {s.form}{s.class_stream ? ` ${s.class_stream}` : ""} · {s.term ?? ""}{s.year ? ` · ${s.year}` : ""} · {s.status}</span>
                    </div>
                    <div className="sm-actions">
                      <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => void duplicate(s)}>Copy</button>
                      <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => void exportSow(s.id)}>.docx</button>
                      <button className="cm-icon-btn cm-icon-btn--danger cm-icon-btn--sm" onClick={() => void removeSaved(s)} aria-label="Delete" title="Delete">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="vp-col vp-col--doc">
          <div className="lp-card vp-doc-card">
            <div className="vp-toolbar">
              <div className="vp-toolbar-left">
                <span className="vp-status">
                  {currentId ? "Saved" : rows.length > 0 ? "Unsaved changes" : "No table yet"}
                  {builtFrom && <span className="vp-status-sub"> · {builtFrom}</span>}
                </span>
              </div>
              <div className="sm-actions">
                <button className="cm-btn cm-btn--ghost" onClick={() => window.print()} disabled={rows.length === 0}>
                  Print
                </button>
                {currentId && (
                  <button className="cm-btn cm-btn--primary" onClick={() => void exportSow(currentId)}>
                    Download .docx
                  </button>
                )}
              </div>
            </div>

            <div className="sow-document" id="sow-document">
              <div className="vp-masthead">
                <div className="vp-school">{schoolName || "SCHOOL NAME"}</div>
                <div className="vp-title">{title || "SCHEME OF WORK"}</div>
                <div className="vp-subtitle">
                  {loadedSubject?.name ?? ""}
                  {formId ? ` — ${loadedForm?.name ?? ""}${stream ? ` ${stream}` : ""}` : ""}
                  {` · ${term}${year ? ` · ${year}` : ""} · ${teacherName || "Teacher"}`}
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="sow-empty">
                  <span className="vp-placeholder-icon">📒</span>
                  <h3>No table yet</h3>
                  <p>Choose a subject and class, then click “Load Curriculum & Build” to generate the termly table.</p>
                </div>
              ) : (
                <div className="sow-scroll">
                  <table className="sow-table">
                    <thead>
                      <tr>
                        {HEADERS.map((h) => (
                          <th key={h.key} className={h.className}>{h.label}</th>
                        ))}
                        <th className="sow-col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rendered.map((entry, i) =>
                        entry.type === "break" ? (
                          <tr key={`b-${i}`} className="sow-break">
                            <td colSpan={HEADERS.length + 1}>
                              <div className="sow-break-inner">
                                <Cell
                                  value={entry.row.breakText ?? ""}
                                  onChange={(v) => setRows((cur) => cur.map((r, idx) => (idx === entry.index ? { ...r, breakText: v } : r)))}
                                  className="sow-break-text"
                                  placeholder="Type a section heading or leave blank…"
                                />
                                <button className="cm-icon-btn cm-icon-btn--danger cm-icon-btn--sm" onClick={() => deleteRow(entry.index)} aria-label="Remove break" title="Remove break">✕</button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={i}>
                            <td className="sow-col-main" rowSpan={entry.mainSpan}>
                              <Cell value={entry.mainCompetence ?? ""} onChange={(v) => updateRowValue(i, "mainCompetence", v)} rows={2} />
                            </td>
                            <td className="sow-col-spec" rowSpan={entry.specSpan}>
                              <Cell value={entry.specificCompetence ?? ""} onChange={(v) => updateRowValue(i, "specificCompetence", v)} rows={2} />
                            </td>
                            <td className="sow-col-mact">
                              <Cell value={entry.mainLearningActivity ?? ""} onChange={(v) => updateRowValue(i, "mainLearningActivity", v)} rows={2} placeholder="Main learning activities…" />
                            </td>
                            <td className="sow-col-sact">
                              <Cell value={entry.specificLearningActivity ?? ""} onChange={(v) => updateRowValue(i, "specificLearningActivity", v)} rows={2} placeholder="Specific learning activities…" />
                            </td>
                            <td className="sow-col-month">
                              <select
                                className="sow-select"
                                value={entry.month ?? ""}
                                onChange={(e) => updateRowValue(i, "month", e.target.value)}
                              >
                                <option value="">Month…</option>
                                {MONTHS.map((m) => (
                                  <option key={m} value={m}>{m.slice(0, 3)}</option>
                                ))}
                              </select>
                            </td>
                            <td className="sow-col-week">
                              <Cell value={entry.week ?? ""} onChange={(v) => updateRowValue(i, "week", v)} placeholder="1-4" />
                            </td>
                            <td className="sow-col-periods">
                              <Cell value={entry.periods ?? ""} onChange={(v) => updateRowValue(i, "periods", v)} placeholder="—" />
                            </td>
                            <td className="sow-col-methods">
                              <Cell value={entry.methods ?? ""} onChange={(v) => updateRowValue(i, "methods", v)} rows={2} />
                            </td>
                            <td className="sow-col-res">
                              <Cell value={entry.resources ?? ""} onChange={(v) => updateRowValue(i, "resources", v)} rows={2} />
                            </td>
                            <td className="sow-col-remarks">
                              <Cell value={entry.remarks ?? ""} onChange={(v) => updateRowValue(i, "remarks", v)} placeholder="Remarks…" />
                            </td>
                            <td className="sow-col-actions">
                              <div className="sow-actions">
                                <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--ghost" onClick={() => addRowAfter(i)} title="Add row below" aria-label="Add row below">+</button>
                                <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--ghost" onClick={() => addBreakAfter(i)} title="Add section break below" aria-label="Add break">—</button>
                                <button className="cm-icon-btn cm-icon-btn--danger cm-icon-btn--sm" onClick={() => deleteRow(i)} title="Delete row" aria-label="Delete row">✕</button>
                              </div>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div className="vp-modal" onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}>
          <div className="vp-modal-body">
            <div className="vp-modal-head">
              <h3>Print Preview</h3>
              <div className="sm-actions">
                <button className="cm-btn cm-btn--ghost" onClick={() => setPreviewOpen(false)}>Close</button>
                <button className="cm-btn cm-btn--primary" onClick={() => window.print()}>Print</button>
              </div>
            </div>
            <div className="sow-modal-doc" id="sow-preview-doc">
              <div className="vp-masthead">
                <div className="vp-school">{schoolName || "SCHOOL NAME"}</div>
                <div className="vp-title">{title || "SCHEME OF WORK"}</div>
                <div className="vp-subtitle">
                  {loadedSubject?.name ?? ""}
                  {formId ? ` — ${loadedForm?.name ?? ""}${stream ? ` ${stream}` : ""}` : ""}
                  {` · ${term}${year ? ` · ${year}` : ""} · ${teacherName || "Teacher"}`}
                </div>
              </div>
              <div className="sow-scroll">
                <table className="sow-table">
                  <thead>
                    <tr>
                      {HEADERS.map((h) => (
                        <th key={h.key} className={h.className}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rendered.map((entry, i) =>
                      entry.type === "break" ? (
                        <tr key={`b-${i}`} className="sow-break">
                          <td colSpan={HEADERS.length}>
                            <div className="sow-break-text-static">{entry.row.breakText || " "}</div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td className="sow-col-main" rowSpan={entry.mainSpan}>{entry.mainCompetence ?? ""}</td>
                          <td className="sow-col-spec" rowSpan={entry.specSpan}>{entry.specificCompetence ?? ""}</td>
                          <td className="sow-col-mact">{entry.mainLearningActivity ?? ""}</td>
                          <td className="sow-col-sact">{entry.specificLearningActivity ?? ""}</td>
                          <td className="sow-col-month">{entry.month ?? ""}</td>
                          <td className="sow-col-week">{entry.week ?? ""}</td>
                          <td className="sow-col-periods">{entry.periods ?? ""}</td>
                          <td className="sow-col-methods">{entry.methods ?? ""}</td>
                          <td className="sow-col-res">{entry.resources ?? ""}</td>
                          <td className="sow-col-remarks">{entry.remarks ?? ""}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}