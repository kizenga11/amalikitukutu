"use client";

import { authedFetch } from "@/lib/api-client";
import type { QuestionType } from "@/lib/assignments-shared";

export interface TeacherOption {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classId: string;
  className: string;
  formLevel: number;
  streamId: string;
  streamName: string;
}

export interface TeacherAssignmentSummary {
  id: string;
  title: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classId: string;
  className: string;
  streamId: string;
  streamName: string;
  deadline: string | null;
  totalMarks: number;
  allowLateSubmission: boolean;
  status: "draft" | "published" | "closed";
  createdAt: string;
  totalStudents: number;
  submittedCount: number;
  markedCount: number;
  notSubmittedCount: number;
}

export interface AssignmentStudent {
  studentId: string;
  registrationNo: string;
  name: string;
  submissionId: string | null;
  status: "not_submitted" | "draft" | "submitted" | "marked";
  submittedAt: string | null;
  isLate: boolean;
  totalScore: number | null;
}

export interface TeacherAssignmentDetail {
  assignment: TeacherAssignmentSummary & {
    instructions: string;
    attachmentName: string | null;
    attachmentType: string | null;
    attachmentData: string | null;
    hasSubmissions: boolean;
  };
  questions: {
    id: string;
    position: number;
    questionType: QuestionType;
    prompt: string;
    options: string[];
    correctOption: number | null;
    marks: number;
  }[];
  students: AssignmentStudent[];
}

export interface TeacherSubmissionDetail {
  submission: {
    id: string;
    status: "draft" | "submitted" | "marked";
    submittedAt: string | null;
    isLate: boolean;
    totalScore: number | null;
    feedback: string | null;
    attachmentName: string | null;
    attachmentType: string | null;
    attachmentData: string | null;
  };
  student: {
    id: string;
    registrationNo: string;
    name: string;
  };
  assignment: {
    id: string;
    title: string;
    totalMarks: number;
    subjectName: string;
    className: string;
    streamName: string;
  };
  answers: {
    id: string;
    questionId: string;
    position: number;
    questionType: QuestionType;
    prompt: string;
    options: string[];
    correctOption: number | null;
    maxMarks: number;
    answerHtml: string;
    answerText: string;
    awardedMarks: number | null;
    feedback: string | null;
  }[];
}

export interface Period {
  academicYearId: string;
  term: 1 | 2;
}

export interface NewQuestionPayload {
  questionType: QuestionType;
  prompt: string;
  options: string[];
  correctOption: number | null;
  marks: number;
}

export interface NewAssignmentPayload {
  subjectId: string;
  classId: string;
  streamId: string;
  title: string;
  instructions: string;
  deadline: string | null;
  totalMarks: number;
  allowLateSubmission: boolean;
  status: "draft" | "published";
  attachment: { name: string; type: string; data: string } | null;
  questions: NewQuestionPayload[];
}

export interface UpdateAssignmentPayload {
  title: string;
  instructions: string;
  deadline: string | null;
  totalMarks: number;
  allowLateSubmission: boolean;
  status: "draft" | "published" | "closed";
  attachment: { name: string; type: string; data: string } | null;
  /** Send null when the assignment already has submissions (questions are locked). */
  questions: NewQuestionPayload[] | null;
}

async function requestJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await authedFetch(input, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & T)
    | null;
  if (!response.ok) {
    const message =
      typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return payload as T;
}

export function fetchTeacherOptions(): Promise<{
  options: TeacherOption[];
  unrestricted: boolean;
}> {
  return requestJson<{ options: TeacherOption[]; unrestricted: boolean }>(
    "/api/teacher/assignments/options",
  );
}

export function fetchTeacherAssignments(): Promise<{
  assignments: TeacherAssignmentSummary[];
  period: Period;
}> {
  return requestJson<{ assignments: TeacherAssignmentSummary[]; period: Period }>(
    "/api/teacher/assignments",
  );
}

export function createTeacherAssignment(payload: NewAssignmentPayload): Promise<{
  ok: true;
  id: string;
  status: "draft" | "published";
}> {
  return requestJson("/api/teacher/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTeacherAssignment(id: string): Promise<TeacherAssignmentDetail> {
  return requestJson<TeacherAssignmentDetail>(`/api/teacher/assignments/${id}`);
}

export function updateTeacherAssignmentStatus(
  id: string,
  status: "draft" | "published" | "closed",
): Promise<{ ok: true; status: string }> {
  return requestJson(`/api/teacher/assignments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateTeacherAssignment(
  id: string,
  payload: UpdateAssignmentPayload,
): Promise<{ ok: true; status: string }> {
  return requestJson(`/api/teacher/assignments/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTeacherAssignment(id: string): Promise<{ ok: true }> {
  return requestJson(`/api/teacher/assignments/${id}`, { method: "DELETE" });
}

export function fetchTeacherSubmission(
  assignmentId: string,
  submissionId: string,
): Promise<TeacherSubmissionDetail> {
  return requestJson<TeacherSubmissionDetail>(
    `/api/teacher/assignments/${assignmentId}/submissions/${submissionId}/grade`,
  );
}

export function gradeTeacherSubmission(
  assignmentId: string,
  submissionId: string,
  payload: {
    answers: { answerId: string; awardedMarks: number | null; feedback: string }[];
    feedback: string;
  },
): Promise<{ ok: true; totalScore: number }> {
  return requestJson(
    `/api/teacher/assignments/${assignmentId}/submissions/${submissionId}/grade`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function downloadAssignmentCsv(id: string, filename: string): Promise<void> {
  const response = await authedFetch(`/api/teacher/assignments/${id}/export`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Could not download the marks.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
