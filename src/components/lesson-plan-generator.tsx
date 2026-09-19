"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  deleteLessonPlan,
  fetchAllLessonPlans,
  fetchLearningActivities,
  fetchMainCompetences,
  fetchMyLessonPlans,
  fetchSpecificCompetences,
  fetchTeacherScope,
  updateLessonPlan,
  type DbLearningActivity,
  type DbMainCompetence,
  type DbSpecificCompetence,
  type LessonPlanRow,
  type LessonPlanStatus,
  type TeacherScope,
} from "@/lib/lesson-plan-api";
import type { LessonPlanContent, LessonStage } from "@/lib/lesson-plan-server";
import { fetchSchoolInfo, fetchTeacherByAuth } from "@/lib/school-api";
import { ListRowSkeleton, Spinner } from "@/components/loading";

type PageRole = "Teacher" | "Headmaster" | "Academic";

interface StageValues {
  time_minutes: string;
  teaching_activities: string;
  learning_activities: string;
  assessment_criteria: string;
}

const STAGES = ["Introduction", "Competence Development", "Design", "Realisation"] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyContent(): LessonPlanContent {
  return {
    main_activity: "",
    specific_activity: "",
    teaching_learning_resources: "",
    references: "",
    stages: STAGES.map((stage) => ({
      stage,
      time_minutes: "",
      teaching_activities: "",
      learning_activities: "",
      assessment_criteria: "",
    })),
  };
}

interface PlanMeta {
  date: string;
  number_of_periods: number;
  time_minutes: number;
  registered_boys: number;
  registered_girls: number;
  present_boys: number;
  present_girls: number;
  class_stream: string;
  lesson_time: string;
  remarks: string;
  reference: string;
}

function emptyMeta(): PlanMeta {
  return {
    date: today(),
    number_of_periods: 1,
    time_minutes: 40,
    registered_boys: 0,
    registered_girls: 0,
    present_boys: 0,
    present_girls: 0,
    class_stream: "",
    lesson_time: "",
    remarks: "",
    reference: "",
  };
}

const editableStyle = (locked: boolean): CSSProperties =>
  locked
    ? { color: "inherit" }
    : { outline: "2px dashed #a78bfa", outlineOffset: "2px", borderRadius: "4px", cursor: "text" };

function EditableCell({
  value,
  locked,
  onChange,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  locked: boolean;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable={!locked}
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      className={`vp-editable ${className ?? ""} ${locked ? "vp-locked" : "vp-unlocked"}`}
      style={editableStyle(locked)}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ").trim();
        if (next !== value) onChange(next);
      }}
    />
  );
}

function EditableNumber({
  value,
  locked,
  onChange,
  className,
  ariaLabel,
}: {
  value: number;
  locked: boolean;
  onChange: (value: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <EditableCell
      value={String(value)}
      locked={locked}
      ariaLabel={ariaLabel}
      className={className}
      onChange={(s) => {
        const n = Math.round(Number(s.replace(/[^0-9-]/g, "")));
        onChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
    />
  );
}

export default function LessonPlanPage({ authUserId, role }: { authUserId: string; role: PageRole }) {
  const isTeacher = role === "Teacher";
  const [scope, setScope] = useState<TeacherScope | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  // create form
  const [subjectId, setSubjectId] = useState("");
  const [formId, setFormId] = useState("");
  const [mains, setMains] = useState<DbMainCompetence[]>([]);
  const [mainId, setMainId] = useState("");
  const [specifics, setSpecifics] = useState<DbSpecificCompetence[]>([]);
  const [specificId, setSpecificId] = useState("");
  const [activities, setActivities] = useState<DbLearningActivity[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [periods, setPeriods] = useState(1);
  const [timeMin, setTimeMin] = useState(40);
  const [date, setDate] = useState(today);
  const [regBoys, setRegBoys] = useState(0);
  const [regGirls, setRegGirls] = useState(0);
  const [presBoys, setPresBoys] = useState(0);
  const [presGirls, setPresGirls] = useState(0);
  const [classStream, setClassStream] = useState("A");
  const [lessonTime, setLessonTime] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reference, setReference] = useState("");
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState("");

  // plans
  const [plans, setPlans] = useState<LessonPlanRow[]>([]);
  const [openPlan, setOpenPlan] = useState<LessonPlanRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // edited content + meta
  const [content, setContent] = useState<LessonPlanContent>(emptyContent);
  const [meta, setMeta] = useState<PlanMeta>(emptyMeta);

  const timersRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadPlans = useCallback(
    async (teacherId: string) => {
      try {
        const rows = isTeacher ? await fetchMyLessonPlans(teacherId) : await fetchAllLessonPlans();
        setPlans(rows);
        setOpenPlan((current) => (current ? rows.find((r) => r.id === current.id) ?? null : null));
      } catch {
        // keep existing list
      }
    },
    [isTeacher],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [school, teacher] = await Promise.all([fetchSchoolInfo(), fetchTeacherByAuth(authUserId)]);
        if (!cancelled) {
          setSchoolName(school.name);
          const name =
            [teacher?.first_name, teacher?.middle_name, teacher?.last_name].filter(Boolean).join(" ") ||
            teacher?.name ||
            "";
          setTeacherName(name);
        }
      } catch {
        // school info optional
      }

      try {
        if (isTeacher) {
          const sc = await fetchTeacherScope(authUserId);
          if (!cancelled) setScope(sc);
        }
      } catch {
        if (!cancelled) {
          setDbError(true);
          setScope({ subjects: [], forms: [] });
        }
      }

      try {
        await reloadPlans(authUserId);
      } catch {
        // list is optional; nothing to surface yet
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (timersRef.current) clearTimeout(timersRef.current);
    };
  }, [authUserId, isTeacher, reloadPlans]);

  // ---- cascading loads ----
  async function loadMains(subject: string, form: string) {
    setMainId("");
    setSpecificId("");
    setSelectedActivityIds([]);
    setActivities([]);
    setSpecifics([]);
    if (!subject || !form) {
      setMains([]);
      return;
    }
    try {
      setMains(await fetchMainCompetences(subject, form));
    } catch {
      setMains([]);
    }
  }

  async function loadSpecifics(main: string) {
    setSpecificId("");
    setSelectedActivityIds([]);
    setActivities([]);
    if (!main) {
      setSpecifics([]);
      return;
    }
    try {
      setSpecifics(await fetchSpecificCompetences(main));
    } catch {
      setSpecifics([]);
    }
  }

  async function loadActivities(specific: string) {
    setSelectedActivityIds([]);
    if (!specific) {
      setActivities([]);
      return;
    }
    try {
      setActivities(await fetchLearningActivities(specific));
    } catch {
      setActivities([]);
    }
  }

  function pickSubject(value: string) {
    setSubjectId(value);
    void loadMains(value, formId);
  }

  function pickForm(value: string) {
    setFormId(value);
    void loadMains(subjectId, value);
  }

  function toggleActivity(id: string) {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const validToGenerate =
    Boolean(subjectId && formId && mainId && specificId) &&
    selectedActivityIds.length > 0 &&
    periods > 0 &&
    timeMin > 0;

  async function generate() {
    setFormError("");
    if (!validToGenerate) {
      setFormError("Complete Subject, Form, Main Competence, Specific Competence and select at least one learning activity.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/lesson-plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subjectId,
          form_id: formId,
          specific_competence_id: specificId,
          learning_activity_ids: selectedActivityIds,
          number_of_periods: periods,
          time_minutes: timeMin,
          date: date || null,
          registered_boys: regBoys,
          registered_girls: regGirls,
          present_boys: presBoys,
          present_girls: presGirls,
          class_stream: classStream || null,
          lesson_time: lessonTime || null,
          remarks: remarks || null,
          reference: reference || null,
        }),
      });
      const body = (await res.json()) as { error?: string; plan?: LessonPlanRow };
      if (!res.ok || !body.plan) {
        setFormError(body.error ?? "Could not generate the lesson plan. Try again.");
        return;
      }
      const created = body.plan;
      openPlanEditor(created);
      await reloadPlans(authUserId);
      setMessage("Lesson plan generated as a draft.");
    } catch {
      setFormError("Network error while generating the lesson plan.");
    } finally {
      setGenerating(false);
    }
  }

  function openPlanEditor(plan: LessonPlanRow) {
    setOpenPlan(plan);
    setEditing(false);
    setContent(plan.content ?? emptyContent());
    setMeta({
      date: plan.date ?? today(),
      number_of_periods: plan.number_of_periods || 1,
      time_minutes: plan.time_minutes || 40,
      registered_boys: plan.registered_boys || 0,
      registered_girls: plan.registered_girls || 0,
      present_boys: plan.present_boys || 0,
      present_girls: plan.present_girls || 0,
      class_stream: plan.class_stream ?? "",
      lesson_time: plan.lesson_time ?? "",
      remarks: plan.remarks ?? "",
      reference: plan.reference ?? "",
    });
  }

  function setStageField(stage: string, field: keyof StageValues, value: string) {
    setContent((current) => ({
      ...current,
      stages: current.stages.map((s) => (s.stage === stage ? { ...s, [field]: value } : s)),
    }));
  }

  function updateMeta(key: keyof PlanMeta, value: string | number) {
    setMeta((current) => ({ ...current, [key]: value }));
  }

  async function save(saveStatus?: LessonPlanStatus) {
    if (!openPlan) return;
    setSaving(true);
    setMessage("");
    try {
      await updateLessonPlan(openPlan.id, {
        content,
        date: meta.date || null,
        number_of_periods: Math.max(1, Math.floor(Number(meta.number_of_periods))),
        time_minutes: Math.max(1, Math.floor(Number(meta.time_minutes))),
        registered_boys: Math.max(0, Math.floor(Number(meta.registered_boys))),
        registered_girls: Math.max(0, Math.floor(Number(meta.registered_girls))),
        present_boys: Math.max(0, Math.floor(Number(meta.present_boys))),
        present_girls: Math.max(0, Math.floor(Number(meta.present_girls))),
        class_stream: meta.class_stream || null,
        lesson_time: meta.lesson_time || null,
        remarks: meta.remarks || null,
        reference: meta.reference || null,
        ...(saveStatus ? { status: saveStatus } : {}),
      });
      setEditing(false);
      setMessage(saveStatus === "final" ? "Lesson plan marked as final." : "Lesson plan saved.");
      await reloadPlans(authUserId);
    } catch {
      setMessage("Could not save the lesson plan.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this lesson plan permanently?")) return;
    try {
      await deleteLessonPlan(id);
      if (openPlan?.id === id) setOpenPlan(null);
      await reloadPlans(authUserId);
    } catch {
      setMessage("Could not delete the lesson plan.");
    }
  }

  if (loading) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">Lesson Plans</h2>
            <p className="page-sub">Prepare and manage your lesson plans.</p>
          </div>
        </div>
        <div className="sm-table-wrap td-loading"><ListRowSkeleton cols={4} /><ListRowSkeleton cols={4} /></div>
      </>
    );
  }

  if (dbError) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">Lesson Plans</h2>
            <p className="page-sub">Prepare and manage your lesson plans.</p>
          </div>
        </div>
        <div className="db-empty">
          <h3>Could not load your teaching scope</h3>
          <p>Contact the headmaster to assign your subjects and forms.</p>
        </div>
      </>
    );
  }

  const locked = !editing;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Lesson Plans</h2>
          <p className="page-sub">
            {isTeacher ? "Generate lesson plans from the TIE syllabus data assigned to you." : "Monitor lesson plans prepared by teachers."}
          </p>
        </div>
        <div className="page-head-right">
          <span className="active-chip">● {isTeacher ? teacherName || "Teacher" : "Monitoring"}</span>
        </div>
      </div>

      {message && (
        <p className="lp-note" role="status">{message}</p>
      )}

      <div className="vp-grid">
        {isTeacher && (
          <div className="vp-col vp-col--form">
            <div className="lp-card lp-create">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Generate Lesson Plan</h3>
                  <p className="panel-sub">{schoolName || "School"} · {teacherName}</p>
                </div>
              </div>

              <div className="lp-grid lp-grid--1">
                <label className="st-field">
                  <span className="st-field-label">Subject</span>
                  <select className="st-input" value={subjectId} onChange={(e) => pickSubject(e.target.value)}>
                    <option value="">Select subject…</option>
                    {(scope?.subjects ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="st-field">
                  <span className="st-field-label">Form / Class</span>
                  <select className="st-input" value={formId} onChange={(e) => pickForm(e.target.value)}>
                    <option value="">Select class…</option>
                    {(scope?.forms ?? []).map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="lp-grid lp-grid--1 lp-grid--mt">
                <label className="st-field">
                  <span className="st-field-label">Main Competence</span>
                  <select className="st-input" value={mainId} onChange={(e) => { setMainId(e.target.value); void loadSpecifics(e.target.value); }} disabled={mains.length === 0}>
                    <option value="">{mains.length === 0 ? "Choose subject + class first…" : "Select main competence…"}</option>
                    {mains.map((m) => (
                      <option key={m.id} value={m.id}>{m.code} · {m.title}</option>
                    ))}
                  </select>
                </label>
                <label className="st-field">
                  <span className="st-field-label">Specific Competence</span>
                  <select className="st-input" value={specificId} onChange={(e) => { setSpecificId(e.target.value); void loadActivities(e.target.value); }} disabled={specifics.length === 0}>
                    <option value="">{specifics.length === 0 ? "Choose a main competence first…" : "Select specific competence…"}</option>
                    {specifics.map((s) => (
                      <option key={s.id} value={s.id}>{s.code} · {s.title}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="lp-grid lp-grid--1 lp-grid--mt">
                <label className="st-field">
                  <span className="st-field-label">Learning Activities (select one or more)</span>
                  <div className="lp-activity-list">
                    {activities.length === 0 ? (
                      <span className="st-hint">Choose a specific competence first…</span>
                    ) : (
                      activities.map((a) => (
                        <label className="st-subject" key={a.id}>
                          <input
                            type="checkbox"
                            checked={selectedActivityIds.includes(a.id)}
                            onChange={() => toggleActivity(a.id)}
                          />
                          <span className="st-subject-name">{a.activity_description}</span>
                          <span className="st-subject-code">{a.code}</span>
                          {a.periods_allocated != null && (
                            <span className="sm-badge sm-badge--theory">{a.periods_allocated} per.</span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </label>
              </div>

              <div className="lp-grid lp-grid--2 lp-grid--mt">
                <label className="st-field">
                  <span className="st-field-label">Number of Periods</span>
                  <input className="st-input" type="number" min={1} value={periods} onChange={(e) => setPeriods(Math.max(1, Number(e.target.value)))} />
                </label>
                <label className="st-field">
                  <span className="st-field-label">Time per Period (minutes)</span>
                  <input className="st-input" type="number" min={1} value={timeMin} onChange={(e) => setTimeMin(Math.max(1, Number(e.target.value)))} />
                </label>
                <label className="st-field">
                  <span className="st-field-label">Date</span>
                  <input className="st-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="st-field">
                  <span className="st-field-label">Class / Stream</span>
                  <input className="st-input" type="text" value={classStream} onChange={(e) => setClassStream(e.target.value)} placeholder="e.g. A" />
                </label>
                <label className="st-field">
                  <span className="st-field-label">Time of Lesson</span>
                  <input className="st-input" type="text" value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} placeholder="e.g. 07:00am - 07:40am" />
                </label>
                <label className="st-field">
                  <span className="st-field-label">Reference</span>
                  <input className="st-input" type="text" value={reference} onChange={(e) => setReference(e.target.value)} />
                </label>
                <label className="st-field st-field--full">
                  <span className="st-field-label">Remarks</span>
                  <textarea className="st-input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </label>
              </div>

              <div className="lp-grid lp-grid--4 lp-grid--mt">
                {[
                  { label: "Registered Boys", val: regBoys, set: setRegBoys },
                  { label: "Registered Girls", val: regGirls, set: setRegGirls },
                  { label: "Present Boys", val: presBoys, set: setPresBoys },
                  { label: "Present Girls", val: presGirls, set: setPresGirls },
                ].map((field) => (
                  <label className="st-field" key={field.label}>
                    <span className="st-field-label">{field.label}</span>
                    <input className="st-input" type="number" min={0} value={field.val} onChange={(e) => field.set(Math.max(0, Number(e.target.value)))} />
                  </label>
                ))}
              </div>

              {formError && <p className="error-message" role="alert" style={{ marginTop: "0.9rem" }}>{formError}</p>}

              <div className="lp-actions">
                <button className="cm-btn cm-btn--primary" onClick={generate} disabled={!validToGenerate || generating}>
                  {generating && <Spinner />}
                  {generating ? "Generating…" : "Generate Lesson Plan"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="vp-col vp-col--doc">
          {openPlan ? (
            <PlanDocument
              plan={openPlan}
              content={content}
              meta={meta}
              locked={locked}
              saving={saving}
              canEdit={isTeacher}
              schoolName={schoolName}
              teacherName={teacherName}
              setContent={setContent}
              updateMeta={updateMeta}
              setStageField={setStageField}
              onLock={() => setEditing(!editing)}
              onSave={() => save()}
              onFinalize={() => save("final")}
              onDelete={() => remove(openPlan.id)}
            />
          ) : (
            <div className="vp-placeholder">
              <div className="vp-placeholder-inner">
                <span className="vp-placeholder-icon">📘</span>
                <h3>{isTeacher ? "No lesson plan selected" : "Open a lesson plan"}</h3>
                <p>{isTeacher ? "Generate a new plan from the form, or open one from the list below to view and edit it." : "Pick a lesson plan from the list below to inspect it."}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="lp-card">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">{isTeacher ? "My Lesson Plans" : "All Lesson Plans"}</h3>
            <p className="panel-sub">Generated drafts and finalized plans.</p>
          </div>
          <span className="panel-badge">{plans.length} plan{plans.length === 1 ? "" : "s"}</span>
        </div>

        {plans.length === 0 ? (
          <p className="td-none">No lesson plans yet. {isTeacher ? "Use the form to create one." : ""}</p>
        ) : (
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Class</th>
                  <th>Competence</th>
                  <th>Date</th>
                  {!isTeacher && <th>Teacher</th>}
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td><span className="sm-name">{p.subject_name}</span></td>
                    <td>{p.form_name}{p.class_stream ? ` ${p.class_stream}` : ""}</td>
                    <td>
                      <div className="lp-comp">
                        <span className="sm-code">{p.specific_competence_code ?? ""}</span>
                        <span>{p.specific_competence_title ?? "—"}</span>
                      </div>
                    </td>
                    <td>{p.date ?? "—"}</td>
                    {!isTeacher && <td>{p.teacher_name}</td>}
                    <td>
                      <span className={`ex-status ex-status--${p.status}`}>{p.status}</span>
                    </td>
                    <td>
                      <div className="sm-actions">
                        <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => openPlanEditor(p)}>
                          {openPlan?.id === p.id ? "Editing" : "Open"}
                        </button>
                        <a
                          className="cm-btn cm-btn--ghost cm-btn--sm"
                          href={`/api/lesson-plans/${p.id}/export`}
                          title="Download as Word (.docx)"
                        >
                          .docx
                        </a>
                        {isTeacher && (
                          <button className="cm-icon-btn cm-icon-btn--danger cm-icon-btn--sm" onClick={() => remove(p.id)} aria-label="Delete" title="Delete">
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------
// The TIE Lesson Plan document (mirrors the .docx export)
// ---------------------------------------------------------------
function PlanDocument({
  plan,
  content,
  meta,
  locked,
  saving,
  canEdit,
  schoolName,
  teacherName,
  setContent,
  updateMeta,
  setStageField,
  onLock,
  onSave,
  onFinalize,
  onDelete,
}: {
  plan: LessonPlanRow;
  content: LessonPlanContent;
  meta: PlanMeta;
  locked: boolean;
  saving: boolean;
  canEdit: boolean;
  schoolName: string;
  teacherName: string;
  setContent: (value: LessonPlanContent) => void;
  updateMeta: (key: keyof PlanMeta, value: string | number) => void;
  setStageField: (stage: string, field: keyof StageValues, value: string) => void;
  onLock: () => void;
  onSave: () => void;
  onFinalize: () => void;
  onDelete: () => void;
}) {
  const cell = (value: string, onChange: (v: string) => void, extraClass = "", placeholder?: string) => (
    <EditableCell value={value} locked={locked || !canEdit} onChange={onChange} className={`vp-value ${extraClass}`} placeholder={placeholder} />
  );

  const numCell = (value: number, onChange: (v: number) => void, extraClass = "") => (
    <EditableNumber value={value} locked={locked || !canEdit} onChange={onChange} className={`vp-value vp-value--num ${extraClass}`} />
  );

  const regT = meta.registered_boys + meta.registered_girls;
  const presT = meta.present_boys + meta.present_girls;
  const absB = Math.max(0, meta.registered_boys - meta.present_boys);
  const absG = Math.max(0, meta.registered_girls - meta.present_girls);
  const absT = absB + absG;

  const timeLabel = `${meta.number_of_periods} period${meta.number_of_periods === 1 ? "" : "s"} × ${meta.time_minutes} minutes${meta.lesson_time ? ` · ${meta.lesson_time}` : ""}`;
  const classLabel = `${plan.form_name} ${meta.class_stream}`.trim();

  const mainCompValue =
    plan.main_competence_code && plan.main_competence_title
      ? `${plan.main_competence_code}. ${plan.main_competence_title}`
      : content.main_activity || "—";
  const specCompValue =
    plan.specific_competence_code && plan.specific_competence_title
      ? `${plan.specific_competence_code}. ${plan.specific_competence_title}`
      : "—";

  const stages: LessonStage[] =
    content.stages.length > 0
      ? content.stages
      : STAGES.map(
          (s): LessonStage => ({
            stage: s,
            time_minutes: "",
            teaching_activities: "",
            learning_activities: "",
            assessment_criteria: "",
          }),
        );

  return (
    <div className="lp-card vp-doc-card">
      <div className="vp-toolbar">
        <div className="vp-toolbar-left">
          <span className="vp-status">
            {locked ? "🔒 Locked" : "🔓 Editing"} · <span className={`ex-status ex-status--${plan.status}`}>{plan.status}</span>
          </span>
        </div>
        <div className="sm-actions">
          {canEdit && (
            <>
              {locked ? (
                <button className="cm-btn cm-btn--ghost" onClick={onLock}>Unlock to Edit</button>
              ) : (
                <button className="cm-btn cm-btn--ghost" onClick={onLock}>Lock Document</button>
              )}
              <button className="cm-btn cm-btn--primary" onClick={onSave} disabled={saving}>
                {saving && <Spinner />} {saving ? "Saving…" : "Save"}
              </button>
              {plan.status !== "final" && (
                <button className="cm-btn cm-btn--primary" onClick={onFinalize} disabled={saving}>
                  Mark as Final
                </button>
              )}
              <button className="cm-icon-btn cm-icon-btn--danger" onClick={onDelete} aria-label="Delete" title="Delete">✕</button>
            </>
          )}
          <button className="cm-btn cm-btn--ghost" onClick={() => window.print()}>Print</button>
          <a className="cm-btn cm-btn--primary" href={`/api/lesson-plans/${plan.id}/export`}>
            Download .docx
          </a>
        </div>
      </div>

      <div className="vp-document" id="plan-document">
        <div className="vp-masthead">
          <div className="vp-school">{schoolName || "SCHOOL NAME"}</div>
          <div className="vp-title">LESSON PLAN</div>
          <div className="vp-subtitle">(Tanzania Institute of Education — Lesson Plan Format)</div>
        </div>

        <table className="vp-table vp-info">
          <tbody>
            <tr>
              <td className="vp-label">School</td>
              <td className="vp-static">{schoolName || "—"}</td>
            </tr>
            <tr>
              <td className="vp-label">Teacher&apos;s Name</td>
              <td className="vp-static">{plan.teacher_name || teacherName || "—"}</td>
            </tr>
            <tr>
              <td className="vp-label">Date</td>
              <td>{cell(meta.date, (v) => updateMeta("date", v), "", "dd/mm/yyyy")}</td>
            </tr>
            <tr>
              <td className="vp-label">Subject</td>
              <td className="vp-static">{plan.subject_name || "—"}</td>
            </tr>
            <tr>
              <td className="vp-label">Class / Form</td>
              <td>{cell(classLabel, (v) => updateMeta("class_stream", v), "", "e.g. Form One A")}</td>
            </tr>
            <tr>
              <td className="vp-label">Time</td>
              <td>{cell(timeLabel, (v) => updateMeta("lesson_time", v), "", "e.g. 2 periods × 40 minutes")}</td>
            </tr>
          </tbody>
        </table>

        <div className="vp-section-title">STUDENT ATTENDANCE</div>
        <table className="vp-table vp-attendance">
          <thead>
            <tr>
              <td className="vp-label"> </td>
              <td className="vp-label vp-center">Girls</td>
              <td className="vp-label vp-center">Boys</td>
              <td className="vp-label vp-center">Total</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="vp-label">Registered</td>
              <td className="vp-center">{numCell(meta.registered_girls, (v) => updateMeta("registered_girls", v))}</td>
              <td className="vp-center">{numCell(meta.registered_boys, (v) => updateMeta("registered_boys", v))}</td>
              <td className="vp-static vp-center">{regT}</td>
            </tr>
            <tr>
              <td className="vp-label">Present</td>
              <td className="vp-center">{numCell(meta.present_girls, (v) => updateMeta("present_girls", v))}</td>
              <td className="vp-center">{numCell(meta.present_boys, (v) => updateMeta("present_boys", v))}</td>
              <td className="vp-static vp-center">{presT}</td>
            </tr>
            <tr>
              <td className="vp-label">Absent</td>
              <td className="vp-static vp-center">{absG}</td>
              <td className="vp-static vp-center">{absB}</td>
              <td className="vp-static vp-center">{absT}</td>
            </tr>
          </tbody>
        </table>

        <div className="vp-section-title">COMPETENCES AND LEARNING ACTIVITY</div>
        <table className="vp-table vp-comp">
          <tbody>
            <tr>
              <td className="vp-label">Main Competence</td>
              <td className="vp-static">{mainCompValue}</td>
            </tr>
            <tr>
              <td className="vp-label">Specific Competence</td>
              <td className="vp-static">{specCompValue}</td>
            </tr>
            <tr>
              <td className="vp-label">Learning Activities</td>
              <td>{cell(content.specific_activity || content.main_activity, (v) => setContent({ ...content, specific_activity: v }))}</td>
            </tr>
            <tr>
              <td className="vp-label">Teaching &amp; Learning Resources</td>
              <td>{cell(content.teaching_learning_resources, (v) => setContent({ ...content, teaching_learning_resources: v }))}</td>
            </tr>
            <tr>
              <td className="vp-label">References</td>
              <td>{cell(content.references, (v) => setContent({ ...content, references: v }))}</td>
            </tr>
          </tbody>
        </table>

        <div className="vp-section-title">LESSON STAGES</div>
        <table className="vp-table vp-stages">
          <thead>
            <tr>
              <td className="vp-label vp-stage-col">Stage</td>
              <td className="vp-label vp-time-col">Time</td>
              <td className="vp-label vp-teach-col">Teaching Activities</td>
              <td className="vp-label vp-learn-col">Learning Activities</td>
              <td className="vp-label vp-assess-col">Assessment Criteria</td>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => {
              const stageName = (stage.stage ?? "").trim();
              const isIntro = stageName.toLowerCase() === "introduction";
              return (
                <tr key={stageName || stage.stage}>
                  <td className="vp-stage-name">{isIntro ? "Introduction" : stageName}</td>
                  <td className="vp-center">
                    {cell(String(stage.time_minutes ?? ""), (v) => setStageField(stageName, "time_minutes", v), "vp-time")}
                  </td>
                  <td>{cell(String(stage.teaching_activities ?? ""), (v) => setStageField(stageName, "teaching_activities", v))}</td>
                  <td>{cell(String(stage.learning_activities ?? ""), (v) => setStageField(stageName, "learning_activities", v))}</td>
                  <td>{cell(String(stage.assessment_criteria ?? ""), (v) => setStageField(stageName, "assessment_criteria", v))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {meta.remarks && (
          <>
            <div className="vp-section-title">REMARKS</div>
            <div className="vp-remarks">{cell(meta.remarks, (v) => updateMeta("remarks", v))}</div>
          </>
        )}

        <div className="vp-section-title">SIGNATURES</div>
        <table className="vp-table vp-sign">
          <tbody>
            <tr>
              <td className="vp-sign-cell">Teacher&apos;s Signature: ______________________&nbsp;&nbsp; Date: ____________</td>
              <td className="vp-sign-cell">Headmaster&apos;s Signature: _____________________&nbsp;&nbsp; Date: ____________</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}