"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePlan, savePlan } from "../actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Stage = {
  id: number; stage: string; minutes: number;
  teaching_activities: string | null; learning_activities: string | null; assessment_criteria: string | null;
};

// Textarea inayojipanua yenyewe kulingana na maudhui: hakuna scroll ndani yake,
// na maandishi yote yanaonekana pia wakati wa kuchapisha.
function AutoGrowTextarea({ value, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => { fit(); }, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    window.addEventListener("beforeprint", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("beforeprint", fit);
    };
  }, []);
  return <textarea ref={ref} value={value} {...props} />;
}

export default function PlanEditor({
  plan, stages, meta, canEdit, canDelete, onBack, accessToken,
}: {
  plan: any; stages: Stage[]; canEdit: boolean; canDelete: boolean;
  meta: { school: string; teacher: string; form: number; subject: string; topic: string; subtopic: string; lessonNo: number; periods: number };
  onBack?: () => void; accessToken?: string;
}) {
  const [p, setP] = useState<any>(plan);
  const [st, setSt] = useState<Stage[]>(stages);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const docRef = useRef<HTMLDivElement>(null);

  // A4 printable area kwa 96dpi (210x297mm ukiondoa margin ya 8mm kila upande).
  const PAGE_W = 733;
  const PAGE_H = 1046;

  // Hupima maudhui kwa mara moja (kwa styles za print) na kuchagua scale inayotosha ukurasa mmoja wa A4.
  const fitForPrint = useCallback(() => {
    const el = docRef.current;
    if (!el) return;
    el.classList.add("lp-measuring");
    el.style.transform = "none";
    let k = 1;
    for (let i = 0; i < 6; i++) {
      el.style.width = `${PAGE_W / k}px`;
      const h = el.scrollHeight;
      const nk = Math.max(0.5, Math.min(1, PAGE_H / h));
      if (Math.abs(nk - k) < 0.002) { k = nk; break; }
      k = nk;
    }
    el.classList.remove("lp-measuring");
    el.style.width = `${PAGE_W / k}px`;
    el.style.transformOrigin = "top left";
    el.style.transform = `scale(${k})`;
  }, []);

  const resetPrint = useCallback(() => {
    const el = docRef.current;
    if (!el) return;
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.width = "";
  }, []);

  useEffect(() => {
    window.addEventListener("beforeprint", fitForPrint);
    window.addEventListener("afterprint", resetPrint);
    return () => {
      window.removeEventListener("beforeprint", fitForPrint);
      window.removeEventListener("afterprint", resetPrint);
    };
  }, [fitForPrint, resetPrint]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setP({ ...p, [k]: e.target.value });
  const setStage = (i: number, k: keyof Stage, v: string) =>
    setSt(st.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  async function onDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    const r = await deletePlan(p.id, accessToken);
    if (r.ok) {
      if (onBack) {
        onBack();
      } else {
        router.push("/lesson-plans");
        router.refresh();
      }
    } else {
      setMsg(r.text);
      setDeleting(false);
    }
  }

  const box = { border: "1px solid #000", padding: 6, verticalAlign: "top" } as const;
  const autoBox = { ...box, background: "#eef2f0", textAlign: "center" } as const;
  const ta = { width: "100%", minHeight: 90, boxSizing: "border-box", border: "none", font: "inherit", resize: "none", overflow: "hidden" } as const;
  const inp = { width: "100%", minWidth: 0, boxSizing: "border-box", border: "none", font: "inherit", textAlign: "center" } as const;
  const tot = (a: any, b: any) => (Number(a) || 0) + (Number(b) || 0);

  const field = (label: string, k: string) => (
    <div style={{ margin: "10px 0" }}>
      <b>{label}:</b>
      <AutoGrowTextarea className="lp-edit" style={{ ...ta, minHeight: 40, borderBottom: "1px dotted #000" }} value={p[k] ?? ""} onChange={set(k)} disabled={!canEdit} />
      <div className="lp-print">{p[k] ?? ""}</div>
    </div>
  );

  return (
    <div className="lp-doc">
      <style>{`
        .lp-print { display: none; }
        .lp-print-inline { display: none; }
        /* Hali ya kupima: inafanana kabisa na print ili urefu ulingane. */
        .lp-measuring { font-size: 11pt !important; line-height: 1.3 !important; }
        .lp-measuring .no-print { display: none !important; }
        .lp-measuring .lp-edit { display: none !important; }
        .lp-measuring .lp-print { display: block !important; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
        .lp-measuring .lp-print-inline { display: inline !important; }
        .lp-measuring h2 { font-size: 14pt !important; margin: 0 0 3pt !important; }
        .lp-measuring h3 { font-size: 11pt !important; margin: 5pt 0 2pt !important; }
        .lp-measuring p { margin: 1.5pt 0 !important; }
        .lp-measuring table { font-size: 11pt !important; margin-bottom: 6pt !important; }
        .lp-measuring table th, .lp-measuring table td { padding: 1.5pt 3pt !important; overflow-wrap: anywhere; word-break: break-word; }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          @page lp { size: A4 portrait; margin: 8mm; }
          .no-print { display: none !important; }
          .lp-edit { display: none !important; }
          .lp-print { display: block; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
          .lp-print-inline { display: inline; }
          html, body { height: auto !important; overflow: visible !important; }
          .app-shell { min-height: 0 !important; }
          .app, .app-shell, .app-main, .content { height: auto !important; overflow: visible !important; max-width: none !important; }
          .lp-doc { page: lp; width: 194mm; max-width: 194mm; height: 280mm; margin: 0; padding: 0; overflow: hidden; }
          .lp-doc-fit { width: 194mm; transform-origin: top left; font-size: 11pt; line-height: 1.3; color: #000; }
          .lp-doc h2 { font-size: 14pt; margin: 0 0 3pt; }
          .lp-doc h3 { font-size: 11pt; margin: 5pt 0 2pt; }
          .lp-doc p { margin: 1.5pt 0; }
          .lp-doc table { font-size: 11pt; margin-bottom: 6pt !important; }
          .lp-doc table th, .lp-doc table td { padding: 1.5pt 3pt !important; overflow-wrap: anywhere; word-break: break-word; }
          .lp-doc thead { display: table-header-group; }
        }
      `}</style>

      <div className="lp-doc-fit" ref={docRef}>
      <div className="no-print lp-toolbar">
        {onBack ? (
          <button className="cm-btn cm-btn--ghost" onClick={onBack}>&larr; Back</button>
        ) : (
          <Link className="cm-btn cm-btn--ghost" href="/lesson-plans">&larr; Back</Link>
        )}
        {canEdit && (
          <button
            className="cm-btn cm-btn--primary"
            disabled={pending}
            onClick={() => start(async () => { const r = await savePlan(p.id, { plan: p, stages: st }, accessToken); setMsg(r.text); })}
          >
            {pending ? "Saving..." : "Save"}
          </button>
        )}
        <button className="cm-btn cm-btn--ghost" onClick={() => window.print()}>Print / PDF</button>
        {canDelete && (
          <button className="cm-btn cm-btn--danger" disabled={deleting} onClick={() => setConfirmDelete(true)}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
        {msg && <span className="lp-toolbar-msg">{msg}</span>}
        <span className="lp-crumb">{meta.topic} › {meta.subtopic} (lesson {meta.lessonNo}/{meta.periods})</span>
      </div>

      <h2 style={{ textAlign: "center" }}>LESSON PLAN</h2>

      <p><b>Name of School:</b> {meta.school} &nbsp; <b>Teacher&apos;s Name:</b> {meta.teacher}</p>
      <p><b>Form:</b> {meta.form} &nbsp; <b>Subject:</b> {meta.subject} &nbsp; <b>Class:</b> {p.class_label}</p>
      <p style={{ display: "flex", gap: 16 }}>
        <span><b>Time:</b> <input className="lp-edit" value={p.lesson_time ?? ""} onChange={set("lesson_time")} disabled={!canEdit} placeholder="08:00 - 08:40" /> <span className="lp-print-inline">{p.lesson_time}</span></span>
        <span><b>Date:</b> <input className="lp-edit" type="date" value={p.lesson_date ?? ""} onChange={set("lesson_date")} disabled={!canEdit} /> <span className="lp-print-inline">{p.lesson_date}</span></span>
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", marginBottom: 12 }}>
        <thead>
          <tr><th style={box} colSpan={9}>Number of students</th></tr>
          <tr><th style={box} colSpan={3}>Registered</th><th style={box} colSpan={3}>Present</th><th style={box} colSpan={3}>Absentees</th></tr>
          <tr>{["Girls", "Boys", "Total", "Girls", "Boys", "Total", "Girls", "Boys", "Total"].map((h, i) => <th key={i} style={box}>{h}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            {(["registered_girls", "registered_boys"] as const).map((k) => (
              <td key={k} style={box}><input type="number" min={0} style={inp} value={p[k] ?? ""} onChange={set(k)} disabled={!canEdit} /></td>
            ))}
            <td style={autoBox}>{tot(p.registered_girls, p.registered_boys)}</td>
            {(["present_girls", "present_boys"] as const).map((k) => (
              <td key={k} style={box}><input type="number" min={0} style={inp} value={p[k] ?? ""} onChange={set(k)} disabled={!canEdit} /></td>
            ))}
            <td style={autoBox}>{tot(p.present_girls, p.present_boys)}</td>
            <td style={autoBox}>{Math.max(0, (Number(p.registered_girls) || 0) - (Number(p.present_girls) || 0))}</td>
            <td style={autoBox}>{Math.max(0, (Number(p.registered_boys) || 0) - (Number(p.present_boys) || 0))}</td>
            <td style={autoBox}>{Math.max(0, tot(p.registered_girls, p.registered_boys) - tot(p.present_girls, p.present_boys))}</td>
          </tr>
        </tbody>
      </table>

      {field("Main Competence", "main_competence")}
      {field("Specific Competence", "specific_competence")}
      {field("Main Activity", "main_activity")}
      {field("Specific Activity", "specific_activity")}
      {field("Teaching and Learning Resources", "resources")}
      {field("References", "reference_books")}

      <h3>Teaching and Learning Process</h3>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={box}>Stages</th><th style={box}>Time (Minutes)</th>
            <th style={box}>Teaching Activities</th><th style={box}>Learning Activities</th><th style={box}>Assessment Criteria</th>
          </tr>
        </thead>
        <tbody>
          {st.map((s, i) => (
            <tr key={s.id}>
              <td style={box}><b>{s.stage}</b></td>
              <td style={{ ...box, width: 60 }}>
                <input type="number" min={0} style={inp} value={s.minutes} onChange={(e) => setStage(i, "minutes", e.target.value)} disabled={!canEdit} />
              </td>
              {(["teaching_activities", "learning_activities", "assessment_criteria"] as const).map((k) => (
                <td key={k} style={box}>
                  <AutoGrowTextarea className="lp-edit" style={ta} value={s[k] ?? ""} onChange={(e) => setStage(i, k, e.target.value)} disabled={!canEdit} />
                  <div className="lp-print">{s[k] ?? ""}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <b>Remarks:</b>
        <AutoGrowTextarea className="lp-edit" style={{ ...ta, borderBottom: "1px dotted #000" }} value={p.remarks ?? ""} onChange={set("remarks")} disabled={!canEdit} />
        <div className="lp-print">{p.remarks ?? ""}</div>
      </div>
      </div>

      {confirmDelete && (
        <div className="no-print cm-modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cm-modal-title">Delete lesson plan</h3>
            <p className="cm-modal-text">Are you sure you want to delete this lesson plan? This action cannot be undone.</p>
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="cm-btn cm-btn--danger" disabled={deleting} onClick={onDelete}>
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
