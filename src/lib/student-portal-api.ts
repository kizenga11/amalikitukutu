"use client";

import type { AssignmentSummary, StudentAnswer, StudentAssignmentQuestion } from "@/lib/assignments-shared";
import type { StudentExamResult } from "@/lib/student-results-server";

export interface StudentMe {
  student: {
    id: string;
    registrationNo: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    fullName: string;
    gender: string;
    phone: string | null;
    classId: string | null;
    className: string;
    streamId: string | null;
    streamName: string;
  };
  subjects: {
    id: string;
    code: string;
    name: string;
    teachers: { name: string; phone: string | null }[];
  }[];
  mustChangePassword: boolean;
}

export interface StudentAssignmentDetail {
  assignment: AssignmentSummary & {
    teacherName: string;
    attachmentType: string | null;
    attachmentData: string | null;
  };
  questions: StudentAssignmentQuestion[];
  submission: {
    id: string;
    status: "draft" | "submitted" | "marked";
    submittedAt: string | null;
    lastSavedAt: string | null;
    isLate: boolean;
    totalScore: number | null;
    feedback: string | null;
    attachmentName: string | null;
    attachmentType: string | null;
    attachmentData: string | null;
  } | null;
  answers: StudentAnswer[];
  locked: boolean;
  deadlinePassed: boolean;
  canSubmit: boolean;
  serverTime: string;
}

export class StudentApiError extends Error {
  status: number;
  data: Record<string, unknown> | null;

  constructor(message: string, status: number, data: Record<string, unknown> | null) {
    super(message);
    this.name = "StudentApiError";
    this.status = status;
    this.data = data;
  }
}

async function studentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      (typeof data?.error === "string" && data.error) ||
      (response.status === 401
        ? "Your session has expired. Please sign in again."
        : "Something went wrong. Please try again.");
    throw new StudentApiError(message, response.status, data);
  }
  return data as T;
}

export async function loginStudent(registrationNo: string, password: string) {
  return studentRequest<{ ok: true; mustChangePassword: boolean; student: StudentMe["student"] }>(
    "/api/student/login",
    { method: "POST", body: JSON.stringify({ registrationNo, password }) },
  );
}

export async function logoutStudent() {
  return studentRequest<{ ok: true }>("/api/student/logout", { method: "POST" });
}

export async function fetchStudentMe() {
  return studentRequest<StudentMe>("/api/student/me");
}

export async function changeStudentPassword(
  currentPassword: string,
  newPassword: string,
) {
  return studentRequest<{ ok: true }>("/api/student/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchStudentResults() {
  return studentRequest<{ exams: StudentExamResult[] }>("/api/student/results");
}

export async function fetchStudentAssignments() {
  return studentRequest<{ assignments: AssignmentSummary[] }>("/api/student/assignments");
}

export async function fetchStudentAssignment(id: string) {
  return studentRequest<StudentAssignmentDetail>(`/api/student/assignments/${id}`);
}

export interface DraftAnswerInput {
  questionId: string;
  answerHtml: string;
  answerText: string;
  answerValue?: unknown;
}

export async function saveStudentDraft(
  id: string,
  answers: DraftAnswerInput[],
  attachment: { name: string; type: string; data: string } | null,
) {
  return studentRequest<{ ok: true; savedAt: string }>(`/api/student/assignments/${id}/draft`, {
    method: "POST",
    body: JSON.stringify({ answers, attachment }),
  });
}

export async function submitStudentAssignment(
  id: string,
  answers: DraftAnswerInput[],
  attachment: { name: string; type: string; data: string } | null,
) {
  return studentRequest<{
    ok: true;
    submittedAt: string;
    isLate: boolean;
  }>(`/api/student/assignments/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers, attachment }),
  });
}

export interface StudentNoteViewItem {
  id: string;
  title: string;
  fileName: string | null;
  fileSize: number | null;
  kind?: "pdf" | "text";
  contentHtml?: string | null;
}
export interface StudentNoteImageView {
  id: string;
  subtopicId: string;
  position: number;
  caption: string | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  url: string | null;
}
export interface StudentSubtopicViewItem {
  id: string;
  position: number;
  title: string;
  note: StudentNoteViewItem | null;
  images: StudentNoteImageView[];
}
export interface StudentTopicViewItem {
  id: string;
  title: string;
  teachingAssignmentId: string;
  subjectName: string;
  subjectCode: string;
  className: string;
  streamName: string;
  teacherName: string;
  subtopics: StudentSubtopicViewItem[];
}

export async function fetchStudentNotes() {
  return studentRequest<{ topics: StudentTopicViewItem[] }>("/api/student/notes");
}

export async function fetchStudentNoteFileUrl(id: string, download = false) {
  const q = download ? "?download=1" : "";
  return studentRequest<{ url?: string; fileName?: string | null; kind?: "pdf" | "text"; contentHtml?: string | null; title?: string }>(`/api/student/notes/${id}/file${q}`);
}

export function studentFullName(student: StudentMe["student"]): string {
  return [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}
