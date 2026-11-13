import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate } from "@/lib/stream-teacher-server";
import { loadStaffNoteContexts } from "@/lib/study-notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    }
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const contexts = await loadStaffNoteContexts(auth.staff.id, unrestricted);
    return NextResponse.json({ contexts, unrestricted });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load subjects/classes for notes.") },
      { status: 500 },
    );
  }
}
