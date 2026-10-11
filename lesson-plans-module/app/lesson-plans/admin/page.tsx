import { getLpUser } from "@/lib/lp/auth";
import { lpDb } from "@/lib/lp/db";
import SeedForm from "./SeedForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const u = await getLpUser();
  if (!u || u.role !== "management") {
    return <p style={{ padding: 24 }}>Ukurasa huu ni wa uongozi wa shule tu.</p>;
  }

  const { data } = await lpDb()
    .from("lp_syllabi")
    .select("id, subject_name, form_level, source, lp_topics(id, total_periods)")
    .order("subject_name")
    .order("form_level");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  const th = { border: "1px solid #ccc", padding: 6, textAlign: "left" } as const;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24, display: "grid", gap: 20 }}>
      <h1>Lesson Plans: Usimamizi wa Silabasi</h1>
      <Link href="/lesson-plans">Nenda kwenye ukurasa wa waalimu</Link>

      <section>
        <h2>Seed silabasi</h2>
        <p style={{ fontSize: 14 }}>
          Kila mstari: <code>Somo|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods</code> (nguzo hiari baada ya
          Periods: <code>MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References</code>).
          Weka somo moja na form moja kwa wakati. Ukiseed tena, data inasasishwa (haiongezwi mara mbili).
        </p>
        <SeedForm />
      </section>

      <section>
        <h2>Silabasi zilizopo</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr><th style={th}>Somo</th><th style={th}>Form</th><th style={th}>Source</th><th style={th}>Topics</th><th style={th}>Vipindi</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td style={th}>{s.subject_name}</td>
                <td style={th}>{s.form_level}</td>
                <td style={th}>{s.source}</td>
                <td style={th}>{s.lp_topics.length}</td>
                <td style={th}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {s.lp_topics.reduce((a: number, t: any) => a + t.total_periods, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
