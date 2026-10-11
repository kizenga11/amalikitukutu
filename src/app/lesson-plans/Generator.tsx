"use client";

import { useActionState, useMemo, useState } from "react";
import { generatePlans } from "./actions";

type Msg = { ok: boolean; text: string } | null;

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Generator({ syllabi }: { syllabi: any[] }) {
  const [sy, setSy] = useState("");
  const [tp, setTp] = useState("");
  const [state, action, pending] = useActionState<Msg, FormData>(generatePlans, null);

  const topics = useMemo(
    () => [...(syllabi.find((s) => String(s.id) === sy)?.lp_topics ?? [])].sort((a: any, b: any) => a.seq - b.seq),
    [sy, syllabi]
  );
  const subs = useMemo(
    () => [...(topics.find((t: any) => String(t.id) === tp)?.lp_subtopics ?? [])].sort((a: any, b: any) => a.seq - b.seq),
    [tp, topics]
  );

  return (
    <form action={action} className="lp-form">
      <label className="sm-field">
        <span className="sm-field-label">Somo na Form</span>
        <select
          className="st-filter lp-full"
          value={sy}
          onChange={(e) => { setSy(e.target.value); setTp(""); }}
          required
        >
          <option value="">-- chagua --</option>
          {syllabi.map((s) => (
            <option key={s.id} value={s.id}>{s.subject_name} - Form {s.form_level} ({s.source})</option>
          ))}
        </select>
      </label>

      <label className="sm-field">
        <span className="sm-field-label">Topic</span>
        <select name="topic_id" className="st-filter lp-full" value={tp} onChange={(e) => setTp(e.target.value)} required disabled={!sy}>
          <option value="">-- chagua --</option>
          {topics.map((t: any) => (
            <option key={t.id} value={t.id}>{t.seq}. {t.name}</option>
          ))}
        </select>
      </label>

      <label className="sm-field">
        <span className="sm-field-label">Subtopic</span>
        <select name="subtopic_id" className="st-filter lp-full" key={tp} defaultValue="all" disabled={!tp}>
          <option value="all">Subtopics zote za topic hii</option>
          {subs.map((s: any) => (
            <option key={s.id} value={s.id}>{s.seq}. {s.name} (vipindi {s.periods})</option>
          ))}
        </select>
      </label>

      <label className="sm-field">
        <span className="sm-field-label">Darasa</span>
        <input name="class_label" className="sm-input" placeholder="mf. Form 1A" required />
      </label>

      <div className="lp-form-actions">
        <button type="submit" className="cm-btn cm-btn--primary" disabled={pending || !tp}>
          {pending ? "Inatengeneza..." : "Generate Lesson Plans"}
        </button>
        <span className="lp-hint">Vipindi, hatua na tarehe za siku za kazi huwekwa kiotomatiki.</span>
      </div>

      {state && <p className={`lp-msg lp-msg--${state.ok ? "ok" : "err"}`}>{state.text}</p>}
    </form>
  );
}
