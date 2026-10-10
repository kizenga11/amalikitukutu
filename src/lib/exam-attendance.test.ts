import { describe, expect, it } from "vitest";
import type { ExamAttendanceClass, ExamAttendanceData, ExamAttendanceStudent } from "./school-api";
import { buildAttendanceSheets, listClassStreams, studentFullName } from "./exam-attendance";

function student(
  id: string,
  first: string,
  last: string,
  streamId: string | null,
  streamName: string,
  subjects: string[],
  middle: string | null = null,
): ExamAttendanceStudent {
  return {
    student_id: id,
    registration_no: `S8384/${id.padStart(4, "0")}/2026`,
    first_name: first,
    middle_name: middle,
    last_name: last,
    gender: "Female",
    stream_id: streamId,
    stream_name: streamName,
    subjects,
  };
}

const klass: ExamAttendanceClass = {
  class_id: "c1",
  class_name: "Form II",
  subjects: [
    { subject_id: "bio", code: "BIO", name: "Biology" },
    { subject_id: "math", code: "MATH", name: "Mathematics" },
    { subject_id: "chem", code: "CHEM", name: "Chemistry" },
  ],
  students: [
    student("1", "Juma", "Asha", "s1", "II A", ["bio", "math"]),
    student("2", "Neema", "Balozi", "s1", "II A", ["bio"]),
    student("3", "Musa", "Chao", "s2", "II B", ["bio", "math"]),
    student("4", "Halima", "Doto", null, "Haijafungwa", ["math"]),
  ],
};

const data: ExamAttendanceData = { classes: [klass] };

describe("exam attendance sheets", () => {
  it("builds a full name, omitting a missing middle name", () => {
    expect(studentFullName({ first_name: "A", middle_name: "B", last_name: "C" })).toBe("A B C");
    expect(studentFullName({ first_name: "A", middle_name: null, last_name: "C" })).toBe("A C");
  });

  it("lists class streams with counts, including unassigned", () => {
    const streams = listClassStreams(data, "c1");
    expect(streams).toEqual([
      { id: null, name: "Haijafungwa", count: 1 },
      { id: "s1", name: "II A", count: 2 },
      { id: "s2", name: "II B", count: 1 },
    ]);
  });

  it("splits each subject per stream and numbers students", () => {
    const sheets = buildAttendanceSheets(data, { classId: "c1", stream: "all" });
    // BIO: s1, s2 | MATH: unassigned, s1, s2  -> 5 sheets (CHEM empty, skipped)
    expect(sheets).toHaveLength(5);
    const first = sheets[0];
    expect(first.subject_name).toBe("Biology");
    expect(first.stream_name).toBe("II A");
    expect(first.students.map((s) => s.no)).toEqual([1, 2]);
    expect(first.students.map((s) => s.full_name)).toEqual(["Juma Asha", "Neema Balozi"]);
    // sheet keys are unique
    expect(new Set(sheets.map((s) => s.key)).size).toBe(5);
  });

  it("filters by a single subject", () => {
    const sheets = buildAttendanceSheets(data, { classId: "c1", stream: "all", subjectId: "math" });
    expect(sheets).toHaveLength(3);
    expect(sheets.every((s) => s.subject_id === "math")).toBe(true);
  });

  it("filters by a single stream and by unassigned stream", () => {
    const streamOne = buildAttendanceSheets(data, { classId: "c1", stream: "s1" });
    expect(streamOne.map((s) => s.subject_name)).toEqual(["Biology", "Mathematics"]);

    const unassigned = buildAttendanceSheets(data, { classId: "c1", stream: null });
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]).toMatchObject({ subject_id: "math", stream_id: null, stream_name: "Haijafungwa" });
  });

  it("skips empty subjects unless includeEmpty is set", () => {
    expect(buildAttendanceSheets(data, { classId: "c1" }).some((s) => s.subject_id === "chem")).toBe(false);
    const withEmpty = buildAttendanceSheets(data, { classId: "c1", includeEmpty: true });
    expect(withEmpty.some((s) => s.subject_id === "chem" && s.students.length === 0)).toBe(true);
  });
});
