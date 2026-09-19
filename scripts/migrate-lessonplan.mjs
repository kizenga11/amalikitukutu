// Run: node scripts/migrate-lessonplan.mjs [path-to-php-sql-dump]
//
// Migrates the legacy PHP "lessonplan" curriculum data into the
// Next.js Supabase schema.
// Idempotent: safe to run repeatedly (skips codes that already exist).

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

// ----------------------------------------------------------------
// Environment + client
// ----------------------------------------------------------------
function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function clientFromUrl(url) {
  const u = new URL(url);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
}

// ----------------------------------------------------------------
// MySQL INSERT parser (proven to handle this dump)
// ----------------------------------------------------------------
function cleanMojibake(s) {
  if (typeof s !== "string" || s === "") return s;
  const out = s
    .replace(/├óÔé¼ÔÇØ/g, "\u2013")
    .replace(/├óÔÇáÔÇÖ/g, "'")
    .replace(/├óÔé¼ÔÇ£/g, "\u201c")
    .replace(/├óÔé¼┼ô/g, "\u201c")
    .replace(/├óÔé¼┼¥/g, "\u201d")
    .replace(/├óÔé¼Ôäó/g, "\u2122")
    .replace(/├é┬▓/g, "\u00b2");
  return out;
}

let mojibakeFixes = 0;

function cleanField(s, isString) {
  if (!isString) return s;
  const cleaned = cleanMojibake(s);
  if (cleaned !== s) mojibakeFixes++;
  return cleaned;
}

function readTuples(text, start) {
  const rows = [];
  let i = start;
  let quote = false;

  while (i < text.length) {
    const ch = text[i];

    if (quote) {
      if (ch === "\\") i += 2;
      else if (ch === "'") {
        if (text[i + 1] === "'") i += 2;
        else {
          quote = false;
          i++;
        }
      } else i++;
      continue;
    }

    if (ch === "'") {
      quote = true;
      i++;
      continue;
    }

    if (ch === "(") {
      const tuple = [];
      i++;
      let field = "";
      let fieldQuoted = false;

      const flushField = () => {
        let value;
        if (fieldQuoted) value = field;
        else {
          const t = field.trim();
          value = /^null$/i.test(t) ? null : t;
        }
        tuple.push(value);
        field = "";
        fieldQuoted = false;
      };

      while (i < text.length) {
        const c = text[i];
        if (fieldQuoted) {
          if (c === "\\") {
            field += text[i + 1] ?? "";
            i += 2;
            continue;
          }
          if (c === "'") {
            if (text[i + 1] === "'") {
              field += "'";
              i += 2;
              continue;
            }
            fieldQuoted = false;
            i++;
            continue;
          }
          field += c;
          i++;
          continue;
        }
        if (c === "'") {
          fieldQuoted = true;
          i++;
          continue;
        }
        if (c === ",") {
          flushField();
          i++;
          continue;
        }
        if (c === ")") {
          flushField();
          i++;
          break;
        }
        if (c === "\\") {
          field += text[i + 1] ?? "";
          i += 2;
          continue;
        }
        field += c;
        i++;
      }
      rows.push(tuple);
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === ";") return { rows, next: i + 1 };
      return { rows, next: i };
    }

    i++;
  }
  return { rows, next: i };
}

function parseDump(text) {
  const tables = {};
  const headerRe = /INSERT INTO `(\w+)` \(([^)]*?)\) VALUES/g;
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim().replace(/^`|`$/g, ""));
    const { rows, next } = readTuples(text, headerRe.lastIndex);
    headerRe.lastIndex = next;
    const bucket = tables[table];
    if (bucket) bucket.rows.push(...rows);
    else tables[table] = { cols, rows };
  }
  return tables;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const FORM_LEVEL = { I: 1, II: 2, III: 3, IV: 4 };

const NEW_SUBJECTS = {
  COMP: { name: "Computer Science", stream: "Vocational" },
  CA: { name: "Computer Application", stream: "Vocational" },
  CP: { name: "Computer Programming", stream: "Vocational" },
  BS: { name: "Business Studies", stream: "Vocational" },
  MATH: { name: "Mathematics", stream: "General" },
  HTM: { name: "Historia ya Tanzania na Maadili", stream: "General" },
};

function nextCode(code, used) {
  let c = code;
  let n = 2;
  while (used.has(c)) c = `${code} (${n++})`;
  return c;
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------
const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

const dumpPath =
  process.argv[2] ?? resolve("lessonplan mfumo", "ezyro_42599568_lesson_plan.sql");

if (!existsSync(dumpPath)) {
  console.error(`Dump file not found: ${dumpPath}`);
  process.exit(1);
}

console.log(`Reading dump: ${dumpPath}`);
const dumpText = readFileSync(dumpPath, "utf8");
const T = parseDump(dumpText);

const subj = T.subjects?.rows ?? [];
const syl = T.syllabuses?.rows ?? [];
const mod = T.modules?.rows ?? [];
const uni = T.units?.rows ?? [];
const ele = T.elements?.rows ?? [];
const em = T.element_methods?.rows ?? [];
const er = T.element_resources?.rows ?? [];
const res = T.resources?.rows ?? [];
const meth = T.teaching_methods?.rows ?? [];

console.log(
  `Parsed: subjects=${subj.length} syllabuses=${syl.length} modules=${mod.length} units=${uni.length} elements=${ele.length} element_methods=${em.length} element_resources=${er.length} resources=${res.length} teaching_methods=${meth.length}`,
);

if (!subj.length || !mod.length || !uni.length) {
  console.error("Dump appears empty; expecting subjects/modules/units data.");
  process.exit(1);
}

if (process.argv.includes("--parse-only")) {
  console.log("parse-only: stopping before database connection.");
  process.exit(0);
}

const client = clientFromUrl(env.DATABASE_URL);
await client.connect();

const C = {
  subjectsNew: 0,
  subjectsMatch: 0,
  mainNew: 0,
  mainSkip: 0,
  specNew: 0,
  specSkip: 0,
  actNew: 0,
  actSkip: 0,
};

try {
  // ---- 1. Forms --------------------------------------------------
  for (const [level, name] of [
    [1, "Form One"],
    [2, "Form Two"],
    [3, "Form Three"],
    [4, "Form Four"],
  ]) {
    await client.query(
      `insert into public.forms (name, form_level) values ($1, $2)
       on conflict (name) do update set form_level = excluded.form_level`,
      [name, level],
    );
  }
  const formRes = await client.query(`select id, form_level from public.forms`);
  const formIdByLevel = new Map(formRes.rows.map((r) => [r.form_level, r.id]));

  // ---- 2. Subjects -------------------------------------------------
  const subRes = await client.query(`select id, code, name from public.subjects`);
  const byCode = new Map(subRes.rows.map((r) => [r.code.toUpperCase(), r]));
  const byName = new Map(subRes.rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const phpSubjectToNext = new Map();

  for (const s of subj) {
    const phpId = Number(s[0]);
    const name = cleanField(s[1], true).trim();
    const code = cleanField(s[2], true).trim().toUpperCase();
    let t = byName.get(name.toLowerCase()) ?? byCode.get(code);
    if (t) {
      C.subjectsMatch++;
    } else {
      const meta = NEW_SUBJECTS[code] ?? { name, stream: "General" };
      const ins = await client.query(
        `insert into public.subjects (code, name, subject_type, has_practical, stream)
         values ($1, $2, 'Optional', false, $3)
         on conflict (code) do update set name = excluded.name
         returning id, code`,
        [code, meta.name, meta.stream],
      );
      t = ins.rows[0];
      byCode.set(code, t);
      byName.set(meta.name.toLowerCase(), t);
      C.subjectsNew++;
      console.log(`  created subject ${code} (${meta.name})`);
    }
    phpSubjectToNext.set(phpId, t.id);
  }

  // ---- 3. Preload existing keys (idempotency) -----------------------
  const mainRows = (
    await client.query(`select id, subject_id, form_id, code from public.main_competences`)
  ).rows;
  const specRows = (
    await client.query(`select id, main_competence_id, code from public.specific_competences`)
  ).rows;
  const actRows = (
    await client.query(`select id, specific_competence_id, code from public.learning_activities`)
  ).rows;

  const mainKeyToId = new Map(); // `${subject}|${formId}|${code}` -> id
  const mainTaken = new Map(); // `${subject}|${formLevel}` -> Set(code)
  for (const r of mainRows) {
    mainKeyToId.set(`${r.subject_id}|${r.form_id}|${r.code}`, r.id);
    const formLv = formRes.rows.find((f) => f.id === r.form_id)?.form_level;
    const k = `${r.subject_id}|${formLv ?? "?"}`;
    if (!mainTaken.has(k)) mainTaken.set(k, new Set());
    mainTaken.get(k).add(r.code);
  }

  const specTaken = new Map(); // mainId -> Set(code)
  for (const r of specRows) {
    if (!specTaken.has(r.main_competence_id)) specTaken.set(r.main_competence_id, new Set());
    specTaken.get(r.main_competence_id).add(r.code);
  }

  const actTaken = new Map(); // specId -> Set(code)
  for (const r of actRows) {
    if (!actTaken.has(r.specific_competence_id)) actTaken.set(r.specific_competence_id, new Set());
    actTaken.get(r.specific_competence_id).add(r.code);
  }

  // ---- 4. Syllabus -> subject ----------------------------------------
  const sylSubject = new Map();
  for (const s of syl) sylSubject.set(Number(s[0]), phpSubjectToNext.get(Number(s[1])));

  // ---- 5. Modules -> main_competences (batch) --------------------------
  const mainBatch = []; // [subjectId, formId, code, title, phpModuleId]
  const phpModToMain = new Map();

  for (const mo of mod) {
    const phpId = Number(mo[0]);
    const syllabusId = Number(mo[1]);
    const codeRaw = cleanField(mo[2], true).trim();
    const title = cleanField(mo[3], true).trim();
    const formRaw = cleanField(mo[4], true).trim();

    const subjectId = sylSubject.get(syllabusId);
    const level = FORM_LEVEL[formRaw];
    if (!subjectId || !level || !formIdByLevel.has(level)) {
      console.warn(`  skip module ${phpId} (unusable syllabus/form)`);
      C.mainSkip++;
      continue;
    }
    const formId = formIdByLevel.get(level);
    const takenKey = `${subjectId}|${level}`;
    if (!mainTaken.has(takenKey)) mainTaken.set(takenKey, new Set());
    const code = mainTaken.get(takenKey).has(codeRaw)
      ? nextCode(codeRaw, mainTaken.get(takenKey))
      : codeRaw;
    mainTaken.get(takenKey).add(code);

    const existingId = mainKeyToId.get(`${subjectId}|${formId}|${code}`);
    if (existingId) {
      phpModToMain.set(phpId, existingId);
      C.mainSkip++;
    } else {
      mainBatch.push([subjectId, formId, code, title, phpId]);
    }
  }

  if (mainBatch.length) {
    const prefix = `insert into public.main_competences (subject_id, form_id, code, title) values`;
    const phInst = [];
    const params = [];
    for (let r = 0; r < mainBatch.length; r++) {
      phInst.push(`($${r * 4 + 1}, $${r * 4 + 2}, $${r * 4 + 3}, $${r * 4 + 4})`);
      params.push(mainBatch[r][0], mainBatch[r][1], mainBatch[r][2], mainBatch[r][3]);
    }
    const ins = await client.query(
      `${prefix} ${phInst.join(", ")} on conflict do nothing returning id`,
      params,
    );
    mainBatch.forEach((row, idx) => {
      phpModToMain.set(row[4], ins.rows[idx]?.id);
      C.mainNew++;
    });
  }

  // ---- 6. Units -> specific_competences (batch) -------------------------
  const specBatch = []; // [mainId, code, title, phpUnitId]
  const phpUnitToSpec = new Map();

  for (const u of uni) {
    const phpId = Number(u[0]);
    const moduleId = Number(u[1]);
    const codeRaw = cleanField(u[2], true).trim();
    const title = cleanField(u[3], true).trim();

    const mainId = phpModToMain.get(moduleId);
    if (!mainId) {
      console.warn(`  skip unit ${phpId} (module ${moduleId} unmapped)`);
      C.specSkip++;
      continue;
    }
    if (!specTaken.has(mainId)) specTaken.set(mainId, new Set());
    const code = specTaken.get(mainId).has(codeRaw)
      ? nextCode(codeRaw, specTaken.get(mainId))
      : codeRaw;
    specTaken.get(mainId).add(code);

    specBatch.push([mainId, code, title, phpId]);
  }

  if (specBatch.length) {
    const prefix = `insert into public.specific_competences (main_competence_id, code, title) values`;
    const phInst = [];
    const params = [];
    for (let r = 0; r < specBatch.length; r++) {
      phInst.push(`($${r * 3 + 1}, $${r * 3 + 2}, $${r * 3 + 3})`);
      params.push(specBatch[r][0], specBatch[r][1], specBatch[r][2]);
    }
    const ins = await client.query(
      `${prefix} ${phInst.join(", ")} on conflict do nothing returning id`,
      params,
    );
    specBatch.forEach((row, idx) => {
      phpUnitToSpec.set(row[3], ins.rows[idx]?.id);
      C.specNew++;
    });
  }

  // ---- 7. Lookup maps for methods/resources -----------------------------
  const methMap = new Map(meth.map((r) => [Number(r[0]), cleanField(r[1], true)]));
  const resMap = new Map(res.map((r) => [Number(r[0]), cleanField(r[1], true)]));

  const emByEl = new Map();
  for (const r of em) {
    const eid = Number(r[1]);
    if (!emByEl.has(eid)) emByEl.set(eid, []);
    emByEl.get(eid).push(r);
  }
  const erByEl = new Map();
  for (const r of er) {
    const eid = Number(r[1]);
    if (!erByEl.has(eid)) erByEl.set(eid, []);
    erByEl.get(eid).push(Number(r[2]));
  }
  const unitPeriods = new Map(uni.map((u) => [Number(u[0]), Number(u[4] ?? 0) || 0]));

  // ---- 8. Elements -> learning_activities (one big batch) -----------------
  const actBatch = [];
  for (const el of ele) {
    const phpId = Number(el[0]);
    const unitId = Number(el[1]);
    const codeRaw = cleanField(el[2], true).trim();
    const title = cleanField(el[3], true).trim();

    const specId = phpUnitToSpec.get(unitId);
    if (!specId) {
      console.warn(`  skip element ${phpId} (unit ${unitId} unmapped)`);
      C.actSkip++;
      continue;
    }
    if (!actTaken.has(specId)) actTaken.set(specId, new Set());
    if (actTaken.get(specId).has(codeRaw)) {
      C.actSkip++;
      continue;
    }
    actTaken.get(specId).add(codeRaw);

    const emRows = emByEl.get(phpId) ?? [];
    const stageContent = {};
    const methods = new Set();
    const assessments = [];
    let totalMin = 0;

    for (const r of emRows) {
      const stage = cleanField(r[3], true).trim();
      const min = Number(r[4]) || 0;
      const teach = cleanField(r[5], true).trim();
      const learn = cleanField(r[6], true).trim();
      const assess = cleanField(r[7], true).trim();
      totalMin += min;
      const mname = methMap.get(Number(r[2]));
      if (mname) methods.add(mname);
      if (assess && !assessments.includes(assess)) assessments.push(assess);
      if (stage && !stageContent[stage]) {
        stageContent[stage] = {
          method: mname ?? "",
          time_minutes: min,
          teaching_activity: teach,
          learning_activity: learn,
          assessment_criteria: assess,
        };
      }
    }

    let periods = unitPeriods.get(unitId) || 0;
    if (!periods && totalMin > 0) periods = Math.max(1, Math.ceil(totalMin / 40));

    const resNames = [];
    for (const rid of erByEl.get(phpId) ?? []) {
      const nm = resMap.get(rid);
      if (nm && !resNames.includes(nm)) resNames.push(nm);
    }

    actBatch.push([
      specId,
      codeRaw,
      title,
      [...methods].join(", ") || null,
      assessments.join("\n") || null,
      resNames.join(", ") || null,
      periods || null,
      Object.keys(stageContent).length ? JSON.stringify(stageContent) : null,
    ]);
    C.actNew++;
  }

  if (actBatch.length) {
    const prefix = `insert into public.learning_activities
      (specific_competence_id, code, activity_description, suggested_methods,
       assessment_criteria, resources, periods_allocated, stage_content) values`;
    let inserted = 0;
    for (let i = 0; i < actBatch.length; i += 150) {
      const chunk = actBatch.slice(i, i + 150);
      const phInst = [];
      const params = [];
      for (let r = 0; r < chunk.length; r++) {
        const ph = [];
        for (let c = 0; c < 8; c++) ph.push(`$${r * 8 + c + 1}`);
        phInst.push(`(${ph.join(", ")})`);
        params.push(...chunk[r]);
      }
      const ins = await client.query(
        `${prefix} ${phInst.join(", ")} on conflict do nothing`,
        params,
      );
      inserted += ins.rowCount;
    }
    C.actNew = inserted;
  }

  // ---- Summary ---------------------------------------------------------
  console.log("\n=== Migration summary ===");
  console.log(`  subjects           : ${C.subjectsNew} created, ${C.subjectsMatch} matched`);
  console.log(`  main_competences   : ${C.mainNew} created, ${C.mainSkip} skipped`);
  console.log(`  specific_competences: ${C.specNew} created, ${C.specSkip} skipped`);
  console.log(`  learning_activities: ${C.actNew} created, ${C.actSkip} skipped`);
  console.log(`  mojibake fixes     : ${mojibakeFixes}`);
  console.log("Done.");
} finally {
  await client.end();
}