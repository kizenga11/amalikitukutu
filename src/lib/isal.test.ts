import { describe, expect, it } from "vitest";
import type { IsalStudent } from "./school-api";
import {
  buildIsalSheet,
  ISAL_ROWS_PER_PAGE,
  isalFullName,
  isalSex,
  isalStreamLabel,
  normalizeIsalName,
} from "./isal";

function student(
  id: string,
  first: string,
  last: string,
  gender: "Male" | "Female",
  classId = "c1",
  streamName = "A",
  middle: string | null = null,
): IsalStudent {
  return {
    student_id: id,
    registration_no: `S7811/${id.padStart(4, "0")}`,
    first_name: first,
    middle_name: middle,
    last_name: last,
    gender,
    class_id: classId,
    stream_id: streamName === "—" ? null : `${classId}-${streamName}`,
    stream_name: streamName,
  };
}

const classNames = new Map([
  ["c1", "Form II"],
  ["c2", "Form III"],
]);

const subject = { subject_id: "math", subject_name: "Mathematics", subject_code: "MATH" };

describe("ISAL helpers", () => {
  it("builds a full name, omitting a missing middle name", () => {
    expect(isalFullName({ first_name: "A", middle_name: "B", last_name: "C" })).toBe("A B C");
    expect(isalFullName({ first_name: "A", middle_name: null, last_name: "C" })).toBe("A C");
  });

  it("normalizes names to uppercase with single spaces", () => {
    expect(normalizeIsalName("  juma   asha  ")).toBe("JUMA ASHA");
  });

  it("maps gender to the printed sex column", () => {
    expect(isalSex("Male")).toBe("M");
    expect(isalSex("Female")).toBe("F");
    expect(isalSex("")).toBe("");
  });

  it("combines the class and stream for the Stream column", () => {
    expect(isalStreamLabel(student("1", "A", "B", "Male"), classNames)).toBe("Form II A");
    expect(isalStreamLabel(student("2", "A", "B", "Female", "c2", "—"), classNames)).toBe("Form III");
    expect(isalStreamLabel(student("3", "A", "B", "Male", "c1", "—"))).toBe("—");
  });

  it("lists students by registration number ascending", () => {
    const sheet = buildIsalSheet({
      subject,
      classNames,
      students: [
        student("1", "zawadi", "mussa", "Female"),
        student("2", "asha", "juma", "Female"),
        student("3", "baraka", "ally", "Male"),
        student("4", "asha", "juma", "Male"),
      ],
    });
    expect(sheet.pages[0].rows.map((row) => row.registration_no)).toEqual([
      "S7811/0001",
      "S7811/0002",
      "S7811/0003",
      "S7811/0004",
    ]);
    expect(sheet.pages[0].rows.map((row) => row.full_name)).toEqual([
      "ZAWADI MUSSA",
      "ASHA JUMA",
      "BARAKA ALLY",
      "ASHA JUMA",
    ]);
    expect(sheet.pages[0].rows.map((row) => row.sex)).toEqual(["F", "F", "M", "M"]);
    expect(sheet.pages[0].rows.map((row) => row.class_name)).toEqual([
      "Form II",
      "Form II",
      "Form II",
      "Form II",
    ]);
    expect(sheet.pages[0].rows.map((row) => row.no)).toEqual([1, 2, 3, 4]);
  });

  it("orders ISAL rows by registration number across classes", () => {
    const sheet = buildIsalSheet({
      subject,
      classNames,
      students: [
        student("1", "Zawadi", "A", "Female", "c2"),
        student("2", "Asha", "A", "Male", "c1"),
        student("3", "Baraka", "A", "Male", "c2"),
        student("4", "Neema", "A", "Female", "c1"),
      ],
    });
    expect(sheet.pages[0].rows.map((row) => [row.class_name, row.sex])).toEqual([
      ["Form III", "F"],
      ["Form II", "M"],
      ["Form III", "M"],
      ["Form II", "F"],
    ]);
  });

  it("counts boys, girls and total", () => {
    const sheet = buildIsalSheet({
      subject,
      classNames,
      students: [
        student("1", "A", "One", "Male"),
        student("2", "B", "Two", "Female"),
        student("3", "C", "Three", "Female"),
      ],
    });
    expect(sheet).toMatchObject({ boys: 1, girls: 2, total: 3, stream_label: "Form II A" });
  });

  it("puts the stream labels in the sheet title", () => {
    const sheet = buildIsalSheet({
      subject,
      classNames,
      students: [
        student("1", "A", "One", "Male", "c1", "A"),
        student("2", "B", "Two", "Female", "c1", "B"),
        student("3", "C", "Three", "Male", "c1", "A"),
      ],
    });
    expect(sheet.stream_label).toBe("Form II A, Form II B");
  });

  it("splits students into pages and shows Page X of Y", () => {
    const students = Array.from({ length: ISAL_ROWS_PER_PAGE + 1 }, (_, index) =>
      student(String(index + 1), `Student${String(index + 1).padStart(3, "0")}`, "Zed", "Male"),
    );
    const sheet = buildIsalSheet({ subject, classNames, students });
    expect(sheet.pages).toHaveLength(2);
    expect(sheet.pages[0].page).toBe(1);
    expect(sheet.pages[0].pages).toBe(2);
    expect(sheet.pages[0].rows).toHaveLength(ISAL_ROWS_PER_PAGE);
    expect(sheet.pages[1].page).toBe(2);
    expect(sheet.pages[1].pages).toBe(2);
    expect(sheet.pages[1].rows).toHaveLength(1);
  });

  it("returns one empty page when no student takes the subject", () => {
    const sheet = buildIsalSheet({ subject, classNames, students: [] });
    expect(sheet.pages).toHaveLength(1);
    expect(sheet.pages[0]).toMatchObject({ page: 1, pages: 1, rows: [] });
    expect(sheet).toMatchObject({ boys: 0, girls: 0, total: 0 });
  });
});
