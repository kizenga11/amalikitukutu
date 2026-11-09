"use client";

import type { WheelEvent } from "react";
import type { TermNumber } from "@/lib/calendar";
import type { Role } from "@/components/navigation/nav-config";
import { TimetableProvider } from "./timetable-context";
import SetupPanel from "./setup-panel";
import SubjectPeriodsPanel from "./subject-periods-panel";
import RulesPanel from "./rules-panel";
import GeneratePanel from "./generate-panel";
import TimetablesPanel from "./timetables-panel";
import "./timetable.css";

export type TimetableSection = "setup" | "periods" | "rules" | "generate" | "timetables";

/**
 * Scrolling the page while a number input is focused makes Chrome change its
 * value on every wheel tick. That is what made period counts race up to 60,
 * so drop focus before the wheel can edit the field.
 */
function blurNumberOnWheel(event: WheelEvent<HTMLDivElement>) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "number") {
    target.blur();
  }
}

export default function TimetableView({
  section,
  role,
  year,
  term,
  onShowTimetable,
}: {
  section: TimetableSection;
  role: Role;
  year: string;
  term: TermNumber;
  onShowTimetable: () => void;
}) {
  return (
    <div className="tt-root" onWheelCapture={blurNumberOnWheel}>
      <TimetableProvider>
        {section === "setup" && <SetupPanel />}
        {section === "periods" && <SubjectPeriodsPanel />}
        {section === "rules" && <RulesPanel />}
        {section === "generate" && (
          <GeneratePanel year={year} term={term} onShowTimetable={onShowTimetable} />
        )}
        {section === "timetables" && <TimetablesPanel year={year} term={term} role={role} />}
      </TimetableProvider>
    </div>
  );
}
