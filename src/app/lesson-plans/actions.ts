"use server";

import { revalidatePath } from "next/cache";
import { lpDb } from "@/lib/lp/db";
import { getLpUser } from "@/lib/lp/auth";
import { buildStages, DEFAULT_LESSON_TIME, makeDateSequencer } from "@/lib/lp/generate";

type Msg = { ok: boolean; text: string };

// Safu za hiari za kiolezo cha hatua (nguzo 15-26 kwenye seed). Zikitolewa,
// hutumika kama maudhui ya hatua; zisipokuwepo, buildStages hutengeneza kiotomatiki.
const STAGE_FIELDS = [
  "intro_teaching", "intro_learning", "intro_assessment",
  "develop_teaching", "develop_learning", "develop_assessment",
  "design_teaching", "design_learning", "design_assessment",
  "realise_teaching", "realise_learning", "realise_assessment",
] as const;

/* ---------- MKUU: SEED SILABASI ---------- */
// Muundo wa mstari (pipe |):
// Somo|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods|MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References
// Nguzo 9-14 ni hiari. MainCompetence ya topic huchukuliwa kutoka mstari wa kwanza wa topic hiyo.
export async function seedSyllabus(_prev: unknown, fd: FormData): Promise<Msg> {
  const u = await getLpUser();
  if (!u || u.role !== "management") return { ok: false, text: "Huna ruhusa." };

  const lines = String(fd.get("data") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.toLowerCase().startsWith("somo|"));
  if (!lines.length) return { ok: false, text: "Hakuna data." };

  const db = lpDb();
  const syl = new Map<string, number>();
  const top = new Map<string, number>();
  const errors: string[] = [];
  const subRows: Record<string, unknown>[] = [];
  let sylTouched = 0;
  let topTouched = 0;

  for (const [i, line] of lines.entries()) {
    const c = line.split("|").map((s) => s.trim());
    const [subject, form, source, tSeq, tName, sSeq, sName, periods] = c;
    const f = Number(form), ts = Number(tSeq), ss = Number(sSeq), p = Number(periods);
    if (!subject || !tName || !sName || ![f, ts, ss, p].every(Number.isFinite) || f < 1 || f > 4 || p < 1) {
      errors.push(`Mstari ${i + 1} una kosa`);
      continue;
    }
    const src = (source || "TIE").toUpperCase();

    const sk = `${subject}|${f}|${src}`;
    if (!syl.has(sk)) {
      const { data, error } = await db
        .from("lp_syllabi")
        .upsert({ subject_name: subject, form_level: f, source: src }, { onConflict: "subject_name,form_level,source" })
        .select("id")
        .single();
      if (error || !data) { errors.push(`Mstari ${i + 1}: ${error?.message}`); continue; }
      syl.set(sk, data.id);
      sylTouched++;
    }
    const sid = syl.get(sk)!;

    const tk = `${sid}|${ts}`;
    if (!top.has(tk)) {
      const { data, error } = await db
        .from("lp_topics")
        .upsert({ syllabus_id: sid, seq: ts, name: tName, main_competence: c[8] || null }, { onConflict: "syllabus_id,seq" })
        .select("id")
        .single();
      if (error || !data) { errors.push(`Mstari ${i + 1}: ${error?.message}`); continue; }
      top.set(tk, data.id);
      topTouched++;
    }

    const stage: Record<string, string | null> = {};
    for (let k = 0; k < STAGE_FIELDS.length; k++) stage[STAGE_FIELDS[k]] = c[14 + k] || null;

    subRows.push({
      topic_id: top.get(tk)!, seq: ss, name: sName, periods: p,
      specific_competence: c[9] || null, main_activity: c[10] || null,
      specific_activity: c[11] || null, resources: c[12] || null, reference_books: c[13] || null,
      ...stage,
    });
  }

  if (subRows.length) {
    const { error } = await db.from("lp_subtopics").upsert(subRows, { onConflict: "topic_id,seq" });
    if (error) return { ok: false, text: `Imeshindwa kuhifadhi subtopics: ${error.message}` };
  }

  for (const tid of new Set(top.values())) {
    const { data } = await db.from("lp_subtopics").select("periods").eq("topic_id", tid);
    const sum = (data ?? []).reduce((a, r) => a + (r.periods as number), 0);
    await db.from("lp_topics").update({ total_periods: sum }).eq("id", tid);
  }

  revalidatePath("/lesson-plans");
  revalidatePath("/lesson-plans/admin");
  return {
    ok: errors.length === 0,
    text: `Somo ${sylTouched} • Topic ${topTouched} • Subtopic ${subRows.length} zimehifadhiwa.${errors.length ? " Makosa: " + errors.slice(0, 5).join("; ") : ""}`,
  };
}

/* ---------- MWALIMU: GENERATE ---------- */
export async function generatePlans(_prev: unknown, fd: FormData): Promise<Msg> {
  const u = await getLpUser();
  if (!u) return { ok: false, text: "Hujaingia." };

  const topicId = Number(fd.get("topic_id"));
  const subId = String(fd.get("subtopic_id") ?? "all");
  const cls = String(fd.get("class_label") ?? "").trim();
  if (!topicId || !cls) return { ok: false, text: "Chagua topic na andika darasa." };

  const db = lpDb();
  const { data: topic } = await db
    .from("lp_topics")
    .select("id, main_competence, lp_syllabi(subject_name, minutes_per_period)")
    .eq("id", topicId)
    .single();
  if (!topic) return { ok: false, text: "Topic haipo." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syl: any = Array.isArray(topic.lp_syllabi) ? topic.lp_syllabi[0] : topic.lp_syllabi;
  if (u.subjects && !u.subjects.includes(syl.subject_name)) {
    return { ok: false, text: "Somo hili hujapangiwa." };
  }

  let q = db.from("lp_subtopics").select("*").eq("topic_id", topicId).order("seq");
  if (subId !== "all") q = q.eq("id", Number(subId));
  const { data: subs } = await q;

  let created = 0;
  const nextDate = makeDateSequencer();
  for (const s of subs ?? []) {
    const { data: ex } = await db
      .from("lp_plans")
      .select("lesson_no")
      .eq("teacher_id", u.id)
      .eq("subtopic_id", s.id)
      .eq("class_label", cls);
    const have = new Set((ex ?? []).map((r) => r.lesson_no as number));

    for (let k = 1; k <= s.periods; k++) {
      if (have.has(k)) continue;
      const { data: plan, error } = await db
        .from("lp_plans")
        .insert({
          teacher_id: u.id, teacher_name: u.name, subtopic_id: s.id, class_label: cls, lesson_no: k,
          lesson_date: nextDate(),
          lesson_time: DEFAULT_LESSON_TIME,
          main_competence: topic.main_competence,
          specific_competence: s.specific_competence,
          main_activity: s.main_activity,
          specific_activity: s.specific_activity ?? s.name,
          resources: s.resources, reference_books: s.reference_books,
        })
        .select("id")
        .single();
      if (error || !plan) continue;
      const stages = buildStages(s, k, s.periods, syl.minutes_per_period ?? 40);
      await db.from("lp_plan_stages").insert(stages.map((x) => ({ plan_id: plan.id, ...x })));
      created++;
    }
  }

  revalidatePath("/lesson-plans");
  return {
    ok: true,
    text: created ? `Mipango ${created} imetengenezwa.` : "Mipango yote ya chaguo hili ipo tayari.",
  };
}

/* ---------- MWALIMU: HIFADHI MABADILIKO ---------- */
const PLAN_FIELDS = [
  "lesson_date", "lesson_time", "registered_girls", "registered_boys", "present_girls", "present_boys",
  "main_competence", "specific_competence", "main_activity", "specific_activity",
  "resources", "reference_books", "remarks",
];
const NUM = new Set(["registered_girls", "registered_boys", "present_girls", "present_boys"]);

export async function savePlan(
  id: number,
  data: {
    plan: Record<string, unknown>;
    stages: { id: number; minutes: number; teaching_activities: string | null; learning_activities: string | null; assessment_criteria: string | null }[];
  }
): Promise<Msg> {
  const u = await getLpUser();
  if (!u) return { ok: false, text: "Hujaingia." };
  const db = lpDb();

  const { data: row } = await db.from("lp_plans").select("teacher_id").eq("id", id).single();
  if (!row || row.teacher_id !== u.id) return { ok: false, text: "Huna ruhusa ya mpango huu." };

  const patch: Record<string, unknown> = {};
  for (const k of PLAN_FIELDS) {
    let v = data.plan[k];
    if (v === "" || v === undefined) v = null;
    if (v !== null && NUM.has(k)) v = Number(v);
    patch[k] = v;
  }
  const { error } = await db.from("lp_plans").update(patch).eq("id", id);
  if (error) return { ok: false, text: error.message };

  for (const s of data.stages) {
    await db
      .from("lp_plan_stages")
      .update({
        minutes: Number(s.minutes) || 0,
        teaching_activities: s.teaching_activities,
        learning_activities: s.learning_activities,
        assessment_criteria: s.assessment_criteria,
      })
      .eq("id", s.id)
      .eq("plan_id", id);
  }
  revalidatePath("/lesson-plans");
  return { ok: true, text: "Imehifadhiwa." };
}

/* ---------- MWALIMU / MKUU: FUTA MPANGO ---------- */
export async function deletePlan(id: number): Promise<Msg> {
  const u = await getLpUser();
  if (!u) return { ok: false, text: "Hujaingia." };
  const db = lpDb();

  const { data: row } = await db.from("lp_plans").select("teacher_id").eq("id", id).single();
  if (!row) return { ok: false, text: "Mpango haupo." };
  if (row.teacher_id !== u.id && u.role !== "management") return { ok: false, text: "Huna ruhusa." };

  const { error } = await db.from("lp_plans").delete().eq("id", id);
  if (error) return { ok: false, text: error.message };

  revalidatePath("/lesson-plans");
  return { ok: true, text: "Mpango umefutwa." };
}
