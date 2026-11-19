import { describe, expect, it } from "vitest";
import { isReturnedForRework } from "./assignments-shared";

describe("isReturnedForRework", () => {
  it("detects a draft that carries the teacher's reason", () => {
    expect(
      isReturnedForRework({ status: "draft", feedback: "Show your working in Q2." }),
    ).toBe(true);
  });

  it("does not treat an ordinary draft without feedback as returned", () => {
    expect(isReturnedForRework({ status: "draft", feedback: null })).toBe(false);
    expect(isReturnedForRework({ status: "draft", feedback: "   " })).toBe(false);
  });

  it("does not treat submitted or marked work as returned", () => {
    expect(isReturnedForRework({ status: "submitted", feedback: "Good effort." })).toBe(false);
    expect(isReturnedForRework({ status: "marked", feedback: "Needs work." })).toBe(false);
  });

  it("handles a missing submission", () => {
    expect(isReturnedForRework(null)).toBe(false);
    expect(isReturnedForRework(undefined)).toBe(false);
  });
});
