import { describe, expect, it } from "vitest";
import { normaliseRegistrationNo, registrationVariants } from "./student-registration";

describe("normaliseRegistrationNo", () => {
  it("trims, uppercases and caps the length", () => {
    expect(normaliseRegistrationNo("  s7811/0020  ")).toBe("S7811/0020");
    expect(normaliseRegistrationNo(null)).toBe("");
    expect(normaliseRegistrationNo(1234)).toBe("");
    expect(normaliseRegistrationNo("a".repeat(60))).toHaveLength(40);
  });
});

describe("registrationVariants", () => {
  it("leaves a plain registration untouched", () => {
    expect(registrationVariants("S7811/0020")).toEqual(["S7811/0020"]);
  });

  it("adds the form without the entry year", () => {
    expect(registrationVariants("S7811/0020/2026")).toEqual([
      "S7811/0020/2026",
      "S7811/0020",
    ]);
  });

  it("handles lowercase and surrounding spaces", () => {
    expect(registrationVariants("  s7811/0020/2026  ")).toEqual([
      "S7811/0020/2026",
      "S7811/0020",
    ]);
  });

  it("only treats a four-digit 1900-2099 year as a suffix", () => {
    expect(registrationVariants("S7811/0020/2025")).toEqual([
      "S7811/0020/2025",
      "S7811/0020",
    ]);
    expect(registrationVariants("S7811/0020/1999")).toEqual([
      "S7811/0020/1999",
      "S7811/0020",
    ]);
    expect(registrationVariants("S7811/0020/1899")).toEqual(["S7811/0020/1899"]);
    expect(registrationVariants("S7811/0020/2100")).toEqual(["S7811/0020/2100"]);
    expect(registrationVariants("S7811/0020/26")).toEqual(["S7811/0020/26"]);
  });

  it("does not return a blank variant", () => {
    expect(registrationVariants("/2026")).toEqual(["/2026"]);
  });

  it("ignores empty input", () => {
    expect(registrationVariants("")).toEqual([]);
    expect(registrationVariants("   ")).toEqual([]);
    expect(registrationVariants(undefined)).toEqual([]);
  });
});
