import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  MIN_SUBJECTS_FOR_DIVISION,
  buildClassResults,
  buildSchoolReport,
  competencyLabel,
  computeGradeAndPoints,
  computeStudentResult,
  computeSubjectScore,
  rankResults,
  type ClassResults,
  type ClassSubjectsInput,
  type MarksCellInput,
  type ScoredSubjectInput,
  type StudentBase,
  type StudentResult,
} from "./grading";

function scoredSubjectsWithScores(scores: number[], absent: boolean[] = []): ScoredSubjectInput[] {
  return scores.map((score, i) => ({
    subject_id: `sub${i}`,
    subject_code: `S${i + 1}`,
    subject_name: `Subject ${i + 1}`,
    has_practical: false,
    theory: score,
    practical: null,
    is_absent: absent[i] ?? false,
  }));
}

function makeBase(studentId: string, firstName: string, lastName: string, gender: string): StudentBase {
  return {
    student_id: studentId,
    first_name: firstName,
    middle_name: null,
    last_name: lastName,
    gender,
    stream_id: null,
    stream_name: "",
  };
}

function studentResult(
  studentId: string,
  firstName: string,
  lastName: string,
  gender: string,
  scores: number[],
  absent: boolean[] = [],
): StudentResult {
  return computeStudentResult(makeBase(studentId, firstName, lastName, gender), scoredSubjectsWithScores(scores, absent));
}

describe("computeSubjectScore", () => {
  it("returns null when the student is absent", () => {
    expect(computeSubjectScore(80, null, true)).toBeNull();
  });

  it("returns null when both theory and practical are missing", () => {
    expect(computeSubjectScore(null, null, false)).toBeNull();
  });

  it("uses the theory score alone for theory-only subjects", () => {
    expect(computeSubjectScore(60, null, false)).toBe(60);
  });

  it("sums theory and practical for practical subjects", () => {
    expect(computeSubjectScore(30, 20, false)).toBe(50);
  });

  it("rounds fractional totals to one decimal place", () => {
    expect(computeSubjectScore(20.25, 20.25, false)).toBe(40.5);
  });
});

describe("computeGradeAndPoints", () => {
  it("grades a perfect score as A with 1 point", () => {
    expect(computeGradeAndPoints(100)).toEqual({ grade: "A", points: 1 });
  });

  it("applies boundary values correctly", () => {
    expect(computeGradeAndPoints(75).grade).toBe("A");
    expect(computeGradeAndPoints(74).grade).toBe("B");
    expect(computeGradeAndPoints(65).grade).toBe("B");
    expect(computeGradeAndPoints(64).grade).toBe("C");
    expect(computeGradeAndPoints(45).grade).toBe("C");
    expect(computeGradeAndPoints(44).grade).toBe("D");
    expect(computeGradeAndPoints(30).grade).toBe("D");
    expect(computeGradeAndPoints(29).grade).toBe("F");
    expect(computeGradeAndPoints(0).grade).toBe("F");
  });

  it("falls back to the last boundary for out-of-range scores", () => {
    expect(computeGradeAndPoints(150)).toEqual({ grade: "F", points: 5 });
  });
});

describe("computeStudentResult", () => {
  it("awards Division I for seven A grades", () => {
    const result = studentResult("u1", "Juma", "Hassan", "Male", [90, 90, 90, 90, 90, 90, 90]);
    expect(result.total_points).toBe(7);
    expect(result.division).toBe("Division I");
    expect(result.incomplete).toBe(false);
  });

  it("awards Division II at 18 points", () => {
    const result = studentResult("u1", "Juma", "Hassan", "Male", [70, 70, 70, 50, 50, 50, 50]);
    expect(result.total_points).toBe(18);
    expect(result.division).toBe("Division II");
  });

  it("awards Division III at 23 points", () => {
    const result = studentResult("u1", "Juma", "Hassan", "Male", [50, 50, 50, 50, 50, 35, 35]);
    expect(result.total_points).toBe(23);
    expect(result.division).toBe("Division III");
  });

  it("awards Division IV at 28 points", () => {
    const result = studentResult("u1", "Juma", "Hassan", "Male", [35, 35, 35, 35, 35, 35, 35]);
    expect(result.total_points).toBe(28);
    expect(result.division).toBe("Division IV");
  });

  it("awards Division 0 at 35 points", () => {
    const result = studentResult("u1", "Juma", "Hassan", "Male", [10, 10, 10, 10, 10, 10, 10]);
    expect(result.total_points).toBe(35);
    expect(result.division).toBe("Division 0");
  });

  it("flags a student with fewer than the minimum scored subjects as incomplete", () => {
    const absent = [false, false, false, false, false, false, true];
    const result = studentResult("u1", "Juma", "Hassan", "Male", [90, 90, 90, 90, 90, 90, 90], absent);
    expect(result.incomplete).toBe(true);
    expect(result.total_points).toBeNull();
    expect(result.division).toBe("Incomplete");
  });

  it("marks absent subjects as ABS", () => {
    const absent = [false, false, false, false, false, false, true];
    const result = studentResult("u1", "Juma", "Hassan", "Male", [90, 90, 90, 90, 90, 90, 90], absent);
    const absentSubject = result.subjects[6];
    expect(absentSubject.grade).toBe("ABS");
    expect(absentSubject.total_score).toBeNull();
  });

  it("only counts the best seven subjects towards the total points", () => {
    const scores = [90, 90, 90, 90, 90, 90, 90, 10];
    const result = studentResult("u1", "Juma", "Hassan", "Male", scores);
    expect(result.subjects).toHaveLength(8);
    expect(result.total_points).toBe(7);
    expect(result.division).toBe("Division I");
  });
});

describe("buildClassResults", () => {
  it("builds per-student results restricted to their enrolled subjects", () => {
    const subjects: ClassSubjectsInput[] = [
      { id: "m", code: "M", name: "Maths", has_practical: false },
      { id: "e", code: "E", name: "English", has_practical: false },
    ];
    const rows: ClassResults[] = [
      buildClassResults(
        {
          class_id: "c1",
          class_name: "Form 1A",
          subjects,
          students: [
            { student_id: "sa", first_name: "Amina", middle_name: null, last_name: "Sule", gender: "Male", stream_id: null, stream_name: "", subjects: ["m", "e"] },
            { student_id: "sb", first_name: "Baraka", middle_name: null, last_name: "Temu", gender: "Female", stream_id: null, stream_name: "", subjects: ["m"] },
          ],
        },
        {
          "sa|m": { theory: 80, practical: null, is_absent: false },
          "sa|e": { theory: 70, practical: null, is_absent: false },
          "sb|m": { theory: 50, practical: null, is_absent: false },
        },
      ),
    ];
    const classResult = rows[0];
    expect(classResult.students).toHaveLength(2);
    expect(classResult.students[0].subjects).toHaveLength(2);
    expect(classResult.students[0].subjects[0].grade).toBe("A");
    expect(classResult.students[0].subjects[1].grade).toBe("B");
    expect(classResult.students[1].subjects).toHaveLength(1);
    expect(classResult.students[1].division).toBe("Incomplete");
  });
});

describe("rankResults", () => {
  it("ranks eligible students by points, with ties sharing a rank", () => {
    const ranked = rankResults([
      studentResult("u1", "Asha", "Ali", "Female", [90, 90, 90, 90, 90, 90, 90]),
      studentResult("u2", "Babu", "Bakari", "Male", [90, 90, 90, 90, 90, 90, 90]),
      studentResult("u3", "Chausiku", "Chambo", "Female", [70, 70, 70, 50, 50, 50, 50]),
      studentResult("u4", "Doto", "Daudi", "Male", [90, 90, 90, 90, 90, 90, 90], [false, false, false, false, false, false, true]),
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });
});

describe("buildSchoolReport", () => {
  function makeSubjects(count: number): ClassSubjectsInput[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `sub${i}`,
      code: `S${i + 1}`,
      name: `Subject ${i + 1}`,
      has_practical: false,
    }));
  }

  function makeClass(subjects: ClassSubjectsInput[]): ClassResults {
    const marks: Record<string, MarksCellInput> = {};
    for (const s of subjects) {
      marks[`sa|${s.id}`] = { theory: 80, practical: null, is_absent: false };
      marks[`sb|${s.id}`] = { theory: 50, practical: null, is_absent: false };
    }
    return buildClassResults(
      {
        class_id: "c1",
        class_name: "Form 1A",
        subjects,
        students: [
          { student_id: "sa", first_name: "Amina", middle_name: null, last_name: "Sule", gender: "Male", stream_id: null, stream_name: "", subjects: subjects.map((s) => s.id) },
          { student_id: "sb", first_name: "Baraka", middle_name: null, last_name: "Temu", gender: "Female", stream_id: null, stream_name: "", subjects: subjects.map((s) => s.id) },
        ],
      },
      marks,
    );
  }

  it("computes student rows, divisions, subject performance and summary", () => {
    const report = buildSchoolReport([makeClass(makeSubjects(MIN_SUBJECTS_FOR_DIVISION))], {
      gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
      divisionRanges: DEFAULT_DIVISION_RANGES,
      competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
    });

    expect(report.students).toHaveLength(2);
    expect(report.students[0].student.student_id).toBe("sa");
    expect(report.students[0].avg).toBe(80);
    expect(report.students[0].divisionCode).toBe("I");
    expect(report.students[1].avg).toBe(50);
    expect(report.students[1].divisionCode).toBe("II");

    const divisionI = report.divisions.find((d) => d.division === "I");
    const divisionII = report.divisions.find((d) => d.division === "II");
    expect(divisionI?.boys).toBe(1);
    expect(divisionI?.girls).toBe(0);
    expect(divisionII?.boys).toBe(0);
    expect(divisionII?.girls).toBe(1);

    expect(report.subjects).toHaveLength(MIN_SUBJECTS_FOR_DIVISION);
    expect(report.subjects[0].registered).toBe(2);
    expect(report.subjects[0].sat).toBe(2);
    expect(report.subjects[0].passed).toBe(2);
    expect(report.subjects[0].avg).toBe(65);

    expect(report.summary.average).toBe(65);
    expect(report.summary.grade).toBe("B");
    expect(report.summary.gpa).toBe(2);
    expect(report.summary.students).toBe(2);
  });
});

describe("competencyLabel", () => {
  it("labels mean points against the competency thresholds", () => {
    expect(competencyLabel(null, DEFAULT_COMPETENCY_THRESHOLDS)).toBe("—");
    expect(competencyLabel(1.5, DEFAULT_COMPETENCY_THRESHOLDS)).toBe("Excellent");
    expect(competencyLabel(1.6, DEFAULT_COMPETENCY_THRESHOLDS)).toBe("Very Good");
    expect(competencyLabel(2.0, DEFAULT_COMPETENCY_THRESHOLDS)).toBe("Very Good");
    expect(competencyLabel(2.3, DEFAULT_COMPETENCY_THRESHOLDS)).toBe("Good");
    expect(competencyLabel(3.0, DEFAULT_COMPETENCY_THRESHOLDS)).toBe("Average");
    expect(competencyLabel(3.1, DEFAULT_COMPETENCY_THRESHOLDS)).toBe("Below Average");
  });
});