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
        <div className="lp-empty">This page is for school management only.</div>
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
          <h1 className="page-title">Syllabus Management</h1>
          <p className="lp-sub">Seed the (TIE) syllabus so teachers can generate lesson plans automatically.</p>
        </div>
        <Link className="cm-btn cm-btn--ghost" href="/lesson-plans">Go to teachers</Link>
      </header>

      <div className="lp-stats">
        <div className="lp-stat"><span className="lp-stat-value">{rows.length}</span><span className="lp-stat-label">Syllabi</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{topicCount}</span><span className="lp-stat-label">Topics</span></div>
        <div className="lp-stat"><span className="lp-stat-value">{periodCount}</span><span className="lp-stat-label">Periods</span></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Seed syllabus</h2>
            <p className="panel-sub">
              Each line is one record. Seeding again updates existing records (no duplicates).
            </p>
          </div>
        </div>
        <div className="lp-format">
          <code>Subject|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods</code>
          <span>Optional columns after Periods:</span>
          <code>MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References</code>
          <span>and more (stage template):</span>
          <code>intro_teaching|intro_learning|intro_assessment|develop_*|design_*|realise_*</code>
        </div>
        <SeedForm />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Existing syllabi ({rows.length})</h2>
        </div>
        {rows.length ? (
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr><th>Subject</th><th>Form</th><th>Source</th><th>Topics</th><th>Periods</th></tr>
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
          <div className="lp-empty">No syllabus yet. Paste data above to get started.</div>
        )}
      </section>
    </div>
  );
}
