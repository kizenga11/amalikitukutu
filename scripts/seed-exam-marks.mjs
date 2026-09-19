import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function scoreFor(key, maximum) {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) % 1000003;
  return Math.max(0, Math.min(maximum, 35 + (hash % (maximum - 34))));
}

async function fetchAll(query, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

const { data: exam, error: examError } = await supabase
  .from("exams")
  .select("id, name, status")
  .eq("status", "active")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (examError) throw examError;
if (!exam) throw new Error("No active exam found.");

const { data: links, error: linksError } = await supabase
  .from("exam_class_subjects")
  .select("exam_id, class_id, subject_id, subject:subjects(id, has_practical, stream)")
  .eq("exam_id", exam.id);
if (linksError) throw linksError;

const classIds = [...new Set((links ?? []).map((link) => link.class_id))];
const students = classIds.length
  ? await fetchAll(supabase.from("students").select("id, class_id, stream_id, stream:streams(name)").in("class_id", classIds))
  : [];
const studentIds = students.map((student) => student.id);
const memberships = studentIds.length
  ? await fetchAll(supabase.from("student_subjects").select("student_id, subject_id").in("student_id", studentIds))
  : [];
const membershipSet = new Set(memberships.map((row) => `${row.student_id}|${row.subject_id}`));

const rows = [];
for (const link of links ?? []) {
  const subject = Array.isArray(link.subject) ? link.subject[0] : link.subject;
  if (!subject) continue;
  for (const student of students) {
    if (student.class_id !== link.class_id) continue;
    const stream = Array.isArray(student.stream) ? student.stream[0] : student.stream;
    if (subject.stream !== "Both" && subject.stream !== stream?.name) continue;
    if (!membershipSet.has(`${student.id}|${link.subject_id}`)) continue;
    rows.push({
      exam_id: exam.id,
      class_id: student.class_id,
      stream_id: student.stream_id,
      subject_id: link.subject_id,
      student_id: student.id,
      theory_score: scoreFor(`${student.id}|${link.subject_id}|theory`, subject.has_practical ? 50 : 100),
      practical_score: subject.has_practical
        ? scoreFor(`${student.id}|${link.subject_id}|practical`, 50)
        : null,
      is_absent: false,
    });
  }
}

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await supabase
    .from("exam_marks")
    .upsert(rows.slice(i, i + 500), { onConflict: "exam_id,class_id,subject_id,student_id" });
  if (error) throw error;
}

console.log(`Seeded ${rows.length} valid marks for active exam "${exam.name}".`);
