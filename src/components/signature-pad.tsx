"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import "./signature-pad.css";

type Point = { x: number; y: number };
type Stroke = Point[];

interface SignaturePadProps {
  open: boolean;
  title?: string;
  note?: string;
  roleLabel: string;
  scopeLabel: string;
  canClear?: boolean;
  onClose: () => void;
  onSave: (signatureData: string) => Promise<void>;
  onClear?: () => Promise<void>;
}

const MAX_SIGNATURE_LENGTH = 580000;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  if (stroke.length === 0) return;
  ctx.beginPath();
  const first = stroke[0];
  ctx.moveTo(first.x * width, first.y * height);
  if (stroke.length === 1) {
    ctx.lineTo(first.x * width + 0.01, first.y * height + 0.01);
  } else {
    for (let i = 1; i < stroke.length - 1; i += 1) {
      const point = stroke[i];
      const next = stroke[i + 1];
      const midX = ((point.x + next.x) / 2) * width;
      const midY = ((point.y + next.y) / 2) * height;
      ctx.quadraticCurveTo(point.x * width, point.y * height, midX, midY);
    }
    const last = stroke[stroke.length - 1];
    ctx.lineTo(last.x * width, last.y * height);
  }
  ctx.stroke();
}

function cropSignature(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] > 18) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const padding = Math.max(8, Math.round(canvas.width * 0.015));
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(canvas.width - 1, maxX + padding);
  const bottom = Math.min(canvas.height - 1, maxY + padding);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;

  const maxWidth = 900;
  const scale = cropWidth > maxWidth ? maxWidth / cropWidth : 1;
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(cropWidth * scale));
  output.height = Math.max(1, Math.round(cropHeight * scale));
  const outCtx = output.getContext("2d");
  if (!outCtx) return null;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(canvas, left, top, cropWidth, cropHeight, 0, 0, output.width, output.height);
  return output.toDataURL("image/png");
}

export default function SignaturePad({
  open,
  title = "Saini ripoti ya wanafunzi",
  note = "Sahihi hii itaonekana kwenye ripoti zote za kila mwanafunzi kwa kipindi hiki.",
  roleLabel,
  scopeLabel,
  canClear = false,
  onClose,
  onSave,
  onClear,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b2a5b";
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke, rect.width, rect.height);
    }
  }, []);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(setupCanvas);
    return () => window.cancelAnimationFrame(frame);
  }, [open, setupCanvas]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !clearing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, clearing, onClose]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setupCanvas());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [open, setupCanvas]);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (saving || clearing) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    activeStrokeRef.current = [point];
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.arc(point.x * rect.width, point.y * rect.height, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#0b2a5b";
    ctx.fill();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || saving || clearing) return;
    const point = pointFromEvent(event);
    const stroke = activeStrokeRef.current;
    if (!point || !stroke) return;
    const previous = stroke[stroke.length - 1];
    const dx = (point.x - previous.x) * 1000;
    const dy = (point.y - previous.y) * 1000;
    if (dx * dx + dy * dy < 1.2) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    stroke.push(point);

    const middle = {
      x: ((previous.x + point.x) / 2) * rect.width,
      y: ((previous.y + point.y) / 2) * rect.height,
    };
    ctx.beginPath();
    ctx.moveTo(previous.x * rect.width, previous.y * rect.height);
    ctx.quadraticCurveTo(
      previous.x * rect.width,
      previous.y * rect.height,
      middle.x,
      middle.y,
    );
    ctx.lineTo(point.x * rect.width, point.y * rect.height);
    ctx.strokeStyle = "#0b2a5b";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasInk(true);
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const stroke = activeStrokeRef.current;
    drawingRef.current = false;
    activeStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (stroke && stroke.length > 1) {
      strokesRef.current.push(stroke);
      setHasInk(true);
    } else if (stroke && stroke.length === 1) {
      strokesRef.current.push(stroke);
      setHasInk(true);
      redraw();
    }
  }

  function undo() {
    if (saving || clearing) return;
    strokesRef.current.pop();
    redraw();
    setHasInk(strokesRef.current.length > 0);
    setError("");
  }

  function clearCanvas() {
    if (saving || clearing) return;
    strokesRef.current = [];
    activeStrokeRef.current = null;
    drawingRef.current = false;
    setHasInk(false);
    setError("");
    redraw();
  }

  async function save() {
    if (saving || clearing) return;
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      setError("Chora sahihi kwanza kabla ya kuhifadhi.");
      return;
    }
    const signatureData = cropSignature(canvas);
    if (!signatureData) {
      setError("Sahihi haijatambuliwa. Jaribu kuchora tena.");
      return;
    }
    if (signatureData.length > MAX_SIGNATURE_LENGTH) {
      setError("Sahihi ni kubwa mno. Futa na ujaribu tena.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(signatureData);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Imeshindikana kuhifadhi sahihi.");
    } finally {
      setSaving(false);
    }
  }

  async function clearSaved() {
    if (!onClear || saving || clearing) return;
    setClearing(true);
    setError("");
    try {
      await onClear();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Imeshindikana kufuta sahihi.");
    } finally {
      setClearing(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="cm-modal-backdrop sigp-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !clearing) onClose();
      }}
    >
      <div
        className="sm-modal sigp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sigp-title"
      >
        <div className="sm-modal-head sigp-head">
          <div>
            <h3 className="sm-modal-title" id="sigp-title">{title}</h3>
            <p className="sm-modal-sub">{roleLabel} · {scopeLabel}</p>
          </div>
          <button
            type="button"
            className="sigp-close"
            onClick={onClose}
            disabled={saving || clearing}
            aria-label="Funga"
          >
            ✕
          </button>
        </div>

        <div className="sigp-body">
          <div className="sigp-note">
            {note}
          </div>
          <div className="sigp-canvas-wrap">
            <span className="sigp-watermark" aria-hidden="true">Saini hapa</span>
            <span className="sigp-baseline" aria-hidden="true" />
            <canvas
              ref={canvasRef}
              className="sigp-canvas"
              aria-label="Eneo la kuchora sahihi"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            />
          </div>
          <p className="sigp-hint">Tumia mouse, kidole au stylus. Unaweza kufuta na kuchora tena.</p>
          {error ? <p className="sigp-error" role="alert">{error}</p> : null}
        </div>

        <div className="sm-modal-actions sigp-actions">
          {canClear && onClear ? (
            <button
              type="button"
              className="cm-btn cm-btn--ghost sigp-clear-saved"
              onClick={clearSaved}
              disabled={saving || clearing}
            >
              {clearing ? "Inafuta..." : "Futa sahihi iliyohifadhiwa"}
            </button>
          ) : null}
          <button type="button" className="cm-btn cm-btn--ghost" onClick={clearCanvas} disabled={saving || clearing || !hasInk}>
            Futa
          </button>
          <button type="button" className="cm-btn cm-btn--ghost" onClick={undo} disabled={saving || clearing || !hasInk}>
            Rudisha
          </button>
          <button type="button" className="cm-btn cm-btn--ghost" onClick={onClose} disabled={saving || clearing}>
            Ghairi
          </button>
          <button type="button" className="cm-btn cm-btn--primary" onClick={save} disabled={saving || clearing || !hasInk}>
            {saving ? "Inahifadhi..." : "Hifadhi sahihi"}
          </button>
        </div>
      </div>
    </div>
  );
}
