"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteLearningActivity,
  deleteMainCompetence,
  deleteSpecificCompetence,
  fetchCurriculum,
  fetchForms,
  insertLearningActivity,
  insertMainCompetence,
  insertSpecificCompetence,
  resolveImportMaps,
  updateLearningActivity,
  updateMainCompetence,
  updateSpecificCompetence,
  type CurriculumForm,
  type DbForm,
} from "@/lib/lesson-plan-api";
import { ListRowSkeleton, Spinner } from "@/components/loading";

type EditorMode =
  | "add-main"
  | "edit-main"
  | "add-specific"
  | "edit-specific"
  | "add-activity"
  | "edit-activity";

interface EditorContext {
  subjectId?: string;
  formId?: string;
  mainId?: string;
  mainCode?: string;
  specificId?: string;
  specificCode?: string;
}

interface EditorState {
  mode: EditorMode;
  targetId?: string;
  context: EditorContext;
}

interface EditorValues {
  subjectId: string;
  formId: string;
  code: string;
  title: string;
  activity_description: string;
  suggested_methods: string;
  assessment_criteria: string;
  resources: string;
  periods_allocated: string;
}

const EMPTY_VALUES: EditorValues = {
  subjectId: "",
  formId: "",
  code: "",
  title: "",
  activity_description: "",
  suggested_methods: "",
  assessment_criteria: "",
  resources: "",
  periods_allocated: "",
};

// ---------------------------------------------------------------
// Import types + CSV parsing
// ---------------------------------------------------------------
interface ImportRow {
  subject: string;
  form: string;
  main_code: string;
  main_title: string;
  specific_code: string;
  specific_title: string;
  activity_code: string;
  activity_description: string;
  suggested_methods: string;
  assessment_criteria: string;
  resources: string;
  periods_allocated: number | null;
  subject_id?: string;
  form_id?: string;
  status: string;
}

const CSV_HEADER_MAP: Record<string, keyof Omit<ImportRow, "subject_id" | "form_id" | "status">> = {
  subject: "subject",
  subjects: "subject",
  form: "form",
  class: "form",
  main_competence_code: "main_code",
  main_competence: "main_code",
  main_competence_title: "main_title",
  maincompetence_title: "main_title",
  specific_competence_code: "specific_code",
  specificcompetence_code: "specific_code",
  specific_competence_title: "specific_title",
  specificcompetence_title: "specific_title",
  activity_code: "activity_code",
  code: "activity_code",
  activity_description: "activity_description",
  activity: "activity_description",
  suggested_methods: "suggested_methods",
  methods: "suggested_methods",
  assessment_criteria: "assessment_criteria",
  learning_activity_resources: "resources",
  resources: "resources",
  periods_allocated: "periods_allocated",
  periods: "periods_allocated",
};

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

const CANONICAL_COLUMNS = [
  "subject",
  "form",
  "main_competence_code",
  "main_competence_title",
  "specific_competence_code",
  "specific_competence_title",
  "activity_code",
  "activity_description",
  "suggested_methods",
  "assessment_criteria",
  "resources",
  "periods_allocated",
];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row[0]?.trim().startsWith("#")) {
        row = [];
        continue;
      }
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (!row[0]?.trim().startsWith("#") && row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

function numberOrNull(value: string): number | null {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseImportText(text: string): ImportRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  let raw: string[][] | Record<string, string>[] | Record<string, string>;
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      if (first && typeof first === "object" && "syllabus" in (first as Record<string, unknown>)) {
        parsed = (first as { syllabus: unknown[] }).syllabus;
      }
    } else if (parsed && typeof parsed === "object" && "syllabus" in (parsed as Record<string, unknown>)) {
      parsed = (parsed as { syllabus: unknown[] }).syllabus;
    }
    raw = (parsed as Record<string, string>[]).map((obj) => {
      const entry: Record<string, string> = {};
      for (const [key, value] of Object.entries(obj ?? {})) {
        entry[key] = value == null ? "" : String(value);
      }
      return entry;
    });
  } else {
    const cells = parseCSV(text);
    if (cells.length === 0) return [];
    const firstRow = cells[0].map(normHeader);
    const hasHeader = firstRow.some((h) => CSV_HEADER_MAP[h]);
    raw = hasHeader ? cells.slice(1).map((r) => Object.fromEntries(r.map((v, i) => [firstRow[i] ?? "", v]))) : cells.map((r) => Object.fromEntries(r.map((v, i) => [CANONICAL_COLUMNS[i] ?? `col_${i}`, v])));
  }

  return raw.map((entry) => {
    const value = (k: string): string => {
      const key = Object.keys(entry).find((x) => normHeader(x) === normHeader(k));
      const rawVal = key ? entry[key] : "";
      return String(rawVal ?? "").trim();
    };
    return {
      subject: value("subject"),
      form: value("form"),
      main_code: value("main_competence_code"),
      main_title: value("main_competence_title"),
      specific_code: value("specific_competence_code"),
      specific_title: value("specific_competence_title"),
      activity_code: value("activity_code"),
      activity_description: value("activity_description"),
      suggested_methods: value("suggested_methods"),
      assessment_criteria: value("assessment_criteria"),
      resources: value("resources"),
      periods_allocated: numberOrNull(value("periods_allocated")),
      status: "Pending",
    };
  });
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function SyllabusManager() {
  const [forms, setForms] = useState<DbForm[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<{ subject: { id: string; name: string; code: string }; forms: CurriculumForm[] }[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // editor
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [values, setValues] = useState<EditorValues>(EMPTY_VALUES);

  // import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importRunning, setImportRunning] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [busyKey, setBusyKey] = useState<string>("");

  const reload = useCallback(async (expandKeys?: string[]) => {
    const next = await fetchCurriculum();
    setTree(next);
    if (expandKeys && expandKeys.length > 0) {
      setExpanded((prev) => {
        const copy = new Set(prev);
        for (const k of expandKeys) copy.add(k);
        return copy;
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [f] = await Promise.all([fetchForms()]);
        if (!cancelled) setForms(f);
        await reload();
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const copy = new Set(prev);
      if (copy.has(key)) copy.delete(key);
      else copy.add(key);
      return copy;
    });
  }

  // ---- editor open / save ----
  function openEditor(state: EditorState, prefill: Partial<EditorValues>) {
    setEditor(state);
    setValues({ ...EMPTY_VALUES, ...prefill });
    setError("");
  }

  function editorTitle(): string {
    switch (editor?.mode) {
      case "add-main": return "Add Main Competence";
      case "edit-main": return "Edit Main Competence";
      case "add-specific": return "Add Specific Competence";
      case "edit-specific": return "Edit Specific Competence";
      case "add-activity": return "Add Learning Activity";
      case "edit-activity": return "Edit Learning Activity";
      default: return "";
    }
  }

  async function saveEditor() {
    if (!editor) return;
    setError("");
    setSaving(true);
    try {
      let openKey: string | undefined;
      switch (editor.mode) {
        case "add-main": {
          if (!values.subjectId || !values.formId || !values.code.trim() || !values.title.trim()) {
            throw new Error("Subject, Form, code and title are required.");
          }
          const created = await insertMainCompetence({
            subject_id: values.subjectId,
            form_id: values.formId,
            code: values.code.trim(),
            title: values.title.trim(),
          });
          openKey = `main:${created.subject_id}:${created.form_id}`;
          break;
        }
        case "edit-main": {
          if (!editor.targetId) return;
          await updateMainCompetence(editor.targetId, { code: values.code.trim(), title: values.title.trim() });
          const located = findMain(editor.targetId);
          if (located) openKey = `main:${located.subject_id}:${located.form_id}`;
          break;
        }
        case "add-specific": {
          if (!editor.context.mainId || !values.code.trim() || !values.title.trim()) {
            throw new Error("Code and title are required.");
          }
          const created = await insertSpecificCompetence({
            main_competence_id: editor.context.mainId,
            code: values.code.trim(),
            title: values.title.trim(),
          });
          const mainRow = findMain(created.main_competence_id);
          if (mainRow) openKey = `main:${mainRow.subject_id}:${mainRow.form_id}`;
          break;
        }
        case "edit-specific": {
          if (!editor.targetId) return;
          await updateSpecificCompetence(editor.targetId, { code: values.code.trim(), title: values.title.trim() });
          break;
        }
        case "add-activity": {
          if (!editor.context.specificId || !values.code.trim() || !values.activity_description.trim()) {
            throw new Error("Code and activity description are required.");
          }
          const created = await insertLearningActivity({
            specific_competence_id: editor.context.specificId,
            code: values.code.trim(),
            activity_description: values.activity_description.trim(),
            suggested_methods: values.suggested_methods.trim() || null,
            assessment_criteria: values.assessment_criteria.trim() || null,
            resources: values.resources.trim() || null,
            periods_allocated: values.periods_allocated ? Math.max(1, Math.floor(Number(values.periods_allocated))) : null,
          });
          const specific = findSpecific(created.specific_competence_id);
          if (specific) {
            const main = findMain(specific.main_competence_id);
            if (main) openKey = `main:${main.subject_id}:${main.form_id}`;
          }
          break;
        }
        case "edit-activity": {
          if (!editor.targetId) return;
          await updateLearningActivity(editor.targetId, {
            code: values.code.trim(),
            activity_description: values.activity_description.trim(),
            suggested_methods: values.suggested_methods.trim() || null,
            assessment_criteria: values.assessment_criteria.trim() || null,
            resources: values.resources.trim() || null,
            periods_allocated: values.periods_allocated ? Math.max(1, Math.floor(Number(values.periods_allocated))) : null,
          });
          break;
        }
      }
      setEditor(null);
      setNote("Saved successfully.");
      await reload(openKey ? [openKey] : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Duplicate code?");
    } finally {
      setSaving(false);
    }
  }

  function findMain(targetId: string): { subject_id: string; form_id: string } | null {
    for (const s of tree) {
      for (const f of s.forms) {
        const main = f.main_competences.find((m) => m.id === targetId);
        if (main) return { subject_id: s.subject.id, form_id: f.id };
      }
    }
    return null;
  }

  function findSpecific(targetId: string): { main_competence_id: string } | null {
    for (const s of tree) {
      for (const f of s.forms) {
        for (const m of f.main_competences) {
          const specific = m.specific_competences.find((x) => x.id === targetId);
          if (specific) return { main_competence_id: m.id };
        }
      }
    }
    return null;
  }

  async function removeTarget(kind: "main" | "specific" | "activity", id: string) {
    const label = kind === "main" ? "main competence" : kind === "specific" ? "specific competence" : "learning activity";
    if (!window.confirm(`Delete this ${label} and everything below it? This cannot be undone.`)) return;
    setBusyKey(id);
    try {
      if (kind === "main") await deleteMainCompetence(id);
      else if (kind === "specific") await deleteSpecificCompetence(id);
      else await deleteLearningActivity(id);
      setNote(`${label.charAt(0).toUpperCase() + label.slice(1)} deleted.`);
      await reload();
    } catch {
      setError(`Could not delete the ${label}.`);
    } finally {
      setBusyKey("");
    }
  }

  // ---- import ----
  async function handleFile(file: File) {
    if (!file) return;
    setImportMessage("");
    setImportRows(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseImportText(text);
      if (rows.length === 0) throw new Error("No importable rows found in the file.");

      const { subjectIdByName, formIdByName } = await resolveImportMaps();
      for (const row of rows) {
        row.subject_id = subjectIdByName.get(row.subject.toLowerCase().trim());
        row.form_id = formIdByName.get(row.form.toLowerCase().trim());
        if (!row.subject_id || !row.form_id) {
          row.status = "Unknown subject or form";
          continue;
        }
        const existing = existingActivity(row);
        if (existing) {
          row.status = "Skip (already exists)";
        } else if (!row.main_code || !row.specific_code || !row.activity_code) {
          row.status = "Missing code(s)";
        } else {
          row.status = "Ready to import";
        }
      }
      setImportRows(rows);
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function existingActivity(row: ImportRow): boolean {
    const subject = tree.find((s) => s.subject.id === row.subject_id);
    if (!subject) return false;
    const form = subject.forms.find((f) => f.id === row.form_id);
    if (!form) return false;
    const main = form.main_competences.find((m) => m.code === row.main_code);
    if (!main) return false;
    const specific = main.specific_competences.find((x) => x.code === row.specific_code);
    if (!specific) return false;
    return specific.activities.some((a) => a.code === row.activity_code);
  }

  async function confirmImport() {
    if (!importRows) return;
    setImportRunning(true);
    setImportMessage("");
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    // in-memory maps so rows sharing the same main/specific reuse ids
    const mainCache = new Map<string, string>(); // subjectId:formId:code -> id
    const specificCache = new Map<string, string>(); // mainId:code -> id
    const activityCache = new Map<string, string>(); // specificId:code -> id

    for (const s of tree) {
      for (const f of s.forms) {
        for (const m of f.main_competences) mainCache.set(`${s.subject.id}:${f.id}:${m.code}`, m.id);
        for (const m of f.main_competences) for (const x of m.specific_competences) specificCache.set(`${m.id}:${x.code}`, x.id);
        for (const m of f.main_competences) for (const x of m.specific_competences) for (const a of x.activities) activityCache.set(`${x.id}:${a.code}`, a.id);
      }
    }

    try {
      for (const row of importRows) {
        try {
          if (!row.subject_id || !row.form_id) {
            failed++;
            row.status = "Failed";
            continue;
          }
          // main
          let mainId = mainCache.get(`${row.subject_id}:${row.form_id}:${row.main_code}`);
          if (!mainId) {
            const main = await insertMainCompetence({
              subject_id: row.subject_id,
              form_id: row.form_id,
              code: row.main_code,
              title: row.main_title || row.main_code,
            });
            mainId = main.id;
            mainCache.set(`${row.subject_id}:${row.form_id}:${row.main_code}`, mainId);
          }
          // specific
          let specificId = specificCache.get(`${mainId}:${row.specific_code}`);
          if (!specificId) {
            const specific = await insertSpecificCompetence({
              main_competence_id: mainId,
              code: row.specific_code,
              title: row.specific_title || row.specific_code,
            });
            specificId = specific.id;
            specificCache.set(`${mainId}:${row.specific_code}`, specificId);
          }
          // activity
          if (activityCache.has(`${specificId}:${row.activity_code}`)) {
            skipped++;
            row.status = "Skipped (already exists)";
            continue;
          }
          await insertLearningActivity({
            specific_competence_id: specificId,
            code: row.activity_code,
            activity_description: row.activity_description,
            suggested_methods: row.suggested_methods || null,
            assessment_criteria: row.assessment_criteria || null,
            resources: row.resources || null,
            periods_allocated: row.periods_allocated,
          });
          activityCache.set(`${specificId}:${row.activity_code}`, "1");
          inserted++;
          row.status = "Imported";
        } catch {
          failed++;
          row.status = "Failed";
        }
      }
      setImportMessage(`Import finished: ${inserted} added, ${skipped} skipped, ${failed} failed.`);
      setImportRows(null);
      setExpanded(new Set());
      await reload();
    } finally {
      setImportRunning(false);
    }
  }

  // ---------------------------------------------------------------
  if (loading) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">Syllabus Manager</h2>
            <p className="page-sub">Maintain competences and learning activities from the TIE curriculum.</p>
          </div>
        </div>
        <div className="sm-table-wrap td-loading"><ListRowSkeleton cols={4} /><ListRowSkeleton cols={4} /><ListRowSkeleton cols={4} /></div>
      </>
    );
  }

  if (loadError) {
    return (
      <div className="db-empty">
        <h3>Could not load the syllabus</h3>
        <p>Make sure the lesson plan tables are migrated and seeded.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Syllabus Manager</h2>
          <p className="page-sub">Competences and learning activities grouped by subject and class.</p>
        </div>
        <div className="page-head-right">
          <a className="cm-btn cm-btn--ghost" href="/syllabus-import-template.csv" download>Download CSV Template</a>
          <button className="cm-btn cm-btn--primary" onClick={() => fileInputRef.current?.click()}>
            {importRows ? "Change File" : "Import CSV / JSON"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button
            className="cm-btn cm-btn--primary cm-add-btn"
            onClick={() => openEditor({ mode: "add-main", context: {} }, {})}
          >
            + Add Competence
          </button>
        </div>
      </div>

      {note && <p className="lp-note" role="status">{note}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}

      {importRows && (
        <section className="lp-card">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Import Preview — {fileName}</h3>
              <p className="panel-sub">{importRows.length} rows · review below then confirm.</p>
            </div>
            <div className="sm-actions">
              <button className="cm-btn cm-btn--ghost" onClick={() => setImportRows(null)}>Cancel</button>
              <button className="cm-btn cm-btn--primary" onClick={confirmImport} disabled={importRunning}>
                {importRunning && <Spinner />}
                {importRunning ? "Importing…" : `Confirm Import (${importRows.filter((r) => r.status === "Ready to import").length})`}
              </button>
            </div>
          </div>
          {importMessage && <p className="lp-note">{importMessage}</p>}
          <div className="sm-table-wrap" style={{ maxHeight: "26rem", overflow: "auto" }}>
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Form</th>
                  <th>Main</th>
                  <th>Specific</th>
                  <th>Activity</th>
                  <th>Periods</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {importRows.slice(0, 200).map((row, i) => (
                  <tr key={i}>
                    <td>{row.subject}</td>
                    <td>{row.form}</td>
                    <td><span className="sm-code">{row.main_code}</span> {row.main_title}</td>
                    <td><span className="sm-code">{row.specific_code}</span> {row.specific_title}</td>
                    <td><span className="sm-code">{row.activity_code}</span> {row.activity_description}</td>
                    <td>{row.periods_allocated ?? "—"}</td>
                    <td><span className={`ex-status ex-status--${row.status === "Ready to import" ? "final" : "draft"}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tree.length === 0 ? (
        <div className="db-empty">
          <h3>No curriculum data yet</h3>
          <p>Import the TIE syllabus from a CSV/JSON file or add competences manually.</p>
        </div>
      ) : (
        tree.map((subject) => (
          <section className="lp-card" key={subject.subject.id}>
            <div className="panel-head">
              <div>
                <h3 className="panel-title">{subject.subject.name}</h3>
                <p className="panel-sub">Code <span className="sm-code">{subject.subject.code}</span> · {subject.forms.length} form{subject.forms.length === 1 ? "" : "s"}</p>
              </div>
              <span className="panel-badge">
                {subject.forms.reduce((sum, f) => sum + f.main_competences.length, 0)} main comp.
              </span>
            </div>

            {subject.forms.map((formItem) => {
              const formKey = `main:${subject.subject.id}:${formItem.id}`;
              const isOpen = expanded.has(formKey);
              return (
                <div className="sm-role-block" key={formItem.id}>
                  <div className="sm-role-head" onClick={() => toggleExpand(formKey)}>
                    <span className="sm-role-toggle">{isOpen ? "▾" : "▸"}</span>
                    <span className="sm-role-name">{formItem.name}</span>
                    <span className="panel-badge">{formItem.main_competences.length}</span>
                  </div>

                  {isOpen && (
                    <div className="sm-role-desc">
                      {formItem.main_competences.length === 0 ? (
                        <p className="td-none">
                          No main competences yet.{" "}
                          <button
                            className="cm-btn cm-btn--ghost cm-btn--sm"
                            onClick={() =>
                              openEditor(
                                { mode: "add-main", context: { subjectId: subject.subject.id, formId: formItem.id } },
                                { subjectId: subject.subject.id, formId: formItem.id },
                              )
                            }
                          >
                            + Add
                          </button>
                        </p>
                      ) : (
                        <div className="syllabus-tree">
                          {formItem.main_competences.map((main, mi) => {
                            return (
                              <div className="syllabus-node" key={main.id}>
                                <div className="syllabus-row">
                                  <span className="sm-code">{main.code}</span>
                                  <span className="syllabus-title">{main.title}</span>
                                  <span className="syllabus-actions">
                                    <button
                                      className="cm-btn cm-btn--ghost cm-btn--sm"
                                      onClick={() =>
                                        openEditor(
                                          { mode: "add-specific", context: { mainId: main.id, mainCode: main.code } },
                                          {},
                                        )
                                      }
                                    >
                                      + Specific
                                    </button>
                                    <button
                                      className="cm-btn cm-btn--ghost cm-btn--sm"
                                      onClick={() =>
                                        openEditor(
                                          { mode: "edit-main", targetId: main.id, context: {} },
                                          { code: main.code, title: main.title },
                                        )
                                      }
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="cm-icon-btn cm-icon-btn--danger cm-icon-btn--sm"
                                      onClick={() => removeTarget("main", main.id)}
                                      disabled={busyKey === main.id}
                                      aria-label="Delete main competence"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                </div>

                                {main.specific_competences.length > 0 && (
                                  <div className="syllabus-children">
                                    {main.specific_competences.map((specific) => {
                                      return (
                                        <div className="syllabus-node" key={specific.id}>
                                          <div className="syllabus-row">
                                            <span className="sm-code">{specific.code}</span>
                                            <span className="syllabus-title">{specific.title}</span>
                                            <span className="syllabus-actions">
                                              <button
                                                className="cm-btn cm-btn--ghost cm-btn--sm"
                                                onClick={() =>
                                                  openEditor(
                                                    {
                                                      mode: "add-activity",
                                                      context: { specificId: specific.id, specificCode: specific.code },
                                                    },
                                                    {},
                                                  )
                                                }
                                              >
                                                + Activity
                                              </button>
                                              <button
                                                className="cm-btn cm-btn--ghost cm-btn--sm"
                                                onClick={() =>
                                                  openEditor(
                                                    { mode: "edit-specific", targetId: specific.id, context: {} },
                                                    { code: specific.code, title: specific.title },
                                                  )
                                                }
                                              >
                                                Edit
                                              </button>
                                              <button
                                                className="cm-icon-btn cm-icon-btn--danger cm-icon-btn--sm"
                                                onClick={() => removeTarget("specific", specific.id)}
                                                disabled={busyKey === specific.id}
                                                aria-label="Delete specific competence"
                                              >
                                                ✕
                                              </button>
                                            </span>
                                          </div>

                                          {specific.activities.length > 0 && (
                                            <div className="syllabus-children">
                                              {specific.activities.map((activity) => (
                                                <div className="syllabus-node" key={activity.id}>
                                                  <div className="syllabus-row">
                                                    <span className="sm-code">{activity.code}</span>
                                                    <span className="syllabus-title">
                                                      {activity.activity_description}
                                                      {activity.periods_allocated != null && (
                                                        <span className="sm-badge sm-badge--theory"> {activity.periods_allocated} per.</span>
                                                      )}
                                                    </span>
                                                    <span className="syllabus-actions">
                                                      <button
                                                        className="cm-btn cm-btn--ghost cm-btn--sm"
                                                        onClick={() =>
                                                          openEditor(
                                                            { mode: "edit-activity", targetId: activity.id, context: {} },
                                                            {
                                                              code: activity.code,
                                                              activity_description: activity.activity_description,
                                                              suggested_methods: activity.suggested_methods ?? "",
                                                              assessment_criteria: activity.assessment_criteria ?? "",
                                                              resources: activity.resources ?? "",
                                                              periods_allocated: activity.periods_allocated != null ? String(activity.periods_allocated) : "",
                                                            },
                                                          )
                                                        }
                                                      >
                                                        Edit
                                                      </button>
                                                      <button
                                                        className="cm-icon-btn cm-icon-btn--danger cm-icon-btn--sm"
                                                        onClick={() => removeTarget("activity", activity.id)}
                                                        disabled={busyKey === activity.id}
                                                        aria-label="Delete learning activity"
                                                      >
                                                        ✕
                                                      </button>
                                                    </span>
                                                  </div>
                                                  {(activity.suggested_methods || activity.assessment_criteria || activity.resources) && (
                                                    <div className="syllabus-details">
                                                      {activity.suggested_methods && <p><b>Methods:</b> {activity.suggested_methods}</p>}
                                                      {activity.assessment_criteria && <p><b>Criterion:</b> {activity.assessment_criteria}</p>}
                                                      {activity.resources && <p><b>Resources:</b> {activity.resources}</p>}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {mi === 0 && main.specific_competences.length === 0 && (
                                  <p className="td-none">No specific competences under <span className="sm-code">{main.code}</span>.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}

      {editor && (
        <div className="cm-modal-backdrop" onClick={() => { if (!saving) setEditor(null); }}>
          <div className="sm-modal">
            <div className="sm-modal-head">
              <h3 className="sm-modal-title">{editorTitle()}</h3>
              <p className="sm-modal-sub">
                {editor.mode.includes("specific") && editor.context.mainCode && (
                  <>Main competence <span className="sm-code">{editor.context.mainCode}</span></>
                )}
                {editor.mode.includes("activity") && editor.context.specificCode && (
                  <>Specific competence <span className="sm-code">{editor.context.specificCode}</span></>
                )}
              </p>
            </div>

            <div className="lp-editor-fields">
              {(editor.mode === "add-main" || editor.mode === "edit-main") && (
                <>
                  {(editor.mode === "add-main") && (
                    <>
                      <label className="st-field">
                        <span className="st-field-label">Subject</span>
                        <select
                          className="st-input"
                          value={values.subjectId}
                          onChange={(e) => setValues({ ...values, subjectId: e.target.value })}
                        >
                          <option value="">Select subject…</option>
                          {tree.map((s) => (
                            <option key={s.subject.id} value={s.subject.id}>{s.subject.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="st-field">
                        <span className="st-field-label">Form / Class</span>
                        <select
                          className="st-input"
                          value={values.formId}
                          onChange={(e) => setValues({ ...values, formId: e.target.value })}
                        >
                          <option value="">Select class…</option>
                          {forms.map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label className="st-field">
                    <span className="st-field-label">Main Competence Code <em>*</em></span>
                    <input className="st-input" value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} placeholder="e.g. 1.1" />
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Main Competence Title <em>*</em></span>
                    <input className="st-input" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} placeholder="e.g. Georeferencing and orientation" />
                  </label>
                </>
              )}

              {(editor.mode === "add-specific" || editor.mode === "edit-specific") && (
                <>
                  <label className="st-field">
                    <span className="st-field-label">Specific Competence Code <em>*</em></span>
                    <input className="st-input" value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} placeholder="e.g. 1.1.1" />
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Specific Competence Title <em>*</em></span>
                    <input className="st-input" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} placeholder="e.g. Locate areas on maps" />
                  </label>
                </>
              )}

              {(editor.mode === "add-activity" || editor.mode === "edit-activity") && (
                <>
                  <label className="st-field">
                    <span className="st-field-label">Activity Code <em>*</em></span>
                    <input className="st-input" value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} placeholder="e.g. 1.1.1.1" />
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Activity Description <em>*</em></span>
                    <textarea className="lp-input lp-textarea" rows={2} value={values.activity_description} onChange={(e) => setValues({ ...values, activity_description: e.target.value })} placeholder="Describe the learning activity…" />
                  </label>
                  <div className="lp-grid lp-grid--2">
                    <label className="st-field">
                      <span className="st-field-label">Suggested Methods</span>
                      <textarea className="lp-input lp-textarea" rows={2} value={values.suggested_methods} onChange={(e) => setValues({ ...values, suggested_methods: e.target.value })} placeholder="e.g. Map reading, group work" />
                    </label>
                    <label className="st-field">
                      <span className="st-field-label">Assessment Criteria</span>
                      <textarea className="lp-input lp-textarea" rows={2} value={values.assessment_criteria} onChange={(e) => setValues({ ...values, assessment_criteria: e.target.value })} placeholder="e.g. Points correctly on a map" />
                    </label>
                  </div>
                  <label className="st-field">
                    <span className="st-field-label">Learning Resources</span>
                    <input className="st-input" value={values.resources} onChange={(e) => setValues({ ...values, resources: e.target.value })} placeholder="e.g. Atlas, wall map, chalk" />
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Periods Allocated</span>
                    <input className="st-input" type="number" min={0} value={values.periods_allocated} onChange={(e) => setValues({ ...values, periods_allocated: e.target.value })} placeholder="e.g. 4" />
                  </label>
                </>
              )}

              {error && <p className="error-message" role="alert">{error}</p>}
            </div>

            <div className="sm-modal-actions">
              <button className="cm-btn cm-btn--ghost" onClick={() => setEditor(null)} disabled={saving}>Cancel</button>
              <button className="cm-btn cm-btn--primary" onClick={saveEditor} disabled={saving}>
                {saving && <Spinner />}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}