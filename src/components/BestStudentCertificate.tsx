"use client";

/**
 * BestStudentCertificate.tsx
 * - <Certificate />        : the A4-landscape certificate (1123 x 794 px)
 * - <CertificateEditor />  : editable fields (name, form, year) + preview + PDF/PNG download
 *
 * Needs:  npm i html-to-image jspdf
 * Needs:  /public/logo.png  (school logo)
 */

import { forwardRef, useEffect, useRef, useState } from "react";

const W = 1123;
const H = 794;
const NAVY = "#0E1F3F";
const GOLD = "#B8923A";
const GOLD_DARK = "#7A5C14";

export type CertificateProps = {
  studentName: string;
  formLevel: string; // e.g. "Form Four"
  academicYear: string; // e.g. "2026"
  awardDate?: string; // e.g. "15 / 12 / 2026" (optional, blank line if empty)
  average?: number | null;
  grade?: string;
  division?: string;
  points?: number | null;
  logoSrc?: string;
  umojaSrc?: string;
  scale?: number; // preview scale only (download is always full size)
};

function LogoBadge({ src, side }: { src: string; side: "left" | "right" }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 62,
        ...(side === "left" ? { left: 74 } : { right: 74 }),
        width: 92,
        height: 92,
        display: "grid",
        placeItems: "center",
        borderRadius: "50%",
        background: "radial-gradient(circle at 30% 25%, rgba(232,203,120,0.24), rgba(251,248,241,0) 68%)",
      }}
    >
      <svg aria-hidden="true" width="92" height="92" viewBox="0 0 92 92" style={{ position: "absolute", inset: 0 }}>
        <circle cx="46" cy="46" r="43" fill="none" stroke="url(#gold)" strokeWidth="1.4" strokeDasharray="2 5" />
        <circle cx="46" cy="46" r="36" fill="none" stroke={GOLD} strokeWidth="0.9" opacity="0.55" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6;
          return <circle key={i} cx={46 + 43 * Math.cos(a)} cy={46 + 43 * Math.sin(a)} r="1.7" fill="url(#gold)" />;
        })}
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={src} style={{ width: 58, height: 58, objectFit: "contain", position: "relative" }} />
    </div>
  );
}

function Corner({ transform, style }: { transform?: string; style: React.CSSProperties }) {
  return (
    <svg aria-hidden="true" width="90" height="90" viewBox="0 0 90 90" style={{ position: "absolute", transform, ...style }}>
      <path d="M6 84V6h78" fill="none" stroke={NAVY} strokeWidth="4" />
      <path d="M20 70V20h50" fill="none" stroke="url(#gold)" strokeWidth="1.5" />
      <path d="M34 56V34h22" fill="none" stroke="url(#gold)" strokeWidth="1" />
      <path d="M6 40A34 34 0 0 1 40 6" fill="none" stroke="url(#gold)" strokeWidth="1" />
      <rect x="2" y="2" width="16" height="16" fill="url(#gold)" />
      <rect x="7" y="7" width="6" height="6" fill={NAVY} />
      <circle cx="48" cy="48" r="3" fill="url(#gold)" />
    </svg>
  );
}

function Laurel() {
  const leaves: [number, number, number][] = [
    [66, 104, -35], [56, 88, -55], [51, 70, -75], [52, 52, -100], [58, 35, -120], [70, 21, -140],
  ];
  return (
    <g fill="url(#gold)">
      {leaves.map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="11" ry="4.5" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </g>
  );
}

function Diamond() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
      <rect x="2" y="2" width="8" height="8" fill="url(#gold)" transform="rotate(45 6 6)" />
    </svg>
  );
}

function displayMetric(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function displayDivision(value: string | undefined) {
  if (!value) return "—";
  return value.replace(/^Division\s*/i, "").trim() || "—";
}

export const Certificate = forwardRef<HTMLDivElement, CertificateProps>(function Certificate(
  { studentName, formLevel, academicYear, awardDate, average, grade, division, points, logoSrc = "/logo.png", umojaSrc = "/assets/umoja.png", scale = 1 },
  ref
) {
  const sans = "'Montserrat', sans-serif";
  const serif = "'Cormorant Garamond', serif";
  return (
    <div style={{ width: W * scale, height: H * scale, overflow: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,600&family=Montserrat:wght@500;600&display=swap');`}</style>
      <div
        ref={ref}
        style={{
          position: "relative", width: W, height: H, boxSizing: "border-box", padding: 26, overflow: "hidden",
          transform: `scale(${scale})`, transformOrigin: "top left",
          backgroundColor: "#FBF8F1",
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(14,31,63,0.028) 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, rgba(184,146,58,0.05) 0 1px, transparent 1px 7px)",
          fontFamily: sans, color: NAVY,
        }}
      >
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#E8CB78" />
              <stop offset="0.35" stopColor="#B8923A" />
              <stop offset="0.65" stopColor="#8A6A1F" />
              <stop offset="1" stopColor="#D9B65A" />
            </linearGradient>
          </defs>
        </svg>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={logoSrc} style={{ position: "absolute", left: 330, top: 180, width: 463, height: "auto", opacity: 0.18 }} />

        <div style={{ position: "absolute", inset: 26, border: `4px solid ${NAVY}`, boxSizing: "border-box" }} />
        <div style={{ position: "absolute", inset: 40, border: `2px solid ${GOLD}`, boxSizing: "border-box" }} />
        <div style={{ position: "absolute", inset: 50, border: `0.75px solid ${GOLD}`, boxSizing: "border-box" }} />

        <LogoBadge src={umojaSrc} side="left" />
        <LogoBadge src={logoSrc} side="right" />
        <Corner style={{ left: 36, bottom: 36 }} transform="scaleY(-1)" />
        <Corner style={{ right: 36, bottom: 36 }} transform="scale(-1,-1)" />

        <div style={{ position: "relative", height: "100%", boxSizing: "border-box", padding: "44px 110px 40px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: 6, color: GOLD_DARK }}>UNITED REPUBLIC OF TANZANIA</div>
          <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600, letterSpacing: 5 }}>KITUKUTU TECHNICAL SECONDARY SCHOOL</div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 500, letterSpacing: 3, color: "#4A5568" }}>IRAMBA DISTRICT · SINGIDA REGION</div>

          <div style={{ marginTop: 12, fontFamily: serif, fontSize: 76, fontWeight: 700, letterSpacing: 14, lineHeight: 1, textShadow: "1px 1px 0 rgba(184,146,58,0.55)" }}>CERTIFICATE</div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 110, height: 1.5, background: GOLD }} />
            <Diamond />
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 7, color: GOLD_DARK }}>OF EXCELLENCE</div>
            <Diamond />
            <div style={{ width: 110, height: 1.5, background: GOLD }} />
          </div>

          <div style={{ marginTop: 14, padding: "7px 36px", borderTop: `1px solid ${GOLD}`, borderBottom: `1px solid ${GOLD}`, fontFamily: serif, fontSize: 28, fontWeight: 700, letterSpacing: 5 }}>
            BEST STUDENT OF THE YEAR {academicYear}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, fontWeight: 500, letterSpacing: 4, color: "#4A5568" }}>THIS CERTIFICATE IS PROUDLY PRESENTED TO</div>

          <div style={{ marginTop: 4, width: 700, padding: "0 0 4px", borderBottom: `1.5px solid ${GOLD}`, fontFamily: serif, fontStyle: "italic", fontWeight: 600, letterSpacing: 1, fontSize: studentName.length > 28 ? 42 : 52, lineHeight: 1.2 }}>
            {studentName}
          </div>

          <div style={{ marginTop: 12, width: 760, fontFamily: serif, fontSize: 23, fontWeight: 600, lineHeight: 1.35, color: NAVY, letterSpacing: 0.4 }}>
            Average {average !== null && average !== undefined ? `${displayMetric(average)}%` : "—"}, Grade {grade || "—"}, Division {displayDivision(division)}, Points {points !== null && points !== undefined ? displayMetric(points) : "—"}.
          </div>

          <div style={{ marginTop: 10, width: 760, fontFamily: serif, fontSize: 18, fontWeight: 500, lineHeight: 1.4, color: "#2D3748" }}>
            in recognition of outstanding academic achievement, exemplary discipline and dedicated leadership demonstrated as the top student of {formLevel} throughout the academic year {academicYear}, with average {average !== null && average !== undefined ? `${displayMetric(average)}%` : "—"}, grade {grade || "—"}, division {displayDivision(division)}, and points {points !== null && points !== undefined ? displayMetric(points) : "—"}.
          </div>

          <div style={{ marginTop: "auto", width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ width: 230, textAlign: "center" }}>
              <div style={{ height: 44 }} />
              <div style={{ borderTop: `1.5px solid ${NAVY}`, paddingTop: 8, fontSize: 11, fontWeight: 600, letterSpacing: 3 }}>HEAD OF SCHOOL</div>
              <div style={{ marginTop: 4, fontSize: 11, color: "#4A5568" }}>Date: {awardDate || `____ / ____ / ${academicYear}`}</div>
            </div>

            <svg aria-hidden="true" width="260" height="150" viewBox="0 0 260 150">
              <polygon points="107,100 91,148 113,138 127,148 135,104" fill={NAVY} />
              <polygon points="153,100 169,148 147,138 133,148 125,104" fill={GOLD_DARK} />
              <Laurel />
              <g transform="translate(260,0) scale(-1,1)"><Laurel /></g>
              <circle cx="130" cy="62" r="57" fill="none" stroke="url(#gold)" strokeWidth="9" strokeDasharray="5 4" />
              <circle cx="130" cy="62" r="49" fill="url(#gold)" />
              <circle cx="130" cy="62" r="41" fill={NAVY} />
              <circle cx="130" cy="62" r="36" fill="none" stroke="url(#gold)" strokeWidth="1" />
              <polygon points="130,38 136,54 153,54 139,64 144,81 130,71 116,81 121,64 107,54 124,54" fill="url(#gold)" />
            </svg>

            <div style={{ width: 230, textAlign: "center" }}>
              <div style={{ height: 44 }} />
              <div style={{ borderTop: `1.5px solid ${NAVY}`, paddingTop: 8, fontSize: 11, fontWeight: 600, letterSpacing: 3 }}>ACADEMIC MASTER</div>
              <div style={{ marginTop: 4, fontSize: 11, color: "#4A5568" }}>Kitukutu Technical Secondary School</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const FORMS = ["Form One", "Form Two", "Form Three", "Form Four", "Form Five", "Form Six"];

export default function CertificateEditor(props: {
  initialName?: string;
  initialForm?: string;
  initialYear?: string;
  average?: number | null;
  grade?: string;
  division?: string;
  points?: number | null;
  logoSrc?: string;
}) {
  const [name, setName] = useState((props.initialName ?? "").toUpperCase() === props.initialName ? toTitle(props.initialName ?? "") : props.initialName ?? "");
  const [form, setForm] = useState(props.initialForm ?? "Form Four");
  const [year, setYear] = useState(props.initialYear ?? String(new Date().getFullYear()));
  const [average, setAverage] = useState<number | null>(props.average ?? null);
  const [grade, setGrade] = useState(props.grade ?? "A");
  const [division, setDivision] = useState(props.division ?? "Division I");
  const [points, setPoints] = useState<number | null>(props.points ?? null);

  useEffect(() => {
    setAverage(props.average ?? null);
    setGrade(props.grade ?? "A");
    setDivision(props.division ?? "Division I");
    setPoints(props.points ?? null);
  }, [props.average, props.grade, props.division, props.points]);

  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  async function download(kind: "pdf" | "png") {
    if (!ref.current || !name.trim()) return;
    setBusy(kind);
    setError("");
    try {
      await document.fonts.ready;
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(ref.current, {
        pixelRatio: 2, cacheBust: true, width: W, height: H,
        style: { transform: "none" },
      });
      const file = `Certificate_${name.trim().replace(/\s+/g, "_")}_${form.replace(/\s+/g, "")}_${year}`;
      if (kind === "png") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${file}.png`;
        a.click();
      } else {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        pdf.addImage(dataUrl, "PNG", 0, 0, 297, 210);
        pdf.save(`${file}.pdf`);
      }
    } catch (e) {
      setError("Imeshindwa kutengeneza cheti. Jaribu tena.");
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  const field: React.CSSProperties = { padding: "8px 10px", border: "1px solid #CBD5E0", borderRadius: 6, fontSize: 14 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13, flex: "1 1 260px" }}>
          Jina la mwanafunzi
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Kidato
          <select style={field} value={form} onChange={(e) => setForm(e.target.value)}>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, width: 100 }}>
          Mwaka
          <input style={field} value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, width: 100 }}>
          Wastani
          <input type="number" step="0.1" style={field} value={average ?? ""} onChange={(e) => setAverage(e.target.value === "" ? null : Number(e.target.value))} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, width: 90 }}>
          Grade
          <select style={field} value={grade} onChange={(e) => setGrade(e.target.value)}>
            {['A','B','C','D','F'].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, width: 110 }}>
          Division
          <select style={field} value={division} onChange={(e) => setDivision(e.target.value)}>
            {['Division I', 'Division II', 'Division III', 'Division IV', 'Division 0'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, width: 90 }}>
          Points
          <input type="number" step="1" style={field} value={points ?? ""} onChange={(e) => setPoints(e.target.value === "" ? null : Number(e.target.value))} />
        </label>
        <button onClick={() => download("pdf")} disabled={!!busy || !name.trim()} style={{ ...field, background: NAVY, color: "#fff", cursor: "pointer" }}>
          {busy === "pdf" ? "Inatengeneza..." : "Pakua PDF"}
        </button>
        <button onClick={() => download("png")} disabled={!!busy || !name.trim()} style={{ ...field, cursor: "pointer" }}>
          {busy === "png" ? "Inatengeneza..." : "Pakua PNG"}
        </button>
      </div>
      {error && <div style={{ color: "#B91C1C", fontSize: 13 }}>{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <Certificate
          ref={ref}
          studentName={name || "Student Full Name"}
          formLevel={form}
          academicYear={year}
          average={average}
          grade={grade}
          division={division}
          points={points}
          logoSrc={props.logoSrc}
          scale={0.8}
        />
      </div>
    </div>
  );
}

function toTitle(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

