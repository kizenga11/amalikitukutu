import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
const GENERATED = 5050 + Math.floor(Math.random() * 900);

function expect(value, what) {
  if (!value) throw new Error(`Failed: ${what}`);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomScore(base) {
  const v = base + (Math.random() * 14 - 7);
  return Math.max(35, Math.min(97, Math.round(v * 10) / 10));
}

async function resetTable(table) {
  const pk = table === "academic_settings" ? "key" : "id";
  const { error } = await supabase
    .from(table)
    .delete()
    .neq(pk, pk === "key" ? "00000000-0000-0000-0000-000000000000" : "00000000-0000-0000-0000-000000000000");
  if (error) {
    if (error.code === "PGRST205") {
      throw new Error(
        "Tables do not exist yet. Run the SQL in supabase/migrations/20260101000000_initial_schema.sql in Supabase Dashboard > SQL Editor, then retry this script.",
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------
// Reset all data (dependent tables first)
// ---------------------------------------------------------------
await resetTable("performance");
await resetTable("attendance");
await resetTable("students");
await resetTable("staff");
await resetTable("streams");
await resetTable("school_classes");
await resetTable("subjects");
await resetTable("academic_settings");
await resetTable("academic_years");
console.log("cleared existing rows");

// ---------------------------------------------------------------
// Academic years: 2025 – 2040
// ---------------------------------------------------------------
{
  const years = [];
  for (let y = 2025; y <= 2040; y++) years.push({ id: String(y), label: String(y), term_count: 2 });
  const { error } = await supabase.from("academic_years").insert(years);
  if (error) throw error;
  console.log(`academic_years: ${years.length}`);
}

// ---------------------------------------------------------------
// Active academic period
// ---------------------------------------------------------------
{
  const { error } = await supabase.from("academic_settings").insert([
    { key: "active_year", value: "2026" },
    { key: "active_term", value: "2" },
  ]);
  if (error) throw error;
  console.log("academic_settings: active_year=2026 active_term=2");
}

// ---------------------------------------------------------------
// Classes: Form I – IV
// ---------------------------------------------------------------
const formNames = ["Form I", "Form II", "Form III", "Form IV"];
const { data: classes, error: classesError } = await supabase
  .from("school_classes")
  .insert(formNames.map((name, i) => ({ name, form_level: i + 1 })))
  .select("id, name, form_level");
expect(classes, "classes insert");
if (classesError) throw classesError;
console.log(`classes: ${classes.length}`);

// ---------------------------------------------------------------
// Streams: General + Vocational for every class
// ---------------------------------------------------------------
const streamRows = classes.flatMap((c) => [
  { class_id: c.id, name: "General" },
  { class_id: c.id, name: "Vocational" },
]);
const { data: streams, error: streamsError } = await supabase
  .from("streams")
  .insert(streamRows)
  .select("id, class_id, name");
expect(streams, "streams insert");
if (streamsError) throw streamsError;

const streamByClass = new Map();
for (const s of streams) {
  if (!streamByClass.has(s.class_id)) streamByClass.set(s.class_id, []);
  streamByClass.get(s.class_id).push(s);
}
console.log(`streams: ${streams.length}`);

// ---------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------
const SUBJECT_SEEDS = [
  { code: "MAT", name: "Mathematics", subject_type: "Compulsory", has_practical: false, stream: "Both", base: 64 },
  { code: "ENG", name: "English Language", subject_type: "Compulsory", has_practical: false, stream: "Both", base: 66 },
  { code: "KIS", name: "Kiswahili", subject_type: "Compulsory", has_practical: false, stream: "Both", base: 72 },
  { code: "BIO", name: "Biology", subject_type: "Compulsory", has_practical: true, stream: "Both", base: 61 },
  { code: "PHY", name: "Physics", subject_type: "Compulsory", has_practical: true, stream: "Both", base: 58 },
  { code: "CHE", name: "Chemistry", subject_type: "Compulsory", has_practical: true, stream: "Both", base: 60 },
  { code: "HIS", name: "History & Civics", subject_type: "Compulsory", has_practical: false, stream: "Both", base: 71 },
  { code: "GEO", name: "Geography", subject_type: "Compulsory", has_practical: false, stream: "Both", base: 68 },
  { code: "AGR", name: "Agriculture", subject_type: "Optional", has_practical: true, stream: "Vocational", base: 63 },
  { code: "BUS", name: "Business Studies", subject_type: "Optional", has_practical: false, stream: "Vocational", base: 65 },
];
const { data: subjects, error: subjectsError } = await supabase
  .from("subjects")
  .insert(SUBJECT_SEEDS.map(({ base, ...s }) => s))
  .select("id, code, name");
expect(subjects, "subjects insert");
if (subjectsError) throw subjectsError;
const subjectByCode = new Map(subjects.map((s) => [s.code, s]));
console.log(`subjects: ${subjects.length}`);

// ---------------------------------------------------------------
// Students (~1,284)
// ---------------------------------------------------------------
const MALE_NAMES = ["Juma","Emmanuel","Baraka","Frank","David","Godfrey","Hashim","Ibrahim","Joseph","Kelvin","Lazaro","Mussa","Nickson","Oscar","Peter","Rehema","Said","Tumaini","Wilber","Yusuf"];
const FEMALE_NAMES = ["Aisha","Beatrice","Catherine","Diana","Elizabeth","Fatuma","Grace","Halima","Irene","Janet","Khadija","Leah","Maria","Neema","Prisca","Rehema","Salma","Upendo","Zainabu"];
const MIDDLE_NAMES = ["Abdallah","Salum","Mohammed","Hassan","John","Thomas","Kipanga","Mwinyi","Charles","Jamal","Athumani","Saidi","George","Daniel","Bakari","Mustafa"];
const SURNAMES = ["Mwakasege","Machumu","Kimaro","Mushi","Lyimo","Swai","Massawe","Komba","Mrema","Kalokola","Akyoo","Kileo","Mvungi","Mollel","Mallya","Shirima","Tarimo","Mdoe","Sanga","Msuya","Mlay","Mtui","Mbonde","Nchimbi"];

function tzPhone(n) {
  const digits = String(n).padStart(8, "0");
  return `07${Math.random() < 0.5 ? "6" : "7"}${digits}`;
}

const TOTAL_STUDENTS = 1284;
const allStreams = streams;
const studentRows = [];
{
  let p = 0;
  for (let i = 0; i < TOTAL_STUDENTS; i++) {
    const gender = Math.random() < 0.51 ? "Male" : "Female";
    const stream = allStreams[i % allStreams.length];
    studentRows.push({
      first_name: gender === "Male" ? pick(MALE_NAMES) : pick(FEMALE_NAMES),
      middle_name: Math.random() < 0.5 ? pick(MIDDLE_NAMES) : null,
      last_name: pick(SURNAMES),
      gender,
      phone: tzPhone(++p),
      class_id: stream.class_id,
      stream_id: stream.id,
    });
  }
}
{
  const { data: insertedStudents, error, count } = await supabase
    .from("students")
    .insert(studentRows)
    .select("id, stream_id", { count: "exact", head: false });
  if (error) throw error;
  console.log(`students: ${count ?? TOTAL_STUDENTS}`);

  const compulsorySubjectIdsByStream = new Map();
  for (const stream of streams) {
    compulsorySubjectIdsByStream.set(
      stream.id,
      SUBJECT_SEEDS
        .filter((subject) => subject.subject_type === "Compulsory" && (subject.stream === stream.name || subject.stream === "Both"))
        .map((subject) => subjectByCode.get(subject.code).id),
    );
  }
  const assignmentRows = (insertedStudents ?? []).flatMap((student) =>
    (compulsorySubjectIdsByStream.get(student.stream_id) ?? []).map((subject_id) => ({
      student_id: student.id,
      subject_id,
    })),
  );
  for (let i = 0; i < assignmentRows.length; i += 500) {
    const { error: assignmentError } = await supabase
      .from("student_subjects")
      .upsert(assignmentRows.slice(i, i + 500), { onConflict: "student_id,subject_id", ignoreDuplicates: true });
    if (assignmentError) throw assignmentError;
  }
  console.log(`compulsory subject assignments: ${assignmentRows.length}`);
}

// ---------------------------------------------------------------
// Staff (86 • mostly teachers)
// ---------------------------------------------------------------
const STAFF_NAMES = ["Mr. Ally Mgunda","Ms. Neema Swalehe","Mr. Joseph Kaaya","Ms. Anna Kileo","Mr. Daudi Mushi","Ms. Upendo Mrema","Mr. Godson Mollel","Ms. Grace Shirima","Mr. Ibrahim Mdoe","Ms. Zainab Tarimo","Mr. Peter Mlay","Ms. Rehema Sanga","Mr. Frank Kimaro","Ms. Catherine Mvungi","Mr. Baraka Mwakasege","Ms. Halima Massawe","Mr. Emmanuel Machumu","Ms. Prisca Lyimo","Mr. Kelvin Komba","Ms. Leah Msuya"];
const ADMIN_NAMES = ["Headmaster J. Mwakasege","Academic Officer L. Kimaro","Bursar H. Mushi","Librarian E. Mrema"];
const STAFF_TOTAL = 86;
const staffRows = [];
for (let i = 0; i < STAFF_TOTAL; i++) {
  if (i < ADMIN_NAMES.length) {
    staffRows.push({ name: ADMIN_NAMES[i], role: i === 0 ? "Headmaster" : i === 1 ? "Academic Officer" : i === 2 ? "Bursar" : "Librarian", subject_id: null });
  } else {
    const code = pick(["MAT","ENG","KIS","BIO","PHY","CHE","HIS","GEO","AGR","BUS"]);
    staffRows.push({
      name: STAFF_NAMES[i % STAFF_NAMES.length] + (i >= STAFF_NAMES.length ? ` ${i}` : ""),
      role: "Teacher",
      subject_id: subjectByCode.get(code).id,
    });
  }
}
{
  const { error, count } = await supabase.from("staff").insert(staffRows).select("id", { count: "exact", head: false });
  if (error) throw error;
  console.log(`staff: ${count ?? STAFF_TOTAL}`);
}

// ---------------------------------------------------------------
// Performance: per class × subject, years {2025, 2026}, terms {1, 2}
// ---------------------------------------------------------------
const YEARS = ["2025", "2026"];
const performanceRows = [];
for (const cls of classes) {
  const formBoost = (cls.form_level - 1) * 1.5;
  for (const sub of SUBJECT_SEEDS) {
    const subject = subjectByCode.get(sub.code);
    let prevTerm1 = null;
    for (const year of YEARS) {
      for (const term of [1, 2]) {
        const base = sub.base + formBoost + (year === "2026" ? 2 : 0) + term * 0.8;
        const score = term === 1 && prevTerm1 !== null ? Math.min(97, Math.max(35, Math.round((prevTerm1 + randomScore(base)) / 2 * 10) / 10)) : randomScore(base);
        if (term === 1) prevTerm1 = score;
        performanceRows.push({
          class_id: cls.id,
          subject_id: subject.id,
          academic_year: year,
          term,
          mean_score: score,
        });
      }
    }
  }
}
{
  let inserted = 0;
  for (let i = 0; i < performanceRows.length; i += 200) {
    const chunk = performanceRows.slice(i, i + 200);
    const { error, count } = await supabase.from("performance").insert(chunk).select("id", { count: "exact", head: false });
    if (error) throw error;
    inserted += count ?? chunk.length;
  }
  console.log(`performance rows: ${inserted}`);
}

// ---------------------------------------------------------------
// Attendance: Mon–Fri of the current week, per class
// ---------------------------------------------------------------
const today = new Date();
const day = today.getDay(); // 0 Sun … 6 Sat
const monday = new Date(today);
monday.setDate(today.getDate() - ((day + 6) % 7));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const attendanceRows = [];
for (let i = 0; i < 5; i++) {
  const date = new Date(monday);
  date.setDate(monday.getDate() + i);
  for (const cls of classes) {
    const streamCount = streamByClass.get(cls.id).length;
    const total = 60 + cls.form_level * 8;
    const absence = Math.ceil(total * (0.03 + (i === 2 ? 0.09 : 0.03) + Math.random() * 0.03));
    attendanceRows.push({
      class_id: cls.id,
      attendance_date: date.toISOString().slice(0, 10),
      present: total - absence,
      total: total + streamCount,
    });
  }
}
{
  const { error, count } = await supabase.from("attendance").insert(attendanceRows).select("id", { count: "exact", head: false });
  if (error) throw error;
  console.log(`attendance rows: ${count ?? attendanceRows.length}`);
}

console.log("seed complete");