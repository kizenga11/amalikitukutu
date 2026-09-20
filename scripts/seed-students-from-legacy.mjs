import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function parseTuples(segment) {
  const tuples = [];
  let i = 0;
  const n = segment.length;
  while (i < n) {
    while (i < n && /\s/.test(segment[i])) i += 1;
    if (i >= n) break;
    if (segment[i] === ",") { i += 1; continue; }
    if (segment[i] !== "(") throw new Error(`Expected '(' at ${segment.slice(i, i + 60)}`);
    i += 1;
    let depth = 1, buf = "", inStr = false;
    const items = [];
    while (i < n && depth > 0) {
      const ch = segment[i];
      if (inStr) {
        if (ch === "\\") { buf += ch + (segment[i + 1] ?? ""); i += 2; continue; }
        if (ch === "'") { inStr = false; i += 1; continue; }
        buf += ch; i += 1; continue;
      }
      if (ch === "'") { inStr = true; buf += ch; i += 1; continue; }
      if (ch === "(") { depth += 1; buf += ch; i += 1; continue; }
      if (ch === ")") {
        depth -= 1;
        if (depth === 0) { items.push(buf); buf = ""; i += 1; break; }
        buf += ch; i += 1; continue;
      }
      if (ch === "," && depth === 1) { items.push(buf); buf = ""; i += 1; continue; }
      buf += ch; i += 1;
    }
    tuples.push(items.map(parseValue));
  }
  return tuples;
}

const parseValue = (raw) => {
  const v = raw.trim();
  if (!v) return null;
  if (/^null$/i.test(v)) return null;
  if (v.startsWith("'")) return v.slice(1, v.endsWith("'") ? -1 : v.length).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};

function extractRows(sql, tableName) {
  const re = new RegExp(`INSERT INTO \`${tableName}\`\\s*\\([^)]*\\)\\s*VALUES\\s*`, "g");
  const rows = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    const start = m.index + m[0].length;
    const end = sql.indexOf(";", start);
    rows.push(...parseTuples(sql.slice(start, end === -1 ? sql.length : end)));
  }
  return rows;
}

const sql = readFileSync(new URL("../db_ya_zamani.sql", import.meta.url), "utf8");

const oldSubjects = extractRows(sql, "subjects").map((r) => ({
  id: r[0], name: String(r[1] ?? "").trim(),
}));

const oldStudents = extractRows(sql, "students").map((r) => ({
  id: r[0], reg: r[1], active: r[2], first: String(r[3] ?? "").trim(), second: r[4] ?? null,
  last: String(r[5] ?? "").trim(), sex: String(r[6] ?? "").trim(),
  form: String(r[7] ?? "").trim(), stream: String(r[8] ?? "").trim(), parentPhone: r[9] ? String(r[9]) : null,
}));

const oldStudentSubjects = extractRows(sql, "student_subjects").map((r) => ({
  student_id: r[1], subject_id: r[2],
}));

const RENAMES = {
  math: "mathematics",
  bstudies: "bussinesstudies",
  computerapplicationwithcad: "computerapplication",
  electricalinstallation: "electrialinstallation",
  electronicsrepair: null,
};

const { data: newSubjects, error: subjErr } = await supabase.from("subjects").select("id, code, name").order("code");
if (subjErr) throw subjErr;
const newByNorm = new Map((newSubjects ?? []).map((s) => [normalize(s.name), s]));

const oldIdToNew = new Map();
const usedSubjectIds = new Set(oldStudentSubjects.map((x) => x.subject_id));
const subjFailed = [];
for (const oldS of oldSubjects) {
  const norm = normalize(oldS.name);
  const target = Object.prototype.hasOwnProperty.call(RENAMES, norm) ? RENAMES[norm] : norm;
  const hit = target != null ? newByNorm.get(target) : null;
  if (hit) oldIdToNew.set(oldS.id, hit);
  else if (usedSubjectIds.has(oldS.id)) subjFailed.push(`  old subject id ${oldS.id} "${oldS.name}"`);
}
if (subjFailed.length) {
  console.error("\nABORT on unmapped used subjects:");
  console.error(subjFailed.join("\n"));
  process.exit(1);
}

console.log("Parsed legacy SQL -> students:", oldStudents.length, " student_subjects:", oldStudentSubjects.length);
console.log("\nVerified subject NAME mapping (old id -> new):");
for (const [oldId, s] of oldIdToNew) {
  if (!usedSubjectIds.has(oldId)) continue;
  const flag = [...oldSubjects].find((x) => x.id === oldId).name.toLowerCase() === s.name.toLowerCase() ? "exact" : "mapped";
  console.log(`  [${oldId}] -> ${s.code} "${s.name}" [${flag}]`);
}

const FORM_LEVEL = { formone: 1, formtwo: 2, formthree: 3, formfour: 4, formi: 1, formii: 2, formiii: 3, formiv: 4 };

const { data: classes } = await supabase.from("school_classes").select("id, name, form_level");
const { data: streams } = await supabase.from("streams").select("id, class_id, name");
const { data: existingStudents } = await supabase.from("students").select("id");

const classByLevel = new Map((classes ?? []).map((c) => [c.form_level, c]));
const streamKey = (cid, name) => `${cid}|${normalize(name)}`;
const streamByKey = new Map((streams ?? []).map((s) => [streamKey(s.class_id, s.name), s]));

function resolveClass(formLevel, streamName) {
  const cls = classByLevel.get(formLevel);
  if (!cls) throw new Error(`No class for level ${formLevel}`);
  const str = streamByKey.get(streamKey(cls.id, streamName));
  if (!str) throw new Error(`No stream "${streamName}" for "${cls.name}"`);
  return { cls, str };
}

const students = oldStudents
  .filter((s) => s.active === 1)
  .map((s) => {
    const level = FORM_LEVEL[normalize(s.form)];
    if (!level) throw new Error(`Unknown form "${s.form}"`);
    const { cls, str } = resolveClass(level, s.stream);
    const subjects = oldStudentSubjects
      .filter((x) => x.student_id === s.id)
      .map((x) => oldIdToNew.get(x.subject_id))
      .filter(Boolean);
    const dupe = new Set();
    return { s, cls: cls.id, str: str.id, subjects: subjects.filter((sub) => (dupe.has(sub.id) ? false : dupe.add(sub.id)) ) };
  });

const inactiveSkipped = oldStudents.filter((s) => s.active !== 1);
const orphans = oldStudentSubjects.filter((x) => !oldStudents.some((s) => s.id === x.student_id));

console.log(`\nPLAN [${APPLY ? "APPLY" : "DRY RUN - no writes"}]:`);
console.log(`  delete existing students in new DB (demo from seed-dashboard): ${existingStudents?.length ?? 0}`);
console.log(`  seed active students: ${students.length}  (inactive skipped: ${inactiveSkipped.length})`);
console.log(`  student_subjects to insert: ${students.reduce((a, p) => a + p.subjects.length, 0)}  (orphan rows: ${orphans.length})`);
for (const p of students) {
  const full = [p.s.first, p.s.second, p.s.last].filter(Boolean).join(" ").trim();
  console.log(`  INSERT ${full} | ${p.s.sex} | Form ${FORM_LEVEL[normalize(p.s.form)]}/${p.s.stream} | ${p.s.parentPhone ?? "-"} | subjects=${p.subjects.length} (${p.subjects.map((x) => x.code).join(",")})`);
}

if (!APPLY) {
  console.log("\nNo writes. Re-run with --apply to seed.");
  process.exit(0);
}

let { count: priorMarks } = await supabase.from("exam_marks").select("id", { count: "exact", head: true });
priorMarks = priorMarks ?? 0;

console.log("\nAPPLYING...");
if ((existingStudents ?? []).length) {
  const { error: delErr } = await supabase.from("students").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw delErr;
  console.log(`  deleted ${existingStudents.length} demo students (cascaded ${priorMarks} demo exam marks, if any)`);
}

const insertedStudentIds = new Map();
for (let i = 0; i < students.length; i += 200) {
  const chunk = students.slice(i, i + 200).map((p) => ({
    first_name: p.s.first,
    middle_name: p.s.second,
    last_name: p.s.last,
    gender: p.s.sex,
    phone: p.s.parentPhone,
    class_id: p.cls,
    stream_id: p.str,
  }));
  const { data: ins, error } = await supabase.from("students").insert(chunk).select("id");
  if (error) throw error;
  for (let k = 0; k < ins.length; k++) insertedStudentIds.set(students[i + k].s.id, ins[k].id);
}
console.log(`  inserted ${students.length} students`);

const subjectRows = [];
for (const p of students) {
  const newId = insertedStudentIds.get(p.s.id);
  if (!newId) throw new Error(`No new id for old student ${p.s.id}`);
  for (const sub of p.subjects) subjectRows.push({ student_id: newId, subject_id: sub.id });
}
for (let i = 0; i < subjectRows.length; i += 500) {
  const { error: insErr } = await supabase.from("student_subjects").upsert(subjectRows.slice(i, i + 500), { onConflict: "student_id,subject_id" });
  if (insErr) throw insErr;
}
console.log(`  inserted ${subjectRows.length} student_subjects`);

console.log("\nDONE.");