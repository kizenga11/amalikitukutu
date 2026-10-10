import type { ExamAttendanceClass, ExamAttendanceData, ExamAttendanceStudent } from "./school-api";

export interface AttendanceSheetStudent {
  no: number;
  student_id: string;
  registration_no: string | null;
  full_name: string;
  stream_id: string | null;
  stream_name: string;
}

export interface AttendanceSheet {
  key: string;
  class_id: string;
  class_name: string;
  stream_id: string | null;
  stream_name: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  students: AttendanceSheetStudent[];
}

export interface BuildSheetsOptions {
  classId: string;
  // undefined or "all" -> every stream; a string -> that stream id; null -> unassigned
  stream?: "all" | string | null;
  subjectId?: string | null;
  includeEmpty?: boolean;
}

export interface AttendanceStreamOption {
  id: string | null;
  name: string;
  count: number;
}

export function studentFullName(
  student: Pick<ExamAttendanceStudent, "first_name" | "middle_name" | "last_name">,
): string {
  return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");
}

// Distinct streams present in a class, with their enrolled-student counts.
// Unassigned students (no stream) surface as a single `null` option.
export function listClassStreams(data: ExamAttendanceData, classId: string): AttendanceStreamOption[] {
  const classRow = data.classes.find((c) => c.class_id === classId);
  if (!classRow) return [];
  const map = new Map<string, AttendanceStreamOption>();
  for (const student of classRow.students) {
    const key = student.stream_id ?? "__none__";
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { id: student.stream_id, name: student.stream_name, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function makeSheet(
  classRow: ExamAttendanceClass,
  subject: { subject_id: string; code: string; name: string },
  streamId: string | null,
  streamName: string,
  students: ExamAttendanceStudent[],
): AttendanceSheet {
  const rows: AttendanceSheetStudent[] = students.map((student, index) => ({
    no: index + 1,
    student_id: student.student_id,
    registration_no: student.registration_no,
    full_name: studentFullName(student),
    stream_id: student.stream_id,
    stream_name: student.stream_name,
  }));
  return {
    key: `${classRow.class_id}|${streamId ?? "__none__"}|${subject.subject_id}`,
    class_id: classRow.class_id,
    class_name: classRow.class_name,
    stream_id: streamId,
    stream_name: streamName,
    subject_id: subject.subject_id,
    subject_code: subject.code,
    subject_name: subject.name,
    students: rows,
  };
}

// One sheet per (subject × stream): header shows school/exam/class/stream/
// subject with a blank date, then the students taking that subject.
export function buildAttendanceSheets(
  data: ExamAttendanceData,
  options: BuildSheetsOptions,
): AttendanceSheet[] {
  const classRow = data.classes.find((c) => c.class_id === options.classId);
  if (!classRow) return [];

  const streamFilter = options.stream === undefined ? "all" : options.stream;
  const matchesStream = (student: ExamAttendanceStudent) =>
    streamFilter === "all" ? true : (student.stream_id ?? null) === streamFilter;

  const streamNameById = new Map<string, string>();
  for (const student of classRow.students) {
    streamNameById.set(student.stream_id ?? "__none__", student.stream_name);
  }

  const sheets: AttendanceSheet[] = [];
  for (const subject of classRow.subjects) {
    if (options.subjectId && subject.subject_id !== options.subjectId) continue;

    const enrolled = classRow.students.filter(
      (student) => matchesStream(student) && student.subjects.includes(subject.subject_id),
    );

    const byStream = new Map<string, ExamAttendanceStudent[]>();
    for (const student of enrolled) {
      const key = student.stream_id ?? "__none__";
      const list = byStream.get(key) ?? [];
      list.push(student);
      byStream.set(key, list);
    }

    if (byStream.size === 0) {
      if (!options.includeEmpty) continue;
      const streamId = streamFilter === "all" ? null : streamFilter;
      const streamName =
        streamId === null ? streamNameById.get("__none__") ?? "Haijafungwa" : streamNameById.get(streamId) ?? "—";
      sheets.push(makeSheet(classRow, subject, streamId, streamName, []));
      continue;
    }

    for (const [key, students] of byStream) {
      const streamId = key === "__none__" ? null : key;
      const streamName = streamNameById.get(key) ?? "—";
      sheets.push(makeSheet(classRow, subject, streamId, streamName, students));
    }
  }

  return sheets.sort(
    (a, b) => a.subject_name.localeCompare(b.subject_name) || a.stream_name.localeCompare(b.stream_name),
  );
}
