"use client";

import { authedFetch } from "@/lib/api-client";
import type { NotificationsResponse } from "@/lib/notifications-types";

export class NotificationsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NotificationsApiError";
    this.status = status;
  }
}

export async function fetchSmartNotifications(): Promise<NotificationsResponse> {
  const response = await authedFetch("/api/notifications", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as NotificationsResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new NotificationsApiError(
      payload.error || "Could not load notifications.",
      response.status,
    );
  }
  return payload;
}
