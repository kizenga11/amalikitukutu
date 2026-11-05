import { authedFetch } from "@/lib/api-client";

export type ReportSignerRole = "Academic" | "StreamTeacher" | "Headmaster";

export interface ReportSignature {
  id: string;
  class_id: string;
  stream_id: string | null;
  academic_year_id: string;
  term: 1 | 2;
  signer_role: ReportSignerRole;
  signer_name: string;
  signature_data: string;
  updated_at: string;
}

export interface ReportSignaturesResponse {
  signatures: ReportSignature[];
}

export interface ReportSignatureQuery {
  classId: string;
  streamId?: string | null;
  year: string;
  term: 1 | 2;
}

export interface SaveReportSignatureInput extends ReportSignatureQuery {
  signatureData: string;
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

export function fetchReportSignatures(query: ReportSignatureQuery): Promise<ReportSignaturesResponse> {
  const params = new URLSearchParams({
    classId: query.classId,
    year: query.year,
    term: String(query.term),
  });
  if (query.streamId) params.set("streamId", query.streamId);
  return requestJson<ReportSignaturesResponse>(`/api/report-signatures?${params.toString()}`);
}

export function saveReportSignature(
  input: SaveReportSignatureInput,
): Promise<{ ok: boolean; signature: ReportSignature }> {
  return requestJson("/api/report-signatures", {
    method: "PUT",
    body: JSON.stringify({
      classId: input.classId,
      streamId: input.streamId ?? null,
      academicYearId: input.year,
      term: input.term,
      signatureData: input.signatureData,
    }),
  });
}

export function clearReportSignature(
  query: ReportSignatureQuery,
): Promise<{ ok: boolean }> {
  const params = new URLSearchParams({
    classId: query.classId,
    year: query.year,
    term: String(query.term),
  });
  if (query.streamId) params.set("streamId", query.streamId);
  return requestJson(`/api/report-signatures?${params.toString()}`, { method: "DELETE" });
}
