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

  const f = { display: "grid", gap: 4 } as const;

  return (
    <form action={action} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <label style={f}>
        Somo na Form
        <select value={sy} onChange={(e) => { setSy(e.target.value); setTp(""); }} required>
          <option value="">-- chagua --</option>
          {syllabi.map((s) => (
            <option key={s.id} value={s.id}>{s.subject_name} - Form {s.form_level} ({s.source})</option>
          ))}
        </select>
      </label>

      <label style={f}>
        Topic
        <select name="topic_id" value={tp} onChange={(e) => setTp(e.target.value)} required disabled={!sy}>
          <option value="">-- chagua --</option>
          {topics.map((t: any) => (
            <option key={t.id} value={t.id}>{t.seq}. {t.name}</option>
          ))}
        </select>
      </label>

      <label style={f}>
        Subtopic
        <select name="subtopic_id" key={tp} defaultValue="all" disabled={!tp}>
          <option value="all">Subtopics zote za topic hii</option>
          {subs.map((s: any) => (
            <option key={s.id} value={s.id}>{s.seq}. {s.name} (vipindi {s.periods})</option>
          ))}
        </select>
      </label>

      <label style={f}>
        Darasa
        <input name="class_label" placeholder="mf. Form 1A" required />
      </label>

      <button type="submit" disabled={pending || !tp}>
        {pending ? "Inatengeneza..." : "Generate Lesson Plans"}
      </button>
      {state && <p style={{ color: state.ok ? "green" : "crimson" }}>{state.text}</p>}
    </form>
  );
}
