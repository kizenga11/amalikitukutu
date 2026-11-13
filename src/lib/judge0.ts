// Server-only Judge0 client for the C++ IDE.
// This module must only be imported from route handlers: it reads secrets
// from process.env and must never be bundled into browser code.

export const CPP_LANGUAGE_ID = 105; // C++ (GCC 14.1.0) on Judge0 CE
export const MAX_CODE_BYTES = 64 * 1024;
export const MAX_STDIN_BYTES = 64 * 1024;
export const MAX_OUTPUT_CHARS = 64 * 1024;
export const CPU_TIME_LIMIT_SECONDS = 5;
export const WALL_TIME_LIMIT_SECONDS = 10;
export const MEMORY_LIMIT_KB = 128 * 1024; // 128 MB
/** Judge0 measures file size in kilobytes, so 64 = 64 KB. */
export const MAX_FILE_SIZE_KB = 64;
export const COMPILER_OPTIONS = "-std=c++17 -Wall";

export type Judge0Status =
  | "success"
  | "wrong_answer"
  | "compile_error"
  | "runtime_error"
  | "time_limit"
  | "internal_error";

export interface Judge0RunResult {
  status: Judge0Status;
  statusId: number;
  statusLabel: string;
  stdout: string;
  compileOutput: string;
  stderr: string;
  /** Seconds, as reported by Judge0. */
  time: number | null;
  /** Kilobytes, as reported by Judge0. */
  memory: number | null;
}

export class Judge0ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Judge0ConfigError";
  }
}

export class Judge0UnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Judge0UnavailableError";
  }
}

interface Judge0Response {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
  status?: { id?: number; description?: string | null } | null;
}

const STATUS_LABELS: Record<number, string> = {
  1: "In queue",
  2: "Processing",
  3: "Accepted",
  4: "Wrong answer",
  5: "Time limit exceeded",
  6: "Compilation error",
  7: "Runtime error (SIGSEGV)",
  8: "Runtime error (SIGXFSZ)",
  9: "Runtime error (SIGFPE)",
  10: "Runtime error (SIGABRT)",
  11: "Runtime error (NZEC)",
  12: "Runtime error (other)",
  13: "Internal error",
  14: "Exec format error",
};

function mapStatus(id: number): Judge0Status {
  if (id === 3) return "success";
  if (id === 4) return "wrong_answer";
  if (id === 5) return "time_limit";
  if (id === 6) return "compile_error";
  if (id >= 7 && id <= 12) return "runtime_error";
  return "internal_error";
}

function truncate(value: string | null | undefined): string {
  if (!value) return "";
  return value.length > MAX_OUTPUT_CHARS
    ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n… (output truncated)`
    : value;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Sends one C++ submission to Judge0 and waits for the result.
 * Throws Judge0ConfigError when the environment is not configured and
 * Judge0UnavailableError when the service cannot be reached or misbehaves.
 * The student's code is never logged.
 */
export async function runCppSubmission(input: {
  code: string;
  stdin: string;
}): Promise<Judge0RunResult> {
  const baseUrl = (process.env.JUDGE0_URL ?? "").trim().replace(/\/+$/, "");
  const authToken = (process.env.JUDGE0_KEY ?? "").trim();
  if (!baseUrl) {
    throw new Judge0ConfigError("JUDGE0_URL is not configured.");
  }

  const languageId = Number(process.env.JUDGE0_CPP_LANGUAGE_ID || CPP_LANGUAGE_ID);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { "X-Auth-Token": authToken } : {}),
      },
      body: JSON.stringify({
        source_code: input.code,
        language_id: Number.isFinite(languageId) ? languageId : CPP_LANGUAGE_ID,
        stdin: input.stdin,
        compiler_options: COMPILER_OPTIONS,
        cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
        wall_time_limit: WALL_TIME_LIMIT_SECONDS,
        memory_limit: MEMORY_LIMIT_KB,
        max_file_size: MAX_FILE_SIZE_KB,
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch {
    throw new Judge0UnavailableError("Judge0 could not be reached.");
  }

  if (!response.ok) {
    throw new Judge0UnavailableError(`Judge0 returned HTTP ${response.status}.`);
  }

  let payload: Judge0Response;
  try {
    payload = (await response.json()) as Judge0Response;
  } catch {
    throw new Judge0UnavailableError("Judge0 returned an invalid response.");
  }

  const statusId = Number(payload.status?.id ?? 13);
  const status = mapStatus(statusId);
  const stderr = truncate(payload.stderr) || truncate(payload.message);

  return {
    status,
    statusId,
    statusLabel: payload.status?.description || STATUS_LABELS[statusId] || "Unknown",
    stdout: truncate(payload.stdout),
    compileOutput: truncate(payload.compile_output),
    stderr,
    time: parseNumber(payload.time),
    memory: typeof payload.memory === "number" ? payload.memory : null,
  };
}
