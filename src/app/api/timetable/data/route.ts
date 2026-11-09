import { NextResponse, type NextRequest } from "next/server";
import { authorizeTimetable, TIMETABLE_READERS } from "@/lib/timetable-auth";
import { loadTimetableData, timetableDb } from "@/lib/timetable-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeTimetable(request, TIMETABLE_READERS);
  if (!auth.ok) return auth.response;

  try {
    const data = await loadTimetableData();
    let viewerTeacherId: string | null = null;
    if (auth.role === "Teacher") {
      const { data: staff } = await timetableDb()
        .from("staff")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      viewerTeacherId = staff?.id ? String(staff.id) : null;
    }

    return NextResponse.json({
      classes: data.classes,
      subjects: data.subjects,
      teachers: data.teachers,
      assignments: data.assignments,
      slots: data.slots,
      rules: data.rules,
      unavailable: data.unavailable,
      teacherLimits: data.teacherLimits,
      input: data.input,
      viewerTeacherId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load timetable data." },
      { status: 500 },
    );
  }
}
