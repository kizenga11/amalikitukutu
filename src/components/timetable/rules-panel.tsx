"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeRules, ruleRowsFrom, type TimetableRules } from "@/lib/timetable";
import { useTimetable } from "./timetable-context";
import { Spinner } from "@/components/loading";

export default function RulesPanel() {
  const { data, loading, error } = useTimetable();
  if (loading) return <div className="tt-state"><Spinner /> Loading rules…</div>;
  if (error) return <div className="tt-state tt-state--error">{error}</div>;
  if (!data) return <div className="tt-state">No timetable data yet.</div>;
  return <RulesForm initial={data.rules} />;
}

function RulesForm({ initial }: { initial: TimetableRules }) {
  const { refresh } = useTimetable();
  const [rules, setRules] = useState<TimetableRules>(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  function patch(patchValue: Partial<TimetableRules>) {
    setRules((current) => normalizeRules({ ...current, ...patchValue }));
  }

  function patchWeight(key: keyof TimetableRules["weights"], value: number) {
    setRules((current) => normalizeRules({ ...current, weights: { ...current.weights, [key]: value } }));
  }

  async function save() {
    setSaving(true);
    setNotice("");
    setProblem("");
    try {
      const { error } = await supabase
        .from("timetable_rules")
        .upsert(ruleRowsFrom(rules), { onConflict: "key" });
      if (error) throw error;
      setNotice("Rules saved. Generate a new version to apply them.");
      refresh();
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : "Could not save rules.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tt-panel-stack">
      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Hard rules</h2>
            <p>These are never broken. The generator will report infeasible instead of breaking them.</p>
          </div>
        </div>
        <div className="tt-grid tt-grid--3">
          <label className="tt-field">
            <span>Maximum consecutive lessons per teacher</span>
            <input
              type="number"
              min={1}
              max={6}
              value={rules.maxConsecutiveTeacher}
              onChange={(event) => patch({ maxConsecutiveTeacher: Number(event.target.value) })}
            />
          </label>
          <label className="tt-field">
            <span>Morning ends at</span>
            <input type="time" value={rules.morningEnds} onChange={(event) => patch({ morningEnds: event.target.value })} />
          </label>
          <label className="tt-toggle">
            <input
              type="checkbox"
              checked={rules.oneSessionPerTeacherClassPerDay}
              onChange={(event) => patch({ oneSessionPerTeacherClassPerDay: event.target.checked })}
            />
            <span>
              <strong>One session per teacher in a class per day</strong>
              <small>A double counts as one session.</small>
            </span>
          </label>
          <label className="tt-toggle">
            <input
              type="checkbox"
              checked={rules.breaksCountAsRest}
              onChange={(event) => patch({ breaksCountAsRest: event.target.checked })}
            />
            <span>
              <strong>Breaks count as rest</strong>
              <small>They interrupt consecutive teaching runs.</small>
            </span>
          </label>
        </div>
      </section>

      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Soft rule weights</h2>
            <p>Higher weights make the generator work harder to satisfy the preference.</p>
          </div>
        </div>
        <div className="tt-grid tt-grid--4">
          <label className="tt-field">
            <span>Morning priority</span>
            <input type="number" min={0} max={1000} value={rules.weights.morning} onChange={(event) => patchWeight("morning", Number(event.target.value))} />
          </label>
          <label className="tt-field">
            <span>Adjacent teaching days</span>
            <input type="number" min={0} max={1000} value={rules.weights.adjacentDays} onChange={(event) => patchWeight("adjacentDays", Number(event.target.value))} />
          </label>
          <label className="tt-field">
            <span>Class single gaps</span>
            <input type="number" min={0} max={1000} value={rules.weights.classGap} onChange={(event) => patchWeight("classGap", Number(event.target.value))} />
          </label>
          <label className="tt-field">
            <span>Teacher single gaps</span>
            <input type="number" min={0} max={1000} value={rules.weights.teacherGap} onChange={(event) => patchWeight("teacherGap", Number(event.target.value))} />
          </label>
        </div>
      </section>

      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Generation</h2>
            <p>The solver stops after this time limit and returns the best timetable it has found.</p>
          </div>
        </div>
        <label className="tt-field tt-field--tight">
          <span>Time limit (seconds)</span>
          <input type="number" min={5} max={600} value={rules.timeLimit} onChange={(event) => patch({ timeLimit: Number(event.target.value) })} />
        </label>
      </section>

      <div className="tt-actions">
        <button type="button" className="cm-btn cm-btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save rules"}
        </button>
      </div>

      {notice && <div className="tt-note tt-note--ok">{notice}</div>}
      {problem && <div className="tt-note tt-note--error">{problem}</div>}
    </div>
  );
}
