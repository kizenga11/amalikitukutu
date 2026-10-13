/* eslint-disable @typescript-eslint/no-explicit-any */

// Hupanga lesson plans kwa: Form -> Somo -> Specific Competence.
export type PlanGroup = {
  form: number | string;
  subjects: {
    subject: string;
    competencies: { competence: string; plans: any[] }[];
  }[];
};

const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const formNum = (f: string) => (/^\d+$/.test(f) ? Number(f) : 999);

export function groupPlans(plans: any[]): PlanGroup[] {
  const byForm = new Map<string, Map<string, Map<string, any[]>>>();

  for (const p of plans) {
    const st = one(p.lp_subtopics);
    const sl = one(one(st?.lp_topics)?.lp_syllabi);
    const form = sl?.form_level != null ? String(sl.form_level) : "?";
    const subject = (sl?.subject_name as string) || "Unknown subject";
    const comp = (p.specific_competence as string) || "No specific competence";

    if (!byForm.has(form)) byForm.set(form, new Map());
    const bySubject = byForm.get(form)!;
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const byComp = bySubject.get(subject)!;
    if (!byComp.has(comp)) byComp.set(comp, []);
    byComp.get(comp)!.push(p);
  }

  return [...byForm.entries()]
    .sort((a, b) => formNum(a[0]) - formNum(b[0]) || a[0].localeCompare(b[0]))
    .map(([form, bySubject]) => ({
      form: /^\d+$/.test(form) ? Number(form) : form,
      subjects: [...bySubject.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([subject, byComp]) => ({
          subject,
          competencies: [...byComp.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([competence, list]) => ({
              competence,
              plans: [...list].sort(
                (a, b) => (Number(a.lesson_no) || 0) - (Number(b.lesson_no) || 0)
              ),
            })),
        })),
    }));
}
