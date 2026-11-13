import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment, getNoteImageWithContext } from "@/lib/study-notes-server";
import { cleanNoteCaption } from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageContext = NonNullable<Awaited<ReturnType<typeof getNoteImageWithContext>>>;

type AuthorizeResult =
  | { ok: false; response: NextResponse }
  | { ok: true; info: ImageContext };

async function authorize(request: NextRequest, id: string): Promise<AuthorizeResult> {
  if (!isUuid(id)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid diagram." }, { status: 400 }) };
  }
  const auth = await authenticate(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!auth.staff) {
    return {
      ok: false,
      response: NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 }),
    };
  }
  const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
  const info = await getNoteImageWithContext(id);
  if (!info) {
    return { ok: false, response: NextResponse.json({ error: "Diagram not found." }, { status: 404 }) };
  }
  const allowed = await canManageTeachingAssignment(auth.staff.id, info.context.teachingAssignmentId, unrestricted);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "You are not allowed to edit this diagram." }, { status: 403 }),
    };
  }
  return { ok: true, info };
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const result = await authorize(request, id);
    if (!result.ok) return result.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const caption = cleanNoteCaption(body?.caption) || null;
    const { error } = await studentAdmin.from("note_images").update({ caption }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, caption });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update diagram.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const result = await authorize(request, id);
    if (!result.ok) return result.response;

    if (result.info.image.filePath) {
      await studentAdmin.storage.from("note-images").remove([result.info.image.filePath]);
    }
    const { error } = await studentAdmin.from("note_images").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not delete diagram.") }, { status: 500 });
  }
}
