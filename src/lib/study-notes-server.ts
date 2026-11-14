import { studentAdmin } from "@/lib/student-auth";
import { isUuid } from "@/lib/stream-teacher-server";
import { loadActiveYearId } from "@/lib/active-year";
import type { StudentProfile } from "@/lib/student-auth";
import type {
  NoteAudienceRow,
  NoteContext,
  NoteImage,
  NoteSubtopic,
  NoteTopicDetail,
  StudentTopicView,
  StudyNote,
} from "@/lib/study-notes-shared";

interface TeachingRow {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
  stream_id: string;
  subject: { code: string; name: string } | { code: string; name: string }[] | null;
  class:
    | { name: string; form_level: number }
    | { name: string; form_level: number }[]
    | null;
  stream: { name: string } | { name: string }[] | null;
  teacher:
    | { first_name: string | null; last_name: string | null; name: string | null }
    | { first_name: string | null; last_name: string | null; name: string | null }[]
    | null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function teacherName(row: TeachingRow): string {
  const t = first(row.teacher);
  return [t?.first_name, t?.last_name].filter(Boolean).join(" ").trim() || t?.name || "Teacher";
}

function toContext(row: TeachingRow): NoteContext {
  const subject = first(row.subject);
  const cls = first(row.class);
  const stream = first(row.stream);
  return {
    teachingAssignmentId: row.id,
    subjectId: row.subject_id,
    subjectCode: subject?.code ?? "",
    subjectName: subject?.name ?? "Subject",
    classId: row.class_id,
    className: cls?.name ?? "",
    streamId: row.stream_id,
    streamName: stream?.name ?? "",
    formLevel: cls?.form_level ?? 0,
    teacherId: row.teacher_id,
    teacherName: teacherName(row),
  };
}

const TEACHING_SELECT =
  "id, teacher_id, subject_id, class_id, stream_id, subject:subjects(code, name), class:school_classes(name, form_level), stream:streams(name), teacher:staff(first_name, last_name, name)";

export async function loadTeachingAssignmentContext(id: string): Promise<NoteContext | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await studentAdmin
    .from("teaching_assignments")
    .select(TEACHING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toContext(data as unknown as TeachingRow);
}

export async function loadStaffNoteContexts(
  staffId: string,
  unrestricted: boolean,
): Promise<NoteContext[]> {
  const year = await loadActiveYearId(studentAdmin);
  let query = studentAdmin
    .from("teaching_assignments")
    .select(TEACHING_SELECT)
    .eq("academic_year", year);
  if (!unrestricted) query = query.eq("teacher_id", staffId);
  const { data, error } = await query;
  if (error) throw error;
  const ctxs = ((data ?? []) as unknown as TeachingRow[]).map(toContext);
  return ctxs.sort(
    (a, b) =>
      a.formLevel - b.formLevel ||
      a.className.localeCompare(b.className) ||
      a.streamName.localeCompare(b.streamName) ||
      a.subjectName.localeCompare(b.subjectName),
  );
}

export async function canManageTeachingAssignment(
  staffId: string,
  teachingAssignmentId: string,
  unrestricted: boolean,
): Promise<boolean> {
  if (!isUuid(teachingAssignmentId)) return false;
  if (unrestricted) {
    const { data, error } = await studentAdmin
      .from("teaching_assignments")
      .select("id")
      .eq("id", teachingAssignmentId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  const { data, error } = await studentAdmin
    .from("teaching_assignments")
    .select("id")
    .eq("id", teachingAssignmentId)
    .eq("teacher_id", staffId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function mapNote(row: any): StudyNote {
  return {
    id: row.id,
    subtopicId: row.subtopic_id,
    title: row.title,
    description: row.description ?? null,
    filePath: row.file_path ?? null,
    fileName: row.file_name ?? null,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    mimeType: row.mime_type ?? null,
    contentHtml: row.content_html ?? null,
    isPublished: Boolean(row.is_published),
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const NOTE_IMAGE_SELECT =
  "id, subtopic_id, position, caption, file_path, file_name, file_size, mime_type, created_at";

async function mapNoteImage(row: any): Promise<NoteImage> {
  const url = row.file_path ? await createSignedNoteImageUrl(row.file_path) : null;
  return {
    id: row.id,
    subtopicId: row.subtopic_id,
    position: row.position == null ? 0 : Number(row.position),
    caption: row.caption ?? null,
    fileName: row.file_name ?? "",
    fileSize: row.file_size == null ? null : Number(row.file_size),
    mimeType: row.mime_type ?? "image/jpeg",
    url,
  };
}

function sortNoteImages(images: NoteImage[]): NoteImage[] {
  return [...images].sort(
    (a, b) => a.position - b.position || a.fileName.localeCompare(b.fileName),
  );
}

export async function loadTopicDetail(topicId: string): Promise<NoteTopicDetail | null> {
  if (!isUuid(topicId)) return null;
  const { data: topic, error } = await studentAdmin
    .from("note_topics")
    .select("id, teaching_assignment_id, title, subtopic_count, created_by, created_at, updated_at")
    .eq("id", topicId)
    .maybeSingle();
  if (error) throw error;
  if (!topic) return null;

  const context = await loadTeachingAssignmentContext(topic.teaching_assignment_id);
  const { data: subs, error: subErr } = await studentAdmin
    .from("note_subtopics")
    .select(
      `id, topic_id, position, title, notes(id, subtopic_id, title, description, file_path, file_name, file_size, mime_type, content_html, is_published, published_at, created_by, created_at, updated_at), note_images(${NOTE_IMAGE_SELECT})`,
    )
    .eq("topic_id", topicId)
    .order("position", { ascending: true });
  if (subErr) throw subErr;

  const subtopics: NoteSubtopic[] = await Promise.all(
    (subs ?? []).map(async (s: any) => {
      const noteRow = Array.isArray(s.notes) ? s.notes[0] : s.notes;
      const imageRows = Array.isArray(s.note_images) ? s.note_images : [];
      const images = await Promise.all(imageRows.map(mapNoteImage));
      return {
        id: s.id,
        topicId: s.topic_id,
        position: s.position,
        title: s.title,
        note: noteRow ? mapNote(noteRow) : null,
        images: sortNoteImages(images),
      };
    }),
  );

  return {
    id: topic.id,
    teachingAssignmentId: topic.teaching_assignment_id,
    title: topic.title,
    subtopicCount: topic.subtopic_count,
    createdBy: topic.created_by,
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
    context,
    subtopics,
  };
}

export async function loadTopicsForTeachingAssignment(teachingAssignmentId: string): Promise<NoteTopicDetail[]> {
  const { data, error } = await studentAdmin
    .from("note_topics")
    .select("id")
    .eq("teaching_assignment_id", teachingAssignmentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const details: NoteTopicDetail[] = [];
  for (const row of data ?? []) {
    const d = await loadTopicDetail(row.id);
    if (d) details.push(d);
  }
  return details;
}

export async function loadAllStaffTopics(staffId: string, unrestricted: boolean): Promise<NoteTopicDetail[]> {
  // load contexts to scope
  const contexts = await loadStaffNoteContexts(staffId, unrestricted);
  const taIds = contexts.map((c) => c.teachingAssignmentId);
  if (taIds.length === 0) return [];
  const { data, error } = await studentAdmin
    .from("note_topics")
    .select("id")
    .in("teaching_assignment_id", taIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const details: NoteTopicDetail[] = [];
  for (const row of data ?? []) {
    const d = await loadTopicDetail(row.id);
    if (d) details.push(d);
  }
  return details;
}

export async function getNoteWithContext(noteId: string): Promise<{
  note: StudyNote;
  context: NoteContext;
  topicId: string;
} | null> {
  if (!isUuid(noteId)) return null;
  const { data, error } = await studentAdmin
    .from("notes")
    .select("id, subtopic_id, title, description, file_path, file_name, file_size, mime_type, content_html, is_published, published_at, created_by, created_at, updated_at, subtopic:note_subtopics(topic_id, topic:note_topics(teaching_assignment_id))")
    .eq("id", noteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sub: any = first((data as any).subtopic);
  const topic: any = first(sub?.topic);
  const taId = topic?.teaching_assignment_id;
  if (!taId) return null;
  const context = await loadTeachingAssignmentContext(taId);
  if (!context) return null;
  return { note: mapNote(data), context, topicId: sub?.topic_id };
}

export async function loadNoteAudience(noteId: string): Promise<NoteAudienceRow[]> {
  const { data, error } = await studentAdmin.rpc("note_audience", { p_note_id: noteId });
  if (!error) {
    return dedupeAudience(
      ((data ?? []) as any[]).map((r) => ({
        studentId: r.student_id,
        registrationNo: r.registration_no ?? null,
        fullName: r.full_name ?? "",
        hasViewed: Boolean(r.has_viewed),
        firstViewedAt: r.first_viewed_at ?? null,
        lastViewedAt: r.last_viewed_at ?? null,
        viewCount: Number(r.view_count ?? 0),
        downloadCount: Number(r.download_count ?? 0),
      })),
    );
  }
  // Older databases may not have the note_audience() helper yet. Fall back to
  // building the audience with plain queries so the button keeps working.
  return loadNoteAudienceFallback(noteId);
}

function dedupeAudience(rows: NoteAudienceRow[]): NoteAudienceRow[] {
  const byStudent = new Map<string, NoteAudienceRow>();
  for (const row of rows) {
    const prev = byStudent.get(row.studentId);
    if (!prev) {
      byStudent.set(row.studentId, row);
      continue;
    }
    const lastViewedAt =
      !prev.lastViewedAt ? row.lastViewedAt
        : !row.lastViewedAt ? prev.lastViewedAt
          : prev.lastViewedAt > row.lastViewedAt ? prev.lastViewedAt : row.lastViewedAt;
    byStudent.set(row.studentId, {
      ...prev,
      hasViewed: prev.hasViewed || row.hasViewed,
      firstViewedAt: prev.firstViewedAt ?? row.firstViewedAt,
      lastViewedAt,
      viewCount: Math.max(prev.viewCount, row.viewCount),
      downloadCount: Math.max(prev.downloadCount, row.downloadCount),
    });
  }
  return Array.from(byStudent.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function loadNoteAudienceFallback(noteId: string): Promise<NoteAudienceRow[]> {
  const info = await getNoteWithContext(noteId);
  if (!info) return [];
  const year = await loadActiveYearId(studentAdmin);

  const { data: subjectRows, error: subErr } = await studentAdmin
    .from("student_subjects")
    .select("student_id")
    .eq("subject_id", info.context.subjectId)
    .eq("academic_year", year);
  if (subErr) throw subErr;
  const studentIds = (subjectRows ?? []).map((r: any) => r.student_id);
  if (studentIds.length === 0) return [];

  const { data: students, error: stuErr } = await studentAdmin
    .from("students")
    .select("id, registration_no, first_name, middle_name, last_name")
    .in("id", studentIds)
    .eq("class_id", info.context.classId)
    .eq("stream_id", info.context.streamId);
  if (stuErr) throw stuErr;

  const { data: views, error: viewErr } = await studentAdmin
    .from("note_views")
    .select("student_id, first_viewed_at, last_viewed_at, view_count, download_count")
    .eq("note_id", noteId);
  if (viewErr) throw viewErr;
  const byStudent = new Map<string, any>((views ?? []).map((v: any) => [v.student_id, v]));

  return dedupeAudience(
    ((students ?? []) as any[]).map((s) => {
      const v = byStudent.get(s.id);
      return {
        studentId: s.id,
        registrationNo: s.registration_no ?? null,
        fullName: [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ").trim(),
        hasViewed: Boolean(v),
        firstViewedAt: v?.first_viewed_at ?? null,
        lastViewedAt: v?.last_viewed_at ?? null,
        viewCount: Number(v?.view_count ?? 0),
        downloadCount: Number(v?.download_count ?? 0),
      };
    }),
  );
}

export async function studentCanViewNote(student: StudentProfile, noteId: string): Promise<boolean> {
  const info = await getNoteWithContext(noteId);
  if (!info || !info.note.isPublished) return false;
  if (!student.classId || !student.streamId) return false;
  if (info.context.classId !== student.classId || info.context.streamId !== student.streamId) return false;
  // must take subject
  const year = await loadActiveYearId(studentAdmin);
  const { data, error } = await studentAdmin
    .from("student_subjects")
    .select("student_id")
    .eq("student_id", student.id)
    .eq("subject_id", info.context.subjectId)
    .eq("academic_year", year)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function loadStudentPublishedNotes(student: StudentProfile): Promise<StudentTopicView[]> {
  if (!student.classId || !student.streamId) return [];
  const year = await loadActiveYearId(studentAdmin);
  // student's subjects
  const { data: subs, error: subErr } = await studentAdmin
    .from("student_subjects")
    .select("subject_id")
    .eq("student_id", student.id)
    .eq("academic_year", year);
  if (subErr) throw subErr;
  const subjectIds = (subs ?? []).map((s: any) => s.subject_id);
  if (subjectIds.length === 0) return [];

  // teaching assignments matching class/stream/subjects
  const { data: tas, error: taErr } = await studentAdmin
    .from("teaching_assignments")
    .select(TEACHING_SELECT)
    .eq("class_id", student.classId)
    .eq("stream_id", student.streamId)
    .eq("academic_year", year)
    .in("subject_id", subjectIds);
  if (taErr) throw taErr;
  const contexts = ((tas ?? []) as unknown as TeachingRow[]).map(toContext);
  const taIds = contexts.map((c) => c.teachingAssignmentId);
  if (taIds.length === 0) return [];

  const ctxByTa = new Map(contexts.map((c) => [c.teachingAssignmentId, c]));

  // topics with subtopics and published notes
  const { data: topics, error: tErr } = await studentAdmin
    .from("note_topics")
    .select(
      `id, title, teaching_assignment_id, created_at, note_subtopics(id, position, title, notes(id, title, file_name, file_size, file_path, content_html, is_published), note_images(${NOTE_IMAGE_SELECT}))`,
    )
    .in("teaching_assignment_id", taIds)
    .order("created_at", { ascending: true });
  if (tErr) throw tErr;

  const result: StudentTopicView[] = [];
  for (const t of topics ?? []) {
    const ctx = ctxByTa.get(t.teaching_assignment_id);
    if (!ctx) continue;
    const mappedSubtopics = await Promise.all(
      ((t as any).note_subtopics || []).map(async (s: any) => {
        const noteRow = Array.isArray(s.notes) ? s.notes[0] : s.notes;
        if (!noteRow || !noteRow.is_published) {
          return {
            id: s.id,
            position: s.position,
            title: s.title,
            note: null,
            images: [] as NoteImage[],
          };
        }
        const isText = !noteRow.file_path && typeof noteRow.content_html === "string" && noteRow.content_html.trim().length > 0;
        const imageRows = Array.isArray(s.note_images) ? s.note_images : [];
        const images = sortNoteImages(await Promise.all(imageRows.map(mapNoteImage)));
        return {
          id: s.id,
          position: s.position,
          title: s.title,
          note: {
            id: noteRow.id,
            title: noteRow.title,
            fileName: noteRow.file_name ?? null,
            fileSize: noteRow.file_size == null ? null : Number(noteRow.file_size),
            kind: isText ? ("text" as const) : ("pdf" as const),
            contentHtml: isText ? noteRow.content_html : null,
          },
          images,
        };
      }),
    );
    const subtopics = mappedSubtopics
      .filter((s) => s.note) // only show subtopics with published notes
      .sort((a, b) => a.position - b.position);

    if (subtopics.length === 0) continue;
    result.push({
      id: t.id,
      title: t.title,
      teachingAssignmentId: t.teaching_assignment_id,
      subjectName: ctx.subjectName,
      subjectCode: ctx.subjectCode,
      className: ctx.className,
      streamName: ctx.streamName,
      teacherName: ctx.teacherName,
      subtopics,
    });
  }

  // Group order by subject name, then oldest topic first so numbering (Topic 1,
  // Topic 2, …) matches the order students see.
  return result.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export async function recordStudentNoteView(noteId: string, studentId: string, action: "open" | "download"): Promise<void> {
  const { error } = await studentAdmin.rpc("record_note_view", {
    p_note_id: noteId,
    p_student_id: studentId,
    p_action: action,
  });
  if (error) throw error;
}

export async function getNoteImageWithContext(imageId: string): Promise<{
  image: {
    id: string;
    subtopicId: string;
    filePath: string;
    fileName: string;
    fileSize: number | null;
    mimeType: string;
    caption: string | null;
  };
  context: NoteContext;
  topicId: string;
  subtopicId: string;
} | null> {
  if (!isUuid(imageId)) return null;
  const { data, error } = await studentAdmin
    .from("note_images")
    .select(
      "id, subtopic_id, file_path, file_name, file_size, mime_type, caption, subtopic:note_subtopics(id, topic_id, topic:note_topics(id, teaching_assignment_id))",
    )
    .eq("id", imageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sub: any = first((data as any).subtopic);
  const topic: any = first(sub?.topic);
  const taId = topic?.teaching_assignment_id;
  if (!taId) return null;
  const context = await loadTeachingAssignmentContext(taId);
  if (!context) return null;
  return {
    image: {
      id: (data as any).id,
      subtopicId: (data as any).subtopic_id,
      filePath: (data as any).file_path,
      fileName: (data as any).file_name,
      fileSize: (data as any).file_size == null ? null : Number((data as any).file_size),
      mimeType: (data as any).mime_type ?? "image/jpeg",
      caption: (data as any).caption ?? null,
    },
    context,
    topicId: sub?.topic_id ?? topic?.id ?? "",
    subtopicId: (data as any).subtopic_id,
  };
}

export async function createSignedNoteImageUrl(filePath: string): Promise<string | null> {
  const { data, error } = await studentAdmin.storage
    .from("note-images")
    .createSignedUrl(filePath, 60 * 60 * 4);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function createSignedNoteUrl(filePath: string, downloadName?: string): Promise<string | null> {
  const { data, error } = await studentAdmin.storage
    .from("notes")
    .createSignedUrl(filePath, 60 * 10, downloadName ? { download: downloadName } : undefined);
  if (error) return null;
  return data?.signedUrl ?? null;
}
