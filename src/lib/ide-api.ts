"use client";

export type IdeRunStatus =
  | "success"
  | "wrong_answer"
  | "compile_error"
  | "runtime_error"
  | "time_limit"
  | "internal_error";

export interface IdeRunResult {
  status: IdeRunStatus;
  statusLabel: string;
  stdout: string;
  compileOutput: string;
  stderr: string;
  time: number | null;
  memory: number | null;
  /** Runs the student can still make in the current one-minute window. */
  remaining: number | null;
}

export class IdeApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IdeApiError";
    this.status = status;
  }
}

export async function runCppCode(input: {
  assignmentId: string;
  questionId: string;
  code: string;
  stdin: string;
}): Promise<IdeRunResult> {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | (Partial<IdeRunResult> & { error?: string; remaining?: number | null })
    | null;

  if (!response.ok || !payload) {
    throw new IdeApiError(
      payload?.error || "Huduma ya kuendesha code haipatikani kwa sasa.",
      response.status,
    );
  }

  return {
    status: (payload.status as IdeRunStatus) || "internal_error",
    statusLabel: payload.statusLabel || "Unknown",
    stdout: payload.stdout || "",
    compileOutput: payload.compileOutput || "",
    stderr: payload.stderr || "",
    time: typeof payload.time === "number" ? payload.time : null,
    memory: typeof payload.memory === "number" ? payload.memory : null,
    remaining: typeof payload.remaining === "number" ? payload.remaining : null,
  };
}

export interface IdeLocalDraft {
  code: string;
  stdin: string;
  updatedAt: string;
}

export function ideDraftKey(assignmentId: string, questionId: string): string {
  return `amali:ide:v1:${assignmentId}:${questionId}`;
}

export function readIdeLocalDraft(key: string): IdeLocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IdeLocalDraft>;
    if (typeof parsed.code !== "string") return null;
    return {
      code: parsed.code,
      stdin: typeof parsed.stdin === "string" ? parsed.stdin : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeIdeLocalDraft(key: string, draft: IdeLocalDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage can be full or blocked in private mode; the server draft still works.
  }
}

export function clearIdeLocalDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
