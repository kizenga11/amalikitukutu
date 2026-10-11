import { getLpUser } from "@/lib/lp/auth";
import { lpDb } from "@/lib/lp/db";
import SeedForm from "./SeedForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function AdminPage() {
  const u = await getLpUser();
  if (!u || u.role !== "management") {
    return (
      <div className="lp-wrap">
        <div className="lp-empty">Ukurasa huu ni wa uongozi wa shule tu.</div>
      </div>
    );
  }

  const { data } = await lpDb()
    .from("lp_syllabi")
    .select("id, subject_name, form_level, source, lp_topics(id, total_periods)")
    .order("subject_name")
    .order("form_level");
  const rows = (data ?? []) as any[];

  const topicCount = rows.reduce((sum, s) => sum + (s.lp_topics?.length ?? 0), 0);
  const periodCount = rows.reduce(
    (sum, s) => sum + (s.lp_topics ?? []).reduce((a: number, t: any) => a + (t.total_periods ?? 0), 0),
    0
  );

  return (
    <div className="lp-wrap">
      <header className="lp-head">
        <div>
          <h1 className="page-title">Usimamizi wa Silabasi</h1>
          <p className="lp-sub">Seede silabasi (TIE) ili walimu waweze kutengeneza mipango ya somo kiotomatiki.</p>
        </div>
        <Link className="cm-btn cm-btn--ghost" href="/lesson-plans">Nenda kwa walimu</Link>
      </header>

      <div className="lp-stats">
        <div className="lp-stat"><span className="lp-stat-value">{rows.length}</span><span className="lp-stat-label">Silabasi</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{topicCount}</span><span className="lp-stat-label">Topics</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{periodCount}</span><span className="lp-stat-label">Vipindi</span></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Seed silabasi</h2>
            <p className="panel-sub">
              Kila mstari ni rekodi moja. Ukiseed tena, data husasishwa (haiwekwi mara mbili).
            </p>
          </div>
        </div>
        <div className="lp-format">
          <code>Somo|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods</code>
          <span>Nguzo za hiari baada ya Periods:</span>
          <code>MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References</code>
          <span>na zaidi (kiolezo cha hatua):</span>
          <code>intro_teaching|intro_learning|intro_assessment|develop_*|design_*|realise_*</code>
        </div>
        <SeedForm />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Silabasi zilizopo ({rows.length})</h2>
        </div>
        {rows.length ? (
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr><th>Somo</th><th>Form</th><th>Source</th><th>Topics</th><th>Vipindi</th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.subject_name}</td>
                    <td>{s.form_level}</td>
                    <td>{s.source}</td>
                    <td>{s.lp_topics.length}</td>
                    <td>{(s.lp_topics as any[]).reduce((a: number, t: any) => a + t.total_periods, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lp-empty">Hakuna silabasi bado. Bandika data hapo juu kuanza.</div>
        )}
      </section>
    </div>
  );
}
