import { authedFetch } from "@/lib/api-client";

export type StreamTeacherTerm = 1 | 2;

export interface StreamTeacherAssignment {
  id: string;
  teacher_id: string;
  stream_id: string;
  academic_year_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  stream_name: string;
  class_id: string;
  class_name: string;
  form_level: number;
  teacher_name: string;
}

export interface StreamTeacherScope {
  streamId: string;
  classId: string;
  streamName: string;
  className: string;
  year: string;
  term: StreamTeacherTerm;
}

export interface StreamTeacherMe {
  staffId: string | null;
  name: string;
  role: string;
  assignments: StreamTeacherAssignment[];
}

export interface StreamTeacherStream {
  id: string;
  class_id: string;
  name: string;
  class_name: string;
  form_level: number;
}

export interface StreamTeacherTeacher {
  id: string;
  name: string;
}

export interface StreamTeacherAssignmentOptions {
  year: string;
  streams: StreamTeacherStream[];
  teachers: StreamTeacherTeacher[];
  assignments: StreamTeacherAssignment[];
}

export interface StreamStudent {
  id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  phone: string | null;
  class_id: string | null;
  stream_id: string | null;
  stream_name: string;
}

export interface StreamStudentsResponse {
  stream: { id: string; name: string; class_id: string; class_name: string };
  students: StreamStudent[];
}

export interface StreamStudentInput {
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  phone: string | null;
}

export interface StreamSubject {
  id: string;
  code: string;
  name: string;
  subject_type: string;
  has_practical: boolean;
  stream: string;
  teachers: { id: string; name: string }[];
  canEdit: boolean;
}

export interface StreamSubjectsResponse {
  stream: { id: string; name: string; class_id: string; class_name: string };
  subjects: StreamSubject[];
}

export interface StreamExam {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  has_practical: boolean;
  status: string;
}

export interface ScopedMarkCell {
  theory: number | null;
  practical: number | null;
  is_absent: boolean;
}

export interface ScopedExamStudent {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
  subjects: string[];
}

export interface ScopedExamMarks {
  exam: StreamExam;
  marks: Record<string, ScopedMarkCell>;
  classRow: {
    class_id: string;
    class_name: string;
    subjects: { id: string; code: string; name: string; has_practical: boolean }[];
    students: ScopedExamStudent[];
  };
}

export interface StreamResultsResponse {
  stream: { id: string; name: string; class_id: string; class_name: string };
  exams: StreamExam[];
  data: ScopedExamMarks | null;
}

export interface StreamConductStudent {
  id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  conduct: string;
  remarks: string;
  source: string;
  updated_at: string | null;
}

export interface StreamConductResponse {
  term: StreamTeacherTerm;
  stream: { id: string; name: string; class_id: string; class_name: string };
  students: StreamConductStudent[];
}

export interface StreamConductEntry {
  studentId: string;
  conduct: string;
  remarks: string;
}

export interface StreamReportsResponse {
  term: StreamTeacherTerm;
  stream: { id: string; name: string; class_id: string; class_name: string };
  exams: StreamExam[];
  data: ScopedExamMarks | null;
  conduct: Record<string, { conduct: string; remarks: string; source: string; updated_at: string | null }>;
}

export interface StreamReportSettings {
  schoolClosed: boolean;
  closingDate: string;
  openingDate: string;
  examId: string;
  behavior: Record<string, (number | null)[]>;
}

export interface StreamReportSettingsResponse {
  settings: StreamReportSettings | null;
  updated_at: string | null;
}

async function requestJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await authedFetch(input, {
    ...init,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

export function fetchStreamTeacherMe(): Promise<StreamTeacherMe> {
  return requestJson<StreamTeacherMe>("/api/stream-teacher/me");
}

export function fetchStreamTeacherAssignments(year: string): Promise<StreamTeacherAssignmentOptions> {
  return requestJson<StreamTeacherAssignmentOptions>(`/api/stream-teacher/assignments?year=${encodeURIComponent(year)}`);
}

export function saveStreamTeacherAssignment(
  streamId: string,
  teacherId: string,
  academicYearId: string,
): Promise<{ ok: boolean; assignments: StreamTeacherAssignment[] }> {
  return requestJson("/api/stream-teacher/assignments", {
    method: "POST",
    body: JSON.stringify({ streamId, teacherId, academicYearId }),
  });
}

export function removeStreamTeacherAssignment(
  streamId: string,
  year: string,
): Promise<{ ok: boolean; assignments: StreamTeacherAssignment[] }> {
  return requestJson(
    `/api/stream-teacher/assignments?streamId=${encodeURIComponent(streamId)}&year=${encodeURIComponent(year)}`,
    { method: "DELETE" },
  );
}

export function fetchStreamStudents(streamId: string, year: string): Promise<StreamStudentsResponse> {
  return requestJson<StreamStudentsResponse>(
    `/api/stream-teacher/students?streamId=${encodeURIComponent(streamId)}&year=${encodeURIComponent(year)}`,
  );
}

export function updateStreamStudent(
  id: string,
  streamId: string,
  academicYearId: string,
  input: StreamStudentInput,
): Promise<{ ok: boolean; student: StreamStudent }> {
  return requestJson("/api/stream-teacher/students", {
    method: "PATCH",
    body: JSON.stringify({ id, streamId, academicYearId, ...input }),
  });
}

export function fetchStreamSubjects(streamId: string, year: string): Promise<StreamSubjectsResponse> {
  return requestJson<StreamSubjectsResponse>(
    `/api/stream-teacher/subjects?streamId=${encodeURIComponent(streamId)}&year=${encodeURIComponent(year)}`,
  );
}

export function createStreamSubject(
  streamId: string,
  academicYearId: string,
  input: { code: string; name: string; subject_type: string; has_practical: boolean },
): Promise<{ ok: boolean; subject: StreamSubject }> {
  return requestJson("/api/stream-teacher/subjects", {
    method: "POST",
    body: JSON.stringify({ streamId, academicYearId, ...input }),
  });
}

export function updateStreamSubject(
  id: string,
  streamId: string,
  academicYearId: string,
  input: { code: string; name: string; subject_type: string; has_practical: boolean },
): Promise<{ ok: boolean; subject: StreamSubject }> {
  return requestJson("/api/stream-teacher/subjects", {
    method: "PATCH",
    body: JSON.stringify({ id, streamId, academicYearId, ...input }),
  });
}

export function deleteStreamSubject(id: string, streamId: string, year: string): Promise<{ ok: boolean }> {
  return requestJson(
    `/api/stream-teacher/subjects?id=${encodeURIComponent(id)}&streamId=${encodeURIComponent(streamId)}&year=${encodeURIComponent(year)}`,
    { method: "DELETE" },
  );
}

export function fetchStreamResults(
  streamId: string,
  year: string,
  examId?: string,
): Promise<StreamResultsResponse> {
  const params = new URLSearchParams({ streamId, year });
  if (examId) params.set("examId", examId);
  return requestJson<StreamResultsResponse>(`/api/stream-teacher/results?${params.toString()}`);
}

export function fetchStreamConduct(
  streamId: string,
  year: string,
  term: StreamTeacherTerm,
): Promise<StreamConductResponse> {
  return requestJson<StreamConductResponse>(
    `/api/stream-teacher/conduct?streamId=${encodeURIComponent(streamId)}&year=${encodeURIComponent(year)}&term=${term}`,
  );
}

export function saveStreamConduct(
  streamId: string,
  academicYearId: string,
  term: StreamTeacherTerm,
  entries: StreamConductEntry[],
): Promise<{ ok: boolean; saved: number }> {
  return requestJson("/api/stream-teacher/conduct", {
    method: "POST",
    body: JSON.stringify({ streamId, academicYearId, term, entries }),
  });
}

export function fetchStreamReports(
  streamId: string,
  year: string,
  term: StreamTeacherTerm,
  examId?: string,
): Promise<StreamReportsResponse> {
  const params = new URLSearchParams({ streamId, year, term: String(term) });
  if (examId) params.set("examId", examId);
  return requestJson<StreamReportsResponse>(`/api/stream-teacher/reports?${params.toString()}`);
}

export function fetchStreamReportSettings(
  streamId: string,
  year: string,
  term: StreamTeacherTerm,
): Promise<StreamReportSettingsResponse> {
  const params = new URLSearchParams({ streamId, year, term: String(term) });
  return requestJson<StreamReportSettingsResponse>(`/api/stream-teacher/report-settings?${params.toString()}`);
}

export function saveStreamReportSettings(
  streamId: string,
  year: string,
  term: StreamTeacherTerm,
  settings: StreamReportSettings,
): Promise<{ ok: boolean; settings: StreamReportSettings; updated_at: string | null }> {
  return requestJson("/api/stream-teacher/report-settings", {
    method: "PUT",
    body: JSON.stringify({ streamId, academicYearId: year, term, settings }),
  });
}
