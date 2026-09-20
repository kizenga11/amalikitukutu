// Restore student_subjects to the exact dump-derived seed (69 active students,
// 657 rows). Running apply-migration.mjs re-executed migration
// 20260114000000 which deletes all Optional Chemistry assignments - restoring
// them here. Uses the same identity + first-hit subject mapping as the seed.
//
// Run: node scripts/restore-student-subjects.mjs   (dry run)
//      node scripts/restore-student-subjects.mjs --apply

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

const normalize = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function parseTuples(segment) {
  const tuples = [];
  let i = 0;
  const n = segment.length;
  while (i < n) {
    while (i < n && /\s/.test(segment[i])) i += 1;
    if (i >= n) break;
    if (segment[i] === ",") { i += 1; continue; }
    if (segment[i] !== "(") throw new Error("bad tuple");
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
const oldSubjects = extractRows(sql, "subjects").map((r) => ({ id: r[0], name: String(r[1] ?? "").trim() }));
const oldStudents = extractRows(sql, "students").map((r) => ({
  id: r[0], active: r[2], first: String(r[3] ?? "").trim(), last: String(r[5] ?? "").trim(),
  sex: String(r[6] ?? "").trim(), stream: String(r[8] ?? "").trim(),
}));
const oldSS = extractRows(sql, "student_subjects").map((r) => ({ student_id: r[1], subject_id: r[2] }));

const RENAMES = {
  math: "mathematics",
  bstudies: "bussinesstudies",
  computerapplicationwithcad: "computerapplication",
  electricalinstallation: "electrialinstallation",
  electronicsrepair: null,
};
const { data: newSubjects } = await supabase.from("subjects").select("id, code, name").order("code");
const newByNorm = new Map();
for (const s of newSubjects ?? []) {
  const key = normalize(s.name);
  if (!newByNorm.has(key)) newByNorm.set(key, s);
}
const oldIdToNew = new Map();
for (const s of oldSubjects) {
  const norm = normalize(s.name);
  const target = Object.prototype.hasOwnProperty.call(RENAMES, norm) ? RENAMES[norm] : norm;
  const hit = target != null ? newByNorm.get(target) : null;
  if (hit) oldIdToNew.set(s.id, hit);
}

const { data: newStudents } = await supabase
  .from("students")
  .select("id, first_name, last_name, gender, stream_id, stream:streams(name)")
  .order("last_name");
const identityKey = (a, b, c, d) => `${normalize(a)}|${normalize(b)}|${normalize(c)}|${normalize(d)}`;
const flatNew = (newStudents ?? []).map((s) => {
  const strm = Array.isArray(s.stream) ? s.stream[0] : s.stream;
  return { id: s.id, first: s.first_name, last: s.last_name, gender: s.gender ?? "", stream_name: strm?.name ?? "" };
});
const oldToNew = new Map();
const issues = [];
for (const os of oldStudents.filter((s) => s.active === 1)) {
  const key = identityKey(os.first, os.last, os.sex, os.stream);
  const hits = flatNew.filter((s) => identityKey(s.first, s.last, s.gender, s.stream_name) === key);
  if (hits.length === 1) oldToNew.set(os.id, hits[0].id);
  else issues.push(`old student ${os.id} "${os.first} ${os.last}" ${os.sex}/${os.stream} matches ${hits.length}`);
}
if (issues.length) {
  console.error("\nABORT on identity mapping:");
  console.error(issues.slice(0, 30).join("\n"));
  process.exit(1);
}

const intended = [];
const failed = [];
for (const ss of oldSS) {
  const stu = oldToNew.get(ss.student_id);
  const sub = oldIdToNew.get(ss.subject_id);
  if (!stu || !sub) { failed.push(`old ${ss.student_id}->${ss.subject_id}`); continue; }
  intended.push({ student_id: stu, subject_id: sub.id });
}
const intendedSet = new Set(intended.map((r) => `${r.student_id}|${r.subject_id}`));

const { data: current } = await supabase.from("student_subjects").select("student_id, subject_id");
const currentSet = new Set((current ?? []).map((r) => `${r.student_id}|${r.subject_id}`));
const missing = intended.filter((r) => !currentSet.has(`${r.student_id}|${r.subject_id}`));
const extra = current.filter((r) => !intendedSet.has(`${r.student_id}|${r.subject_id}`));

const codeOf = new Map((newSubjects ?? []).map((s) => [s.id, s.code]));
const stuName = new Map(flatNew.map((s) => [s.id, `${s.first} ${s.last}`]));

console.log(`intended (dump-derived seed, ${newStudents?.length ?? 0} students): ${intendedSet.size} rows`);
console.log(`current student_subjects: ${currentSet.size}`);
console.log(`missing (to insert): ${missing.length}  extra-to-remove: ${extra.length}  unmapped: ${failed.length}`);
const aggr = (rows) => {
  const m = {};
  for (const r of rows) {
    const c = codeOf.get(r.subject_id) ?? "?";
    m[c] = (m[c] ?? 0) + 1;
  }
  return m;
};
console.log("missing by code:", aggr(missing));

if (!APPLY) {
  console.log("\nPLAN [DRY RUN]: re-insert missing rows to return student_subjects to the verified 657-row seed state.");
  console.log("  (extra-to-remove is expected to be 0 once the first-hit subject mapping is used)");
  process.exit(0);
}

console.log("\nAPPLYING...");
for (let i = 0; i < missing.length; i += 500) {
  const { error } = await supabase.from("student_subjects").upsert(missing.slice(i, i + 500), { onConflict: "student_id,subject_id" });
  if (error) throw error;
}
console.log(`  inserted ${missing.length} missing rows`);

if (extra.length) {
  const EXTRA_BATCH = 100;
  for (let i = 0; i < extra.length; i += EXTRA_BATCH) {
    const chunk = extra.slice(i, i + EXTRA_BATCH);
    const orFilter = chunk
      .map((r) => `and(student_id.eq.${r.student_id},subject_id.eq.${r.subject_id})`)
      .join(",");
    const { error } = await supabase.from("student_subjects").delete().or(orFilter);
    if (error) throw error;
  }
  console.log(`  removed ${extra.length} stray rows`);
} else {
  console.log("  no stray rows to remove");
}

const { data: after } = await supabase.from("student_subjects").select("student_id, subject_id");
console.log(`final student_subjects: ${after?.length ?? 0}`);
for (const r of after ?? []) {
  const key = `${r.student_id}|${r.subject_id}`;
  if (!intendedSet.has(key)) console.log(`  !! unexpected: ${stuName.get(r.student_id)} | ${codeOf.get(r.subject_id)}`);
}
if ((after?.length ?? 0) !== intendedSet.size) {
  console.error("\nMISMATCH after restore - review manually.");
  process.exit(1);
}
console.log(`\nDONE. student_subjects == verified seed (${intendedSet.size} rows).`);