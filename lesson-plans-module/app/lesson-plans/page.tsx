import Link from "next/link";
import { getLpUser } from "@/lib/lp/auth";
import { lpDb } from "@/lib/lp/db";
import Generator from "./Generator";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function LessonPlansPage() {
  const u = await getLpUser();
  if (!u) return <p style={{ padding: 24 }}>Tafadhali ingia kwanza.</p>;

  const db = lpDb();
  const { data: sy } = await db
    .from("lp_syllabi")
    .select("id, subject_name, form_level, source, lp_topics(id, seq, name, lp_subtopics(id, seq, name, periods))")
    .order("subject_name")
    .order("form_level");
  const syllabi = ((sy ?? []) as any[]).filter((s) => !u.subjects || u.subjects.includes(s.subject_name));

  const { data: pl } = await db
    .from("lp_plans")
    .select("id, lesson_no, class_label, lesson_date, lp_subtopics(name, periods, lp_topics(name, lp_syllabi(subject_name, form_level)))")
    .eq("teacher_id", u.id)
    .order("id", { ascending: false })
    .limit(300);
  const plans = (pl ?? []) as any[];

  const c = { border: "1px solid #ccc", padding: 6, textAlign: "left" } as const;
  const one = (x: any) => (Array.isArray(x) ? x[0] : x);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24, display: "grid", gap: 24 }}>
      <h1>Lesson Plans</h1>
      {u.role === "management" && <Link href="/lesson-plans/admin">Usimamizi wa silabasi (seed)</Link>}

      <section>
        <h2>Tengeneza mipango</h2>
        {syllabi.length ? <Generator syllabi={syllabi} /> : <p>Hakuna silabasi iliyoseedwa kwa masomo yako bado.</p>}
      </section>

      <section>
        <h2>Mipango yangu ({plans.length})</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={c}>Somo</th><th style={c}>Form</th><th style={c}>Subtopic</th>
              <th style={c}>Kipindi</th><th style={c}>Darasa</th><th style={c}></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const st = one(p.lp_subtopics);
              const sl = one(one(st?.lp_topics)?.lp_syllabi);
              return (
                <tr key={p.id}>
                  <td style={c}>{sl?.subject_name}</td>
                  <td style={c}>{sl?.form_level}</td>
                  <td style={c}>{st?.name}</td>
                  <td style={c}>{p.lesson_no}/{st?.periods}</td>
                  <td style={c}>{p.class_label}</td>
                  <td style={c}><Link href={`/lesson-plans/${p.id}`}>Fungua</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
