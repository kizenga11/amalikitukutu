// Run: node scripts/seed-lesson-plan.mjs
// Seeds the lesson-plan feature:
//   * forms   -> Form One .. Form Four (matches school_classes.form_level)
//   * schools -> a single school row derived from academic_settings
//   * teacher_subjects <- teaching_assignments (staff <-> subject <-> form)
//   * syllabus (demo) -> main_competences / specific_competences /
//                        learning_activities for every subject+form a
//                        teacher is assigned to, so the generate flow works
//                        immediately after seeding.
// Safe to run repeatedly (idempotent - skips codes that already exist).

import { readFileSync } from "node:fs";
import pg from "pg";

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
    connectionTimeoutMillis: 20000,
  });
}

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

const client = clientFromUrl(env.DATABASE_URL);

try {
  await client.connect();

  // ---- Forms -------------------------------------------------------
  const formNames = [
    { level: 1, name: "Form One" },
    { level: 2, name: "Form Two" },
    { level: 3, name: "Form Three" },
    { level: 4, name: "Form Four" },
  ];
  for (const f of formNames) {
    await client.query(
      `insert into public.forms (name, form_level)
       values ($1, $2)
       on conflict (name) do update set form_level = excluded.form_level`,
      [f.name, f.level],
    );
  }
  console.log(`forms: ${formNames.length} ensured (Form One..Form Four)`);

  // ---- Schools -------------------------------------------------------
  const settingsRes = await client.query(
    `select key, value from public.academic_settings where key in ('school_name','school_district','school_address')`,
  );
  const settings = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));
  const schoolName = settings.school_name || "AMALI SCHOOL";
  const schoolDistrict = settings.school_district || "";
  const schoolAddress = settings.school_address || "";

  // Keep a single row per school name (a previous run may have duplicated).
  await client.query(
    `delete from public.schools s
     using public.schools s2
     where s.name = s2.name and s.id > s2.id`,
  );
  await client.query(
    `insert into public.schools (id, name, district, po_box)
     select gen_random_uuid(), $1, $2, $3
     where not exists (select 1 from public.schools where name = $1)`,
    [schoolName, schoolDistrict, schoolAddress],
  );
  console.log(`schools: ensured a school row for "${schoolName}"`);

  // ---- teacher_subjects from teaching_assignments -------------------
  const tsRes = await client.query(
    `insert into public.teacher_subjects (user_id, subject_id, form_id)
     select distinct
       ta.teacher_id                as user_id,
       ta.subject_id                as subject_id,
       f.id                         as form_id
     from public.teaching_assignments ta
     join public.school_classes c on c.id = ta.class_id
     join public.forms f on f.form_level = c.form_level
     on conflict (user_id, subject_id, form_id) do nothing
     returning id`,
  );
  console.log(`teacher_subjects: added ${tsRes.rowCount} row(s) from existing teaching assignments`);

  // ---- Syllabus (demo curriculum for every assigned subject + form) -----
  // Kept generic so it works for any subject; the headmaster can replace or
  // extend this with the real TIE syllabus via the Syllabus Manager import.
  async function getOrCreateMain(subjectId, formId, code, title) {
    const ins = await client.query(
      `insert into public.main_competences (subject_id, form_id, code, title)
       values ($1, $2, $3, $4)
       on conflict (subject_id, form_id, code) do nothing
       returning id`,
      [subjectId, formId, code, title],
    );
    if (ins.rowCount > 0) return { id: ins.rows[0].id, created: true };
    const sel = await client.query(
      `select id from public.main_competences
       where subject_id = $1 and form_id = $2 and code = $3`,
      [subjectId, formId, code],
    );
    return { id: sel.rows[0].id, created: false };
  }

  async function getOrCreateSpecific(mainId, code, title) {
    const ins = await client.query(
      `insert into public.specific_competences (main_competence_id, code, title)
       values ($1, $2, $3)
       on conflict (main_competence_id, code) do nothing
       returning id`,
      [mainId, code, title],
    );
    if (ins.rowCount > 0) return { id: ins.rows[0].id, created: true };
    const sel = await client.query(
      `select id from public.specific_competences
       where main_competence_id = $1 and code = $2`,
      [mainId, code],
    );
    return { id: sel.rows[0].id, created: false };
  }

  async function getOrCreateActivity(specificId, code, activity) {
    const ins = await client.query(
      `insert into public.learning_activities
         (specific_competence_id, code, activity_description,
          suggested_methods, assessment_criteria, resources, periods_allocated)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (specific_competence_id, code) do nothing
       returning id`,
      [specificId, code, activity.description, activity.methods, activity.criteria, activity.resources, activity.periods],
    );
    if (ins.rowCount > 0) return { id: ins.rows[0].id, created: true };
    const sel = await client.query(
      `select id from public.learning_activities
       where specific_competence_id = $1 and code = $2`,
      [specificId, code],
    );
    return { id: (sel.rows[0] ?? {}).id ?? null, created: false };
  }

  const pairRes = await client.query(
    `select distinct s.id as subject_id, s.name as subject_name, f.id as form_id, f.name as form_name
     from public.teacher_subjects ts
     join public.subjects s on s.id = ts.subject_id
     join public.forms f on f.id = ts.form_id`,
  );

  let mains = 0;
  let specifics = 0;
  let activities = 0;
  for (const pair of pairRes.rows) {
    const { subject_id: sId, subject_name: sName, form_id: fId, form_name: fName } = pair;

    const mainBlocks = [
      {
        code: "1",
        title: `Fundamental concepts and skills in ${sName}`,
        specifics: [
          {
            code: "1.1",
            title: `Core terms and principles of ${sName}`,
            activities: [
              {
                code: "1.1.1",
                description: `Identify and explain the key terms and ideas for ${sName} ${fName}`,
                methods: "Question and answer, pair work",
                criteria: "Correctly explains the key terms in own words",
                resources: "Textbook, notes, chalkboard",
                periods: 2,
              },
              {
                code: "1.1.2",
                description: "Relate the concepts to familiar everyday situations",
                methods: "Discussion, group work",
                criteria: "Gives correct examples from daily life",
                resources: "Chart, pictures",
                periods: 2,
              },
            ],
          },
          {
            code: "1.2",
            title: `Using ${sName} knowledge to describe the world`,
            activities: [
              {
                code: "1.2.1",
                description: `Observe and record examples of ${sName} concepts in the environment`,
                methods: "Field observation, note making",
                criteria: "Records accurate examples",
                resources: "Worksheet, pencil",
                periods: 3,
              },
              {
                code: "1.2.2",
                description: "Present observations and answer class questions",
                methods: "Presentation, discussion",
                criteria: "Presents findings clearly and accurately",
                resources: "Display chart",
                periods: 2,
              },
            ],
          },
        ],
      },
      {
        code: "2",
        title: `Application of ${sName} in real-world tasks`,
        specifics: [
          {
            code: "2.1",
            title: "Practical tasks and problem solving",
            activities: [
              {
                code: "2.1.1",
                description: `Carry out guided exercises applying ${sName} skills`,
                methods: "Guided practice, demonstration",
                criteria: "Completes exercises correctly",
                resources: "Exercise book, tools",
                periods: 3,
              },
              {
                code: "2.1.2",
                description: "Work in groups to solve a given problem",
                methods: "Group work, peer discussion",
                criteria: "Cooperates and reaches the correct solution",
                resources: "Task cards",
                periods: 2,
              },
            ],
          },
          {
            code: "2.2",
            title: "Presenting and evaluating work",
            activities: [
              {
                code: "2.2.1",
                description: "Prepare and present the group solution to the class",
                methods: "Presentation",
                criteria: "Presents work logically",
                resources: "Chalkboard, flip chart",
                periods: 2,
              },
              {
                code: "2.2.2",
                description: "Assess own and peers' work against the criteria",
                methods: "Self and peer assessment",
                criteria: "Gives fair and accurate feedback",
                resources: "Assessment checklist",
                periods: 2,
              },
            ],
          },
        ],
      },
    ];

    for (const main of mainBlocks) {
      const mainRes = await getOrCreateMain(sId, fId, main.code, main.title);
      if (mainRes.created) mains++;
      for (const specific of main.specifics) {
        const specificRes = await getOrCreateSpecific(mainRes.id, specific.code, specific.title);
        if (specificRes.created) specifics++;
        for (const activity of specific.activities) {
          const activityRes = await getOrCreateActivity(specificRes.id, activity.code, activity);
          if (activityRes.created) activities++;
        }
      }
    }
    console.log(`syllabus ensured for ${sName} · ${fName}`);
  }

  const counts = await client.query(
    `select
       (select count(*) from public.forms) as forms,
       (select count(*) from public.schools) as schools,
       (select count(*) from public.teacher_subjects) as teacher_subjects,
       (select count(*) from public.main_competences) as main_competences,
       (select count(*) from public.specific_competences) as specific_competences,
       (select count(*) from public.learning_activities) as learning_activities`,
  );
  console.log(
    `syllabus summary: +${mains} mains, +${specifics} specifics, +${activities} activities ensured`,
  );
  console.log("Totals:", counts.rows[0]);
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}