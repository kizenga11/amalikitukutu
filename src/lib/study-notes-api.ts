"use client";

import { authedFetch } from "@/lib/api-client";
import type { NoteAudienceRow, NoteContext, NoteTopicDetail } from "@/lib/study-notes-shared";

async function requestJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await authedFetch(input, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as (Record<string, unknown> & T) | null;
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : response.status === 404
          ? "This request is not available on the running server. Restart the app, then try again."
          : `Something went wrong (HTTP ${response.status}). Please try again.`;
    throw new Error(message);
  }
  return payload as T;
}

export function fetchNoteContexts(): Promise<{ contexts: NoteContext[]; unrestricted: boolean }> {
  return requestJson("/api/teacher/notes/contexts");
}

export function fetchNoteTopics(): Promise<{ topics: NoteTopicDetail[] }> {
  return requestJson("/api/teacher/notes/topics");
}

export function createNoteTopic(payload: { teachingAssignmentId: string; title: string; subtopicCount: number }): Promise<{ ok: true; id: string }> {
  return requestJson("/api/teacher/notes/topics", { method: "POST", body: JSON.stringify(payload) });
}

export function fetchNoteTopic(id: string): Promise<{ topic: NoteTopicDetail | null }> {
  return requestJson(`/api/teacher/notes/topics/${id}`);
}

export function renameNoteTopic(id: string, title: string): Promise<{ ok: true }> {
  return requestJson(`/api/teacher/notes/topics/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
}

export function deleteNoteTopic(id: string): Promise<{ ok: true }> {
  return requestJson(`/api/teacher/notes/topics/${id}`, { method: "DELETE" });
}

export function renameNoteSubtopic(id: string, title: string): Promise<{ ok: true }> {
  return requestJson(`/api/teacher/notes/subtopics/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
}

export async function uploadNotePdf(subtopicId: string, form: FormData): Promise<{ ok: true; id: string }> {
  const response = await authedFetch(`/api/teacher/notes/subtopics/${subtopicId}/upload`, {
    method: "POST",
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "Could not upload note.";
    throw new Error(message);
  }
  return payload as { ok: true; id: string };
}

export function saveNoteText(subtopicId: string, payload: { title: string; contentHtml: string }): Promise<{ ok: true; id: string; kind: "text" }> {
  return requestJson(`/api/teacher/notes/subtopics/${subtopicId}/content`, { method: "POST", body: JSON.stringify(payload) });
}

export async function uploadNoteImage(subtopicId: string, form: FormData): Promise<{ ok: true; id: string }> {
  const response = await authedFetch(`/api/teacher/notes/subtopics/${subtopicId}/images`, {
    method: "POST",
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "Could not upload diagram.";
    throw new Error(message);
  }
  return payload as { ok: true; id: string };
}

export function updateNoteImageCaption(id: string, caption: string): Promise<{ ok: true; caption: string | null }> {
  return requestJson(`/api/teacher/notes/images/${id}`, { method: "PATCH", body: JSON.stringify({ caption }) });
}

export function deleteNoteImage(id: string): Promise<{ ok: true }> {
  return requestJson(`/api/teacher/notes/images/${id}`, { method: "DELETE" });
}

export function updateNote(id: string, payload: { title: string; description?: string | null }): Promise<{ ok: true }> {
  return requestJson(`/api/teacher/notes/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteNote(id: string): Promise<{ ok: true }> {
  return requestJson(`/api/teacher/notes/notes/${id}`, { method: "DELETE" });
}

export function setNotePublished(id: string, publish: boolean): Promise<{ ok: true; isPublished: boolean }> {
  return requestJson(`/api/teacher/notes/notes/${id}/publish`, { method: "POST", body: JSON.stringify({ publish }) });
}

export function fetchNoteAudience(id: string): Promise<{ audience: NoteAudienceRow[]; summary: { total: number; viewed: number; notViewed: number } }> {
  return requestJson(`/api/teacher/notes/notes/${id}/audience`);
}

export function fetchTeacherNoteFileUrl(id: string, download = false): Promise<{ url?: string; kind?: "pdf" | "text"; contentHtml?: string | null; title?: string }> {
  const q = download ? "?download=1" : "";
  return requestJson(`/api/teacher/notes/notes/${id}/file${q}`);
}
