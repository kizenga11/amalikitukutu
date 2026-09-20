import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const DEFAULT_PASSWORD = "12345678";

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
    if (segment[i] !== "(") throw new Error(`Expected '(' at ${segment.slice(i, i + 40)}`);
    i += 1;
    let depth = 1;
    let buf = "";
    let inStr = false;
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

function parseValue(raw) {
  const v = raw.trim();
  if (!v) return null;
  if (/^null$/i.test(v)) return null;
  if (v.startsWith("'")) {
    let c = v.slice(1, v.endsWith("'") ? -1 : v.length);
    c = c.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    return c;
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

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
  id: r[0], name: String(r[1] ?? "").trim(), short: String(r[2] ?? "").trim(),
  code: String(r[3] ?? "").trim(), stream: String(r[4] ?? "").trim(), category: String(r[5] ?? "").trim(),
}));

const oldTeachers = extractRows(sql, "teachers").map((r) => ({
  id: r[0], first_name: r[1] ?? "", second_name: r[2] ?? "", last_name: r[3] ?? "",
  sex: String(r[4] ?? "").trim(), email: String(r[5] ?? "").trim().toLowerCase(),
  phone: r[6] ? String(r[6]) : null, password: r[7] ?? null,
}));

const oldAssignments = extractRows(sql, "teacher_assignments").map((r) => ({
  id: r[0], teacher_id: r[1], subject_id: r[2],
  form_level: String(r[3] ?? "").trim(), stream: String(r[4] ?? "").trim().toLowerCase(),
  class_stream: String(r[5] ?? "").trim(),
}));

console.log(`Parsed legacy SQL -> subjects:${oldSubjects.length} teachers:${oldTeachers.length} assignments:${oldAssignments.length}`);

const RENAMES = {
  math: "mathematics",
  bstudies: "bussinesstudies",
  computerapplicationwithcad: "computerapplication",
  electricalinstallation: "electrialinstallation",
  electronicsrepair: null,
};

const { data: newSubjects, error: subjErr } = await supabase.from("subjects").select("id, code, name, stream").order("code");
if (subjErr) throw subjErr;
const newByNorm = new Map((newSubjects ?? []).map((s) => [normalize(s.name), s]));

const oldIdToNew = new Map();
const usedIds = new Set(oldAssignments.map((a) => a.subject_id));
const failed = [];
for (const oldS of oldSubjects) {
  const norm = normalize(oldS.name);
  const target = Object.prototype.hasOwnProperty.call(RENAMES, norm) ? RENAMES[norm] : norm;
  const hit = target != null ? newByNorm.get(target) : null;
  if (hit) oldIdToNew.set(oldS.id, { old: oldS, new: hit });
  else if (usedIds.has(oldS.id)) failed.push(`  old id ${oldS.id} "${oldS.name}" (${oldS.short}) -> NO match in new DB`);
}
if (failed.length) {
  console.error(`\nABORT on unmapped used subjects:`);
  console.error(failed.join("\n"));
  process.exit(1);
}

console.log("\nVerified subject NAME mapping (old id -> new):");
for (const [oldId, e] of oldIdToNew) {
  if (!usedIds.has(oldId)) continue;
  const flag = normalize(e.old.name) === normalize(e.new.name) ? "exact" : "mapped";
  console.log(`  [${oldId}] "${e.old.name}" (${e.old.short}) -> ${e.new.code} "${e.new.name}" [${flag}]`);
}

const { data: classes } = await supabase.from("school_classes").select("id, name, form_level");
const { data: streams } = await supabase.from("streams").select("id, class_id, name");
const { data: forms } = await supabase.from("forms").select("id, name, form_level");
const { data: existingStaff } = await supabase.from("staff").select("*").eq("role", "Teacher");

const classByLevel = new Map((classes ?? []).map((c) => [c.form_level, c]));
const streamKey = (cid, name) => `${cid}|${normalize(name)}`;
const streamByKey = new Map((streams ?? []).map((s) => [streamKey(s.class_id, s.name), s]));
const formByLevel = new Map((forms ?? []).map((f) => [f.form_level, f]));
const staffByEmail = new Map((existingStaff ?? []).map((s) => [String(s.email ?? "").trim().toLowerCase(), s]));

const FORM_LEVEL = { formone: 1, formtwo: 2, formthree: 3, formfour: 4, formi: 1, formii: 2, formiii: 3, formiv: 4 };

function resolveStream(formLevel, streamName) {
  const cls = classByLevel.get(formLevel);
  if (!cls) throw new Error(`No class for level ${formLevel}`);
  const str = streamByKey.get(streamKey(cls.id, streamName));
  if (!str) throw new Error(`No stream "${streamName}" for "${cls.name}"`);
  return { cls, str };
}

const demoTeachers = (existingStaff ?? []).filter((s) => s.role === "Teacher" && (s.email === null || String(s.email).trim() === ""));
const teacherPlans = [];
for (const t of oldTeachers) {
  const fullName = [t.first_name, t.second_name, t.last_name].filter((p) => p && p.trim()).join(" ").trim();
  const existing = staffByEmail.get(t.email);
  const assignments = oldAssignments.filter((a) => a.teacher_id === t.id).map((a) => {
    const e = oldIdToNew.get(a.subject_id);
    if (!e) return null;
    const level = FORM_LEVEL[normalize(a.form_level)];
    if (!level) throw new Error(`Unknown form "${a.form_level}"`);
    const cls = resolveStream(level, a.stream);
    const subjStream = normalize(e.new.stream ?? "");
    const strName = normalize(cls.str.name);
    if (subjStream !== "both" && subjStream !== strName) {
      throw new Error(`Stream mismatch: "${e.old.name}" (${e.new.code}) is ${e.new.stream} but assignment is ${cls.cls.name}/${cls.str.name}`);
    }
    return { cls, subj: e.new, old: e.old, a };
  }).filter(Boolean);
  teacherPlans.push({ t, fullName, existing, assignments });
}

console.log(`\nPLAN [${APPLY ? "APPLY" : "DRY RUN - no writes"}]:`);
console.log(`  delete demo teachers (role=Teacher, no email): ${demoTeachers.length} -> keep kitukutu/real teachers`);
console.log(`  teachers to add/update: ${teacherPlans.length}`);
for (const p of teacherPlans) {
  console.log(`  ${p.existing ? "UPSERT" : "INSERT"} ${p.fullName} <${p.t.email}> phone=${p.t.phone ?? "-"} gender=${p.t.sex || "-"} assignments=${p.assignments.length}`);
  for (const x of p.assignments) console.log(`      ${x.old.short} -> ${x.subj.code} in ${x.cls.cls.name}/${x.cls.str.name}`);
}
console.log(`  auth accounts (email+${DEFAULT_PASSWORD}): ${oldTeachers.filter((t) => t.email).length}`);

if (!APPLY) {
  console.log("\nNo writes. Re-run with --apply to seed.");
  process.exit(0);
}

console.log("\nAPPLYING...");
const demoIds = demoTeachers.map((s) => s.id);
if (demoIds.length) {
  const { error } = await supabase.from("staff").delete().in("id", demoIds);
  if (error) throw error;
  console.log(`  deleted ${demoIds.length} demo teachers`);
}

const createdStaff = [];
for (const p of teacherPlans) {
  const data = {
    name: p.fullName,
    role: "Teacher",
    first_name: p.t.first_name.trim() || null,
    middle_name: p.t.second_name.trim() || null,
    last_name: p.t.last_name.trim() || null,
    gender: p.t.sex || null,
    phone: p.t.phone || null,
    email: p.t.email,
    password: DEFAULT_PASSWORD,
  };
  let staffId;
  if (p.existing) {
    const { data: upd, error } = await supabase.from("staff").update(data).eq("id", p.existing.id).select().single();
    if (error) throw error;
    staffId = upd.id;
    console.log(`  updated staff: ${p.fullName} <${p.t.email}>`);
  } else {
    const { data: ins, error } = await supabase.from("staff").insert(data).select().single();
    if (error) throw error;
    staffId = ins.id;
    createdStaff.push(ins);
    console.log(`  inserted staff: ${p.fullName} <${p.t.email}>`);
  }

  const { error: delA } = await supabase.from("teaching_assignments").delete().eq("teacher_id", staffId);
  if (delA) throw delA;
  const rows = p.assignments.map((x) => ({
    teacher_id: staffId, subject_id: x.subj.id, class_id: x.cls.cls.id, stream_id: x.cls.str.id,
  }));
  if (rows.length) {
    const { error: insA } = await supabase.from("teaching_assignments").insert(rows).select();
    if (insA) throw insA;
    console.log(`    + ${rows.length} teaching_assignments`);
  }

  const { error: delT } = await supabase.from("teacher_subjects").delete().eq("user_id", staffId);
  if (delT) throw delT;
  const trows = [];
  for (const x of p.assignments) {
    const form = formByLevel.get(x.cls.cls.form_level);
    if (!form) continue;
    const pair = `${staffId}|${x.subj.id}|${form.id}`;
    if (trows.some((r) => `${r.user_id}|${r.subject_id}|${r.form_id}` === pair)) continue;
    trows.push({ user_id: staffId, subject_id: x.subj.id, form_id: form.id });
  }
  if (trows.length) {
    const { error: insT } = await supabase.from("teacher_subjects").insert(trows).select();
    if (insT) throw insT;
    console.log(`    + ${trows.length} teacher_subjects`);
  }

  const email = p.t.email;
  const meta = { role: "Teacher", staff_id: staffId, name: p.fullName };
  let authUserId = null;
  const existingAuth = await findAuthUser(email);
  if (existingAuth) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingAuth.id, {
      password: DEFAULT_PASSWORD, user_metadata: meta,
    });
    if (error) throw error;
    authUserId = data.user?.id ?? existingAuth.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password: DEFAULT_PASSWORD, email_confirm: true, user_metadata: meta,
    });
    if (error) throw error;
    authUserId = data.user?.id;
  }
  const { error: linkErr } = await supabase.from("staff").update({ auth_user_id: authUserId }).eq("id", staffId);
  if (linkErr) throw linkErr;
  console.log(`    auth linked: ${email}`);
}

async function findAuthUser(email) {
  const target = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users?.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (!data?.nextPage || page >= (data?.lastPage ?? 0)) return null;
    page += 1;
  }
}

console.log(`\nDONE. Seeded ${teacherPlans.length} teachers (${createdStaff.length} new, ${teacherPlans.length - createdStaff.length} updated).`);