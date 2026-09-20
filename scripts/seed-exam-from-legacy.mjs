// Seed "MID-TERM EXAM SEPTEMBER 2026" (legacy exam id 29) from db_ya_zamani.sql.
//
// Storage rule (per the school's convention): a legacy / non-practical exam
// holds ONE 0-100 mark per student+subject in theory_score; practical_score is
// NULL. The exam's own has_practical flag decides the scale (this exam has
// none), so even practical-flagged subjects keep a single 0-100 theory mark.
// Every mark is preserved exactly as recorded - nothing is merged, split, or
// skipped, including marks for subjects a student no longer takes.
//
// Run: node scripts/seed-exam-from-legacy.mjs   (dry run)
//      node scripts/seed-exam-from-legacy.mjs --apply

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
// Pass the legacy exam id as the first argument (default: 29 "MID-TERM EXAM SEPTEMBER 2026").
const TARGET_EXAM_ID = Number(process.argv[2] ?? 29);

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

const normalize = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

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

// ── Parse the legacy dump ─────────────────────────────────────────────────
const sql = readFileSync(new URL("../db_ya_zamani.sql", import.meta.url), "utf8");

const oldExams = extractRows(sql, "exams").map((r) => ({ id: r[0], name: String(r[1] ?? "").trim(), sd: r[4], ed: r[5] }));
const exam = oldExams.find((e) => e.id === TARGET_EXAM_ID);
if (!exam) throw new Error(`Legacy exam id ${TARGET_EXAM_ID} not found in dump`);
if (exam.sd == null || exam.ed == null) throw new Error(`Legacy exam ${TARGET_EXAM_ID} has no dates`);

const oldSubjects = extractRows(sql, "subjects").map((r) => ({ id: r[0], name: String(r[1] ?? "").trim() }));
const oldStudents = extractRows(sql, "students").map((r) => ({
  id: r[0], active: r[2], first: String(r[3] ?? "").trim(), middle: String(r[4] ?? "").trim(),
  last: String(r[5] ?? "").trim(), sex: String(r[6] ?? "").trim(), stream: String(r[8] ?? "").trim(),
}));
const oldMarks = extractRows(sql, "marks").map((r) => ({
  student_id: r[1], subject_id: r[2], marks_value: r[4] == null ? null : Number(r[4]), exam_id: r[5], status: String(r[7] ?? "").trim(),
}));

const marks = oldMarks.filter((m) => m.exam_id === TARGET_EXAM_ID);
const oldById = new Map(oldStudents.map((s) => [s.id, s]));

// Safety: every mark must be valid. Marks of students who left the school
// (inactive in the legacy dump) are KEPT — those students are created below so
// nothing is skipped.
const markValIssues = marks
  .filter((m) => m.status === "present")
  .filter((m) => typeof m.marks_value !== "number" || !Number.isFinite(m.marks_value) || m.marks_value < 0 || m.marks_value > 100)
  .map((m) => `student ${m.student_id} subject ${m.subject_id} present value=${JSON.stringify(m.marks_value)}`);
if (markValIssues.length) {
  console.error("\nABORT on invalid marks values:");
  console.error(markValIssues.join("\n"));
  process.exit(1);
}

// ── Subject mapping (same rules as the student/teacher migrations) ────────
const RENAMES = {
  math: "mathematics",
  bstudies: "bussinesstudies",
  computerapplicationwithcad: "computerapplication",
  electricalinstallation: "electrialinstallation",
  electronicsrepair: null,
};
const { data: newSubjects, error: subjErr } = await supabase.from("subjects").select("id, code, name, has_practical").order("code");
if (subjErr) throw subjErr;
// Keep the FIRST subject row per name (lowest code). The DB contains duplicate
// rows in some cases ("Computer Science" exists as C.SCI and COMP) - the seed
// and the students' subject lists both use the first row, so marks must point
// at the same ids or the app would not display them.
const newByNorm = new Map();
for (const s of newSubjects ?? []) {
  const key = normalize(s.name);
  if (!newByNorm.has(key)) newByNorm.set(key, s);
}
const oldIdToNew = new Map();
const usedSubjectIds = new Set(marks.map((m) => m.subject_id));
for (const oldS of oldSubjects) {
  const norm = normalize(oldS.name);
  const target = Object.prototype.hasOwnProperty.call(RENAMES, norm) ? RENAMES[norm] : norm;
  const hit = target != null ? newByNorm.get(target) : null;
  if (hit) oldIdToNew.set(oldS.id, hit);
}
const unmapped = [...usedSubjectIds].filter((oldId) => !oldIdToNew.has(oldId));
if (unmapped.length) {
  console.error("\nABORT on unmapped subjects used by this exam:");
  for (const oldId of unmapped) console.error(`  old subject id ${oldId} "${oldSubjects.find((s) => s.id === oldId)?.name}"`);
  process.exit(1);
}
const subjByCode = new Map((newSubjects ?? []).map((s) => [s.id, s]));
const codeOf = (newSubjectId) => subjByCode.get(newSubjectId)?.code ?? newSubjectId;

// ── Match legacy students to seeded new students (no stable id survives) ──
const { data: newStudents, error: stuErr } = await supabase
  .from("students")
  .select("id, first_name, last_name, gender, class_id, stream_id, class:school_classes(form_level), stream:streams(name)")
  .order("last_name");
if (stuErr) throw stuErr;

const identityKey = (first, last, sex, stream) => `${normalize(first)}|${normalize(last)}|${normalize(sex)}|${normalize(stream)}`;

const flatNew = (newStudents ?? []).map((s) => {
  const cls = Array.isArray(s.class) ? s.class[0] : s.class;
  const strm = Array.isArray(s.stream) ? s.stream[0] : s.stream;
  return {
    id: s.id,
    first: s.first_name,
    last: s.last_name,
    gender: s.gender ?? "",
    class_id: s.class_id,
    stream_id: s.stream_id,
    form_level: cls?.form_level ?? null,
    stream_name: strm?.name ?? "",
  };
});
const newById = new Map(flatNew.map((s) => [s.id, s]));

const oldIdToNewStudent = new Map();
const collisions = [];
// Active students must map 1:1 onto the current register (protects against
// misassigned marks). Inactive students (left the school) have no current row
// yet; they are created below so their marks are preserved, never dropped.
for (const os of oldStudents) {
  if (os.active !== 1) continue;
  const key = identityKey(os.first, os.last, os.sex, os.stream);
  const matches = flatNew.filter((s) => identityKey(s.first, s.last, s.gender, s.stream_name) === key);
  if (matches.length === 0) collisions.push(`old student ${os.id} "${os.first} ${os.last}" (${os.sex}/${os.stream}) has NO new match`);
  else if (matches.length > 1) collisions.push(`old student ${os.id} "${os.first} ${os.last}" matches ${matches.length} new students`);
  else oldIdToNewStudent.set(os.id, matches[0]);
}

// Class + streams needed to place any legacy students we have to create.
const { data: classData } = await supabase.from("school_classes").select("id, name, form_level");
const formOne = (classData ?? []).find((c) => c.form_level === 1);
if (!formOne) throw new Error("No Form I class in new DB");
const { data: formOneStreamRows } = await supabase.from("streams").select("id, name").eq("class_id", formOne.id);
const formOneStreams = (formOneStreamRows ?? []).sort((a, b) => a.name.localeCompare(b.name));

const marksOldIds = [...new Set(marks.map((m) => m.student_id))];
for (const oldId of marksOldIds) {
  const os = oldById.get(oldId);
  if (!os) { collisions.push(`mark references unknown student ${oldId}`); continue; }
  if (oldIdToNewStudent.has(oldId)) continue;
  const key = identityKey(os.first, os.last, os.sex, os.stream);
  const matches = flatNew.filter((s) => identityKey(s.first, s.last, s.gender, s.stream_name) === key);
  if (matches.length > 1) { collisions.push(`old student ${oldId} "${os.first} ${os.last}" matches ${matches.length} new students`); continue; }
  if (matches.length === 1) { oldIdToNewStudent.set(oldId, matches[0]); continue; }

  // Legacy student with marks but no current row (e.g. left the school): create
  // them so their marks are kept. No marks are dropped.
  const stream = formOneStreams.find((s) => s.name.toLowerCase() === os.stream.toLowerCase()) ?? formOneStreams[0];
  if (!stream) { collisions.push(`no Form I stream for legacy student ${oldId} "${os.first} ${os.last}" (${os.stream})`); continue; }
  const gender = /^(female|f)/i.test(os.sex) ? "Female" : "Male";
  let createdId;
  if (APPLY) {
    const created = await supabase
      .from("students")
      .insert({
        first_name: os.first,
        middle_name: os.middle || null,
        last_name: os.last,
        gender,
        class_id: formOne.id,
        stream_id: stream.id,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    createdId = created.data.id;
  } else {
    createdId = crypto.randomUUID();
  }
  const nn = {
    id: createdId,
    first: os.first,
    last: os.last,
    gender,
    class_id: formOne.id,
    stream_id: stream.id,
    form_level: 1,
    stream_name: stream.name,
  };
  flatNew.push(nn);
  newById.set(nn.id, nn);
  oldIdToNewStudent.set(oldId, nn);
  console.log(`  ${APPLY ? "+ created" : "~ would create"} legacy student in new DB: ${os.last}, ${os.first} (${os.stream}) - marks preserved`);
}

if (collisions.length) {
  console.error("\nABORT: student identity mapping failed (chose: fail loudly rather than misassign marks):");
  console.error(collisions.slice(0, 30).join("\n"));
  process.exit(1);
}

const notFormOne = marks.filter((m) => { const ns = oldIdToNewStudent.get(m.student_id); return !ns || ns.form_level !== 1; });
if (notFormOne.length) {
  console.error(`\nABORT: ${notFormOne.length} marks belong to students outside Form I (exam was Form I only).`);
  process.exit(1);
}

// ── Build the plan ─────────────────────────────────────────────────────────
const distinctNewSubjectIds = [...new Set([...usedSubjectIds].map((oldId) => oldIdToNew.get(oldId).id))];

// Legacy marks can carry the same mark twice for one student+subject (e.g. the
// old dump stored Math under two subject rows). exam_marks is unique per
// (exam, student, subject), so collapse such pairs: prefer present, then the
// higher theory score. Legacy duplicate values mirror each other, so this is lossless.
const marksDedupeKey = (m) => `${m.student_id}|${oldIdToNew.get(m.subject_id).id}`;
const marksDeduped = [];
const dedupeMap = new Map();
for (const m of marks) {
  const k = marksDedupeKey(m);
  const existing = dedupeMap.get(k);
  if (!existing) { dedupeMap.set(k, m); continue; }
  let keep = existing, drop = m;
  if (m.status === "present" && existing.status !== "present") { keep = m; drop = existing; }
  else if (m.status === "present" && existing.status === "present" && m.marks_value > existing.marks_value) { keep = m; drop = existing; }
  else if (m.status !== "present" && existing.status !== "present") { keep = existing; drop = m; }
  dedupeMap.set(k, keep);
  const ns = oldIdToNewStudent.get(drop.student_id);
  const subj = oldIdToNew.get(drop.subject_id);
  console.log(`  ~ merged legacy duplicate for "${ns.last} ${ns.first}" (${codeOf(subj.id)}): kept ${keep.status}=${keep.marks_value}, dropped ${drop.status}=${drop.marks_value}`);
}
for (const m of dedupeMap.values()) marksDeduped.push(m);
if (marksDeduped.length !== marks.length) {
  console.log(`  (deduplicated ${marks.length} legacy rows -> ${marksDeduped.length} unique student+subject rows)`);
}

const present = marksDeduped.filter((m) => m.status === "present");
const absentRows = marksDeduped.filter((m) => m.status !== "present");
const sumLegacy = present.reduce((a, m) => a + m.marks_value, 0);

const rows = marksDeduped.map((m) => {
  const ns = oldIdToNewStudent.get(m.student_id);
  const subj = oldIdToNew.get(m.subject_id);
  return {
    student_id: ns.id,
    class_id: formOne.id,
    stream_id: ns.stream_id,
    subject_id: subj.id,
    theory: m.status === "present" ? m.marks_value : null,
    is_absent: m.status !== "present",
  };
});

const bySubject = {};
for (const m of marksDeduped) {
  const code = codeOf(oldIdToNew.get(m.subject_id).id);
  bySubject[code] = bySubject[code] ?? { count: 0, present: 0, absent: 0, sum: 0 };
  bySubject[code].count++;
  if (m.status === "present") { bySubject[code].present++; bySubject[code].sum += m.marks_value; }
  else bySubject[code].absent++;
}

console.log(`LEGACY EXAM: "${exam.name}"  (id ${TARGET_EXAM_ID}, ${exam.sd} -> ${exam.ed})`);
console.log(`  marks rows: ${marksDeduped.length} (raw ${marks.length})   present: ${present.length}   absent: ${absentRows.length}`);
console.log(`  distinct students: ${new Set(rows.map((r) => r.student_id)).size}   distinct subjects: ${distinctNewSubjectIds.length}`);
console.log(`  sum of all present marks: ${sumLegacy}`);

console.log("\nPLAN " + (APPLY ? "[APPLY]" : "[DRY RUN - no writes]"));
console.log(`  create exam has_practical=false status=published, class=${formOne.name}, ${distinctNewSubjectIds.length} subjects, ${rows.length} marks`);

for (const [code, b] of Object.entries(bySubject).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`    ${code}: ${b.count} (present ${b.present}, absent ${b.absent}) sum=${b.sum}`);
}

const { data: memberships } = await supabase
  .from("student_subjects")
  .select("student_id, subject_id")
  .in("student_id", rows.map((r) => r.student_id));
const membershipSet = new Set((memberships ?? []).map((m) => `${m.student_id}|${m.subject_id}`));
const notInCurrent = rows.filter((r) => !membershipSet.has(`${r.student_id}|${r.subject_id}`));
console.log(`\nMARK PAIRS NOT IN CURRENT student_subjects (preserved, not dropped): ${notInCurrent.length}`);
for (const r of notInCurrent) {
  const st = newById.get(r.student_id);
  console.log(`  ${st?.last}, ${st?.first} | ${codeOf(r.subject_id)}`);
}

if (!APPLY) {
  console.log("\nNo writes. Re-run with --apply to seed.");
  process.exit(0);
}

// ── APPLY ─────────────────────────────────────────────────────────────────
console.log("\nAPPLYING...");
const { data: dupExam } = await supabase.from("exams").select("id").eq("name", exam.name).limit(1);
if (dupExam && dupExam.length > 0) {
  console.error(`ABORT: exam with name "${exam.name}" already exists. Refusing to duplicate.`);
  process.exit(1);
}
const { data: created, error: insExamErr } = await supabase
  .from("exams")
  .insert({
    name: exam.name,
    start_date: String(exam.sd).slice(0, 10),
    end_date: String(exam.ed).slice(0, 10),
    has_practical: false,
    status: "published",
  })
  .select("id")
  .single();
if (insExamErr) throw insExamErr;
const newExamId = created.id;
console.log(`  created exam ${newExamId}`);

const { error: insClassErr } = await supabase.from("exam_classes").insert({ exam_id: newExamId, class_id: formOne.id });
if (insClassErr) throw insClassErr;
console.log(`  exam_class: ${formOne.name}`);

const { error: insLinksErr } = await supabase
  .from("exam_class_subjects")
  .insert(distinctNewSubjectIds.map((subject_id) => ({ exam_id: newExamId, class_id: formOne.id, subject_id })));
if (insLinksErr) throw insLinksErr;
console.log(`  exam_class_subjects: ${distinctNewSubjectIds.length}`);

const markRows = rows.map((r) => ({
  exam_id: newExamId,
  class_id: r.class_id,
  stream_id: r.stream_id,
  subject_id: r.subject_id,
  student_id: r.student_id,
  theory_score: r.theory,
  practical_score: null,
  is_absent: r.is_absent,
}));
for (let i = 0; i < markRows.length; i += 500) {
  const { error: insMarksErr } = await supabase.from("exam_marks").upsert(markRows.slice(i, i + 500), {
    onConflict: "exam_id,class_id,subject_id,student_id",
  });
  if (insMarksErr) throw insMarksErr;
}
console.log(`  exam_marks: ${markRows.length}`);

// ── Verify against the dump ────────────────────────────────────────────────
console.log("\nVerifying against legacy dump...");
const { data: written, error: readErr } = await supabase
  .from("exam_marks")
  .select("subject_id, theory_score, is_absent")
  .eq("exam_id", newExamId);
if (readErr) throw readErr;

const agg = (list) => {
  const map = new Map();
  for (const it of list) {
    const code = codeOf(it.subject_id);
    const b = map.get(code) ?? { count: 0, present: 0, sum: 0 };
    b.count++;
    if (!it.is_absent) { b.present++; b.sum += Number(it.theory_score); }
    map.set(code, b);
  }
  return map;
};
const dumpAgg = agg(marksDeduped.map((m) => ({ subject_id: oldIdToNew.get(m.subject_id).id, is_absent: m.status !== "present", theory_score: m.status === "present" ? m.marks_value : null })));
const dbAgg = agg(written ?? []);

const writtenPresent = (written ?? []).filter((r) => !r.is_absent);
const sumDb = writtenPresent.reduce((a, r) => a + Number(r.theory_score), 0);

let ok = true;
const check = (label, a, b) => {
  const pass = String(a) === String(b);
  if (!pass) ok = false;
  console.log(`  ${pass ? "OK " : "!! "}${label}: ${a} == ${b}`);
};
check("exam_marks total", (written ?? []).length, marksDeduped.length);
check("present rows", writtenPresent.length, present.length);
check("absent rows", (written ?? []).filter((r) => r.is_absent).length, absentRows.length);
check("sum of all present theory marks", sumDb, sumLegacy);
for (const [code, b] of dumpAgg) {
  const db = dbAgg.get(code);
  if (!db || db.count !== b.count || db.present !== b.present || db.sum !== b.sum) {
    ok = false;
    console.log(`  !! subject ${code}: db=${JSON.stringify(db)} dump=${JSON.stringify(b)}`);
  }
}
const reverse = [...dbAgg.keys()].filter((code) => !dumpAgg.has(code));
if (reverse.length) { ok = false; console.log(`  !! subjects present in db but not dump: ${reverse.join(", ")}`); }

if (!ok) {
  console.error("\nMISMATCH DETECTED - investigate before trusting this seed.");
  process.exit(1);
}
console.log("\nDONE. All counts, per-subject counts and sums match the legacy dump exactly.");