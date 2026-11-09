"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type {
  DaySlot,
  SolverInput,
  TimetableAssignment,
  TimetableClass,
  TimetableLabels,
  TimetableRules,
} from "@/lib/timetable";

export interface TimetableClientData {
  classes: TimetableClass[];
  subjects: { id: string; code: string; name: string }[];
  teachers: { id: string; name: string }[];
  assignments: TimetableAssignment[];
  slots: DaySlot[];
  rules: TimetableRules;
  unavailable: { teacherId: string; slotIds: string[] }[];
  teacherLimits: { teacherId: string; maxPerDay: number }[];
  input: SolverInput;
  viewerTeacherId: string | null;
}

interface TimetableContextValue {
  token: string | null;
  data: TimetableClientData | null;
  labels: Required<TimetableLabels>;
  loading: boolean;
  error: string;
  refresh: () => void;
}

const TimetableContext = createContext<TimetableContextValue | null>(null);

const EMPTY_LABELS: Required<TimetableLabels> = {
  class: (id) => id,
  teacher: (id) => id,
  subject: (id) => id,
  slot: (id) => id,
};

export function TimetableProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<TimetableClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: session }) => {
      if (!cancelled) setToken(session.session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/timetable/data", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as TimetableClientData & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error ?? "Could not load timetable settings.");
          setData(null);
        } else {
          setError("");
          setData(payload);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load timetable settings.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tick]);

  const labels = useMemo<Required<TimetableLabels>>(() => {
    if (!data) return EMPTY_LABELS;
    const classById = new Map(data.classes.map((entry) => [entry.id, entry.label]));
    const teacherById = new Map(data.teachers.map((entry) => [entry.id, entry.name]));
    const subjectById = new Map(data.subjects.map((entry) => [entry.id, entry.name]));
    const slotById = new Map(
      data.slots.map((slot) => [slot.id, `${slot.label ?? slot.kind} ${slot.start}-${slot.end}`]),
    );
    return {
      class: (id) => classById.get(id) ?? id,
      teacher: (id) => teacherById.get(id) ?? id,
      subject: (id) => subjectById.get(id) ?? id,
      slot: (id) => slotById.get(id) ?? id,
    };
  }, [data]);

  const value = useMemo(
    () => ({ token, data, labels, loading, error, refresh }),
    [token, data, labels, loading, error, refresh],
  );

  return <TimetableContext.Provider value={value}>{children}</TimetableContext.Provider>;
}

export function useTimetable(): TimetableContextValue {
  const value = useContext(TimetableContext);
  if (!value) throw new Error("useTimetable must be used inside TimetableProvider");
  return value;
}
