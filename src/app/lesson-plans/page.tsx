import Link from "next/link";
import { getLpUser } from "@/lib/lp/auth";
import { lpDb } from "@/lib/lp/db";
import Generator from "./Generator";

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
        <div className="lp-empty">Tafadhali ingia kwanza ili kuona mipango ya masomo.</div>
      </div>
    );
  }

  const db = lpDb();
  const { data: sy } = await db
    .from("lp_syllabi")
    .select("id, subject_name, form_level, source, lp_topics(id, seq, name, lp_subtopics(id, seq, name, periods))")
    .order("subject_name")
    .order("form_level");
  const allSyllabi = (sy ?? []) as any[];
  const syllabi = allSyllabi.filter((s) => !u.subjects || u.subjects.includes(s.subject_name));

  let planQuery = db
    .from("lp_plans")
    .select("id, lesson_no, class_label, lesson_date, teacher_name, lp_subtopics(name, periods, lp_topics(name, lp_syllabi(subject_name, form_level)))");
  if (u.role !== "management") planQuery = planQuery.eq("teacher_id", u.id);
  const { data: pl } = await planQuery.order("id", { ascending: false }).limit(500);
  const base = (pl ?? []) as any[];

  const one = (x: any) => (Array.isArray(x) ? x[0] : x);
  const subjectOf = (p: any) => one(one(one(p.lp_subtopics)?.lp_topics)?.lp_syllabi)?.subject_name as string | undefined;

  const planSubjects = [...new Set(base.map(subjectOf).filter(Boolean))].sort() as string[];
  const plans = subject ? base.filter((p) => subjectOf(p) === subject) : base;

  const topicCount = syllabi.reduce((sum, s) => sum + (s.lp_topics?.length ?? 0), 0);
  const isMgmt = u.role === "management";

  return (
    <div className="lp-wrap">
      <header className="lp-head">
        <div>
          <h1 className="page-title">Lesson Plans</h1>
          <p className="lp-sub">
            Tengeneza na chapisha mipango ya somo kwa muundo wa TIE. {isMgmt ? "Unaona mipango ya walimu wote." : "Unaona mipango yako tu."}
          </p>
        </div>
        {isMgmt && (
          <Link className="cm-btn cm-btn--ghost" href="/lesson-plans/admin">Usimamizi wa silabasi</Link>
        )}
      </header>

      <div className="lp-stats">
        <div className="lp-stat"><span className="lp-stat-value">{syllabi.length}</span><span className="lp-stat-label">Silabasi</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{topicCount}</span><span className="lp-stat-label">Topics</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{base.length}</span><span className="lp-stat-label">{isMgmt ? "Mipango yote" : "Mipango yangu"}</span></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Tengeneza mipango</h2>
            <p className="panel-sub">Chagua Somo → Topic → Subtopic, andika darasa; mfumo hutengeneza mipango, hatua na muda kiotomatiki.</p>
          </div>
        </div>
        {syllabi.length ? (
          <Generator syllabi={syllabi} />
        ) : (
          <div className="lp-empty">
            Hakuna silabasi iliyoseedwa kwa masomo yako bado.
            {isMgmt && <> Nenda <Link href="/lesson-plans/admin">Usimamizi wa silabasi</Link> kuweka data.</>}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">{isMgmt ? "Mipango yote" : "Mipango yangu"} ({plans.length})</h2>
          {planSubjects.length > 0 && (
            <div className="lp-filters">
              <Link className={`lp-chip${!subject ? " lp-chip--active" : ""}`} href="/lesson-plans">Zote</Link>
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
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr>
                  <th>Somo</th><th>Form</th><th>Subtopic</th><th>Kipindi</th><th>Darasa</th>
                  {isMgmt && <th>Mwalimu</th>}
                  <th>Tarehe</th><th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
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
                      <td className="lp-table-action"><Link href={`/lesson-plans/${p.id}`}>Fungua</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lp-empty">
            {subject ? "Hakuna mipango ya somo hili bado." : "Hakuna mipango bado. Tengeneza mipango hapo juu."}
          </div>
        )}
      </section>
    </div>
  );
}
