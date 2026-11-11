import { authedFetch } from "@/lib/api-client";

export type ReportBehaviourRatings = (number | null)[];

export interface ReportBehaviourMeta {
  streamId: string;
  streamName: string;
  teacherName: string;
  updatedAt: string | null;
}

export interface ReportBehaviourResponse {
  behavior: Record<string, ReportBehaviourRatings>;
  requirements?: Record<string, string[]>;
  filledBy: Record<string, ReportBehaviourMeta>;
}

export interface ReportBehaviourQuery {
  classId: string;
  streamId?: string | null;
  year: string;
  term: 1 | 2;
}

async function requestJson<T>(input: string): Promise<T> {
  const response = await authedFetch(input, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

export function fetchReportBehaviour(query: ReportBehaviourQuery): Promise<ReportBehaviourResponse> {
  const params = new URLSearchParams({
    classId: query.classId,
    year: query.year,
    term: String(query.term),
  });
  if (query.streamId) params.set("streamId", query.streamId);
  return requestJson<ReportBehaviourResponse>(`/api/report-behaviour?${params.toString()}`);
}

export interface SaveReportRequirementsInput {
  classId: string;
  streamId?: string | null;
  year: string;
  term: 1 | 2;
  requirements: string[];
}

export interface SaveReportRequirementsResponse {
  ok: boolean;
  requirements: string[];
}

export async function saveReportRequirements(
  input: SaveReportRequirementsInput,
): Promise<SaveReportRequirementsResponse> {
  const response = await authedFetch("/api/report-requirements", {
    method: "PUT",
    body: JSON.stringify({
      classId: input.classId,
      streamId: input.streamId ?? null,
      year: input.year,
      term: input.term,
      requirements: input.requirements,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & SaveReportRequirementsResponse;
  if (!response.ok) {
    throw new Error(payload.error || "Could not save requirements.");
  }
  return payload;
}
