"use client";

import { useMemo, useState } from "react";
import { fetchStudentNoteFileUrl, type StudentTopicViewItem } from "@/lib/student-portal-api";
import StudentNoticeDialog from "@/components/student-notice-dialog";
import NoteContent from "@/components/note-content";

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ViewerState =
  | { kind: "pdf"; url: string; title: string }
  | { kind: "text"; contentHtml: string; title: string }
  | { kind: "image"; url: string; title: string }
  | null;

export default function StudentNotesTab({ topics }: { topics: StudentTopicViewItem[] }) {
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState<ViewerState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Stable per-subject numbering: Topic 1, Topic 2, … from the full list, so
  // searching never renumbers the topics.
  const topicNumbers = useMemo(() => {
    const bySubject = new Map<string, StudentTopicViewItem[]>();
    for (const t of topics) {
      const key = t.subjectName || "Subject";
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key)!.push(t);
    }
    const numbers = new Map<string, number>();
    for (const list of bySubject.values()) {
      list.forEach((t, index) => numbers.set(t.id, index + 1));
    }
    return numbers;
  }, [topics]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, StudentTopicViewItem[]>();
    for (const t of topics) {
      const hay = `${t.subjectName} ${t.subjectCode} ${t.title} ${t.subtopics
        .map(
          (s) =>
            `${s.title} ${s.note?.title || ""} ${s.images
              .map((img) => `${img.caption || ""} ${img.fileName}`)
              .join(" ")}`,
        )
        .join(" ")}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const key = t.subjectName || "Subject";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [topics, query]);

  async function openNote(id: string, title: string, download = false) {
    setError("");
    setLoadingId(id + (download ? "-d" : "-o"));
    try {
      const res = await fetchStudentNoteFileUrl(id, download);
      if (res.kind === "text" || (!res.url && res.contentHtml)) {
        setViewer({ kind: "text", contentHtml: res.contentHtml || "", title: res.title || title });
      } else if (download) {
        if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        if (res.url) setViewer({ kind: "pdf", url: res.url, title: res.title || title });
      }
    } catch (e: any) {
      setError(e?.message || "Could not open note.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="sp-stack">
      <div className="sp-section-head">
        <div>
          <h1 className="sp-page-title">Study Notes</h1>
          <p className="sp-muted">Select a subject, then open a topic to view its subtopics, notes and diagrams.</p>
        </div>
      </div>

      {error && (
        <StudentNoticeDialog
          open
          tone="error"
          title="Could not open note"
          message={error}
          onClose={() => setError("")}
        />
      )}

      <div className="sp-card" style={{ paddingBottom: 12 }}>
        <input
          className="ta-input"
          style={{ width: "100%" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search subject, topic, note or diagram..."
        />
      </div>

      {groups.length === 0 ? (
        <div className="sp-card"><p className="sp-muted">No study notes available yet.</p></div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {groups.map(([subject, list]) => (
            <details key={subject} className="sp-card" style={{ padding: 0, overflow: "hidden" }}>
              <summary style={{ cursor: "pointer", listStyle: "none", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontWeight: 700, background: "#fff" }}>
                <span>{subject}</span>
                <span className="sp-muted" style={{ fontWeight: 500, fontSize: 13 }}>{list.length} topic{list.length === 1 ? "" : "s"}</span>
              </summary>
              <div style={{ padding: "0 16px 16px", display: "grid", gap: 10, background: "#fff", borderTop: "1px solid #e5e7eb" }}>
                {list.map((t) => (
                  <details key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#f8fafc", overflow: "hidden" }}>
                    <summary style={{ cursor: "pointer", listStyle: "none", padding: "12px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "1 1 220px", minWidth: 0 }}>
                        <span style={{ background: "#eef2ff", color: "#3730a3", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                          Topic {topicNumbers.get(t.id) ?? 1}
                        </span>
                        <span style={{ fontWeight: 600 }}>{t.title}</span>
                      </span>
                      <span className="sp-muted" style={{ fontSize: 12 }}>{t.className} {t.streamName} · {t.teacherName} · {t.subtopics.length} subtopic{t.subtopics.length === 1 ? "" : "s"}</span>
                    </summary>
                    <div style={{ padding: "0 14px 14px", display: "grid", gap: 10 }}>
                      {t.subtopics.map((s) => (
                        <div key={s.id} style={{ padding: "10px 12px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.position}. {s.title}</div>
                          {s.note ? (
                            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                                <div style={{ fontWeight: 500 }}>{s.note.title}</div>
                                <div className="sp-muted" style={{ fontSize: 12 }}>
                                  {s.note.kind === "text" || (!s.note.fileName && s.note.contentHtml)
                                    ? "Text note"
                                    : `PDF ${fmtBytes(s.note.fileSize)}${s.note.fileName ? ` · ${s.note.fileName}` : ""}`}
                                  {s.images.length > 0 ? ` · ${s.images.length} diagram${s.images.length === 1 ? "" : "s"}` : ""}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button type="button" className="sp-btn sp-btn--primary" disabled={loadingId === s.note.id + "-o"} onClick={() => openNote(s.note!.id, s.note!.title, false)}>
                                  {loadingId === s.note!.id + "-o" ? "Opening…" : "Read"}
                                </button>
                                {(s.note.kind === "text" || (!s.note.fileName && s.note.contentHtml)) ? null : (
                                  <button type="button" className="sp-btn sp-btn--ghost" disabled={loadingId === s.note!.id + "-d"} onClick={() => openNote(s.note!.id, s.note!.title, true)}>
                                    {loadingId === s.note!.id + "-d" ? "…" : "Download"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="sp-muted">No note available.</div>
                          )}

                          {s.images.length > 0 && (
                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
                              <div className="sp-muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                                Michoro / Diagrams ({s.images.length})
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                                {s.images.map((img) => (
                                  <figure key={img.id} style={{ margin: 0, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                                    <button
                                      type="button"
                                      disabled={!img.url}
                                      onClick={() => {
                                        if (img.url) setViewer({ kind: "image", url: img.url, title: img.caption || img.fileName || "Diagram" });
                                      }}
                                      style={{ display: "block", width: "100%", border: 0, padding: 0, background: "#f1f5f9", cursor: img.url ? "zoom-in" : "default" }}
                                    >
                                      {img.url ? (
                                        <img
                                          src={img.url}
                                          alt={img.caption || img.fileName || "Diagram"}
                                          style={{ display: "block", width: "100%", height: 110, objectFit: "cover" }}
                                        />
                                      ) : (
                                        <span className="sp-muted" style={{ display: "grid", placeItems: "center", height: 110, fontSize: 12 }}>No preview</span>
                                      )}
                                    </button>
                                    <figcaption style={{ padding: "6px 8px", fontSize: 12, color: "#475569", lineHeight: 1.4 }}>
                                      {img.caption || img.fileName}
                                    </figcaption>
                                  </figure>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {viewer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setViewer(null)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(1000px, 96vw)", height: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewer.title}</strong>
              <button type="button" className="sp-btn sp-btn--ghost" onClick={() => setViewer(null)}>Close</button>
            </div>
            {viewer.kind === "pdf" ? (
              <iframe src={viewer.url} title={viewer.title} style={{ flex: 1, width: "100%", border: "none" }} />
            ) : viewer.kind === "image" ? (
              <div style={{ flex: 1, overflow: "auto", display: "grid", placeItems: "center", padding: 16, background: "#0f172a" }}>
                <img src={viewer.url} alt={viewer.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "#fff", borderRadius: 8 }} />
              </div>
            ) : (
              <div style={{ flex: 1, overflow: "auto", padding: 16 }} className="sp-note-content">
                <NoteContent html={viewer.contentHtml} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
