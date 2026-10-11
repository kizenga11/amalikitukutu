import { notFound } from "next/navigation";
import { getLpUser, SCHOOL_NAME } from "@/lib/lp/auth";
import { lpDb } from "@/lib/lp/db";
import { STAGES } from "@/lib/lp/generate";
import PlanEditor from "./PlanEditor";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getLpUser();
  if (!u) {
    return <div className="lp-wrap"><div className="lp-empty">Tafadhali ingia kwanza.</div></div>;
  }

  const db = lpDb();
  const { data: row } = await db
    .from("lp_plans")
    .select("*, lp_subtopics(name, periods, lp_topics(name, lp_syllabi(subject_name, form_level)))")
    .eq("id", Number(id))
    .single();
  if (!row) notFound();

  const isOwner = row.teacher_id === u.id;
  if (!isOwner && u.role !== "management") {
    return <div className="lp-wrap"><div className="lp-empty">Huna ruhusa kuona mpango huu.</div></div>;
  }

  const { data: stages } = await db.from("lp_plan_stages").select("*").eq("plan_id", row.id);
  const sorted = [...(stages ?? [])].sort(
    (a: any, b: any) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)
  );

  const one = (x: any) => (Array.isArray(x) ? x[0] : x);
  const { lp_subtopics, ...plan } = row as any;
  const sub = one(lp_subtopics);
  const topic = one(sub?.lp_topics);
  const syl = one(topic?.lp_syllabi);

  return (
    <PlanEditor
      plan={plan}
      stages={sorted as any}
      canEdit={isOwner}
      canDelete={isOwner || u.role === "management"}
      meta={{
        school: SCHOOL_NAME,
        teacher: plan.teacher_name,
        form: syl?.form_level,
        subject: syl?.subject_name,
        topic: topic?.name,
        subtopic: sub?.name,
        lessonNo: plan.lesson_no,
        periods: sub?.periods,
      }}
    />
  );
}
