/* ============================================================
   Timetable — server-side data loader
   ------------------------------------------------------------
   Builds the solver input (spec §9) from the live database.
   Only uses the new timetable tables plus existing
   classes/streams/subjects/staff/teaching_assignments.
   ============================================================ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RULES,
  normalizeRules,
  type DaySlot,
  type SlotKind,
  type SolverInput,
  type TimetableAssignment,
  type TimetableClass,
  type TimetableLabels,
  type TimetableRules,
} from "./timetable";

let cached: SupabaseClient | null = null;

export function timetableDb(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}

interface FormRow {
  id: string;
  form_level: number;
  name: string;
}

interface StreamRow {
  id: string;
  class_id: string;
  name: string;
}

interface SubjectRow {
  id: string;
  code: string;
  name: string;
}

interface StaffRow {
  id: string;
  name: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
}

interface AssignmentRow {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
  stream_id: string;
}

interface SlotRow {
  id: string;
  day: number;
  position: number;
  start_time: string;
  end_time: string;
  kind: SlotKind;
  label: string | null;
}

interface ScopeRow {
  slot_id: string;
  class_id: string;
}

interface PeriodRow {
  class_id: string;
  subject_id: string;
  assignment_id: string;
  periods: number;
  morning_priority: number;
}

interface UnavailableRow {
  teacher_id: string;
  slot_id: string;
}

interface TeacherLimitRow {
  teacher_id: string;
  max_per_day: number;
}

interface RuleRow {
  key: string;
  value_json: unknown;
}

export interface TimetableData {
  classes: TimetableClass[];
  subjects: { id: string; code: string; name: string }[];
  teachers: { id: string; name: string }[];
  assignments: TimetableAssignment[];
  slots: DaySlot[];
  rules: TimetableRules;
  unavailable: { teacherId: string; slotIds: string[] }[];
  teacherLimits: { teacherId: string; maxPerDay: number }[];
  input: SolverInput;
  labels: Required<TimetableLabels>;
}

const ROMAN = ["I", "II", "III", "IV"];

export function classLabelFor(formLevel: number, streamIndex: number, streamName: string): string {
  const form = ROMAN[formLevel - 1] ?? String(formLevel);
  if (streamIndex >= 0 && streamIndex < 26) {
    return `${form}${String.fromCharCode(65 + streamIndex)}`;
  }
  return `${form} ${streamName}`;
}

export async function loadTimetableData(sourceVersionId?: string): Promise<TimetableData> {
  const db = timetableDb();

  const [
    formsResult,
    streamsResult,
    subjectsResult,
    staffResult,
    assignmentsResult,
    slotsResult,
    scopesResult,
    periodsResult,
    unavailableResult,
    teacherLimitsResult,
    rulesResult,
  ] = await Promise.all([
    db.from("school_classes").select("id, form_level, name"),
    db.from("streams").select("id, class_id, name"),
    db.from("subjects").select("id, code, name"),
    db.from("staff").select("id, name, first_name, middle_name, last_name"),
    db.from("teaching_assignments").select("id, teacher_id, subject_id, class_id, stream_id"),
    db.from("timetable_day_slot").select("id, day, position, start_time, end_time, kind, label").order("day").order("position"),
    db.from("timetable_slot_scope").select("slot_id, class_id"),
    db.from("timetable_subject_periods").select("class_id, subject_id, assignment_id, periods, morning_priority"),
    db.from("timetable_teacher_unavailable").select("teacher_id, slot_id"),
    db.from("timetable_teacher_limit").select("teacher_id, max_per_day"),
    db.from("timetable_rules").select("key, value_json"),
  ]);

  const failed = [
    ["school classes", formsResult.error],
    ["streams", streamsResult.error],
    ["subjects", subjectsResult.error],
    ["staff", staffResult.error],
    ["teaching assignments", assignmentsResult.error],
    ["day slots", slotsResult.error],
    ["slot scopes", scopesResult.error],
    ["subject periods", periodsResult.error],
    ["teacher availability", unavailableResult.error],
    ["teacher daily limits", teacherLimitsResult.error],
    ["timetable rules", rulesResult.error],
  ].find(([, error]) => error);
  if (failed) throw new Error(`Could not load ${failed[0]}: ${(failed[1] as { message: string }).message}`);

  const forms = (formsResult.data ?? []) as unknown as FormRow[];
  const streams = (streamsResult.data ?? []) as unknown as StreamRow[];
  const subjects = (subjectsResult.data ?? []) as unknown as SubjectRow[];
  const staff = (staffResult.data ?? []) as unknown as StaffRow[];
  const teachingAssignments = (assignmentsResult.data ?? []) as unknown as AssignmentRow[];
  const slotRows = (slotsResult.data ?? []) as unknown as SlotRow[];
  const scopes = (scopesResult.data ?? []) as unknown as ScopeRow[];
  const periodRows = (periodsResult.data ?? []) as unknown as PeriodRow[];
  const unavailableRows = (unavailableResult.data ?? []) as unknown as UnavailableRow[];
  const teacherLimitRows = (teacherLimitsResult.data ?? []) as unknown as TeacherLimitRow[];
  const ruleRows = (rulesResult.data ?? []) as unknown as RuleRow[];

  const formById = new Map(forms.map((form) => [form.id, form]));

  const classes: TimetableClass[] = [];
  const streamsByForm = new Map<string, StreamRow[]>();
  for (const stream of streams) {
    streamsByForm.set(stream.class_id, [...(streamsByForm.get(stream.class_id) ?? []), stream]);
  }
  for (const [formId, formStreams] of streamsByForm) {
    const form = formById.get(formId);
    if (!form) continue;
    const ordered = [...formStreams].sort((a, b) => a.name.localeCompare(b.name));
    ordered.forEach((stream, streamIndex) => {
      classes.push({
        id: stream.id,
        label: classLabelFor(form.form_level, streamIndex, stream.name),
        formLevel: form.form_level,
        streamName: stream.name,
      });
    });
  }
  classes.sort((a, b) => a.formLevel - b.formLevel || a.label.localeCompare(b.label));

  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const teacherNameById = new Map(
    staff.map((member) => [
      member.id,
      member.name?.trim() ||
        [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(" ").trim() ||
        "Teacher",
    ]),
  );

  const periodByAssignment = new Map(periodRows.map((row) => [row.assignment_id, row]));

  const assignments: TimetableAssignment[] = teachingAssignments
    .map((assignment) => {
      const period = periodByAssignment.get(assignment.id);
      const subject = subjectById.get(assignment.subject_id);
      return {
        id: assignment.id,
        classId: assignment.stream_id,
        subjectId: assignment.subject_id,
        subjectCode: subject?.code ?? "SUB",
        subjectName: subject?.name ?? "Subject",
        teacherId: assignment.teacher_id,
        teacherName: teacherNameById.get(assignment.teacher_id) ?? "Teacher",
        periods: period?.periods ?? 0,
        priority: period?.morning_priority ?? 0,
      };
    })
    .sort(
      (a, b) =>
        a.classId.localeCompare(b.classId) ||
        a.subjectName.localeCompare(b.subjectName) ||
        a.teacherName.localeCompare(b.teacherName),
    );

  const scopesBySlot = new Map<string, string[]>();
  for (const scope of scopes) {
    scopesBySlot.set(scope.slot_id, [...(scopesBySlot.get(scope.slot_id) ?? []), scope.class_id]);
  }

  const slots: DaySlot[] = slotRows.map((row) => ({
    id: row.id,
    day: Number(row.day),
    position: Number(row.position),
    start: String(row.start_time).slice(0, 5),
    end: String(row.end_time).slice(0, 5),
    kind: row.kind,
    label: row.label,
    appliesTo: row.kind === "special" ? (scopesBySlot.get(row.id) ?? ["*"]) : ["*"],
  }));

  const days = [...new Set(slots.map((slot) => slot.day))]
    .sort((a, b) => a - b)
    .map((day) => ({
      id: day,
      slots: slots
        .filter((slot) => slot.day === day)
        .sort((a, b) => a.position - b.position)
        .map((slot) => ({
          id: slot.id,
          start: slot.start,
          end: slot.end,
          kind: slot.kind,
          label: slot.label ?? undefined,
          appliesTo: slot.appliesTo,
        })),
    }));

  const unavailableMap = new Map<string, string[]>();
  for (const row of unavailableRows) {
    unavailableMap.set(row.teacher_id, [...(unavailableMap.get(row.teacher_id) ?? []), row.slot_id]);
  }
  const unavailable = [...unavailableMap].map(([teacherId, slotIds]) => ({ teacherId, slotIds }));

  const teacherLimits = teacherLimitRows
    .filter((row) => teacherNameById.has(row.teacher_id))
    .map((row) => ({ teacherId: row.teacher_id, maxPerDay: Number(row.max_per_day) }))
    .filter((row) => Number.isInteger(row.maxPerDay) && row.maxPerDay > 0);

  const rules = parseRules(ruleRows);

  const subjectPriority: Record<string, number> = {};
  const solverAssignments = assignments
    .filter((assignment) => assignment.periods > 0)
    .map((assignment) => {
      subjectPriority[assignment.subjectId] = Math.max(
        subjectPriority[assignment.subjectId] ?? 0,
        assignment.priority,
      );
      return {
        id: assignment.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        periods: assignment.periods,
      };
    });

  let locked: SolverInput["locked"] = [];
  if (sourceVersionId) {
    const { data: lockedRows, error } = await db
      .from("timetable_lesson")
      .select("assignment_id, slot_id, size, locked")
      .eq("version_id", sourceVersionId)
      .eq("locked", true);
    if (error) throw new Error(`Could not load locked lessons: ${error.message}`);
    locked = (lockedRows ?? [])
      .filter((row) => row.assignment_id && row.slot_id)
      .map((row) => ({
        assignmentId: String(row.assignment_id),
        slotId: String(row.slot_id),
        size: Number(row.size) === 2 ? 2 : 1,
      }));
  }

  const classById = new Map(classes.map((cls) => [cls.id, cls]));
  const subjectNameById = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const slotLabelById = new Map(
    slots.map((slot) => [slot.id, `${slot.label ?? slot.kind} ${slot.start}-${slot.end}`]),
  );

  const labels: Required<TimetableLabels> = {
    class: (id) => classById.get(id)?.label ?? id,
    teacher: (id) => teacherNameById.get(id) ?? id,
    subject: (id) => subjectNameById.get(id) ?? id,
    slot: (id) => slotLabelById.get(id) ?? id,
  };

  const input: SolverInput = {
    days,
    classes: classes.map((cls) => ({ id: cls.id })),
    assignments: solverAssignments,
    subjectPriority,
    teacherUnavailable: unavailable,
    teacherLimits,
    locked,
    rules,
  };

  return {
    classes,
    subjects: subjects.map((subject) => ({ id: subject.id, code: subject.code, name: subject.name })),
    teachers: staff.map((member) => ({
      id: member.id,
      name: teacherNameById.get(member.id) ?? "Teacher",
    })),
    assignments,
    slots,
    rules,
    unavailable,
    teacherLimits,
    input,
    labels,
  };
}

function parseRules(rows: RuleRow[]): TimetableRules {
  const partial: Record<string, unknown> = {};
  for (const row of rows) {
    const value = row.value_json;
    if (row.key === "weights" && value && typeof value === "object") {
      partial.weights = value;
    } else if (value && typeof value === "object" && "value" in value) {
      partial[row.key] = (value as { value: unknown }).value;
    } else {
      partial[row.key] = value;
    }
  }
  return normalizeRules({ ...DEFAULT_RULES, ...(partial as Partial<TimetableRules>) });
}
