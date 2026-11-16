"use client";

import { authedFetch } from "@/lib/api-client";
import type {
  LoginFailuresResponse,
  ResetStudentPasswordResponse,
  StudentActivityResponse,
  StudentLoginsResponse,
} from "@/lib/student-accounts-types";

export class StudentAccountsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentAccountsApiError";
    this.status = status;
  }
}

async function requestJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await authedFetch(input, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new StudentAccountsApiError(
      payload.error || "Request failed. Please try again.",
      response.status,
    );
  }
  return payload;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function fetchStudentLogins(params: {
  search?: string;
  filter?: string;
  page?: number;
  pageSize?: number;
}): Promise<StudentLoginsResponse> {
  return requestJson<StudentLoginsResponse>(
    `/api/student-accounts${buildQuery(params)}`,
  );
}

export function fetchStudentActivity(studentId: string): Promise<StudentActivityResponse> {
  return requestJson<StudentActivityResponse>(
    `/api/student-accounts/activity${buildQuery({ studentId })}`,
  );
}

export function fetchLoginFailures(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<LoginFailuresResponse> {
  return requestJson<LoginFailuresResponse>(
    `/api/student-accounts/failures${buildQuery(params)}`,
  );
}

export function resetStudentPasswordToDefault(
  studentId: string,
): Promise<ResetStudentPasswordResponse> {
  return requestJson<ResetStudentPasswordResponse>(
    "/api/student-accounts/reset-password",
    { method: "POST", body: JSON.stringify({ studentId }) },
  );
}
