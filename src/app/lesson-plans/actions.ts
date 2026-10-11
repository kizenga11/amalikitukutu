"use server";

import { revalidatePath } from "next/cache";
import { lpDb } from "@/lib/lp/db";
import { getLpUser, SCHOOL_NAME } from "@/lib/lp/auth";
import { buildStages, DEFAULT_LESSON_TIME, makeDateSequencer, STAGES } from "@/lib/lp/generate";

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
  const u = await getLpUser(String(fd.get("access_token") ?? "") || undefined);
  if (!u || u.role !== "management") return { ok: false, text: "You do not have permission." };

  const lines = String(fd.get("data") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.toLowerCase().startsWith("somo|"));
  if (!lines.length) return { ok: false, text: "No data." };

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
      errors.push(`Line ${i + 1} has an error`);
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
      if (error || !data) { errors.push(`Line ${i + 1}: ${error?.message}`); continue; }
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
      if (error || !data) { errors.push(`Line ${i + 1}: ${error?.message}`); continue; }
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
    if (error) return { ok: false, text: `Failed to save subtopics: ${error.message}` };
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
    text: `${sylTouched} subject(s) • ${topTouched} topic(s) • ${subRows.length} subtopic(s) saved.${errors.length ? " Errors: " + errors.slice(0, 5).join("; ") : ""}`,
  };
}

/* ---------- MWALIMU: GENERATE ---------- */
export async function generatePlans(_prev: unknown, fd: FormData): Promise<Msg> {
  const u = await getLpUser(String(fd.get("access_token") ?? "") || undefined);
  if (!u) return { ok: false, text: "You are not signed in." };

  const topicId = Number(fd.get("topic_id"));
  const subId = String(fd.get("subtopic_id") ?? "all");
  const comp = String(fd.get("specific_competence") ?? "").trim();
  const cls = String(fd.get("class_label") ?? "").trim();
  if (!topicId || !cls) return { ok: false, text: "Select a topic and enter a class." };

  const db = lpDb();
  const { data: topic } = await db
    .from("lp_topics")
    .select("id, main_competence, lp_syllabi(subject_name, minutes_per_period)")
    .eq("id", topicId)
    .single();
  if (!topic) return { ok: false, text: "Topic not found." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syl: any = Array.isArray(topic.lp_syllabi) ? topic.lp_syllabi[0] : topic.lp_syllabi;
  if (u.subjects && !u.subjects.includes(syl.subject_name)) {
    return { ok: false, text: "This subject is not assigned to you." };
  }

  // Generate by Specific Competency (all its subtopics) when chosen, else by subtopic.
  let q = db.from("lp_subtopics").select("*").eq("topic_id", topicId).order("seq");
  if (comp) q = q.eq("specific_competence", comp);
  else if (subId !== "all") q = q.eq("id", Number(subId));
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
    text: created ? `${created} plan(s) created.` : "All plans for this selection already exist.",
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
  },
  accessToken?: string
): Promise<Msg> {
  const u = await getLpUser(accessToken);
  if (!u) return { ok: false, text: "You are not signed in." };
  const db = lpDb();

  const { data: row } = await db.from("lp_plans").select("teacher_id").eq("id", id).single();
  if (!row || row.teacher_id !== u.id) return { ok: false, text: "You do not have permission for this plan." };

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
  return { ok: true, text: "Saved." };
}

/* ---------- MWALIMU / MKUU: FUTA MPANGO ---------- */
export async function deletePlan(id: number, accessToken?: string): Promise<Msg> {
  const u = await getLpUser(accessToken);
  if (!u) return { ok: false, text: "You are not signed in." };
  const db = lpDb();

  const { data: row } = await db.from("lp_plans").select("teacher_id").eq("id", id).single();
  if (!row) return { ok: false, text: "Plan not found." };
  if (row.teacher_id !== u.id && u.role !== "management") return { ok: false, text: "You do not have permission." };

  const { error } = await db.from("lp_plans").delete().eq("id", id);
  if (error) return { ok: false, text: error.message };

  revalidatePath("/lesson-plans");
  return { ok: true, text: "Plan deleted." };
}

/* ---------- MWALIMU / MKUU: FUTA MIPANGO YOTE ---------- */
type DeleteAllResult = { ok: true; deleted: number } | { ok: false; text: string };

export async function deleteAllPlans(accessToken: string): Promise<DeleteAllResult> {
  const u = await getLpUser(accessToken);
  if (!u) return { ok: false, text: "You are not signed in." };
  const db = lpDb();

  // Management deletes all plans; a teacher deletes only their own.
  let query = db.from("lp_plans").delete({ count: "exact" });
  query = u.role === "management" ? query.gte("id", 0) : query.eq("teacher_id", u.id);

  const { error, count } = await query;
  if (error) return { ok: false, text: error.message };

  revalidatePath("/lesson-plans");
  return { ok: true, deleted: count ?? 0 };
}

/* ---------- DWASHIBODI: TAZAMA MUHTASARI ---------- */
type Overview =
  | {
      ok: true;
      syllabi: any[];
      plans: any[];
      subjects: string[] | null;
      role: "management" | "teacher";
      userName: string;
    }
  | { ok: false; text: string };

export async function getLpOverview(accessToken: string): Promise<Overview> {
  const u = await getLpUser(accessToken);
  if (!u) return { ok: false, text: "You are not signed in." };

  const db = lpDb();
  const { data: sy } = await db
    .from("lp_syllabi")
    .select("id, subject_name, form_level, source, lp_topics(id, seq, name, total_periods, lp_subtopics(id, seq, name, periods))")
    .order("subject_name")
    .order("form_level");
  const allSyllabi = (sy ?? []) as any[];
  const syllabi = allSyllabi.filter((s) => !u.subjects || u.subjects.includes(s.subject_name as string));

  let planQuery = db
    .from("lp_plans")
    .select("id, lesson_no, class_label, lesson_date, teacher_name, lp_subtopics(name, periods, lp_topics(name, lp_syllabi(subject_name, form_level)))");
  if (u.role !== "management") planQuery = planQuery.eq("teacher_id", u.id);
  const { data: pl } = await planQuery.order("id", { ascending: false }).limit(500);

  return {
    ok: true,
    syllabi,
    plans: (pl ?? []) as any[],
    subjects: u.subjects,
    role: u.role,
    userName: u.name,
  };
}

/* ---------- DWASHIBODI: FUNGUA MPANGO ---------- */
type PlanDetail =
  | {
      ok: true;
      plan: any;
      stages: any[];
      canEdit: boolean;
      canDelete: boolean;
      meta: { school: string; teacher: string; form: number; subject: string; topic: string; subtopic: string; lessonNo: number; periods: number };
    }
  | { ok: false; text: string };

export async function getPlanDetail(accessToken: string, id: number): Promise<PlanDetail> {
  const u = await getLpUser(accessToken);
  if (!u) return { ok: false, text: "You are not signed in." };

  const db = lpDb();
  const { data: row } = await db
    .from("lp_plans")
    .select("*, lp_subtopics(name, periods, lp_topics(name, lp_syllabi(subject_name, form_level)))")
    .eq("id", id)
    .single();
  if (!row) return { ok: false, text: "Plan not found." };

  const isOwner = row.teacher_id === u.id;
  if (!isOwner && u.role !== "management") return { ok: false, text: "You do not have permission to view this plan." };

  const { data: stages } = await db.from("lp_plan_stages").select("*").eq("plan_id", row.id);
  const sorted = [...(stages ?? [])].sort((a: any, b: any) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));

  const one = (x: any) => (Array.isArray(x) ? x[0] : x);
  const { lp_subtopics, ...plan } = row as any;
  const sub = one(lp_subtopics);
  const topic = one(sub?.lp_topics);
  const syl = one(topic?.lp_syllabi);

  return {
    ok: true,
    plan,
    stages: sorted as any[],
    canEdit: isOwner,
    canDelete: isOwner || u.role === "management",
    meta: {
      school: SCHOOL_NAME,
      teacher: plan.teacher_name,
      form: syl?.form_level,
      subject: syl?.subject_name,
      topic: topic?.name,
      subtopic: sub?.name,
      lessonNo: plan.lesson_no,
      periods: sub?.periods,
    },
  };
}
