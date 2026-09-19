import type { SowRow } from "@/lib/scheme-of-work-docx";
import { supabase } from "./supabase";
import type { DbForm, DbLearningActivity, DbMainCompetence, DbSpecificCompetence } from "./lesson-plan-api";

export type SowStatus = "draft" | "final";

export interface SowRowInfo {
  id: string;
  teacher_id: string;
  subject_id: string;
  subject_name: string;
  form_id: string | null;
  form: string;
  class_stream: string | null;
  term: string | null;
  year: string | null;
  title: string;
  school_name: string;
  teacher_name: string;
  status: SowStatus;
  created_at: string;
  updated_at: string;
}

export interface SowDetail extends SowRowInfo {
  sow_data: SowRow[];
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchMySows(teacherId?: string): Promise<SowRowInfo[]> {
  // When a teacher id is known, reuse Supabase directly (RLS scopes the row set).
  if (teacherId) {
    const { data, error } = await supabase
      .from("generated_sow_plans")
      .select(`id, teacher_id, subject_id, subject:subjects(name), form_id, form, class_stream, term, year,
        title, school_name, teacher_name, status, created_at, updated_at`)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
      return {
        id: row.id,
        teacher_id: row.teacher_id,
        subject_id: row.subject_id,
        subject_name: subject?.name ?? "Unknown",
        form_id: row.form_id,
        form: row.form,
        class_stream: row.class_stream,
        term: row.term,
        year: row.year,
        title: row.title,
        school_name: row.school_name,
        teacher_name: row.teacher_name,
        status: row.status as SowStatus,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
  }

  const res = await fetch("/api/sow", { headers: await authHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to load schemes of work");
  }
  const body = (await res.json()) as { sows: SowRowInfo[] };
  return body.sows ?? [];
}

export async function fetchSow(id: string): Promise<SowDetail> {
  const res = await fetch(`/api/sow/${id}`, { headers: await authHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to load scheme of work");
  }
  const body = (await res.json()) as { sow: SowDetail };
  return body.sow;
}

export interface SowCreateInput {
  subject_id: string;
  form: string;
  class_stream?: string | null;
  term?: string | null;
  year?: string | null;
  title?: string | null;
  sow_data: SowRow[];
  status?: SowStatus;
}

export async function createSow(input: SowCreateInput): Promise<SowDetail> {
  const res = await fetch("/api/sow/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to save scheme of work");
  }
  const body = (await res.json()) as { sow: SowDetail };
  return body.sow;
}

export interface SowUpdateInput {
  class_stream?: string | null;
  term?: string | null;
  year?: string | null;
  title?: string | null;
  sow_data?: SowRow[];
  status?: SowStatus;
}

export async function updateSow(id: string, patch: SowUpdateInput): Promise<SowDetail> {
  const res = await fetch(`/api/sow/${id}`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to update scheme of work");
  }
  const body = (await res.json()) as { sow: SowDetail };
  return body.sow;
}

export async function deleteSow(id: string): Promise<void> {
  const res = await fetch(`/api/sow/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to delete scheme of work");
  }
}

export async function exportSow(id: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/sow/${id}/export`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed to export scheme of work");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `scheme-of-work-${id}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Re-export the curriculum fetchers used to build SOW rows.
export type { DbForm, DbLearningActivity, DbMainCompetence, DbSpecificCompetence };