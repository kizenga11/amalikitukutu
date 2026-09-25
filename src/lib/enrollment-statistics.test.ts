import { describe, expect, it } from "vitest";
import type { EnrollmentStreamStat } from "./school-api";

function totals(rows: EnrollmentStreamStat[]) {
  const male = rows.reduce((sum, row) => sum + row.male, 0);
  const female = rows.reduce((sum, row) => sum + row.female, 0);
  return { male, female, total: male + female };
}

describe("student enrollment subject totals", () => {
  it("keeps stream, form, and grand totals mathematically consistent", () => {
    const rows: EnrollmentStreamStat[] = [
      { classId: "f1", className: "Form 1", formLevel: 1, streamId: "1a", streamName: "1A", male: 4, female: 6, total: 10 },
      { classId: "f1", className: "Form 1", formLevel: 1, streamId: "1b", streamName: "1B", male: 5, female: 3, total: 8 },
      { classId: "f2", className: "Form 2", formLevel: 2, streamId: "2a", streamName: "2A", male: 7, female: 2, total: 9 },
    ];
    const formOne = rows.filter((row) => row.formLevel === 1);
    const grand = totals(rows);
    expect(formOne.every((row) => row.total === row.male + row.female)).toBe(true);
    expect(totals(formOne)).toEqual({ male: 9, female: 9, total: 18 });
    expect(grand).toEqual({ male: 16, female: 11, total: 27 });
    expect(grand.total).toBe(totals(formOne).total + totals(rows.filter((row) => row.formLevel === 2)).total);
  });
});
