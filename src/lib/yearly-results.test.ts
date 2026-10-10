import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
} from "./grading";
import {
  MIN_EXAMS_PER_SUBJECT,
  MIN_SUBJECTS_FOR_YEARLY_RANKING,
  buildYearlyReport,
  type YearlyEnrollmentInput,
  type YearlyExamMeta,
  type YearlyMarkInput,
  type YearlySettings,
  type YearlyStudentInput,
  type YearlySubjectMeta,
} from "./yearly-results";

const settings: YearlySettings = {
  gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
  divisionRanges: DEFAULT_DIVISION_RANGES,
  competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
};

const exams: YearlyExamMeta[] = ["e1", "e2", "e3", "e4", "e5"].map((id, index) => ({
  id,
  name: `Exam ${index + 1}`,
  start_date: `2026-0${index + 1}-01`,
}));

function subject(id: string, code: string): YearlySubjectMeta {
  return { id, code, name: code, has_practical: false };
}

function student(id: string, name: string): YearlyStudentInput {
  return { student_id: id, first_name: name, middle_name: null, last_name: "", gender: "Male", stream_id: null, stream_name: "A" };
}

function mark(examId: string, studentId: string, subjectId: string, score: number): YearlyMarkInput {
  return { exam_id: examId, student_id: studentId, subject_id: subjectId, theory: score, practical: null, is_absent: false };
}

function enroll(studentId: string, subjectId: string): YearlyEnrollmentInput {
  return { student_id: studentId, subject_id: subjectId, academic_year: null };
}

describe("buildYearlyReport eligibility", () => {
  it("only qualifies a subject once the student sat MIN_EXAMS_PER_SUBJECT exams", () => {
    const s1 = subject("s1", "MAT");
    const marks: YearlyMarkInput[] = [];
    for (const exam of exams) marks.push(mark(exam.id, "A", "s1", 80));
    for (const exam of exams.slice(0, 4)) marks.push(mark(exam.id, "C", "s1", 100));

    const report = buildYearlyReport({
      students: [student("A", "Ana"), student("C", "Cara")],
      subjects: [s1],
      marks,
      enrollment: [enroll("A", "s1"), enroll("C", "s1")],
      exams,
      settings,
    });

    expect(report.subjects).toHaveLength(1);
    expect(report.subjects[0].sat).toBe(1);
    expect(report.subjects[0].average).toBe(80);
    expect(report.bestPerSubject[0].top.map((entry) => entry.student_id)).toEqual(["A"]);
    const c = report.excluded.find((item) => item.student_id === "C");
    expect(c?.reason).toBe("too_few_exams");
  });

  it("never lets a left-subject student change the class average or best student", () => {
    const s1 = subject("s1", "PHY");
    const marks: YearlyMarkInput[] = [];
    for (const exam of exams) marks.push(mark(exam.id, "A", "s1", 60));
    for (const exam of exams) marks.push(mark(exam.id, "B", "s1", 100));

    const report = buildYearlyReport({
      students: [student("A", "Ana"), student("B", "Beka")],
      subjects: [s1],
      marks,
      enrollment: [enroll("A", "s1")],
      exams,
      settings,
    });

    expect(report.subjects[0].average).toBe(60);
    expect(report.subjects[0].bestStudentId).toBe("A");
    expect(report.bestPerSubject[0].top[0].student_id).toBe("A");
    const b = report.excluded.find((item) => item.student_id === "B");
    expect(b?.reason).toBe("left_subject");
    expect(b?.left_subject_codes).toEqual(["PHY"]);
  });

  it("includes left-subject scores in subject stats only when requested", () => {
    const s1 = subject("s1", "PHY");
    const marks: YearlyMarkInput[] = [];
    for (const exam of exams) marks.push(mark(exam.id, "A", "s1", 60));
    for (const exam of exams) marks.push(mark(exam.id, "B", "s1", 100));

    const base = {
      students: [student("A", "Ana"), student("B", "Beka")],
      subjects: [s1],
      marks,
      enrollment: [enroll("A", "s1")],
      exams,
      settings,
    };
    const off = buildYearlyReport({ ...base, includeLeft: false });
    const on = buildYearlyReport({ ...base, includeLeft: true });

    expect(off.subjects[0].average).toBe(60);
    expect(off.subjects[0].sat).toBe(1);
    expect(on.subjects[0].average).toBe(80);
    expect(on.subjects[0].sat).toBe(2);
  });

  it("ranks a student only with MIN_SUBJECTS_FOR_YEARLY_RANKING qualifying subjects", () => {
    const subjects = Array.from({ length: 7 }, (_, index) => subject(`s${index + 1}`, `S${index + 1}`));
    const marks: YearlyMarkInput[] = [];
    const enrollment: YearlyEnrollmentInput[] = [];
    for (let index = 0; index < 7; index += 1) {
      enrollment.push(enroll("A", `s${index + 1}`));
      for (const exam of exams) marks.push(mark(exam.id, "A", `s${index + 1}`, 70));
    }
    for (let index = 0; index < 6; index += 1) {
      enrollment.push(enroll("B", `s${index + 1}`));
      for (const exam of exams) marks.push(mark(exam.id, "B", `s${index + 1}`, 70));
    }

    const report = buildYearlyReport({
      students: [student("A", "Ana"), student("B", "Beka")],
      subjects,
      marks,
      enrollment,
      exams,
      settings,
    });

    expect(MIN_SUBJECTS_FOR_YEARLY_RANKING).toBe(7);
    expect(report.ranking.map((row) => row.student_id)).toEqual(["A"]);
    const b = report.excluded.find((item) => item.student_id === "B");
    expect(b?.reason).toBe("too_few_exams");
    expect(b?.detail).toContain("7 required");
  });

  it("uses MIN_EXAMS_PER_SUBJECT as the single subject threshold", () => {
    expect(MIN_EXAMS_PER_SUBJECT).toBe(5);
  });
});
