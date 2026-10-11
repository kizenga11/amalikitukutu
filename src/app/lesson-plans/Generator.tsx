"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { generatePlans } from "./actions";

type Msg = { ok: boolean; text: string } | null;

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Generator({ syllabi, onGenerated, accessToken }: { syllabi: any[]; onGenerated?: () => void; accessToken?: string }) {
  const [sy, setSy] = useState("");
  const [tp, setTp] = useState("");
  const [sub, setSub] = useState("");
  const [state, action, pending] = useActionState<Msg, FormData>(generatePlans, null);

  useEffect(() => {
    if (state?.ok) onGenerated?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

  const topics = useMemo(
    () => [...(syllabi.find((s) => String(s.id) === sy)?.lp_topics ?? [])].sort((a: any, b: any) => a.seq - b.seq),
    [sy, syllabi]
  );
  const subs = useMemo(
    () => [...(topics.find((t: any) => String(t.id) === tp)?.lp_subtopics ?? [])].sort((a: any, b: any) => a.seq - b.seq),
    [tp, topics]
  );

  // Default the subtopic to the first subtopic of the selected topic.
  useEffect(() => {
    setSub(subs.length ? String(subs[0].id) : "");
  }, [subs]);

  return (
    <form action={action} className="lp-form">
      <input type="hidden" name="access_token" value={accessToken ?? ""} />
      <label className="sm-field">
        <span className="sm-field-label">Subject and Form</span>
        <select
          className="st-filter lp-full"
          value={sy}
          onChange={(e) => { setSy(e.target.value); setTp(""); }}
          required
        >
          <option value="">-- select --</option>
          {syllabi.map((s) => (
            <option key={s.id} value={s.id}>{s.subject_name} - Form {s.form_level} ({s.source})</option>
          ))}
        </select>
      </label>

      <label className="sm-field">
        <span className="sm-field-label">Topic</span>
        <select name="topic_id" className="st-filter lp-full" value={tp} onChange={(e) => setTp(e.target.value)} required disabled={!sy}>
          <option value="">-- select --</option>
          {topics.map((t: any) => (
            <option key={t.id} value={t.id}>{t.seq}. {t.name}</option>
          ))}
        </select>
      </label>

      <label className="sm-field">
        <span className="sm-field-label">Subtopic</span>
        <select name="subtopic_id" className="st-filter lp-full" value={sub} onChange={(e) => setSub(e.target.value)} disabled={!tp} required>
          <option value="all">All subtopics of this topic</option>
          {subs.map((s: any) => (
            <option key={s.id} value={s.id}>{s.seq}. {s.name} (periods {s.periods})</option>
          ))}
        </select>
      </label>

      <label className="sm-field">
        <span className="sm-field-label">Class</span>
        <input name="class_label" className="sm-input" placeholder="e.g. Form 1A" required />
      </label>

      <div className="lp-form-actions">
        <button type="submit" className="cm-btn cm-btn--primary" disabled={pending || !tp || !sub}>
          {pending ? "Generating..." : "Generate Lesson Plans"}
        </button>
        <span className="lp-hint">Periods, stages and working-day dates are set automatically.</span>
      </div>

      {state && <p className={`lp-msg lp-msg--${state.ok ? "ok" : "err"}`}>{state.text}</p>}
    </form>
  );
}
