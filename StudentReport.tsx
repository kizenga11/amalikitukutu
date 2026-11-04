"use client";

import { ChangeEvent, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Ripoti ya Maendeleo ya Mwanafunzi — A4, ukurasa mmoja             */
/*  Hakuna dependency ya ziada. Weka kama: app/ripoti/page.tsx        */
/*  au components/StudentReport.tsx kisha uiite kutoka page.          */
/* ------------------------------------------------------------------ */

type Subject = {
  name: string;
  ex1: string;
  ex2: string;
  final: string;
  teacher: string;
};

type CommentKey = "teacher" | "academic" | "head";

const BEHAVIOR = [
  "Nidhamu",
  "Usafi",
  "Bidii ya masomo",
  "Michezo/klabu",
  "Uongozi",
  "Ushirikiano na wenzake",
  "Heshima kwa walimu",
  "Utunzaji wa mali ya shule",
];
const RATINGS = ["Bora Sana", "Nzuri", "Wastani", "Dhaifu"];

const INITIAL_SUBJECTS: Subject[] = [
  ["Kiswahili", "72", "75", "68"],
  ["English", "65", "68", "70"],
  ["Mathematics", "58", "61", "61"],
  ["Biology", "77", "80", "80"],
  ["Chemistry", "49", "52", "52"],
  ["Physics", "44", "47", "40"],
  ["Civics", "69", "72", "73"],
  ["History", "60", "63", "55"],
  ["Geography", "66", "69", "64"],
  ["Computer Programming", "85", "88", "88"],
].map(([name, ex1, ex2, final]) => ({ name, ex1, ex2, final, teacher: "" }));

/* ---------------------------- helpers ----------------------------- */

function toNum(s: string): number | null {
  const v = parseFloat(s.trim());
  return Number.isNaN(v) ? null : v;
}

function grade(score: number) {
  if (score >= 75) return { g: "A", p: 1, r: "Bora Sana" };
  if (score >= 65) return { g: "B", p: 2, r: "Vizuri Sana" };
  if (score >= 45) return { g: "C", p: 3, r: "Wastani" };
  if (score >= 30) return { g: "D", p: 4, r: "Hafifu" };
  return { g: "F", p: 5, r: "Dhaifu" };
}

function joinList(a: string[]) {
  if (a.length < 2) return a.join("");
  return a.slice(0, -1).join(", ") + " na " + a[a.length - 1];
}

function firstName(full: string) {
  const n = full.trim().split(/\s+/)[0] || "Mwanafunzi";
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

type Summary = {
  total: number;
  avg: number;
  g: string;
  points: number | null;
  division: string;
  best: string[];
  weak: string[];
};

function buildComments(name: string, s: Summary): Record<CommentKey, string> {
  const N = firstName(name);
  const b = joinList(s.best);
  const w = s.weak.length ? joinList(s.weak) : "";
  const p = s.points;

  let teacher: string;
  if (s.avg >= 75)
    teacher = `${N} ni mwanafunzi mwenye uwezo mkubwa na bidii ya kupigiwa mfano, hasa katika ${b}. Aendelee kudumisha kiwango hiki na kuwasaidia wenzake.`;
  else if (s.avg >= 65)
    teacher = `${N} ana matokeo mazuri sana, hasa katika ${b}.${
      w
        ? ` Akiongeza juhudi katika ${w} atafikia kiwango cha juu zaidi.`
        : " Akiendelea hivi atafikia kiwango cha juu zaidi."
    }`;
  else if (s.avg >= 45)
    teacher = `${N} ana matokeo ya wastani. Anahitaji kuongeza juhudi${
      w ? ` katika ${w}` : ""
    }, kujisomea zaidi na kuuliza walimu pale asipoelewa.`;
  else
    teacher = `${N} ana matokeo yasiyoridhisha. Anahitaji msaada wa karibu, kujisomea kila siku${
      w ? ` na kuimarisha ${w}` : ""
    }, pamoja na kuhudhuria vipindi vya ziada.`;

  let academic: string;
  switch (s.division) {
    case "I":
      academic = `Ufaulu wa kitaaluma ni bora (Divisheni I, pointi ${p}). Anahimizwa kudumisha ufaulu huu na kushiriki vipindi vya ziada vya kujiendeleza.`;
      break;
    case "II":
      academic = `Ufaulu wa kitaaluma ni mzuri (Divisheni II, pointi ${p}).${
        w
          ? ` Akiimarisha ${w} anaweza kufikia Divisheni I.`
          : " Akiongeza juhudi anaweza kufikia Divisheni I."
      }`;
      break;
    case "III":
      academic = `Ufaulu wa kitaaluma ni wa wastani (Divisheni III, pointi ${p}). Anashauriwa kuhudhuria vipindi vya ziada${
        w ? ` katika ${w}` : ""
      } na kufanya mazoezi ya mitihani iliyopita.`;
      break;
    case "IV":
      academic = `Ufaulu wa kitaaluma ni hafifu (Divisheni IV, pointi ${p}). Anahitaji mpango maalum wa kuimarisha masomo${
        w ? `, hasa ${w}` : ""
      }, pamoja na ufuatiliaji wa karibu wa mwalimu na mzazi.`;
      break;
    case "0":
      academic = `Ufaulu wa kitaaluma haukidhi kiwango (Divisheni 0, pointi ${p}). Hatua za haraka za kumsaidia zinahitajika, zikiwemo vipindi vya ziada na ufuatiliaji wa kila wiki.`;
      break;
    default:
      academic = `Wastani wa jumla ni ${s.avg.toFixed(1)}% (Daraja ${s.g}). ${
        s.avg >= 65
          ? "Ufaulu ni mzuri, aendelee kuongeza juhudi."
          : s.avg >= 45
          ? `Anahitaji kuongeza juhudi${w ? ` katika ${w}` : ""}.`
          : `Anahitaji msaada wa ziada wa kitaaluma${w ? ` katika ${w}` : ""}.`
      }`;
  }

  let head: string;
  if (s.g === "A" || s.g === "B")
    head =
      "Hongera kwa matokeo mazuri. Shule inakutaka uendelee kuwa mfano bora wa nidhamu na bidii kwa wanafunzi wenzako.";
  else if (s.g === "C")
    head =
      "Matokeo ni ya wastani. Shule inamtaka mwanafunzi kuongeza juhudi na nidhamu ya kujisomea; tunaomba ushirikiano wa mzazi/mlezi.";
  else
    head =
      "Matokeo hayaridhishi. Shule inamtaka mwanafunzi kubadilika na kuweka bidii zaidi; tunamwomba mzazi/mlezi kushirikiana nasi kwa karibu.";

  return { teacher, academic, head };
}

/* ---------------------------- component --------------------------- */

export default function StudentReport() {
  const [school, setSchool] = useState("KITUKUTU TECHNICAL SECONDARY SCHOOL");
  const [contact, setContact] = useState(
    "S.L.P ____, SINGIDA · Simu: ____________ · Barua pepe: ____________"
  );
  const [logos, setLogos] = useState<[string | null, string | null]>([null, null]);

  const [student, setStudent] = useState({
    name: "JUMA ALLY MUSSA",
    gender: "ME",
    regNo: "S1234/0001",
    form: "Form Two",
    stream: "A",
    year: "2026",
    term: "Muhula wa Pili – Mtihani wa Mwisho wa Mwaka",
    classSize: "45",
  });

  const [labels, setLabels] = useState({ ex1: "Mtihani 1", ex2: "Mtihani 2" });
  const [subjects, setSubjects] = useState<Subject[]>(INITIAL_SUBJECTS);
  const [position, setPosition] = useState("5");
  const [ratings, setRatings] = useState<number[]>([0, 1, 0, 2, 1, 0, 0, 1]);
  const [manual, setManual] = useState<Partial<Record<CommentKey, string>>>({});
  const [headDate, setHeadDate] = useState("__/__/2026");
  const [closing, setClosing] = useState("__ / __ / 2026");
  const [opening, setOpening] = useState("__ / __ / 2027");

  /* ----- hesabu (kutoka Mtihani wa Mwisho tu) ----- */
  const summary = useMemo<Summary | null>(() => {
    const scored = subjects
      .map((s) => ({ name: s.name.trim(), v: toNum(s.final) }))
      .filter((r): r is { name: string; v: number } => r.v !== null);
    if (!scored.length) return null;

    const total = scored.reduce((a, r) => a + r.v, 0);
    const avg = total / scored.length;
    const pts = scored.map((r) => grade(r.v).p).sort((a, b) => a - b);

    let points: number | null = null;
    let division = "–";
    if (pts.length >= 7) {
      points = pts.slice(0, 7).reduce((a, b) => a + b, 0);
      division =
        points <= 17 ? "I" : points <= 21 ? "II" : points <= 25 ? "III" : points <= 33 ? "IV" : "0";
    }

    const best = [...scored].sort((a, b) => b.v - a.v).slice(0, 2).map((r) => r.name);
    const weak = scored
      .filter((r) => r.v < 45)
      .sort((a, b) => a.v - b.v)
      .slice(0, 3)
      .map((r) => r.name);

    return { total, avg, g: grade(avg).g, points, division, best, weak };
  }, [subjects]);

  const auto = useMemo(
    () => (summary ? buildComments(student.name, summary) : null),
    [summary, student.name]
  );

  const commentValue = (k: CommentKey) => manual[k] ?? auto?.[k] ?? "";

  /* ----- vishikilizi ----- */
  const setSubject = (i: number, key: keyof Subject, value: string) =>
    setSubjects((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)));

  const setStudentField = (key: keyof typeof student) => (e: ChangeEvent<HTMLInputElement>) =>
    setStudent((p) => ({ ...p, [key]: e.target.value }));

  const pickLogo = (idx: 0 | 1) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setLogos((prev) => {
        const next: [string | null, string | null] = [prev[0], prev[1]];
        next[idx] = String(reader.result);
        return next;
      });
    reader.readAsDataURL(file);
  };

  const setComment = (k: CommentKey, v: string) => setManual((p) => ({ ...p, [k]: v }));
  const resetComments = () => setManual({});

  return (
    <div className="rp-wrap">
      <style>{CSS}</style>

      <div className="rp-bar">
        <button onClick={() => window.print()}>Print / Hifadhi PDF</button>
        {Object.keys(manual).length > 0 && (
          <button className="rp-ghost" onClick={resetComments}>
            Rudisha maoni ya kiotomatiki
          </button>
        )}
        <small>
          Bofya logo kuweka picha. Andika alama za Mtihani wa Mwisho, daraja na maoni hujijaza.
        </small>
      </div>

      <div className="rp-scroll">
        <div className="rp-page">
          {/* ---------- kichwa ---------- */}
          <div className="rp-hd">
            <label className={"rp-logo" + (logos[0] ? "" : " empty")}>
              {logos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logos[0]} alt="Logo 1" />
              ) : (
                <span>LOGO 1</span>
              )}
              <input type="file" accept="image/*" hidden onChange={pickLogo(0)} />
            </label>
            <div className="rp-mid">
              <div className="rp-s1">
                JAMHURI YA MUUNGANO WA TANZANIA
                <br />
                HALMASHAURI YA WILAYA YA IRAMBA
              </div>
              <input
                className="rp-in rp-h1"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                aria-label="Jina la shule"
              />
              <input
                className="rp-in rp-s1"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                aria-label="Anuani ya shule"
              />
            </div>
            <label className={"rp-logo" + (logos[1] ? "" : " empty")}>
              {logos[1] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logos[1]} alt="Logo 2" />
              ) : (
                <span>LOGO 2</span>
              )}
              <input type="file" accept="image/*" hidden onChange={pickLogo(1)} />
            </label>
          </div>

          <div className="rp-title">RIPOTI YA MAENDELEO YA MWANAFUNZI</div>

          {/* ---------- taarifa za mwanafunzi ---------- */}
          <table className="rp-info">
            <tbody>
              <tr>
                <td>
                  <b>Jina la Mwanafunzi:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "58%" }} value={student.name} onChange={setStudentField("name")} />
                </td>
                <td>
                  <b>Jinsia:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "40%" }} value={student.gender} onChange={setStudentField("gender")} />
                </td>
                <td>
                  <b>Namba ya Usajili:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "50%" }} value={student.regNo} onChange={setStudentField("regNo")} />
                </td>
              </tr>
              <tr>
                <td>
                  <b>Kidato:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "60%" }} value={student.form} onChange={setStudentField("form")} />
                </td>
                <td>
                  <b>Mkondo:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "50%" }} value={student.stream} onChange={setStudentField("stream")} />
                </td>
                <td>
                  <b>Mwaka:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "60%" }} value={student.year} onChange={setStudentField("year")} />
                </td>
              </tr>
              <tr>
                <td colSpan={2}>
                  <b>Muhula / Mtihani:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "68%" }} value={student.term} onChange={setStudentField("term")} />
                </td>
                <td>
                  <b>Wanafunzi Darasani:</b>{" "}
                  <input className="rp-in rp-inl" style={{ width: "30%" }} value={student.classSize} onChange={setStudentField("classSize")} />
                </td>
              </tr>
            </tbody>
          </table>

          {/* ---------- matokeo ---------- */}
          <h3>1. Matokeo ya Masomo</h3>
          <table className="rp-tbl">
            <thead>
              <tr>
                <th style={{ width: "4%" }}>#</th>
                <th>Somo</th>
                <th style={{ width: "12%" }}>
                  <input
                    className="rp-in rp-c rp-th"
                    value={labels.ex1}
                    onChange={(e) => setLabels((p) => ({ ...p, ex1: e.target.value }))}
                    aria-label="Jina la mtihani wa kwanza"
                  />
                  (100)
                </th>
                <th style={{ width: "12%" }}>
                  <input
                    className="rp-in rp-c rp-th"
                    value={labels.ex2}
                    onChange={(e) => setLabels((p) => ({ ...p, ex2: e.target.value }))}
                    aria-label="Jina la mtihani wa pili"
                  />
                  (100)
                </th>
                <th style={{ width: "13%" }}>Mtihani wa Mwisho (100)</th>
                <th style={{ width: "8%" }}>Daraja</th>
                <th style={{ width: "20%" }}>Maelezo</th>
                <th style={{ width: "12%" }}>Mwalimu</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => {
                const v = toNum(s.final);
                const gr = v === null ? null : grade(v);
                return (
                  <tr key={i}>
                    <td className="rp-c">{i + 1}</td>
                    <td>
                      <input className="rp-in" value={s.name} onChange={(e) => setSubject(i, "name", e.target.value)} />
                    </td>
                    <td>
                      <input className="rp-in rp-c" inputMode="decimal" value={s.ex1} onChange={(e) => setSubject(i, "ex1", e.target.value)} />
                    </td>
                    <td>
                      <input className="rp-in rp-c" inputMode="decimal" value={s.ex2} onChange={(e) => setSubject(i, "ex2", e.target.value)} />
                    </td>
                    <td>
                      <input className="rp-in rp-c rp-b" inputMode="decimal" value={s.final} onChange={(e) => setSubject(i, "final", e.target.value)} />
                    </td>
                    <td className="rp-c rp-b">{gr?.g ?? ""}</td>
                    <td>{gr?.r ?? ""}</td>
                    <td>
                      <input className="rp-in rp-c" value={s.teacher} onChange={(e) => setSubject(i, "teacher", e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="rp-key">
            <b>Viwango (NECTA):</b> A 75–100 Bora Sana · B 65–74 Vizuri Sana · C 45–64 Wastani · D 30–44 Hafifu · F 0–29 Dhaifu
          </div>

          {/* ---------- muhtasari ---------- */}
          <h3>2. Muhtasari wa Matokeo</h3>
          <table className="rp-sum">
            <tbody>
              <tr>
                <td><b>{summary ? summary.total.toFixed(1) : "–"}</b><span>Jumla ya Alama</span></td>
                <td><b>{summary ? summary.avg.toFixed(1) : "–"}</b><span>Wastani (%)</span></td>
                <td><b>{summary?.g ?? "–"}</b><span>Daraja la Jumla</span></td>
                <td><b>{summary?.points ?? "–"}</b><span>Pointi (Bora 7)</span></td>
                <td><b>{summary?.division ?? "–"}</b><span>Divisheni</span></td>
                <td>
                  <input className="rp-in rp-c rp-big" value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Nafasi" />
                  <span>Nafasi</span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ---------- tabia ---------- */}
          <h3>3. Tabia na Mwenendo</h3>
          <table className="rp-tbl">
            <thead>
              <tr>
                <th style={{ width: "23%" }}>Kipengele</th>
                {RATINGS.map((r) => <th key={"a" + r}>{r}</th>)}
                <th style={{ width: "23%" }}>Kipengele</th>
                {RATINGS.map((r) => <th key={"b" + r}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((row) => (
                <tr key={row}>
                  {[row, row + 4].map((idx) => (
                    <BehaviorCells
                      key={idx}
                      label={BEHAVIOR[idx]}
                      value={ratings[idx]}
                      onPick={(r) => setRatings((p) => p.map((x, i) => (i === idx ? r : x)))}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---------- maoni ---------- */}
          <h3>4. Maoni na Uthibitisho</h3>

          <div className="rp-cm">
            <div className="rp-t">Maoni ya Mwalimu wa Darasa</div>
            <textarea className="rp-in rp-ta" rows={2} value={commentValue("teacher")} onChange={(e) => setComment("teacher", e.target.value)} />
          </div>

          <div className="rp-cm">
            <div className="rp-t">Maoni ya Mwalimu wa Taaluma</div>
            <textarea className="rp-in rp-ta" rows={2} value={commentValue("academic")} onChange={(e) => setComment("academic", e.target.value)} />
            <div className="rp-sg">
              <div><input className="rp-in" aria-label="Jina la Mwalimu wa Taaluma" /><i>Jina la Mwalimu wa Taaluma</i></div>
              <div><input className="rp-in" aria-label="Sahihi" /><i>Sahihi</i></div>
            </div>
          </div>

          <div className="rp-cm">
            <div className="rp-t">Maoni ya Mkuu wa Shule</div>
            <textarea className="rp-in rp-ta" rows={2} value={commentValue("head")} onChange={(e) => setComment("head", e.target.value)} />
            <div className="rp-sg">
              <div><input className="rp-in" aria-label="Jina la Mkuu wa Shule" /><i>Jina la Mkuu wa Shule</i></div>
              <div><input className="rp-in" aria-label="Sahihi" /><i>Sahihi</i></div>
              <div className="rp-stamp"><span>MUHURI</span></div>
              <div className="rp-dt">
                <input className="rp-in" value={headDate} onChange={(e) => setHeadDate(e.target.value)} aria-label="Tarehe" />
                <i>Tarehe</i>
              </div>
            </div>
          </div>

          <div className="rp-next">
            <div>
              <b>Shule inafungwa:</b>{" "}
              <input className="rp-in rp-inl" style={{ width: "55%" }} value={closing} onChange={(e) => setClosing(e.target.value)} />
            </div>
            <div>
              <b>Shule inafunguliwa:</b>{" "}
              <input className="rp-in rp-inl" style={{ width: "55%" }} value={opening} onChange={(e) => setOpening(e.target.value)} />
            </div>
          </div>

          {/* ---------- sehemu ya mzazi ---------- */}
          <div className="rp-cut"><span>✂ KATA HAPA — Mzazi/Mlezi arudishe sehemu hii shuleni ✂</span></div>

          <div className="rp-parent">
            <h3 style={{ marginTop: 0 }}>5. Maoni ya Mzazi / Mlezi</h3>
            <div>
              <b>Mwanafunzi:</b> {student.name.trim()} &nbsp; <b>Kidato:</b> {student.form}
            </div>
            <textarea className="rp-in rp-ta rp-parent-ta" rows={2} aria-label="Maoni ya mzazi" />
            <div className="rp-sg">
              <div><input className="rp-in" aria-label="Jina la Mzazi/Mlezi" /><i>Jina la Mzazi/Mlezi</i></div>
              <div><input className="rp-in" aria-label="Namba ya simu" /><i>Namba ya simu</i></div>
              <div><input className="rp-in" aria-label="Sahihi" /><i>Sahihi</i></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- sehemu ndogo --------------------------- */

function BehaviorCells({
  label,
  value,
  onPick,
}: {
  label: string;
  value: number;
  onPick: (r: number) => void;
}) {
  return (
    <>
      <td>{label}</td>
      {RATINGS.map((r, i) => (
        <td
          key={r}
          className="rp-c rp-pick"
          role="button"
          tabIndex={0}
          aria-label={`${label}: ${r}`}
          aria-pressed={value === i}
          onClick={() => onPick(i)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(i)}
        >
          {value === i ? "✓" : ""}
        </td>
      ))}
    </>
  );
}

/* ----------------------------- CSS -------------------------------- */

const CSS = `
.rp-wrap{--ink:#1a1a1a;--navy:#0b2a5b;--gold:#b8860b;--line:#9aa5b8;--soft:#eef2f9;
 background:#cfd6e2;color:var(--ink);color-scheme:light;font-family:Georgia,"Times New Roman",serif;font-size:11px;line-height:1.25}
.rp-wrap *{box-sizing:border-box}
.rp-bar{text-align:center;padding:8px}
.rp-bar button{background:var(--navy);color:#fff;border:0;padding:8px 16px;border-radius:6px;font-size:14px;cursor:pointer;margin:0 4px}
.rp-bar .rp-ghost{background:#fff;color:var(--navy);border:1px solid var(--navy)}
.rp-bar small{display:block;margin-top:4px;color:#333;font-family:Arial,sans-serif}
.rp-scroll{overflow-x:auto;padding:0 8px 16px}
.rp-page{width:210mm;margin:0 auto;background:#fff;padding:3mm 9mm;border:3px double var(--navy)}
.rp-in{font:inherit;color:inherit;background:transparent;border:0;outline:0;width:100%;padding:0;margin:0}
.rp-in:focus{outline:2px solid var(--gold);background:#fffbe6}
.rp-inl{display:inline-block;border-bottom:1px dotted #777;vertical-align:baseline}
.rp-c{text-align:center}
.rp-b{font-weight:bold}
.rp-hd{display:flex;align-items:center;gap:8px;border-bottom:3px solid var(--navy);padding-bottom:4px}
.rp-mid{flex:1;text-align:center}
.rp-s1{font-size:10px;letter-spacing:.4px;text-align:center}
.rp-h1{margin:1px 0;font-size:17px;font-weight:bold;color:var(--navy);letter-spacing:1px;text-align:center}
.rp-logo{width:62px;height:62px;flex:none;border:1.5px dashed var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;font:9px Arial;color:#777;cursor:pointer;overflow:hidden;text-align:center}
.rp-logo img{width:100%;height:100%;object-fit:contain}
.rp-title{background:var(--navy);color:#fff;text-align:center;font-weight:bold;letter-spacing:2px;padding:3px;margin:5px 0;font-size:13px}
.rp-wrap h3{margin:6px 0 3px;font-size:11px;color:var(--navy);border-left:5px solid var(--gold);padding-left:6px;text-transform:uppercase;letter-spacing:.5px}
.rp-wrap table{width:100%;border-collapse:collapse}
.rp-wrap td,.rp-wrap th{border:1px solid var(--line);padding:2px 4px;vertical-align:middle}
.rp-wrap th{background:var(--soft);color:var(--navy);font-size:10px}
.rp-th{font-weight:bold;font-size:10px;color:var(--navy)}
.rp-info td{border:0;border-bottom:1px dotted #777;padding:2px 3px}
.rp-info b{color:var(--navy)}
.rp-pick{cursor:pointer;width:5%}
.rp-pick:focus-visible{outline:2px solid var(--gold)}
.rp-sum td{text-align:center;background:var(--soft);padding:3px}
.rp-sum b{display:block;font-size:14px;color:var(--navy)}
.rp-sum span{font-size:9px;text-transform:uppercase}
.rp-big{font-size:14px;font-weight:bold;color:var(--navy)}
.rp-key{font-size:9.5px;margin-top:2px;color:#333}
.rp-cm{border:1px solid var(--line);padding:3px 6px;margin-bottom:4px;break-inside:avoid}
.rp-t{font-weight:bold;color:var(--navy);font-size:10px;text-transform:uppercase}
.rp-ta{display:block;resize:none;font-style:italic;min-height:20px;margin:1px 0 2px;line-height:1.3}
.rp-sg{display:flex;gap:22px;font-size:10px;align-items:flex-end;margin:6px 0 17px}
.rp-sg>div{flex:1;border-bottom:1px solid #000;padding-top:14px;position:relative;min-height:26px}
.rp-sg>div i{position:absolute;bottom:-15px;left:0;font-size:9px;color:#555;font-style:normal;white-space:nowrap}
.rp-sg .rp-dt{flex:none;width:80px}
.rp-sg .rp-stamp{flex:none;width:100px;height:56px;border:1.5px dashed var(--line);font:9px Arial;color:#888;display:flex;align-items:center;justify-content:center;padding:0}
.rp-next{display:flex;gap:6px;margin-top:3px;font-size:10px}
.rp-next>div{flex:1;border:1px solid var(--line);padding:2px 5px}
.rp-cut{border-top:2px dashed #555;margin:8px 0 2px;text-align:center;font-size:9.5px;height:0}
.rp-cut span{position:relative;top:-7px;background:#fff;padding:0 8px;font-family:Arial}
.rp-parent{border:2px solid var(--navy);padding:4px 8px;break-inside:avoid}
.rp-parent-ta{border-bottom:1px dotted #777;min-height:34px;margin:2px 0 4px;font-style:normal}
@media print{
 @page{size:A4;margin:4mm}
 .rp-wrap{background:#fff}
 .rp-bar{display:none}
 .rp-scroll{padding:0;overflow:visible}
 .rp-page{margin:0;width:auto}
 .rp-logo{border-color:transparent}.rp-logo.empty{color:transparent}
 .rp-sg .rp-stamp{border-color:transparent;color:transparent}
 .rp-in:focus{outline:0;background:none}
 .rp-wrap *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;
