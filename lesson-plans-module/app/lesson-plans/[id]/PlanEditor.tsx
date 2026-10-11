"use client";

import { useState, useTransition } from "react";
import { savePlan } from "../actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Stage = {
  id: number; stage: string; minutes: number;
  teaching_activities: string | null; learning_activities: string | null; assessment_criteria: string | null;
};

export default function PlanEditor({
  plan, stages, meta, canEdit,
}: {
  plan: any; stages: Stage[]; canEdit: boolean;
  meta: { school: string; teacher: string; form: number; subject: string; topic: string; subtopic: string; lessonNo: number; periods: number };
}) {
  const [p, setP] = useState<any>(plan);
  const [st, setSt] = useState<Stage[]>(stages);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setP({ ...p, [k]: e.target.value });
  const setStage = (i: number, k: keyof Stage, v: string) =>
    setSt(st.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  const box = { border: "1px solid #000", padding: 6, verticalAlign: "top" } as const;
  const ta = { width: "100%", minHeight: 90, boxSizing: "border-box", border: "none", font: "inherit", resize: "vertical" } as const;
  const inp = { width: "100%", boxSizing: "border-box", border: "none", font: "inherit" } as const;
  const tot = (a: any, b: any) => (Number(a) || 0) + (Number(b) || 0);

  const field = (label: string, k: string) => (
    <div style={{ margin: "10px 0" }}>
      <b>{label}:</b>
      <textarea style={{ ...ta, minHeight: 40, borderBottom: "1px dotted #000" }} value={p[k] ?? ""} onChange={set(k)} disabled={!canEdit} />
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, background: "#fff", color: "#000" }}>
      <style>{`@media print{.no-print{display:none!important}}`}</style>

      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <a href="/lesson-plans">&larr; Rudi</a>
        {canEdit && (
          <button
            disabled={pending}
            onClick={() => start(async () => { const r = await savePlan(p.id, { plan: p, stages: st }); setMsg(r.text); })}
          >
            {pending ? "Inahifadhi..." : "Hifadhi"}
          </button>
        )}
        <button onClick={() => window.print()}>Chapisha / PDF</button>
        <span>{msg}</span>
        <span style={{ marginLeft: "auto", fontSize: 13 }}>
          {meta.topic} › {meta.subtopic} (kipindi {meta.lessonNo}/{meta.periods})
        </span>
      </div>

      <h2 style={{ textAlign: "center" }}>LESSON PLAN</h2>

      <p><b>Name of School:</b> {meta.school} &nbsp; <b>Teacher&apos;s Name:</b> {meta.teacher}</p>
      <p><b>Form:</b> {meta.form} &nbsp; <b>Subject:</b> {meta.subject} &nbsp; <b>Class:</b> {p.class_label}</p>
      <p style={{ display: "flex", gap: 16 }}>
        <span><b>Time:</b> <input value={p.lesson_time ?? ""} onChange={set("lesson_time")} disabled={!canEdit} placeholder="08:00 - 08:40" /></span>
        <span><b>Date:</b> <input type="date" value={p.lesson_date ?? ""} onChange={set("lesson_date")} disabled={!canEdit} /></span>
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 12 }}>
        <thead>
          <tr><th style={box} colSpan={6}>Number of students</th></tr>
          <tr><th style={box} colSpan={3}>Registered</th><th style={box} colSpan={3}>Present</th></tr>
          <tr>{["Girls", "Boys", "Total", "Girls", "Boys", "Total"].map((h, i) => <th key={i} style={box}>{h}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            {(["registered_girls", "registered_boys"] as const).map((k) => (
              <td key={k} style={box}><input type="number" min={0} style={inp} value={p[k] ?? ""} onChange={set(k)} disabled={!canEdit} /></td>
            ))}
            <td style={box}>{tot(p.registered_girls, p.registered_boys)}</td>
            {(["present_girls", "present_boys"] as const).map((k) => (
              <td key={k} style={box}><input type="number" min={0} style={inp} value={p[k] ?? ""} onChange={set(k)} disabled={!canEdit} /></td>
            ))}
            <td style={box}>{tot(p.present_girls, p.present_boys)}</td>
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
                  <textarea style={ta} value={s[k] ?? ""} onChange={(e) => setStage(i, k, e.target.value)} disabled={!canEdit} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <b>Remarks:</b>
        <textarea style={{ ...ta, borderBottom: "1px dotted #000" }} value={p.remarks ?? ""} onChange={set("remarks")} disabled={!canEdit} />
      </div>
    </div>
  );
}
