"use client";

import "./stream-teacher.css";

import type { StreamTeacherAssignment, StreamTeacherScope, StreamTeacherTerm } from "@/lib/stream-teacher-api";
import StudentsManagement from "@/components/students-management";
import SubjectManagement from "@/components/subject-management";
import StudentReportCard from "@/components/student-report-card";
import StreamResults from "@/components/stream-results";
import BestStudentYearly from "@/components/best-student-yearly";

export type StreamTeacherSection = "students" | "subjects" | "results" | "reports" | "beststudent";

interface Props {
  section: StreamTeacherSection;
  assignments: StreamTeacherAssignment[];
  selectedStreamId: string;
  onSelectStream: (streamId: string) => void;
  year: string;
  term: StreamTeacherTerm;
}

export default function MkondoWangu({
  section,
  assignments,
  selectedStreamId,
  onSelectStream,
  year,
  term,
}: Props) {
  const yearAssignments = assignments.filter((assignment) => assignment.academic_year_id === year);
  const selected =
    yearAssignments.find((assignment) => assignment.stream_id === selectedStreamId) ??
    yearAssignments[0] ??
    null;

  if (!selected) {
    return (
      <div className="stream-teacher-page">
        <div className="st-empty-state">No stream is assigned to you for {year}.</div>
      </div>
    );
  }

  const scope: StreamTeacherScope = {
    streamId: selected.stream_id,
    classId: selected.class_id,
    streamName: selected.stream_name,
    className: selected.class_name,
    year,
    term,
  };

  return (
    <div className="stream-teacher-page">
      {yearAssignments.length > 1 && (
        <div className="mkondo-picker mkondo-picker--bar">
          <label htmlFor="mkondo-stream">Select stream</label>
          <select
            id="mkondo-stream"
            value={selected.stream_id}
            onChange={(event) => onSelectStream(event.target.value)}
          >
            {yearAssignments.map((assignment) => (
              <option key={assignment.stream_id} value={assignment.stream_id}>
                {assignment.class_name} - {assignment.stream_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {section === "students" && <StudentsManagement scope={scope} />}
      {section === "subjects" && <SubjectManagement scope={scope} />}
      {section === "results" && <StreamResults streamId={selected.stream_id} year={year} />}
      {section === "reports" && <StudentReportCard scope={scope} />}
      {section === "beststudent" && (
        <BestStudentYearly key={`${scope.classId}-${scope.streamId}-${scope.year}`} scope={scope} />
      )}
    </div>
  );
}
