import {
  cleanLine,
  cleanMultiline,
  isPracticalQuestion,
  normaliseMatchingConfig,
  normaliseMcqConfig,
  normaliseStructuredParts,
  type MatchingConfig,
  type QuestionType,
  type StructuredPart,
} from "@/lib/assignments-shared";
import { currentTerm, currentYearId } from "@/lib/calendar";
import { loadActiveYearId } from "@/lib/active-year";
import { studentAdmin } from "@/lib/student-auth";
import { ASSIGNMENT_SELECT, firstRelation, type AssignmentRow } from "@/lib/student-assignments-server";

const QUESTION_TYPES = new Set<QuestionType>([
  "essay",
  "calculation",
  "short_answer",
  "mcq",
  "matching",
  "structured",
]);

export interface IncomingQuestion {
  questionType: QuestionType;
  prompt: string;
  /** Flexible config stored in assignment_questions.options (jsonb). */
  options: unknown;
  correctOption: number | null;
  marks: number;
}

// A part with subparts is a container: its marks are the total of the
// subparts, so they must not be added again (that double-counted the marks).
function totalStructuredMarks(parts: StructuredPart[]): number {
  let total = 0;
  for (const part of parts) {
    if (part.children && part.children.length > 0) total += totalStructuredMarks(part.children);
    else total += Number(part.marks) || 0;
  }
  return total;
}

export function parseQuestions(
  raw: unknown,
): { ok: true; questions: IncomingQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Add at least one question." };
  }
  if (raw.length > 100) {
    return { ok: false, error: "An assignment cannot have more than 100 questions." };
  }

  const questions: IncomingQuestion[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== "object") {
      return { ok: false, error: `Question ${index + 1} is invalid.` };
    }
    const row = item as Record<string, unknown>;
    const questionType = row.questionType as QuestionType;
    if (!QUESTION_TYPES.has(questionType)) {
      return { ok: false, error: `Invalid question type for question ${index + 1}.` };
    }

    const prompt = cleanMultiline(row.prompt, 5000);
    // structured/matching may have prompt at top level or inside config; allow empty prompt if config present
    const hasConfigPrompt = questionType === "structured" || questionType === "matching";
    if (!prompt && !hasConfigPrompt) {
      return { ok: false, error: `Enter the instructions for question ${index + 1}.` };
    }

    const marksNum = Number(row.marks);
    if (!Number.isFinite(marksNum) || marksNum < 0 || marksNum > 10000) {
      return { ok: false, error: `The marks for question ${index + 1} are invalid.` };
    }

    let options: unknown = null;
    let correctOption: number | null = null;
    let marks = marksNum;

    if (questionType === "mcq") {
      const config = normaliseMcqConfig(row.options ?? row);
      if (Array.isArray(config.items) && config.items.length > 0) {
        if (config.items.length > 20) return { ok: false, error: `Question ${index + 1} (MCQ) can have at most 20 items.` };
        const items = config.items.map((it, i) => {
          const choices = (it.choices || []).map((c) => String(c).trim()).filter(Boolean);
          return {
            key: it.key || `item-${i}`,
            label: it.label || String(i + 1),
            prompt: (it.prompt || "").trim(),
            choices,
            choiceLabels: (it.choiceLabels && it.choiceLabels.length === choices.length) ? it.choiceLabels : choices.map((_, j) => String.fromCharCode(65 + j)),
            correctOption: typeof it.correctOption === "number" && it.correctOption >= 0 && it.correctOption < choices.length ? it.correctOption : null,
            marks: typeof it.marks === "number" && Number.isFinite(it.marks) ? it.marks : undefined,
          };
        });
        for (let i = 0; i < items.length; i++) {
          if (items[i].choices.length < 2 || items[i].choices.length > 10) return { ok: false, error: `Question ${index + 1}, item (${items[i].label}) needs 2 to 10 options.` };
          if (!items[i].prompt) return { ok: false, error: `Question ${index + 1}, item (${items[i].label}) needs question text.` };
        }
        options = { instruction: (config.instruction || prompt || "").trim() || undefined, items };
        correctOption = null;
      } else {
        if (config.choices.length < 2 || config.choices.length > 20) {
          return {
            ok: false,
            error: `Question ${index + 1} requires 2 to 20 options.`,
          };
        }
        // correct option may be provided at row level for compatibility
        const correctRaw = row.correctOption ?? (row.options as any)?.correctOption ?? config.correctOption;
        const correct = Number(correctRaw);
        if (Number.isInteger(correct) && correct >= 0 && correct < config.choices.length) {
          correctOption = correct;
        } else {
          correctOption = config.correctOption;
        }
        options = { choices: config.choices, choiceLabels: config.choiceLabels, correctOption };
      }
    } else if (questionType === "matching") {
      const config: MatchingConfig = normaliseMatchingConfig(row.options ?? row);
      if (config.pairs.length < 2 || config.pairs.length > 20) {
        return { ok: false, error: `Question ${index + 1} (matching) requires 2 to 20 pairs.` };
      }
      options = config;
    } else if (questionType === "structured") {
      const rawParts = (row.options && typeof row.options === "object" && (row.options as any).parts)
        ? (row.options as any).parts
        : (row.parts ?? row.options);
      const parts = normaliseStructuredParts(rawParts);
      if (parts.length === 0) {
        return { ok: false, error: `Question ${index + 1} (structured) requires at least one part.` };
      }
      options = { parts };
      // A structured question's marks always come from its parts, so the
      // question total can never be larger than what the parts add up to.
      const derived = totalStructuredMarks(parts);
      if (derived > 0) marks = derived;
    } else if (questionType === "essay" || questionType === "calculation" || questionType === "short_answer") {
      // A practical question keeps only the mode flag. Hidden tests never
      // live in options because students receive options verbatim.
      options = isPracticalQuestion({ questionType, options: row.options })
        ? { practical: true }
        : null;
    }

    questions.push({ questionType, prompt: prompt || (questionType === "matching" ? "Match the items." : "Answer all parts."), options, correctOption, marks });
  }

  return { ok: true, questions };
}

export interface TeacherOption {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classId: string;
  className: string;
  formLevel: number;
  streamId: string;
  streamName: string;
}

export interface TeacherAssignmentSummary {
  id: string;
  title: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classId: string;
  className: string;
  streamId: string;
  streamName: string;
  deadline: string | null;
  totalMarks: number;
  allowLateSubmission: boolean;
  status: "draft" | "published" | "closed";
  createdAt: string;
  totalStudents: number;
  submittedCount: number;
  markedCount: number;
  notSubmittedCount: number;
}

export interface AssignmentStudent {
  studentId: string;
  registrationNo: string;
  name: string;
  submissionId: string | null;
  status: "not_submitted" | "draft" | "submitted" | "marked";
  submittedAt: string | null;
  isLate: boolean;
  totalScore: number | null;
}

export interface TeacherAssignmentDetail {
  assignment: TeacherAssignmentSummary & {
    instructions: string;
    attachmentName: string | null;
    attachmentType: string | null;
    attachmentData: string | null;
    hasSubmissions: boolean;
  };
  questions: {
    id: string;
    position: number;
    questionType: QuestionType;
    prompt: string;
    options: unknown;
    correctOption: number | null;
    marks: number;
  }[];
  students: AssignmentStudent[];
}

export interface TeacherSubmissionDetail {
  submission: {
    id: string;
    status: "draft" | "submitted" | "marked";
    submittedAt: string | null;
    isLate: boolean;
    totalScore: number | null;
    feedback: string | null;
    attachmentName: string | null;
    attachmentType: string | null;
    attachmentData: string | null;
  };
  student: {
    id: string;
    registrationNo: string;
    name: string;
  };
  assignment: {
    id: string;
    title: string;
    totalMarks: number;
    subjectName: string;
    className: string;
    streamName: string;
  };
  answers: {
    id: string;
    questionId: string;
    position: number;
    questionType: QuestionType;
    prompt: string;
    options: unknown;
    correctOption: number | null;
    maxMarks: number;
    answerHtml: string;
    answerText: string;
    awardedMarks: number | null;
    feedback: string | null;
  }[];
}

interface TeachingRow {
  subject_id: string;
  class_id: string;
  stream_id: string;
  subject: { code: string; name: string } | { code: string; name: string }[] | null;
  class:
    | { name: string; form_level: number }
    | { name: string; form_level: number }[]
    | null;
  stream: { name: string } | { name: string }[] | null;
}

interface StudentRow {
  id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
}

interface AnswerRow {
  id: string;
  question_id: string;
  answer_html: string | null;
  answer_text: string | null;
  awarded_marks: number | null;
  feedback: string | null;
}

function fullName(row: StudentRow): string {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ").trim();
}

export async function loadTeacherOptions(
  staffId: string,
  unrestricted = false,
): Promise<TeacherOption[]> {
  if (unrestricted) {
    return loadAllTeacherOptions();
  }

  const year = await loadActiveYearId(studentAdmin);
  const { data, error } = await studentAdmin
    .from("teaching_assignments")
    .select(
      "subject_id, class_id, stream_id, subject:subjects(code, name), class:school_classes(name, form_level), stream:streams(name)",
    )
    .eq("teacher_id", staffId)
    .eq("academic_year", year);
  if (error) throw error;

  const seen = new Set<string>();
  const options: TeacherOption[] = [];
  for (const row of (data ?? []) as unknown as TeachingRow[]) {
    const subject = firstRelation(row.subject);
    const cls = firstRelation(row.class);
    const stream = firstRelation(row.stream);
    const key = `${row.subject_id}|${row.class_id}|${row.stream_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      subjectId: row.subject_id,
      subjectCode: subject?.code ?? "",
      subjectName: subject?.name ?? "Somo",
      classId: row.class_id,
      className: cls?.name ?? "",
      formLevel: cls?.form_level ?? 0,
      streamId: row.stream_id,
      streamName: stream?.name ?? "",
    });
  }

  return sortTeacherOptions(options);
}

interface OptionSubjectRow {
  id: string;
  code: string;
  name: string;
}

interface OptionClassRow {
  id: string;
  name: string;
  form_level: number;
}

interface OptionStreamRow {
  id: string;
  class_id: string;
  name: string;
}

interface OptionStudentSubjectRow {
  subject_id: string;
  student:
    | { class_id: string | null; stream_id: string | null }
    | { class_id: string | null; stream_id: string | null }[]
    | null;
}

async function loadAllTeacherOptions(): Promise<TeacherOption[]> {
  const year = await loadActiveYearId(studentAdmin);
  const [subjectsResult, classesResult, streamsResult, linksResult, teachingResult] =
    await Promise.all([
      studentAdmin.from("subjects").select("id, code, name"),
      studentAdmin.from("school_classes").select("id, name, form_level"),
      studentAdmin.from("streams").select("id, class_id, name"),
      studentAdmin
        .from("student_subjects")
        .select("subject_id, student:students(class_id, stream_id)")
        .eq("academic_year", year),
      studentAdmin
        .from("teaching_assignments")
        .select("subject_id, class_id, stream_id")
        .eq("academic_year", year),
    ]);

  if (subjectsResult.error) throw subjectsResult.error;
  if (classesResult.error) throw classesResult.error;
  if (streamsResult.error) throw streamsResult.error;
  if (linksResult.error) throw linksResult.error;
  if (teachingResult.error) throw teachingResult.error;

  const subjects = new Map(
    ((subjectsResult.data ?? []) as OptionSubjectRow[]).map((row) => [row.id, row]),
  );
  const classes = new Map(
    ((classesResult.data ?? []) as OptionClassRow[]).map((row) => [row.id, row]),
  );
  const streams = new Map(
    ((streamsResult.data ?? []) as OptionStreamRow[]).map((row) => [row.id, row]),
  );

  const seen = new Set<string>();
  const options: TeacherOption[] = [];

  function add(subjectId: string, classId: string, streamId: string) {
    const key = `${subjectId}|${classId}|${streamId}`;
    if (seen.has(key)) return;
    const subject = subjects.get(subjectId);
    const cls = classes.get(classId);
    const stream = streams.get(streamId);
    if (!subject || !cls || !stream || stream.class_id !== classId) return;
    seen.add(key);
    options.push({
      subjectId,
      subjectCode: subject.code,
      subjectName: subject.name,
      classId,
      className: cls.name,
      formLevel: cls.form_level,
      streamId,
      streamName: stream.name,
    });
  }

  for (const row of teachingResult.data ?? []) {
    add(row.subject_id, row.class_id, row.stream_id);
  }

  for (const row of (linksResult.data ?? []) as unknown as OptionStudentSubjectRow[]) {
    const student = firstRelation(row.student);
    if (!student?.class_id || !student.stream_id) continue;
    add(row.subject_id, student.class_id, student.stream_id);
  }

  return sortTeacherOptions(options);
}

function sortTeacherOptions(options: TeacherOption[]): TeacherOption[] {
  return options.sort(
    (a, b) =>
      a.formLevel - b.formLevel ||
      a.className.localeCompare(b.className) ||
      a.streamName.localeCompare(b.streamName) ||
      a.subjectName.localeCompare(b.subjectName),
  );
}

export async function canTeach(
  staffId: string,
  subjectId: string,
  classId: string,
  streamId: string,
): Promise<boolean> {
  const year = await loadActiveYearId(studentAdmin);
  const { data, error } = await studentAdmin
    .from("teaching_assignments")
    .select("id")
    .eq("teacher_id", staffId)
    .eq("subject_id", subjectId)
    .eq("class_id", classId)
    .eq("stream_id", streamId)
    .eq("academic_year", year)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function studentsForSubject(
  classId: string,
  streamId: string,
  subjectId: string,
): Promise<StudentRow[]> {
  const year = await loadActiveYearId(studentAdmin);
  const { data: studentData, error: studentError } = await studentAdmin
    .from("students")
    .select("id, registration_no, first_name, middle_name, last_name")
    .eq("class_id", classId)
    .eq("stream_id", streamId)
    .eq("status", "Active")
    .order("last_name")
    .order("first_name");
  if (studentError) throw studentError;

  const rows = (studentData ?? []) as StudentRow[];
  if (rows.length === 0) return [];

  const { data: links, error: linkError } = await studentAdmin
    .from("student_subjects")
    .select("student_id")
    .eq("subject_id", subjectId)
    .eq("academic_year", year)
    .in(
      "student_id",
      rows.map((row) => row.id),
    );
  if (linkError) throw linkError;

  const allowed = new Set((links ?? []).map((row) => row.student_id));
  return rows.filter((row) => allowed.has(row.id));
}

export async function loadTeacherAssignments(
  staffId: string,
): Promise<TeacherAssignmentSummary[]> {
  const year = await loadActiveYearId(studentAdmin);
  const { data, error } = await studentAdmin
    .from("assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("teacher_id", staffId)
    .eq("academic_year_id", year)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as AssignmentRow[];
  if (rows.length === 0) return [];

  const { data: submissions, error: submissionError } = await studentAdmin
    .from("assignment_submissions")
    .select("assignment_id, status")
    .in(
      "assignment_id",
      rows.map((row) => row.id),
    );
  if (submissionError) throw submissionError;

  const submittedByAssignment = new Map<string, number>();
  const markedByAssignment = new Map<string, number>();
  for (const submission of submissions ?? []) {
    if (submission.status === "submitted" || submission.status === "marked") {
      submittedByAssignment.set(
        submission.assignment_id,
        (submittedByAssignment.get(submission.assignment_id) ?? 0) + 1,
      );
    }
    if (submission.status === "marked") {
      markedByAssignment.set(
        submission.assignment_id,
        (markedByAssignment.get(submission.assignment_id) ?? 0) + 1,
      );
    }
  }

  const studentCountCache = new Map<string, number>();
  const summaries: TeacherAssignmentSummary[] = [];

  for (const row of rows) {
    const subject = firstRelation(row.subject);
    const cls = firstRelation(row.class);
    const stream = firstRelation(row.stream);
    const cacheKey = `${row.class_id}|${row.stream_id}|${row.subject_id}`;
    let totalStudents = studentCountCache.get(cacheKey);
    if (totalStudents === undefined) {
      totalStudents = (await studentsForSubject(row.class_id, row.stream_id, row.subject_id)).length;
      studentCountCache.set(cacheKey, totalStudents);
    }
    const submittedCount = submittedByAssignment.get(row.id) ?? 0;
    const markedCount = markedByAssignment.get(row.id) ?? 0;

    summaries.push({
      id: row.id,
      title: row.title,
      subjectId: row.subject_id,
      subjectCode: subject?.code ?? "",
      subjectName: subject?.name ?? "Somo",
      classId: row.class_id,
      className: cls?.name ?? "",
      streamId: row.stream_id,
      streamName: stream?.name ?? "",
      deadline: row.deadline,
      totalMarks: Number(row.total_marks ?? 0),
      allowLateSubmission: Boolean(row.allow_late_submission),
      status: row.status,
      createdAt: row.created_at,
      totalStudents,
      submittedCount,
      markedCount,
      notSubmittedCount: Math.max(0, totalStudents - submittedCount),
    });
  }

  return summaries;
}

export async function loadTeacherAssignment(
  staffId: string,
  assignmentId: string,
): Promise<TeacherAssignmentDetail | null> {
  const { data, error } = await studentAdmin
    .from("assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("id", assignmentId)
    .eq("teacher_id", staffId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as AssignmentRow;
  const activeYear = await loadActiveYearId(studentAdmin);
  if (row.academic_year_id !== activeYear) return null;
  const subject = firstRelation(row.subject);
  const cls = firstRelation(row.class);
  const stream = firstRelation(row.stream);

  const [{ data: questionData, error: questionError }, studentRows] = await Promise.all([
    studentAdmin
      .from("assignment_questions")
      .select("id, position, question_type, prompt, options, correct_option, marks")
      .eq("assignment_id", row.id)
      .order("position", { ascending: true }),
    studentsForSubject(row.class_id, row.stream_id, row.subject_id),
  ]);
  if (questionError) throw questionError;

  const { data: submissionData, error: submissionError } = await studentAdmin
    .from("assignment_submissions")
    .select("id, student_id, status, submitted_at, is_late, total_score")
    .eq("assignment_id", row.id);
  if (submissionError) throw submissionError;

  const submissionByStudent = new Map<
    string,
    {
      id: string;
      status: "draft" | "submitted" | "marked";
      submitted_at: string | null;
      is_late: boolean;
      total_score: number | null;
    }
  >();
  for (const submission of submissionData ?? []) {
    submissionByStudent.set(submission.student_id, submission);
  }

  const students: AssignmentStudent[] = studentRows.map((student) => {
    const submission = submissionByStudent.get(student.id) ?? null;
    const status: AssignmentStudent["status"] = submission
      ? submission.status
      : "not_submitted";
    return {
      studentId: student.id,
      registrationNo: student.registration_no ?? "",
      name: fullName(student),
      submissionId: submission?.id ?? null,
      status,
      submittedAt: submission?.submitted_at ?? null,
      isLate: Boolean(submission?.is_late),
      totalScore:
        submission?.total_score === null || submission?.total_score === undefined
          ? null
          : Number(submission.total_score),
    };
  });

  const submittedCount = students.filter(
    (student) => student.status === "submitted" || student.status === "marked",
  ).length;
  const markedCount = students.filter((student) => student.status === "marked").length;

  return {
    assignment: {
      id: row.id,
      title: row.title,
      subjectId: row.subject_id,
      subjectCode: subject?.code ?? "",
      subjectName: subject?.name ?? "Somo",
      classId: row.class_id,
      className: cls?.name ?? "",
      streamId: row.stream_id,
      streamName: stream?.name ?? "",
      deadline: row.deadline,
      totalMarks: Number(row.total_marks ?? 0),
      allowLateSubmission: Boolean(row.allow_late_submission),
      status: row.status,
      createdAt: row.created_at,
      totalStudents: students.length,
      submittedCount,
      markedCount,
      notSubmittedCount: Math.max(0, students.length - submittedCount),
      instructions: row.instructions,
      attachmentName: row.attachment_name,
      attachmentType: row.attachment_type,
      attachmentData: row.attachment_data,
      hasSubmissions: (submissionData ?? []).length > 0,
    },
    questions: (questionData ?? []).map((question) => ({
      id: question.id,
      position: question.position,
      questionType: question.question_type as QuestionType,
      prompt: question.prompt,
      options: question.options ?? null,
      correctOption: question.correct_option === null ? null : Number(question.correct_option),
      marks: Number(question.marks ?? 0),
    })),
    students,
  };
}

export async function loadTeacherSubmission(
  staffId: string,
  assignmentId: string,
  submissionId: string,
): Promise<TeacherSubmissionDetail | null> {
  const detail = await loadTeacherAssignment(staffId, assignmentId);
  if (!detail) return null;

  const { data: submission, error } = await studentAdmin
    .from("assignment_submissions")
    .select(
      "id, student_id, status, submitted_at, is_late, total_score, feedback, attachment_name, attachment_type, attachment_data",
    )
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!submission) return null;

  const { data: studentData, error: studentError } = await studentAdmin
    .from("students")
    .select("id, registration_no, first_name, middle_name, last_name")
    .eq("id", submission.student_id)
    .maybeSingle();
  if (studentError) throw studentError;
  if (!studentData) return null;

  const { data: answerData, error: answerError } = await studentAdmin
    .from("assignment_answers")
    .select("id, question_id, answer_html, answer_text, awarded_marks, feedback")
    .eq("submission_id", submission.id);
  if (answerError) throw answerError;

  const answerByQuestion = new Map<string, AnswerRow>();
  for (const answer of (answerData ?? []) as AnswerRow[]) {
    answerByQuestion.set(answer.question_id, answer);
  }

  return {
    submission: {
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submitted_at,
      isLate: Boolean(submission.is_late),
      totalScore:
        submission.total_score === null ? null : Number(submission.total_score),
      feedback: submission.feedback,
      attachmentName: submission.attachment_name,
      attachmentType: submission.attachment_type,
      attachmentData: submission.attachment_data,
    },
    student: {
      id: studentData.id,
      registrationNo: studentData.registration_no ?? "",
      name: fullName(studentData as StudentRow),
    },
    assignment: {
      id: detail.assignment.id,
      title: detail.assignment.title,
      totalMarks: detail.assignment.totalMarks,
      subjectName: detail.assignment.subjectName,
      className: detail.assignment.className,
      streamName: detail.assignment.streamName,
    },
    answers: detail.questions.map((question) => {
      const answer = answerByQuestion.get(question.id);
      return {
        id: answer?.id ?? "",
        questionId: question.id,
        position: question.position,
        questionType: question.questionType,
        prompt: question.prompt,
        options: question.options,
        correctOption: question.correctOption,
        maxMarks: question.marks,
        answerHtml: answer?.answer_html ?? "",
        answerText: answer?.answer_text ?? "",
        awardedMarks:
          answer?.awarded_marks === null || answer?.awarded_marks === undefined
            ? null
            : Number(answer.awarded_marks),
        feedback: answer?.feedback ?? null,
      };
    }),
  };
}

export async function saveTeacherGrade(
  staffId: string,
  assignmentId: string,
  submissionId: string,
  grade: {
    answers: { answerId: string; awardedMarks: number | null; feedback: string }[];
    feedback: string;
  },
): Promise<{ totalScore: number }> {
  const { data: submission, error } = await studentAdmin
    .from("assignment_submissions")
    .select("id, assignment_id, status")
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!submission) throw new Error("Student submission not found.");
  if (submission.status === "draft") {
    throw new Error("The student has not submitted this assignment.");
  }

  const { data: assignment, error: assignmentError } = await studentAdmin
    .from("assignments")
    .select("id, total_marks, teacher_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignment || assignment.teacher_id !== staffId) {
    throw new Error("You are not allowed to grade this assignment.");
  }

  const { data: answers, error: answerError } = await studentAdmin
    .from("assignment_answers")
    .select("id, awarded_marks")
    .eq("submission_id", submissionId);
  if (answerError) throw answerError;

  const incoming = new Map(grade.answers.map((row) => [row.answerId, row]));
  const updates: { id: string; awarded: number; feedback: string | null }[] = [];
  let total = 0;

  for (const answer of answers ?? []) {
    const entry = incoming.get(answer.id);
    const awarded = entry
      ? entry.awardedMarks === null || !Number.isFinite(entry.awardedMarks)
        ? 0
        : Math.max(0, Number(entry.awardedMarks))
      : answer.awarded_marks === null
        ? 0
        : Number(answer.awarded_marks);
    total += awarded;

    if (entry) {
      updates.push({
        id: answer.id,
        awarded,
        feedback: cleanMultiline(entry.feedback, 5000) || null,
      });
    }
  }

  const totalMarks = Number(assignment.total_marks ?? 0);
  if (totalMarks > 0 && total > totalMarks) {
    throw new Error(`The total (${total}) exceeds the assignment total (${totalMarks}).`);
  }

  for (const update of updates) {
    const { error: updateError } = await studentAdmin
      .from("assignment_answers")
      .update({
        awarded_marks: update.awarded,
        feedback: update.feedback,
      })
      .eq("id", update.id);
    if (updateError) throw updateError;
  }

  const { error: updateError } = await studentAdmin
    .from("assignment_submissions")
    .update({
      status: "marked",
      total_score: total,
      feedback: cleanMultiline(grade.feedback, 10_000) || null,
      marked_at: new Date().toISOString(),
      marked_by: staffId,
    })
    .eq("id", submissionId);
  if (updateError) throw updateError;

  return { totalScore: total };
}

export async function countAssignmentSubmissions(assignmentId: string): Promise<number> {
  const { count, error } = await studentAdmin
    .from("assignment_submissions")
    .select("id", { count: "exact", head: true })
    .eq("assignment_id", assignmentId);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteTeacherAssignment(
  staffId: string,
  assignmentId: string,
): Promise<boolean> {
  const { data, error } = await studentAdmin
    .from("assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("teacher_id", staffId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export const assignmentDefaults = {
  academicYearId: currentYearId,
  term: currentTerm,
};

export async function loadActivePeriod(): Promise<{ academicYearId: string; term: 1 | 2 }> {
  const { data, error } = await studentAdmin
    .from("academic_settings")
    .select("key, value")
    .in("key", ["active_year", "active_term"]);
  if (error) return assignmentDefaults;

  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.key, row.value);

  const year = map.get("active_year") ?? "";
  const termValue = Number(map.get("active_term"));
  return {
    academicYearId: /^\d{4}$/.test(year) ? year : currentYearId,
    term: termValue === 1 || termValue === 2 ? termValue : currentTerm,
  };
}
