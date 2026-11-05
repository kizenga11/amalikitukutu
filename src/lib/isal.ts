import type { IsalStudent } from "./school-api";

// Rows that fit on one A4 portrait page at 12pt after the header and (on the
// last page) the signature footer. Kept conservative so a printed row or the
// footer is never pushed onto an extra blank page.
export const ISAL_ROWS_PER_PAGE = 33;

export interface IsalSubjectInfo {
  subject_id: string;
  subject_name: string;
  subject_code: string;
}

export interface IsalStudentRow {
  no: number;
  student_id: string;
  registration_no: string | null;
  full_name: string;
  class_name: string;
  sex: string;
}

export interface IsalPageData {
  page: number;
  pages: number;
  rows: IsalStudentRow[];
}

export interface IsalSheet {
  key: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  stream_label: string;
  boys: number;
  girls: number;
  total: number;
  pages: IsalPageData[];
}

export function isalFullName(
  student: Pick<IsalStudent, "first_name" | "middle_name" | "last_name">,
): string {
  return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");
}

export function normalizeIsalName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

export function isalSex(gender: string): string {
  if (gender === "Male") return "M";
  if (gender === "Female") return "F";
  return "";
}

export function isalStreamLabel(
  student: Pick<IsalStudent, "class_id" | "stream_name">,
  classNames?: Map<string, string>,
): string {
  const className = classNames?.get(student.class_id)?.trim() ?? "";
  const rawStream = student.stream_name?.trim() ?? "";
  const streamName = rawStream && rawStream !== "—" ? rawStream : "";
  const parts = [className, streamName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

// Streams covered by one ISAL, shown in the sheet title instead of a column.
export function isalSheetStreamLabel(
  students: IsalStudent[],
  classNames?: Map<string, string>,
): string {
  const labels = Array.from(
    new Set(
      students
        .map((student) => isalStreamLabel(student, classNames))
        .filter((label) => label && label !== "—"),
    ),
  ).sort((a, b) => a.localeCompare(b));
  return labels.join(", ");
}

// Rows follow registration number ascending; students without a
// registration number go last, then fall back to alphabetical order.
export function buildIsalRows(
  students: IsalStudent[],
  classNames?: Map<string, string>,
): IsalStudentRow[] {
  return students
    .map((student) => ({
      no: 0,
      student_id: student.student_id,
      registration_no: student.registration_no,
      full_name: normalizeIsalName(isalFullName(student)),
      class_name: classNames?.get(student.class_id) ?? "—",
      sex: isalSex(student.gender),
    }))
    .sort((a, b) => {
      const regA = a.registration_no?.trim() ?? "";
      const regB = b.registration_no?.trim() ?? "";
      if (!regA && regB) return 1;
      if (regA && !regB) return -1;
      return (
        regA.localeCompare(regB, undefined, { numeric: true, sensitivity: "base" }) ||
        a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" }) ||
        a.student_id.localeCompare(b.student_id)
      );
    })
    .map((row, index) => ({ ...row, no: index + 1 }));
}

export function buildIsalSheet(params: {
  subject: IsalSubjectInfo;
  students: IsalStudent[];
  classNames?: Map<string, string>;
  rowsPerPage?: number;
}): IsalSheet {
  const { subject, students, classNames } = params;
  const rowsPerPage = Math.max(1, Math.floor(params.rowsPerPage ?? ISAL_ROWS_PER_PAGE));
  const rows = buildIsalRows(students, classNames);
  const boys = rows.filter((row) => row.sex === "M").length;
  const girls = rows.filter((row) => row.sex === "F").length;
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  const pages: IsalPageData[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    pages.push({
      page: index + 1,
      pages: pageCount,
      rows: rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage),
    });
  }

  return {
    key: subject.subject_id,
    subject_id: subject.subject_id,
    subject_name: subject.subject_name,
    subject_code: subject.subject_code,
    stream_label: isalSheetStreamLabel(students, classNames),
    boys,
    girls,
    total: rows.length,
    pages,
  };
}
