import Link from "next/link";
import { getLpUser } from "@/lib/lp/auth";
import { lpDb } from "@/lib/lp/db";
import Generator from "./Generator";
import { groupPlans } from "@/lib/lp/group";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function LessonPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;
  const u = await getLpUser();
  if (!u) {
    return (
      <div className="lp-wrap">
        <div className="lp-empty">Please sign in to view lesson plans.</div>
      </div>
    );
  }

  const db = lpDb();
  const { data: sy } = await db
    .from("lp_syllabi")
    .select("id, subject_name, form_level, source, lp_topics(id, seq, name, lp_subtopics(id, seq, name, periods, specific_competence))")
    .order("subject_name")
    .order("form_level");
  const allSyllabi = (sy ?? []) as any[];
  const syllabi = allSyllabi.filter((s) => !u.subjects || u.subjects.includes(s.subject_name));

  let planQuery = db
    .from("lp_plans")
    .select("id, lesson_no, class_label, lesson_date, teacher_name, specific_competence, lp_subtopics(name, periods, lp_topics(name, lp_syllabi(subject_name, form_level)))");
  if (u.role !== "management") planQuery = planQuery.eq("teacher_id", u.id);
  const { data: pl } = await planQuery.order("id", { ascending: false }).limit(500);
  const base = (pl ?? []) as any[];

  const one = (x: any) => (Array.isArray(x) ? x[0] : x);
  const subjectOf = (p: any) => one(one(one(p.lp_subtopics)?.lp_topics)?.lp_syllabi)?.subject_name as string | undefined;

  const planSubjects = [...new Set(base.map(subjectOf).filter(Boolean))].sort() as string[];
  const plans = subject ? base.filter((p) => subjectOf(p) === subject) : base;
  const grouped = groupPlans(plans);

  const topicCount = syllabi.reduce((sum, s) => sum + (s.lp_topics?.length ?? 0), 0);
  const isMgmt = u.role === "management";

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
          <Link className="cm-btn cm-btn--ghost" href="/lesson-plans/admin">Syllabus admin</Link>
        )}
      </header>

      <div className="lp-stats">
        <div className="lp-stat"><span className="lp-stat-value">{syllabi.length}</span><span className="lp-stat-label">Syllabi</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{topicCount}</span><span className="lp-stat-label">Topics</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{base.length}</span><span className="lp-stat-label">{isMgmt ? "All plans" : "My plans"}</span></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Generate plans</h2>
            <p className="panel-sub">Choose Subject → Topic → Subtopic, enter a class; the system creates plans, stages and time automatically.</p>
          </div>
        </div>
        {syllabi.length ? (
          <Generator syllabi={syllabi} />
        ) : (
          <div className="lp-empty">
            No syllabus has been seeded for your subjects yet.
            {isMgmt && <> Go to <Link href="/lesson-plans/admin">Syllabus admin</Link> to add data.</>}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">{isMgmt ? "All plans" : "My plans"} ({plans.length})</h2>
          {planSubjects.length > 0 && (
            <div className="lp-filters">
              <Link className={`lp-chip${!subject ? " lp-chip--active" : ""}`} href="/lesson-plans">All</Link>
              {planSubjects.map((s) => (
                <Link
                  key={s}
                  className={`lp-chip${subject === s ? " lp-chip--active" : ""}`}
                  href={`/lesson-plans?subject=${encodeURIComponent(s)}`}
                >
                  {s}
                </Link>
              ))}
            </div>
          )}
        </div>

        {plans.length ? (
          <div className="lp-group-list">
            {grouped.map((fg) => (
              <div className="lp-group" key={String(fg.form)}>
                <h3 className="lp-group-title">Form {fg.form}</h3>
                {fg.subjects.map((sg) => (
                  <div className="lp-subgroup" key={sg.subject}>
                    <h4 className="lp-group-subtitle">{sg.subject}</h4>
                    {sg.competencies.map((cg) => (
                      <details className="lp-competence" key={cg.competence}>
                        <summary className="lp-competence-label">
                          {cg.competence} <span className="lp-competence-count">({cg.plans.length})</span>
                        </summary>
                        <div className="lp-table-wrap">
                          <table className="lp-table">
                            <thead>
                              <tr>
                                <th>Subtopic</th><th>Lesson</th><th>Class</th>
                                {isMgmt && <th>Teacher</th>}
                                <th>Date</th><th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {cg.plans.map((p) => {
                                const st = one(p.lp_subtopics);
                                return (
                                  <tr key={p.id}>
                                    <td>{st?.name}</td>
                                    <td>{p.lesson_no}/{st?.periods}</td>
                                    <td>{p.class_label}</td>
                                    {isMgmt && <td>{p.teacher_name}</td>}
                                    <td>{p.lesson_date ?? "—"}</td>
                                    <td className="lp-table-action"><Link href={`/lesson-plans/${p.id}`}>Open</Link></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="lp-empty">
            {subject ? "No plans for this subject yet." : "No plans yet. Generate plans above."}
          </div>
        )}
      </section>
    </div>
  );
}
