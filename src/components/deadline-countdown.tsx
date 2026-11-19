"use client";

import { useEffect, useState } from "react";
import {
  DEADLINE_WARNING_MS,
  formatTimeLeft,
  remainingMs,
} from "@/lib/deadline-countdown";

/**
 * Live "time left" label for a student assignment.
 *
 * Nothing is rendered during the server render or the first client render:
 * the clock is only read in an effect. That keeps hydration stable and means
 * a phone with the wrong time cannot change what the server rendered.
 *
 * The starting point comes from the server's clock (when supplied), then the
 * remaining time ticks locally from that offset.
 */
export default function DeadlineCountdown({
  deadline,
  serverTime,
  active = true,
  className = "",
}: {
  deadline: string | null | undefined;
  serverTime?: string | null;
  active?: boolean;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !deadline) return;

    const serverMs = serverTime ? new Date(serverTime).getTime() : NaN;
    const offset = Number.isFinite(serverMs) ? serverMs - Date.now() : 0;
    let timer: number | undefined;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const current = Date.now() + offset;
      setNowMs(current);
      const left = remainingMs(deadline, current);
      // No need to re-render every second while the deadline is still far away.
      const delay = left !== null && left <= DEADLINE_WARNING_MS ? 1000 : 30_000;
      timer = window.setTimeout(tick, delay);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, deadline, serverTime]);

  if (!active || !deadline || nowMs === null) return null;

  const left = remainingMs(deadline, nowMs);
  if (left === null || left > DEADLINE_WARNING_MS) return null;

  const overdue = left <= 0;
  return (
    <span
      className={`sp-countdown ${overdue ? "sp-countdown--overdue" : "sp-countdown--urgent"} ${className}`.trim()}
      role="timer"
      aria-live="off"
    >
      {overdue ? "Muda umepita" : formatTimeLeft(left)}
    </span>
  );
}
