"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { fetchSchoolInfo } from "@/lib/school-api";
import { loadCertificateSignature, saveCertificateSignature, type CertificateSigner } from "@/lib/certificate-signatures";
import type { StreamTeacherScope } from "@/lib/stream-teacher-api";
import SignaturePad from "@/components/signature-pad";
import "./award-certificates.css";

/* ---------- Data ---------- */

type Cat = { c: string; d: string; t: string };

const CATS: Record<string, Cat> = {
  "Excellence in Discipline": { c: "#8c1d2c", d: "#5e0f1b", t: "In recognition of exemplary discipline, respect for teachers and peers, and for being a role model to the whole school community." },
  "Sports Excellence": { c: "#d2570f", d: "#8f3503", t: "In recognition of an outstanding contribution to sports and for proudly representing the school in competitions." },
  "Cleanliness & Environment": { c: "#0f7a6e", d: "#09463f", t: "In recognition of exceptional care for personal hygiene, the school environment and property, and for inspiring others to do the same." },
  "Dedication & Hard Work": { c: "#6d3fc0", d: "#42217f", t: "In recognition of remarkable hard work, perseverance and self-motivation in studies and all school activities throughout his/her time with us." },
  "Service & Teamwork": { c: "#1f7a3a", d: "#0f4a21", t: "In recognition of faithful, selfless service to the school, marked by teamwork and responsibility without being asked." },
  "Outstanding Leadership": { c: "#1d4ed8", d: "#112f86", t: "In recognition of leading fellow students with wisdom, integrity and a strong sense of responsibility as a school leader." },
  "Academic Excellence": { c: "#14295c", d: "#0a1636", t: "In recognition of outstanding academic performance throughout Form One to Form Four." },
  "Certificate of Appreciation": { c: "#b0225f", d: "#701238", t: "In sincere appreciation of a valuable contribution and genuine love for our school throughout his/her studies." },
};
const CAT_NAMES = Object.keys(CATS);

type Vals = {
  gov: string;
  dist: string;
  addr: string;
  school: string;
  year: string;
  sig1: string;
  sig2: string;
  sig1Img: string;
  sig2Img: string;
  cite: string;
  logoL: string;
  logoR: string;
};

const GOLD = "url(#gold)";

const DEFS_HTML =
  '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1d98a"/><stop offset=".5" stop-color="#c9a227"/><stop offset="1" stop-color="#8a6410"/></linearGradient></defs></svg>';

const PRINT_CSS = `
@page{size:A4 landscape;margin:0}
html,body{margin:0;padding:0;background:#fff}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.vz.print{background:#fff;min-height:0;padding:0}
.vz .sheet{padding:0;gap:0;display:block}
.vz .holder{width:297mm!important;height:210mm!important;box-shadow:none;break-after:page;page-break-after:always}
.vz .holder:last-child{break-after:auto;page-break-after:auto}
.vz .cert{transform:none!important}
.vz .ph{visibility:hidden}
`;

/* ---------- Helpers ---------- */

function star(cx: number, cy: number, n: number, R: number, r: number): string {
  const a: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R;
    const an = (Math.PI * i) / n - Math.PI / 2;
    a.push((cx + rad * Math.cos(an)).toFixed(2) + "," + (cy + rad * Math.sin(an)).toFixed(2));
  }
  return a.join(" ");
}

function fitOne(el: HTMLElement) {
  el.style.fontSize = "";
  let fs = 30;
  while (el.scrollWidth > el.clientWidth + 1 && fs > 16) {
    fs -= 1;
    el.style.fontSize = fs + "pt";
  }
}

function streamCategory(name: string): string {
  const value = name.trim().toLowerCase();
  if (value.includes("vocational") || value.includes("technical")) return "VOCATIONAL";
  if (value.includes("general")) return "GENERAL";
  return name.trim().toUpperCase();
}

/* ---------- Certificate pieces ---------- */

function Bracket() {
  return (
    <g stroke={GOLD} fill="none" strokeWidth="1.1">
      <path d="M16 40V16h24" />
      <circle cx="16" cy="16" r="1.8" fill={GOLD} />
      <path d="M21 33V21h12" strokeWidth=".5" />
    </g>
  );
}

function Swoosh() {
  return (
    <>
      <polygon points="0,0 66,0 0,43" fill={GOLD} />
      <polygon points="0,0 63,0 0,41" fill="#0f1c3f" />
      <polygon points="0,0 50,0 0,33" fill="var(--ac)" />
      <polygon points="0,0 36,0 0,24" fill="var(--ad)" opacity=".55" />
    </>
  );
}

function Decor() {
  return (
    <svg className="decor" viewBox="0 0 297 210" preserveAspectRatio="none">
      <g fill="none" style={{ stroke: "var(--ac)" }} opacity=".07" strokeWidth=".7">
        {[30, 42, 54, 66, 78, 90].map((r) => (
          <circle key={r} cx="148.5" cy="108" r={r} />
        ))}
      </g>
      <rect x="9" y="9" width="279" height="192" fill="none" stroke="#0f1c3f" strokeWidth="1.7" />
      <rect x="11.2" y="11.2" width="274.6" height="187.6" stroke={GOLD} fill="none" strokeWidth=".6" />
      <rect x="13.5" y="13.5" width="270" height="183" stroke={GOLD} fill="none" strokeWidth="1.1" strokeDasharray="0.1 2.1" strokeLinecap="round" />
      <rect x="16" y="16" width="265" height="178" stroke={GOLD} fill="none" strokeWidth=".35" />
      <g transform="translate(297 0) scale(-1 1)">
        <Bracket />
      </g>
      <g transform="translate(0 210) scale(1 -1)">
        <Bracket />
      </g>
      <Swoosh />
      <g transform="rotate(180 148.5 105)">
        <Swoosh />
      </g>
    </svg>
  );
}

function Rosette({ year }: { year: string }) {
  return (
    <svg className="ros" viewBox="0 0 60 76">
      <polygon points="20,40 13,74 24,68 30,76 35,44" fill="var(--ac)" />
      <polygon points="40,40 47,74 36,68 30,76 25,44" fill="var(--ad)" />
      <polygon points={star(30, 30, 22, 28, 24.5)} fill={GOLD} />
      <circle cx="30" cy="30" r="20" fill="#0f1c3f" stroke="#f1d98a" strokeWidth=".8" />
      <polygon points={star(30, 22, 5, 5, 2.1)} fill={GOLD} />
      <text x="30" y="36" textAnchor="middle" fontFamily="Cinzel,Georgia,serif" fontWeight="700" fontSize="7.5" fill="#f1d98a">
        {year}
      </text>
    </svg>
  );
}

function Logo({ side, src, label }: { side: "l" | "r"; src: string; label: ReactNode }) {
  return (
    <div className={"lg " + side}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <span className="ph">{label}</span>
      )}
    </div>
  );
}

function Certificate({ name, cat, v }: { name: string; cat: string; v: Vals }) {
  const c = CATS[cat];
  const ce = { contentEditable: true, suppressContentEditableWarning: true } as const;
  return (
    <div className="holder">
      <section className="cert" style={{ "--ac": c.c, "--ad": c.d } as CSSProperties}>
        <Decor />
        <div className="inner">
          <Logo side="l" src={v.logoL} label={<>UMOJA<br />LOGO</>} />
          <Logo side="r" src={v.logoR} label={<>SCHOOL<br />LOGO</>} />
          <div className="gov" {...ce}>{v.gov}</div>
          <div className="dist" {...ce}>{v.dist}</div>
          <div className="addr" {...ce}>{v.addr}</div>
          <div className="school" {...ce}>{v.school}</div>
          <div className="kicker">
            <i></i>CERTIFICATE OF AWARD<i></i>
          </div>
          <div className="ribbon" {...ce}>{cat}</div>
          <p className="pre">Presented to</p>
          <div className="name" {...ce}>{name}</div>
          <p className="cite" {...ce}>{v.cite}</p>
          <div className="foot">
            <div className="sig">
              {v.sig1Img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sig-img" src={v.sig1Img} alt="" />
              ) : null}
              <div {...ce}>{v.sig1}</div>
              <small>Signature &amp; Stamp</small>
            </div>
            <Rosette year={v.year} />
            <div className="sig">
              {v.sig2Img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sig-img" src={v.sig2Img} alt="" />
              ) : null}
              <div {...ce}>{v.sig2}</div>
              <small>Date: ____ / ____ / {v.year}</small>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Page ---------- */

interface Props {
  scope?: StreamTeacherScope | null;
}

export default function AwardCertificates({ scope = null }: Props = {}) {
  const [cat, setCat] = useState<string>(CAT_NAMES[0]);
  const [gov, setGov] = useState("United Republic of Tanzania");
  const [dist, setDist] = useState("Iramba District Council");
  const [addr, setAddr] = useState("P.O. Box ____, Singida");
  const [school, setSchool] = useState("Amali Kitukutu Technical School");
  const [year, setYear] = useState(scope?.year ?? String(new Date().getFullYear()));
  const [sig1, setSig1] = useState("Head of School");
  const [sig2, setSig2] = useState("Academic Master");
  const [sig1Img, setSig1Img] = useState(() => loadCertificateSignature("head"));
  const [sig2Img, setSig2Img] = useState(() => loadCertificateSignature("academic"));
  const [signPad, setSignPad] = useState<CertificateSigner | null>(null);
  const [names, setNames] = useState("");
  const [cite, setCite] = useState(CATS[CAT_NAMES[0]].t);
  const [logoL, setLogoL] = useState("");
  const [logoR, setLogoR] = useState("");
  const [scale, setScale] = useState(1);

  const sheetRef = useRef<HTMLDivElement>(null);

  const list = names.split("\n").map((n) => n.trim()).filter(Boolean);
  const people = list.length ? list : [""];
  const v: Vals = { gov, dist, addr, school, year, sig1, sig2, sig1Img, sig2Img, cite, logoL, logoR };

  const sheetKey = [cat, gov, dist, addr, school, year, sig1, sig2, sig1Img.length, sig2Img.length, cite, names, logoL.length, logoL.slice(-24), logoR.length, logoR.slice(-24)].join("\u0001");

  function fitNames() {
    sheetRef.current?.querySelectorAll<HTMLElement>(".name").forEach(fitOne);
  }

  useEffect(() => {
    fitNames();
  }, [sheetKey]);

  useEffect(() => {
    const onFonts = () => fitNames();
    document.fonts?.addEventListener?.("loadingdone", onFonts);
    return () => document.fonts?.removeEventListener?.("loadingdone", onFonts);
  }, []);

  useEffect(() => {
    fetchSchoolInfo()
      .then((info) => {
        if (info.name) setSchool(info.name);
        if (info.council || info.district) setDist(info.council || info.district);
        if (info.address) setAddr(info.address);
        if (info.unionLogo) setLogoL(info.unionLogo);
        if (info.schoolLogo) setLogoR(info.schoolLogo);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, (el.clientWidth - 32) / (297 * 3.7795)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function updateSignature(signer: CertificateSigner, value: string) {
    if (signer === "head") setSig1Img(value);
    else setSig2Img(value);
    saveCertificateSignature(signer, value);
  }

  async function saveCertificateSignatureData(signatureData: string) {
    if (!signPad) return;
    updateSignature(signPad, signatureData);
    setSignPad(null);
  }

  async function clearCertificateSignatureData() {
    if (!signPad) return;
    updateSignature(signPad, "");
    setSignPad(null);
  }

  function onCat(e: ChangeEvent<HTMLSelectElement>) {
    const k = e.target.value;
    setCat(k);
    setCite(CATS[k].t);
  }

  function onLogo(setter: (s: string) => void) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => setter(String(r.result));
      r.readAsDataURL(f);
    };
  }

  async function printSheet() {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const clone = sheet.cloneNode(true) as HTMLElement;
    clone.style.setProperty("--s", "1");
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => (n instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${n.href}">` : n.outerHTML))
      .join("");
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><base href="${document.baseURI}"><title>Certificates</title>${styles}<style>${PRINT_CSS}</style></head><body>${DEFS_HTML}<div class="vz print">${clone.outerHTML}</div></body></html>`
    );
    doc.close();
    const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
    await Promise.all(
      links.map(
        (l) =>
          new Promise<void>((res) => {
            if (l.sheet) return res();
            l.addEventListener("load", () => res());
            l.addEventListener("error", () => res());
          })
      )
    );
    try {
      await doc.fonts.ready;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
    try {
      await doc.fonts.ready;
    } catch {}
    win.addEventListener("afterprint", () => iframe.remove());
    win.focus();
    win.print();
  }

  return (
    <div className="vz">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f1d98a" />
            <stop offset=".5" stopColor="#c9a227" />
            <stop offset="1" stopColor="#8a6410" />
          </linearGradient>
        </defs>
      </svg>

      {scope ? (
        <div className="vz-scope">
          <div>
            <span className="vz-scope-title">Stream Teacher</span>
            <strong>{scope.className} — {scope.streamName} Stream</strong>
          </div>
          <span className="vz-scope-pill">{streamCategory(scope.streamName)}</span>
        </div>
      ) : null}

      <div className="ctrl">
        <label>
          Award category
          <select value={cat} onChange={onCat}>
            {CAT_NAMES.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Government
          <input value={gov} onChange={(e) => setGov(e.target.value)} />
        </label>
        <label>
          Council
          <input value={dist} onChange={(e) => setDist(e.target.value)} />
        </label>
        <label>
          School address
          <input value={addr} onChange={(e) => setAddr(e.target.value)} />
        </label>
        <label>
          School name
          <input value={school} onChange={(e) => setSchool(e.target.value)} />
        </label>
        <label>
          Year (shown on the seal and date)
          <input value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label>
          First signature
          <input value={sig1} onChange={(e) => setSig1(e.target.value)} />
        </label>
        <label>
          Second signature
          <input value={sig2} onChange={(e) => setSig2(e.target.value)} />
        </label>
        <div className="wide sig-controls">
          <span className="sig-controls-label">Sahihi za vyeti (huhifadhiwa kwenye kivinjari)</span>
          <div className="sig-control-row">
            <span>Mkuu wa Shule</span>
            {sig1Img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sig-control-thumb" src={sig1Img} alt="" />
            ) : (
              <span className="sig-control-empty">Hakuna sahihi bado</span>
            )}
            <button type="button" onClick={() => setSignPad("head")}>
              {sig1Img ? "Badilisha sahihi" : "Saini"}
            </button>
            {sig1Img ? (
              <button type="button" className="sig-clear" onClick={() => updateSignature("head", "")}>
                Futa
              </button>
            ) : null}
          </div>
          <div className="sig-control-row">
            <span>Mwalimu wa Taaluma</span>
            {sig2Img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sig-control-thumb" src={sig2Img} alt="" />
            ) : (
              <span className="sig-control-empty">Hakuna sahihi bado</span>
            )}
            <button type="button" onClick={() => setSignPad("academic")}>
              {sig2Img ? "Badilisha sahihi" : "Saini"}
            </button>
            {sig2Img ? (
              <button type="button" className="sig-clear" onClick={() => updateSignature("academic", "")}>
                Futa
              </button>
            ) : null}
          </div>
        </div>
        <label>
          Left logo (Union)
          <input type="file" accept="image/*" onChange={onLogo(setLogoL)} />
        </label>
        <label>
          Right logo (School)
          <input type="file" accept="image/*" onChange={onLogo(setLogoR)} />
        </label>
        <label className="wide">
          Student names (one name per line — each name gets its own certificate)
          <textarea
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder={"Example:\nAmina Juma Mrisho\nBaraka Daudi Mwakyusa"}
          />
        </label>
        <label className="wide">
          Certificate citation (changes with the category; you can edit it)
          <textarea value={cite} onChange={(e) => setCite(e.target.value)} style={{ minHeight: 60 }} />
        </label>
        <div className="wide" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={printSheet}>Print / Save PDF</button>
          <p className="hint">In the print dialog choose A4, Landscape, Margins: None, and turn on “Background graphics”.</p>
        </div>
      </div>

      <div
        className="sheet"
        ref={sheetRef}
        style={{ "--s": scale } as CSSProperties}
        onInput={(e) => {
          const t = e.target as HTMLElement;
          if (t.classList?.contains("name")) fitOne(t);
        }}
      >
        <Fragment key={sheetKey}>
          {people.map((n, i) => (
            <Certificate key={i} name={n} cat={cat} v={v} />
          ))}
        </Fragment>
      </div>

      <SignaturePad
        open={signPad !== null}
        title={signPad === "head" ? "Saini cheti cha tuzo — Mkuu wa Shule" : "Saini cheti cha tuzo — Mwalimu wa Taaluma"}
        note="Sahihi hii itaonekana kwenye vyeti vyote vya tuzo na cheti cha mwanafunzi bora kwenye kivinjari hiki."
        roleLabel={signPad === "head" ? "Mkuu wa Shule" : "Mwalimu wa Taaluma"}
        scopeLabel={school}
        canClear={Boolean(signPad === "head" ? sig1Img : sig2Img)}
        onClose={() => setSignPad(null)}
        onSave={saveCertificateSignatureData}
        onClear={clearCertificateSignatureData}
      />
    </div>
  );
}
