import { describe, expect, it } from "vitest";
import { STAGES, buildStages, makeDateSequencer, splitMinutes } from "./generate";

describe("splitMinutes", () => {
  it("hugawanya dakika zote bila kupoteza", () => {
    for (const total of [10, 40, 45, 80]) {
      const parts = splitMinutes(total);
      expect(parts).toHaveLength(4);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("hupa Competence Development muda mwingi", () => {
    const [intro, develop] = splitMinutes(40);
    expect(develop).toBeGreaterThan(intro);
  });
});

describe("makeDateSequencer", () => {
  it("huruka wikendi na kurudisha tarehe ISO mfululizo", () => {
    // 2026-01-02 ni Ijumaa (Jumatatu inayofuata ni 2026-01-05).
    const next = makeDateSequencer(new Date(2026, 0, 2));
    expect(next()).toBe("2026-01-05");
    expect(next()).toBe("2026-01-06");
    expect(next()).toBe("2026-01-07");
    expect(next()).toBe("2026-01-08");
    expect(next()).toBe("2026-01-09");
    expect(next()).toBe("2026-01-12"); // huruka wikendi
  });
});

describe("buildStages", () => {
  it("hutengeneza hatua nne na jumla ya dakika sahihi", () => {
    const stages = buildStages({ name: "Kupima kasi" }, 1, 1, 40);
    expect(stages.map((s) => s.stage)).toEqual([...STAGES]);
    expect(stages.reduce((a, s) => a + s.minutes, 0)).toBe(40);
    expect(stages[0].teaching_activities).toContain("Kupima kasi");
  });

  it("hutumia maudhui maalum yaliyotolewa kwenye subtopic", () => {
    const stages = buildStages({ name: "X", intro_teaching: "MAALUM" }, 1, 3, 40);
    expect(stages[0].teaching_activities).toBe("MAALUM");
  });

  it("hutofautisha kipindi cha kwanza na cha mwisho", () => {
    const first = buildStages({ name: "Y" }, 1, 3, 40);
    const last = buildStages({ name: "Y" }, 3, 3, 40);
    expect(first[1].teaching_activities).not.toBe(last[1].teaching_activities);
  });
});
