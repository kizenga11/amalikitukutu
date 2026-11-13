import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { loadTeacherAssignment, type AssignmentStudent } from "@/lib/teacher-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<AssignmentStudent["status"], string> = {
  not_submitted: "Not submitted",
  draft: "Draft",
  submitted: "Submitted",
  marked: "Marked",
};

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function fileSafe(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "assignment"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const detail = await loadTeacherAssignment(auth.staff.id, id);
    if (!detail) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const header = [
      "Registration No.",
      "Student name",
      "Status",
      "Submitted at",
      "Late",
      "Marks",
      `Total (${detail.assignment.totalMarks})`,
    ];

    const lines = [header.map(csvCell).join(",")];
    for (const student of detail.students) {
      lines.push(
        [
          student.registrationNo,
          student.name,
          STATUS_LABEL[student.status],
          student.submittedAt
            ? new Date(student.submittedAt).toLocaleString("en-GB")
            : "",
          student.isLate ? "Yes" : "No",
          student.totalScore ?? "",
          detail.assignment.totalMarks,
        ]
          .map(csvCell)
          .join(","),
      );
    }

    const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
    const filename = `assignment-${fileSafe(detail.assignment.title)}-${detail.assignment.className}-${detail.assignment.streamName}.csv`
      .replace(/\s+/g, "-")
      .toLowerCase();

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not export the marks.") },
      { status: 500 },
    );
  }
}
