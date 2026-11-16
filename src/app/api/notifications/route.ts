import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  loadSmartNotifications,
  requireNotificationsAdmin,
} from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireNotificationsAdmin(request);
    if (!auth.ok) return auth.response;

    const data = await loadSmartNotifications({
      staffId: auth.staff?.id ?? null,
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load notifications.") },
      { status: 500 },
    );
  }
}
