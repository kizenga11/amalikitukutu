"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  DAY_NAMES,
  minutesToTime,
  timeToMinutes,
  type DaySlot,
  type SlotKind,
  type TimetableClass,
} from "@/lib/timetable";
import { useTimetable, type TimetableClientData } from "./timetable-context";
import { Spinner } from "@/components/loading";

interface DraftSlot {
  uid: string;
  id?: string;
  day: number;
  start: string;
  end: string;
  kind: SlotKind;
  label: string;
  appliesTo: string[];
}

interface TemplateConfig {
  start: string;
  lessonMinutes: number;
  teaAfter: number;
  teaMinutes: number;
  lunchAfter: number;
  lunchMinutes: number;
  counts: Record<number, number>;
}

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `draft-${uidCounter}`;
}

function toDrafts(slots: DaySlot[]): DraftSlot[] {
  return [...slots]
    .sort((a, b) => a.day - b.day || a.position - b.position)
    .map((slot) => ({
      uid: nextUid(),
      id: slot.id,
      day: slot.day,
      start: slot.start,
      end: slot.end,
      kind: slot.kind,
      label: slot.label ?? "",
      appliesTo: slot.appliesTo.includes("*") ? [] : slot.appliesTo,
    }));
}

export default function SetupPanel() {
  const { data, loading, error } = useTimetable();
  if (loading) return <div className="tt-state"><Spinner /> Loading setup…</div>;
  if (error) return <div className="tt-state tt-state--error">{error}</div>;
  if (!data) return <div className="tt-state">No timetable data yet.</div>;
  return <SetupEditor data={data} />;
}

function SetupEditor({ data }: { data: TimetableClientData }) {
  const { refresh } = useTimetable();
  const [drafts, setDrafts] = useState<DraftSlot[]>(() => toDrafts(data.slots));
  const [activeDay, setActiveDay] = useState<number>(() => data.slots[0]?.day ?? 1);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [copyTarget, setCopyTarget] = useState<number>(0);
  const [config, setConfig] = useState<TemplateConfig>({
    start: "07:30",
    lessonMinutes: 40,
    teaAfter: 3,
    teaMinutes: 20,
    lunchAfter: 7,
    lunchMinutes: 40,
    counts: { 1: 10, 2: 8, 3: 8, 4: 10, 5: 6, 6: 0 },
  });

  const dayDrafts = useMemo(
    () => drafts.filter((slot) => slot.day === activeDay),
    [drafts, activeDay],
  );
  const daysWithSlots = useMemo(() => [...new Set(drafts.map((slot) => slot.day))].sort((a, b) => a - b), [drafts]);

  function updateDraft(uid: string, patch: Partial<DraftSlot>) {
    setDrafts((current) => current.map((slot) => (slot.uid === uid ? { ...slot, ...patch } : slot)));
  }

  function move(uid: string, direction: -1 | 1) {
    setDrafts((current) => {
      const daySlots = current.filter((slot) => slot.day === activeDay);
      const index = daySlots.findIndex((slot) => slot.uid === uid);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= daySlots.length) return current;
      [daySlots[index], daySlots[target]] = [daySlots[target], daySlots[index]];
      const otherDays = current.filter((slot) => slot.day !== activeDay);
      return [...otherDays, ...daySlots];
    });
  }

  function remove(uid: string) {
    setDrafts((current) => current.filter((slot) => slot.uid !== uid));
  }

  function addSlot(kind: SlotKind) {
    setDrafts((current) => {
      const daySlots = current.filter((slot) => slot.day === activeDay);
      const last = daySlots[daySlots.length - 1];
      const start = last?.end ?? "07:30";
      const end = minutesToTime(timeToMinutes(start) + (kind === "break" ? 20 : 40));
      return [
        ...current,
        {
          uid: nextUid(),
          day: activeDay,
          start,
          end,
          kind,
          label: kind === "break" ? "BREAK" : kind === "special" ? "SPECIAL" : "",
          appliesTo: [],
        },
      ];
    });
  }

  function copyDay() {
    if (!copyTarget || copyTarget === activeDay) return;
    setDrafts((current) => {
      const source = current.filter((slot) => slot.day === activeDay);
      const kept = current.filter((slot) => slot.day !== copyTarget);
      const copied = source.map((slot) => ({
        ...slot,
        uid: nextUid(),
        id: undefined,
        day: copyTarget,
      }));
      return [...kept, ...copied];
    });
    setNotice(`Copied ${DAY_NAMES[activeDay - 1]} to ${DAY_NAMES[copyTarget - 1]}. Save to apply.`);
  }

  function applyTemplate() {
    const generated: DraftSlot[] = [];
    for (let day = 1; day <= 6; day += 1) {
      const count = Number(config.counts[day] ?? 0);
      if (count <= 0) continue;
      let cursor = timeToMinutes(config.start);
      for (let index = 1; index <= count; index += 1) {
        if (config.teaAfter > 0 && config.teaMinutes > 0 && index === config.teaAfter + 1) {
          const end = cursor + config.teaMinutes;
          generated.push({
            uid: nextUid(),
            day,
            start: minutesToTime(cursor),
            end: minutesToTime(end),
            kind: "break",
            label: "TEA BREAK",
            appliesTo: [],
          });
          cursor = end;
        }
        if (config.lunchAfter > 0 && config.lunchMinutes > 0 && index === config.lunchAfter + 1) {
          const end = cursor + config.lunchMinutes;
          generated.push({
            uid: nextUid(),
            day,
            start: minutesToTime(cursor),
            end: minutesToTime(end),
            kind: "break",
            label: "LUNCH",
            appliesTo: [],
          });
          cursor = end;
        }
        const end = cursor + Math.max(5, config.lessonMinutes);
        generated.push({
          uid: nextUid(),
          day,
          start: minutesToTime(cursor),
          end: minutesToTime(end),
          kind: "lesson",
          label: "",
          appliesTo: [],
        });
        cursor = end;
      }
    }
    setDrafts(generated);
    setActiveDay(generated[0]?.day ?? 1);
    setNotice("Template created in the editor. Review the times, then choose Save timeline.");
    setProblem("");
  }

  async function saveTimeline() {
    setSaving(true);
    setNotice("");
    setProblem("");
    try {
      const originalIds = new Set(data.slots.map((slot) => slot.id));
      const keptIds = new Set(drafts.map((slot) => slot.id).filter(Boolean) as string[]);
      const removed = [...originalIds].filter((id) => !keptIds.has(id));
      if (removed.length > 0) {
        const { error: deleteError } = await supabase.from("timetable_day_slot").delete().in("id", removed);
        if (deleteError) {
          setProblem(
            `Could not delete ${removed.length} slot(s). If a version already uses them, delete that version first. ${deleteError.message}`,
          );
          return;
        }
      }

      const ordered = [...drafts].sort((a, b) => a.day - b.day);
      const positionByDay = new Map<number, number>();
      for (const slot of ordered) {
        const position = positionByDay.get(slot.day) ?? 0;
        positionByDay.set(slot.day, position + 1);
        const row = {
          day: slot.day,
          position,
          start_time: slot.start,
          end_time: slot.end,
          kind: slot.kind,
          label: slot.label.trim() || null,
        };
        if (slot.id) {
          const { error: updateError } = await supabase.from("timetable_day_slot").update(row).eq("id", slot.id);
          if (updateError) throw updateError;
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from("timetable_day_slot")
            .insert(row)
            .select("id")
            .single();
          if (insertError) throw insertError;
          slot.id = String(inserted.id);
        }
      }

      const savedIds: string[] = [];
      const scopeRows: { slot_id: string; class_id: string }[] = [];
      for (const slot of ordered) {
        if (!slot.id) continue;
        savedIds.push(slot.id);
        if (slot.kind === "special" && slot.appliesTo.length > 0) {
          for (const classId of slot.appliesTo) scopeRows.push({ slot_id: slot.id, class_id: classId });
        }
      }
      if (savedIds.length > 0) {
        await supabase.from("timetable_slot_scope").delete().in("slot_id", savedIds);
      }
      if (scopeRows.length > 0) {
        const { error: scopeError } = await supabase.from("timetable_slot_scope").insert(scopeRows);
        if (scopeError) throw scopeError;
      }

      setNotice("Timeline saved.");
      refresh();
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : "Could not save the timeline.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tt-panel-stack">
      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Quick timeline generator</h2>
            <p>Creates an editable week from your start time, lesson length and breaks.</p>
          </div>
        </div>
        <div className="tt-grid tt-grid--4">
          <label className="tt-field">
            <span>Start time</span>
            <input type="time" value={config.start} onChange={(event) => setConfig({ ...config, start: event.target.value })} />
          </label>
          <label className="tt-field">
            <span>Lesson length (min)</span>
            <input
              type="number"
              min={5}
              max={180}
              value={config.lessonMinutes}
              onChange={(event) => setConfig({ ...config, lessonMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="tt-field">
            <span>Tea break after lesson</span>
            <input
              type="number"
              min={0}
              max={30}
              value={config.teaAfter}
              onChange={(event) => setConfig({ ...config, teaAfter: Number(event.target.value) })}
            />
          </label>
          <label className="tt-field">
            <span>Tea length (min)</span>
            <input
              type="number"
              min={0}
              max={120}
              value={config.teaMinutes}
              onChange={(event) => setConfig({ ...config, teaMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="tt-field">
            <span>Lunch break after lesson</span>
            <input
              type="number"
              min={0}
              max={30}
              value={config.lunchAfter}
              onChange={(event) => setConfig({ ...config, lunchAfter: Number(event.target.value) })}
            />
          </label>
          <label className="tt-field">
            <span>Lunch length (min)</span>
            <input
              type="number"
              min={0}
              max={180}
              value={config.lunchMinutes}
              onChange={(event) => setConfig({ ...config, lunchMinutes: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="tt-grid tt-grid--6">
          {DAY_NAMES.map((name, index) => (
            <label key={name} className="tt-field">
              <span>{name.slice(0, 3)} lessons</span>
              <input
                type="number"
                min={0}
                max={16}
                value={config.counts[index + 1] ?? 0}
                onChange={(event) =>
                  setConfig({ ...config, counts: { ...config.counts, [index + 1]: Number(event.target.value) } })
                }
              />
            </label>
          ))}
        </div>
        <div className="tt-actions">
          <button type="button" className="cm-btn cm-btn--ghost" onClick={applyTemplate}>
            Create template
          </button>
        </div>
      </section>

      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Day timeline</h2>
            <p>Every slot is editable. Special slots only close the classes you choose.</p>
          </div>
          <div className="tt-actions">
            <button type="button" className="cm-btn cm-btn--primary" onClick={saveTimeline} disabled={saving}>
              {saving ? "Saving…" : "Save timeline"}
            </button>
          </div>
        </div>

        <div className="tt-tabs">
          {[1, 2, 3, 4, 5, 6].map((day) => (
            <button
              key={day}
              type="button"
              className={`tt-tab${activeDay === day ? " is-active" : ""}`}
              onClick={() => setActiveDay(day)}
            >
              {DAY_NAMES[day - 1]}
              {daysWithSlots.includes(day) ? "" : " · empty"}
            </button>
          ))}
        </div>

        {dayDrafts.length === 0 ? (
          <div className="tt-empty">No slots on {DAY_NAMES[activeDay - 1]}. Add a lesson, break or special slot.</div>
        ) : (
          <div className="tt-slot-list">
            {dayDrafts.map((slot, index) => (
              <div key={slot.uid} className={`tt-slot-row tt-slot-row--${slot.kind}`}>
                <div className="tt-slot-order">{index + 1}</div>
                <label className="tt-field tt-field--tight">
                  <span>Start</span>
                  <input type="time" value={slot.start} onChange={(event) => updateDraft(slot.uid, { start: event.target.value })} />
                </label>
                <label className="tt-field tt-field--tight">
                  <span>End</span>
                  <input type="time" value={slot.end} onChange={(event) => updateDraft(slot.uid, { end: event.target.value })} />
                </label>
                <label className="tt-field tt-field--tight">
                  <span>Kind</span>
                  <select
                    value={slot.kind}
                    onChange={(event) => updateDraft(slot.uid, { kind: event.target.value as SlotKind })}
                  >
                    <option value="lesson">Lesson</option>
                    <option value="break">Break</option>
                    <option value="special">Special</option>
                  </select>
                </label>
                <label className="tt-field tt-field--grow">
                  <span>Label</span>
                  <input
                    type="text"
                    value={slot.label}
                    placeholder={slot.kind === "lesson" ? "Lesson" : "Label"}
                    onChange={(event) => updateDraft(slot.uid, { label: event.target.value })}
                  />
                </label>
                <div className="tt-slot-buttons">
                  <button type="button" className="tt-icon" onClick={() => move(slot.uid, -1)} disabled={index === 0} aria-label="Move up">↑</button>
                  <button type="button" className="tt-icon" onClick={() => move(slot.uid, 1)} disabled={index === dayDrafts.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="tt-icon tt-icon--danger" onClick={() => remove(slot.uid)} aria-label="Delete slot">×</button>
                </div>
                {slot.kind === "special" && (
                  <div className="tt-scope">
                    <span className="tt-scope-label">Applies to</span>
                    <button
                      type="button"
                      className={`tt-chip${slot.appliesTo.length === 0 ? " is-on" : ""}`}
                      onClick={() => updateDraft(slot.uid, { appliesTo: [] })}
                    >
                      All classes
                    </button>
                    {data.classes.map((cls: TimetableClass) => {
                      const on = slot.appliesTo.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          className={`tt-chip${on ? " is-on" : ""}`}
                          onClick={() =>
                            updateDraft(slot.uid, {
                              appliesTo: on
                                ? slot.appliesTo.filter((id) => id !== cls.id)
                                : [...slot.appliesTo, cls.id],
                            })
                          }
                        >
                          {cls.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="tt-actions tt-actions--between">
          <div className="tt-actions">
            <button type="button" className="cm-btn cm-btn--ghost" onClick={() => addSlot("lesson")}>+ Lesson</button>
            <button type="button" className="cm-btn cm-btn--ghost" onClick={() => addSlot("break")}>+ Break</button>
            <button type="button" className="cm-btn cm-btn--ghost" onClick={() => addSlot("special")}>+ Special</button>
          </div>
          <div className="tt-actions">
            <select value={copyTarget} onChange={(event) => setCopyTarget(Number(event.target.value))} className="tt-select">
              <option value={0}>Copy day to…</option>
              {[1, 2, 3, 4, 5, 6]
                .filter((day) => day !== activeDay)
                .map((day) => (
                  <option key={day} value={day}>{DAY_NAMES[day - 1]}</option>
                ))}
            </select>
            <button type="button" className="cm-btn cm-btn--ghost" onClick={copyDay} disabled={!copyTarget}>
              Copy
            </button>
          </div>
        </div>

        {notice && <div className="tt-note tt-note--ok">{notice}</div>}
        {problem && <div className="tt-note tt-note--error">{problem}</div>}
      </section>

      <TeacherAvailability data={data} />
    </div>
  );
}

function TeacherAvailability({ data }: { data: TimetableClientData }) {
  const { refresh } = useTimetable();
  const [teacherId, setTeacherId] = useState(data.teachers[0]?.id ?? "");
  const [unavailable, setUnavailable] = useState<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {};
    for (const entry of data.unavailable) map[entry.teacherId] = new Set(entry.slotIds);
    return map;
  });
  const [problem, setProblem] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const entry of data.teacherLimits) map[entry.teacherId] = String(entry.maxPerDay);
    return map;
  });
  const [savingLimit, setSavingLimit] = useState(false);

  const teacherSlots = useMemo(
    () => [...data.slots].sort((a, b) => a.day - b.day || a.position - b.position),
    [data.slots],
  );

  async function toggle(slotId: string) {
    if (!teacherId) return;
    const current = new Set(unavailable[teacherId] ?? []);
    const isOn = current.has(slotId);
    if (isOn) current.delete(slotId);
    else current.add(slotId);
    setUnavailable((state) => ({ ...state, [teacherId]: current }));

    if (isOn) {
      const { error } = await supabase
        .from("timetable_teacher_unavailable")
        .delete()
        .eq("teacher_id", teacherId)
        .eq("slot_id", slotId);
      if (error) setProblem(error.message);
    } else {
      const { error } = await supabase
        .from("timetable_teacher_unavailable")
        .upsert({ teacher_id: teacherId, slot_id: slotId }, { onConflict: "teacher_id,slot_id" });
      if (error) setProblem(error.message);
    }
  }

  async function toggleDay(day: number, on: boolean) {
    if (!teacherId) return;
    const slots = teacherSlots.filter((slot) => slot.day === day && slot.kind !== "break");
    const current = new Set(unavailable[teacherId] ?? []);
    for (const slot of slots) {
      if (on) current.add(slot.id);
      else current.delete(slot.id);
    }
    setUnavailable((state) => ({ ...state, [teacherId]: current }));

    if (on) {
      const rows = slots.map((slot) => ({ teacher_id: teacherId, slot_id: slot.id }));
      const { error } = await supabase
        .from("timetable_teacher_unavailable")
        .upsert(rows, { onConflict: "teacher_id,slot_id" });
      if (error) setProblem(error.message);
    } else {
      const { error } = await supabase
        .from("timetable_teacher_unavailable")
        .delete()
        .eq("teacher_id", teacherId)
        .in("slot_id", slots.map((slot) => slot.id));
      if (error) setProblem(error.message);
    }
  }

  async function saveLimit(value: string) {
    if (!teacherId) return;
    const parsed = Number(value);
    setSavingLimit(true);
    setProblem("");
    try {
      if (!value.trim() || !Number.isFinite(parsed) || parsed <= 0) {
        const { error } = await supabase
          .from("timetable_teacher_limit")
          .delete()
          .eq("teacher_id", teacherId);
        if (error) throw error;
      } else {
        const maxPerDay = Math.max(1, Math.min(16, Math.floor(parsed)));
        const { error } = await supabase
          .from("timetable_teacher_limit")
          .upsert(
            { teacher_id: teacherId, max_per_day: maxPerDay, updated_at: new Date().toISOString() },
            { onConflict: "teacher_id" },
          );
        if (error) throw error;
      }
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : "Could not save the daily maximum.");
    } finally {
      setSavingLimit(false);
      refresh();
    }
  }

  if (!teacherId) {
    return <section className="tt-card"><div className="tt-empty">Add staff before setting teacher availability.</div></section>;
  }

  return (
    <section className="tt-card">
      <div className="tt-card-head">
        <div>
          <h2>Teacher availability</h2>
          <p>Optional. A teacher cannot be scheduled in a slot that is marked unavailable.</p>
        </div>
        <label className="tt-field tt-field--tight">
          <span>Teacher</span>
          <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            {data.teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
            ))}
          </select>
        </label>
        <label className="tt-field tt-field--tight">
          <span>Max periods / day</span>
          <input
            type="number"
            min={1}
            max={16}
            placeholder="No limit"
            value={limits[teacherId] ?? ""}
            disabled={savingLimit}
            onChange={(event) =>
              setLimits((state) => ({ ...state, [teacherId]: event.target.value }))
            }
            onBlur={(event) => saveLimit(event.target.value)}
          />
        </label>
      </div>

      <div className="tt-avail-days">
        {[1, 2, 3, 4, 5, 6].map((day) => {
          const slots = teacherSlots.filter((slot) => slot.day === day);
          if (slots.length === 0) return null;
          const set = unavailable[teacherId] ?? new Set<string>();
          return (
            <div key={day} className="tt-avail-day">
              <div className="tt-avail-day-head">
                <strong>{DAY_NAMES[day - 1]}</strong>
                <button type="button" className="tt-link" onClick={() => toggleDay(day, true)}>Unavailable all</button>
                <button type="button" className="tt-link" onClick={() => toggleDay(day, false)}>Clear</button>
              </div>
              <div className="tt-avail-slots">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className={`tt-avail-slot${set.has(slot.id) ? " is-off" : ""}${slot.kind === "break" ? " is-break" : ""}`}
                    onClick={() => slot.kind !== "break" && toggle(slot.id)}
                    disabled={slot.kind === "break"}
                    title={slot.label ?? slot.kind}
                  >
                    {slot.start}-{slot.end}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {problem && <div className="tt-note tt-note--error">{problem}</div>}
    </section>
  );
}
