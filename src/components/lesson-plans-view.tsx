"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLpOverview, getPlanDetail } from "@/app/lesson-plans/actions";
import Generator from "@/app/lesson-plans/Generator";
import SeedForm from "@/app/lesson-plans/admin/SeedForm";
import PlanEditor from "@/app/lesson-plans/[id]/PlanEditor";

type Overview = Awaited<ReturnType<typeof getLpOverview>>;
type Detail = Awaited<ReturnType<typeof getPlanDetail>>;

type Ov = Extract<Overview, { ok: true }>;
type Det = Extract<Detail, { ok: true }>;

/* eslint-disable @typescript-eslint/no-explicit-any */
const one = (x: any) => (Array.isArray(x) ? x[0] : x);

export default function LessonPlansView() {
  const [token, setToken] = useState<string | null>(null);
  const [ov, setOv] = useState<Ov | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [subject, setSubject] = useState("");
  const [selected, setSelected] = useState<Det | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getLpOverview(token).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setOv(r);
        setErr("");
      } else {
        setErr(r.text);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, tick]);

  const openPlan = useCallback(
    (id: number) => {
      if (!token) return;
      setDetailLoading(true);
      getPlanDetail(token, id)
        .then((r) => {
          if (r.ok) {
            setSelected(r);
            setErr("");
          } else {
            setErr(r.text);
          }
        })
        .finally(() => setDetailLoading(false));
    },
    [token]
  );

  const closePlan = useCallback(() => {
    setSelected(null);
    refresh();
  }, [refresh]);

  const subjectOf = useCallback((p: any) => one(one(one(p.lp_subtopics)?.lp_topics)?.lp_syllabi)?.subject_name as string | undefined, []);

  const isMgmt = ov?.role === "management";
  const topicCount = useMemo(() => (ov?.syllabi ?? []).reduce((sum, s: any) => sum + (s.lp_topics?.length ?? 0), 0), [ov]);
  const planSubjects = useMemo(
    () => [...new Set((ov?.plans ?? []).map((p: any) => subjectOf(p)).filter(Boolean) as string[])].sort(),
    [ov, subjectOf]
  );
  const plans = useMemo(() => (subject ? (ov?.plans ?? []).filter((p: any) => subjectOf(p) === subject) : ov?.plans ?? []), [ov, subject, subjectOf]);
  const seededPeriods = useMemo(
    () =>
      (ov?.syllabi ?? []).reduce((sum: number, s: any) => sum + (s.lp_topics ?? []).reduce((a: number, t: any) => a + (t.total_periods ?? 0), 0), 0),
    [ov]
  );

  if (selected) {
    return (
      <PlanEditor
        plan={selected.plan}
        stages={selected.stages}
        meta={selected.meta}
        canEdit={selected.canEdit}
        canDelete={selected.canDelete}
        onBack={closePlan}
        accessToken={token ?? undefined}
      />
    );
  }

  if (detailLoading) {
    return <div className="lp-wrap"><div className="lp-empty">Opening plan...</div></div>;
  }

  return (
    <div className="lp-wrap">
      <header className="lp-head">
        <div>
          <h1 className="page-title">Lesson Plans</h1>
          <p className="lp-sub">
            Create and print TIE-format lesson plans. {isMgmt ? "You can see all teachers' plans." : "You can see your own plans only."}
          </p>
        </div>
        {isMgmt && (
          <button className="cm-btn cm-btn--ghost" onClick={() => setShowAdmin((v) => !v)}>
            {showAdmin ? "Hide syllabus admin" : "Syllabus admin"}
          </button>
        )}
      </header>

      <div className="lp-stats">
        <div className="lp-stat"><span className="lp-stat-value">{ov?.syllabi.length ?? 0}</span><span className="lp-stat-label">Syllabi</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{topicCount}</span><span className="lp-stat-label">Topics</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{ov?.plans.length ?? 0}</span><span className="lp-stat-label">{isMgmt ? "All plans" : "My plans"}</span></div>
      </div>

      {err && <p className="lp-msg lp-msg--err">{err}</p>}

      {!ov && !err && <div className="lp-empty">Loading...</div>}

      {ov && !err && (
        <>
          {showAdmin && isMgmt && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2 className="panel-title">Seed syllabus</h2>
                  <p className="panel-sub">Seeding again updates existing records (no duplicates).</p>
                </div>
              </div>
              <SeedForm onSeeded={refresh} accessToken={token ?? undefined} />
              {ov.syllabi.length ? (
                <div className="lp-table-wrap" style={{ marginTop: 12 }}>
                  <table className="lp-table">
                    <thead>
                      <tr><th>Subject</th><th>Form</th><th>Source</th><th>Topics</th><th>Periods</th></tr>
                    </thead>
                    <tbody>
                      {ov.syllabi.map((s: any) => (
                        <tr key={s.id}>
                          <td>{s.subject_name}</td>
                          <td>{s.form_level}</td>
                          <td>{s.source}</td>
                          <td>{s.lp_topics.length}</td>
                          <td>{(s.lp_topics as any[]).reduce((a: number, t: any) => a + (t.total_periods ?? 0), 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="lp-empty" style={{ marginTop: 12 }}>No syllabus yet. Paste data above to get started.</div>
              )}
              <p className="lp-sub" style={{ marginTop: 8 }}>Total periods in the syllabus: {seededPeriods}</p>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Generate plans</h2>
                <p className="panel-sub">Choose Subject → Topic → Subtopic, enter a class; the system creates plans, stages and time automatically.</p>
              </div>
            </div>
            {ov.syllabi.length ? (
              <Generator syllabi={ov.syllabi} onGenerated={refresh} accessToken={token ?? undefined} />
            ) : (
              <div className="lp-empty">
                No syllabus has been seeded for your subjects yet.
                {isMgmt && <> Click &quot;Syllabus admin&quot; above to add data.</>}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">{isMgmt ? "All plans" : "My plans"} ({plans.length})</h2>
              {planSubjects.length > 0 && (
                <div className="lp-filters">
                  <button className={`lp-chip${!subject ? " lp-chip--active" : ""}`} onClick={() => setSubject("")}>All</button>
                  {planSubjects.map((s) => (
                    <button key={s} className={`lp-chip${subject === s ? " lp-chip--active" : ""}`} onClick={() => setSubject(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {plans.length ? (
              <div className="lp-table-wrap">
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>Subject</th><th>Form</th><th>Subtopic</th><th>Lesson</th><th>Class</th>
                      {isMgmt && <th>Teacher</th>}
                      <th>Date</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p: any) => {
                      const st = one(p.lp_subtopics);
                      const sl = one(one(st?.lp_topics)?.lp_syllabi);
                      return (
                        <tr key={p.id}>
                          <td>{sl?.subject_name}</td>
                          <td>{sl?.form_level}</td>
                          <td>{st?.name}</td>
                          <td>{p.lesson_no}/{st?.periods}</td>
                          <td>{p.class_label}</td>
                          {isMgmt && <td>{p.teacher_name}</td>}
                          <td>{p.lesson_date ?? "—"}</td>
                          <td className="lp-table-action"><button className="cm-btn cm-btn--ghost" onClick={() => openPlan(p.id)}>Open</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="lp-empty">
                {subject ? "No plans for this subject yet." : "No plans yet. Generate plans above."}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}