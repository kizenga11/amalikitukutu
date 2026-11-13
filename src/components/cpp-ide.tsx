"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import {
  codeFromAnswerHtml,
  codeToAnswerHtml,
  parseCompilerDiagnostics,
  type CodeDiagnostic,
} from "@/lib/code-errors";
import {
  IdeApiError,
  ideDraftKey,
  readIdeLocalDraft,
  runCppCode,
  writeIdeLocalDraft,
  type IdeRunResult,
} from "@/lib/ide-api";
import { IDE_RUN_ENABLED } from "@/lib/ide-config";
import "./cpp-ide.css";

const DEFAULT_CPP_CODE = `#include <iostream>
using namespace std;

int main() {
    // Andika code yako hapa
    cout << "Hello, Dunia!" << endl;
    return 0;
}
`;

type MonacoEditorComponent = typeof import("@monaco-editor/react")["default"];

interface CppIdeProps {
  assignmentId: string;
  questionId: string;
  questionNumber: number;
  initialHtml: string;
  locked: boolean;
  submitting?: boolean;
  onChange: (answer: { html: string; text: string }) => void;
  onSubmit: () => void;
}

function statusTone(status: IdeRunResult["status"]): "success" | "error" | "warn" {
  if (status === "success") return "success";
  if (status === "compile_error" || status === "runtime_error" || status === "wrong_answer") {
    return "error";
  }
  return "warn";
}

function statusLabel(result: IdeRunResult): string {
  if (result.status === "success") return "Imefanikiwa";
  if (result.status === "compile_error") return "Kosa la kukusanya (compile)";
  if (result.status === "time_limit") return "Muda umezidi";
  if (result.status === "runtime_error") return "Kosa la utekelezaji (runtime)";
  if (result.status === "wrong_answer") return "Jibu si sahihi";
  return "Hitilafu ya huduma";
}

export default function CppIde({
  assignmentId,
  questionId,
  questionNumber,
  initialHtml,
  locked,
  submitting = false,
  onChange,
  onSubmit,
}: CppIdeProps) {
  const draftKey = ideDraftKey(assignmentId, questionId);
  // Write-only mode (the default) hides Run/stdin/output until Judge0 exists.
  const runEnabled = IDE_RUN_ENABLED;

  // A student who already has saved code (server answer or local recovery draft)
  // has clearly started working; the untouched starter template does not count.
  const [touched, setTouched] = useState(() => {
    if (codeFromAnswerHtml(initialHtml).trim()) return true;
    return Boolean(readIdeLocalDraft(draftKey)?.code?.trim());
  });
  const [code, setCode] = useState<string>(() => {
    const saved = codeFromAnswerHtml(initialHtml);
    if (saved.trim()) return saved;
    const local = readIdeLocalDraft(draftKey);
    if (local?.code?.trim()) return local.code;
    return DEFAULT_CPP_CODE;
  });
  const [stdin, setStdin] = useState<string>(() => readIdeLocalDraft(draftKey)?.stdin ?? "");
  const [fontSize, setFontSize] = useState(14);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IdeRunResult | null>(null);
  const [runError, setRunError] = useState("");
  const [lastRun, setLastRun] = useState<{ code: string; ok: boolean } | null>(null);
  const [mode, setMode] = useState<"monaco" | "plain">("monaco");
  const [Monaco, setMonaco] = useState<MonacoEditorComponent | null>(null);
  const [monacoFailed, setMonacoFailed] = useState(false);
  const [monacoMounted, setMonacoMounted] = useState(false);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const plainRef = useRef<HTMLTextAreaElement | null>(null);

  // Load the editor bundle lazily, only when a practical question is opened.
  useEffect(() => {
    let cancelled = false;
    import("@monaco-editor/react")
      .then((mod) => {
        if (!cancelled) setMonaco(() => mod.default);
      })
      .catch(() => {
        if (!cancelled) {
          setMonacoFailed(true);
          setMode("plain");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Weak networks: start in the plain editor when the browser is offline.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) setMode("plain");
  }, []);

  // If the CDN takes too long, offer the plain editor instead of a blank box.
  useEffect(() => {
    if (mode !== "monaco" || monacoMounted || monacoFailed) return;
    const timer = window.setTimeout(() => setMode("plain"), 15_000);
    return () => window.clearTimeout(timer);
  }, [mode, monacoMounted, monacoFailed]);

  // Local recovery draft. The server draft is saved by the existing 6s autosave.
  // Nothing is stored until the student actually edits, so the starter template
  // is never mistaken for a real answer.
  useEffect(() => {
    if (!touched) return;
    const timer = window.setTimeout(() => {
      writeIdeLocalDraft(draftKey, {
        code,
        stdin,
        updatedAt: new Date().toISOString(),
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [code, stdin, draftKey, touched]);

  const applyMarkers = useCallback((next: IdeRunResult | null) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    if (!next?.compileOutput) {
      monaco.editor.setModelMarkers(model, "cpp", []);
      return;
    }

    const diagnostics = parseCompilerDiagnostics(next.compileOutput);
    monaco.editor.setModelMarkers(
      model,
      "cpp",
      diagnostics.map((item) => ({
        severity:
          item.severity === "error"
            ? monaco.MarkerSeverity.Error
            : item.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        message: item.message,
        startLineNumber: item.line,
        startColumn: Math.max(1, item.column || 1),
        endLineNumber: item.line,
        endColumn: Math.max(1, item.column || 1) + 1,
      })),
    );
  }, []);

  useEffect(() => {
    applyMarkers(result);
  }, [result, applyMarkers]);

  // Clear markers when the IDE closes.
  useEffect(() => {
    return () => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel();
      if (monaco && model) monaco.editor.setModelMarkers(model, "cpp", []);
    };
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      setMonacoMounted(true);
      applyMarkers(result);
      editor.focus();
    },
    [applyMarkers, result],
  );

  function updateCode(next: string) {
    setCode(next);
    setTouched(true);
    // Keep the existing assignment draft in sync with the editor.
    onChange({ html: codeToAnswerHtml(next), text: next });
  }

  async function handleRun() {
    if (running || locked) return;
    const current = code;
    setRunning(true);
    setRunError("");
    try {
      const res = await runCppCode({
        assignmentId,
        questionId,
        code: current,
        stdin,
      });
      setResult(res);
      setLastRun({ code: current, ok: res.status === "success" });
      // Running also persists the code through the existing autosave flow.
      onChange({ html: codeToAnswerHtml(current), text: current });
    } catch (err) {
      setResult(null);
      setLastRun(null);
      setRunError(
        err instanceof IdeApiError
          ? err.message
          : "Huduma ya kuendesha code haipatikani kwa sasa. Jaribu tena baadaye; code yako haijapotea.",
      );
    } finally {
      setRunning(false);
    }
  }

  function jumpTo(diagnostic: CodeDiagnostic) {
    if (mode === "plain") {
      const textarea = plainRef.current;
      if (!textarea) return;
      const offset = lineOffset(code, diagnostic.line, diagnostic.column);
      textarea.focus();
      textarea.setSelectionRange(offset, offset);
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(diagnostic.line);
    editor.setPosition({
      lineNumber: diagnostic.line,
      column: Math.max(1, diagnostic.column || 1),
    });
    editor.focus();
  }

  const diagnostics = result?.compileOutput
    ? parseCompilerDiagnostics(result.compileOutput).filter((item) => item.severity !== "note")
    : [];
  // Write-only mode: any code the student actually wrote can be submitted.
  const canSubmit = runEnabled
    ? Boolean(lastRun?.ok && lastRun.code === code && !locked && !running)
    : Boolean(touched && code.trim().length > 0 && !locked);
  const codeChangedSinceRun = Boolean(lastRun && lastRun.code !== code);

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    // Guarantee the parent has the exact code before the existing submit flow runs.
    onChange({ html: codeToAnswerHtml(code), text: code });
    onSubmit();
  }

  return (
    <div className="ide" aria-label={`C++ IDE kwa swali ${questionNumber}`}>
      <div className="ide-toolbar">
        <div className="ide-toolbar-left">
          <span className="ide-language">C++</span>
          <div className="ide-mode-switch" role="group" aria-label="Aina ya editor">
            <button
              type="button"
              className={mode === "monaco" ? "ide-mode-btn ide-mode-btn--active" : "ide-mode-btn"}
              onClick={() => setMode("monaco")}
              disabled={monacoFailed}
            >
              IDE
            </button>
            <button
              type="button"
              className={mode === "plain" ? "ide-mode-btn ide-mode-btn--active" : "ide-mode-btn"}
              onClick={() => setMode("plain")}
            >
              Maandishi
            </button>
          </div>
        </div>
        <div className="ide-toolbar-right">
          {mode === "monaco" && (
            <div className="ide-font" role="group" aria-label="Ukubwa wa herufi">
              <button type="button" className="ide-icon-btn" onClick={() => setFontSize((s) => Math.max(11, s - 1))} aria-label="Punguza herufi">A−</button>
              <span className="ide-font-value">{fontSize}</span>
              <button type="button" className="ide-icon-btn" onClick={() => setFontSize((s) => Math.min(22, s + 1))} aria-label="Ongeza herufi">A+</button>
            </div>
          )}
          {runEnabled && (
            <button
              type="button"
              className="ide-btn ide-btn--run"
              onClick={() => void handleRun()}
              disabled={running || locked}
            >
              {running ? "Inaendesha…" : "Endesha"}
            </button>
          )}
        </div>
      </div>

      <div className="ide-editor-wrap">
        {mode === "monaco" && Monaco ? (
          <Monaco
            path={`${assignmentId}-${questionId}.cpp`}
            language="cpp"
            theme="vs-dark"
            value={code}
            onChange={(value) => updateCode(value ?? "")}
            onMount={handleMount}
            loading={<div className="ide-editor-loading">Inapakia editor…</div>}
            options={{
              fontSize,
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              insertSpaces: true,
              autoClosingBrackets: "always",
              autoClosingQuotes: "always",
              autoIndent: "full",
              formatOnPaste: true,
              wordWrap: "off",
              lineNumbers: "on",
              renderLineHighlight: "line",
              padding: { top: 12, bottom: 12 },
              readOnly: locked,
            }}
          />
        ) : (
          <div className="ide-plain">
            {mode === "monaco" && !monacoFailed && (
              <div className="ide-plain-note">Editor inapakia… unaweza kuendelea kuandika hapa chini.</div>
            )}
            {monacoFailed && (
              <div className="ide-plain-note">Editor haikupatikana. Tumia sehemu hii ya maandishi; code yako itahifadhiwa kama kawaida.</div>
            )}
            <textarea
              ref={plainRef}
              className="ide-textarea"
              value={code}
              onChange={(event) => updateCode(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              readOnly={locked}
              aria-label={`Code ya C++ kwa swali ${questionNumber}`}
            />
          </div>
        )}
      </div>

      {runEnabled && (
        <label className="ide-stdin">
          <span>Input (stdin) — hiari</span>
          <textarea
            value={stdin}
            onChange={(event) => setStdin(event.target.value)}
            placeholder="Weka input ya program hapa, kama ipo…"
            spellCheck={false}
            rows={2}
            readOnly={locked}
          />
        </label>
      )}

      {runEnabled && (result || runError) && (
        <div className="ide-output" aria-live="polite">
          {runError ? (
            <div className="ide-status ide-status--error">{runError}</div>
          ) : result ? (
            <>
              <div className="ide-output-head">
                <span className={`ide-status ide-status--${statusTone(result.status)}`}>{statusLabel(result)}</span>
                <span className="ide-meta">
                  {result.time !== null && <>Muda: {result.time.toFixed(3)}s · </>}
                  {result.memory !== null && <>Memory: {Math.round(result.memory / 1024)} MB</>}
                  {result.remaining !== null && <> · Zimebaki: {result.remaining}/dakika</>}
                </span>
              </div>

              {diagnostics.length > 0 && (
                <div className="ide-errors">
                  <h4>Makosa ya kukusanya</h4>
                  <ul>
                    {diagnostics.map((item, index) => (
                      <li key={`${item.line}-${item.column}-${index}`}>
                        <button type="button" className="ide-error-link" onClick={() => jumpTo(item)}>
                          <span className={`ide-error-line ide-error-line--${item.severity}`}>
                            Mstari {item.line}{item.column ? `:${item.column}` : ""}
                          </span>
                          <span>{item.message}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.compileOutput && diagnostics.length === 0 && (
                <pre className="ide-pre ide-pre--compile">{result.compileOutput}</pre>
              )}

              <div className="ide-output-grid">
                <div>
                  <h4>Matokeo (stdout)</h4>
                  <pre className="ide-pre">{result.stdout || "—"}</pre>
                </div>
                {(result.stderr || result.status === "runtime_error" || result.status === "time_limit") && (
                  <div>
                    <h4>Makosa (stderr)</h4>
                    <pre className="ide-pre ide-pre--error">{result.stderr || "Program ilisimama bila maelezo."}</pre>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      <div className="ide-submit-bar">
        <p className="ide-submit-hint">
          {locked
            ? "Kazi hii imeshafungwa."
            : !runEnabled
              ? touched && code.trim()
                ? "Code yako itawasilishwa kama jibu lako."
                : "Andika code yako kwanza."
              : lastRun?.ok && !codeChangedSinceRun
                ? "Code imefanikiwa. Unaweza kuwasilisha kazi nzima."
                : codeChangedSinceRun
                  ? "Umebadilisha code. Endesha tena ili kuwasilisha."
                  : "Endesha code kwanza. Kitufe cha kuwasilisha kitafunguka baada ya code kufanikiwa."}
        </p>
        <button
          type="button"
          className="ide-btn ide-btn--submit"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? "Inawasilisha…" : "Wasilisha kazi"}
        </button>
      </div>
    </div>
  );
}

/** Character offset for a 1-based line/column inside a string. */
function lineOffset(code: string, line: number, column: number): number {
  const lines = code.split("\n");
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i += 1) {
    offset += lines[i].length + 1;
  }
  const lineText = lines[line - 1] ?? "";
  return offset + Math.min(Math.max(0, column - 1), lineText.length);
}
