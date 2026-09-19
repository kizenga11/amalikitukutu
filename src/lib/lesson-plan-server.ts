// Server-side Lesson Plan generator.
// Organizes REAL syllabus data (already stored in the database) into the
// TIE lesson-plan JSON structure. Generation is 100% done by the app itself
// (deterministic organizer) — no AI calls, no external providers, no keys.

export interface LessonStage {
  stage: string;
  time_minutes: string;
  teaching_activities: string;
  learning_activities: string;
  assessment_criteria: string;
}

export interface LessonPlanContent {
  main_activity: string;
  specific_activity: string;
  teaching_learning_resources: string;
  references: string;
  stages: LessonStage[];
}

export interface StageContentEntry {
  method?: string;
  time_minutes?: number;
  teaching_activity?: string;
  learning_activity?: string;
  assessment_criteria?: string;
}

// Keyed by the PHP stage names (introduction / development / design / realisation).
export type StageContentMap = Record<string, StageContentEntry>;

export interface SyllabusActivity {
  code: string;
  activity_description: string;
  suggested_methods: string | null;
  assessment_criteria: string | null;
  resources: string | null;
  periods_allocated: number | null;
  stage_content?: StageContentMap | null;
}

export interface GenerateSource {
  schoolName: string;
  teacherName: string;
  subjectName: string;
  formName: string;
  mainCompetenceCode: string;
  mainCompetenceTitle: string;
  specificCompetenceCode: string;
  specificCompetenceTitle: string;
  activities: SyllabusActivity[];
  number_of_periods: number;
  time_minutes: number;
}

const STAGE_ORDER = ["Introduction", "Competence Development", "Design", "Realisation"] as const;

// PHP stage key -> TIE stage name.
const STAGE_CONTENT_MAP: { key: string; stage: (typeof STAGE_ORDER)[number] }[] = [
  { key: "introduction", stage: "Introduction" },
  { key: "development", stage: "Competence Development" },
  { key: "design", stage: "Design" },
  { key: "realisation", stage: "Realisation" },
];

// When the migrated PHP data carries verbatim per-stage content, use it instead
// of the deterministic templates (faithful reproduction of the legacy plans).
function stagesFromContent(activities: SyllabusActivity[]): LessonStage[] | null {
  const first = activities.find((a) => a.stage_content && Object.keys(a.stage_content).length > 0);
  const sc = first?.stage_content;
  if (!sc) return null;

  const stages: LessonStage[] = [];
  for (const { key, stage } of STAGE_CONTENT_MAP) {
    const entry = sc[key];
    if (!entry) return null;
    stages.push({
      stage,
      time_minutes: entry.time_minutes != null ? String(entry.time_minutes) : "",
      teaching_activities: entry.teaching_activity ?? "",
      learning_activities: entry.learning_activity ?? "",
      assessment_criteria: entry.assessment_criteria ?? "",
    });
  }
  return stages;
}

// Deterministic time split across the four TIE stages.
function distributeTime(totalMinutes: number, stages: readonly string[]): Record<string, number> {
  if (stages.length === 0) return {};
  const ratios: Record<string, number> = {
    Introduction: 0.15,
    "Competence Development": 0.45,
    Design: 0.2,
    Realisation: 0.2,
  };
  const weights = stages.map((s) => Math.max(0, ratios[s] ?? 0.25));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const allocation: Record<string, number> = {};
  let assigned = 0;
  stages.forEach((s, i) => {
    if (i === stages.length - 1) {
      allocation[s] = totalMinutes - assigned;
      return;
    }
    const value = Math.max(0, Math.round((weights[i] / totalWeight) * totalMinutes));
    allocation[s] = value;
    assigned += value;
  });
  return allocation;
}

function toList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeValues(activities: SyllabusActivity[], pick: (a: SyllabusActivity) => string | null): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const activity of activities) {
    for (const item of toList(pick(activity))) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        parts.push(item);
      }
    }
  }
  return parts.join("; ");
}

export function organizeDeterministic(source: GenerateSource): LessonPlanContent {
  const totalMinutes = source.number_of_periods * source.time_minutes;
  const times = distributeTime(totalMinutes, STAGE_ORDER);

  const methods = mergeValues(source.activities, (a) => a.suggested_methods);
  const criteria = mergeValues(source.activities, (a) => a.assessment_criteria);
  const resources = mergeValues(source.activities, (a) => a.resources);
  const activityText = source.activities
    .map((a) => `${a.code}. ${a.activity_description}`)
    .join("\n");

  const mainActivity = [
    `${source.mainCompetenceCode}. ${source.mainCompetenceTitle}`,
    activityText ? `Learning activities: ${activityText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const specificActivity = [
    `${source.specificCompetenceCode}. ${source.specificCompetenceTitle}`,
    source.activities.map((a) => a.activity_description).join("; "),
  ]
    .filter(Boolean)
    .join(" — ");

  const stageContent: Record<string, Omit<LessonStage, "stage" | "time_minutes">> = {
    Introduction: {
      teaching_activities: `Briefly introduce the lesson; explain the competence ${source.specificCompetenceCode} to be developed.${
        methods ? ` Use the suggested methods: ${methods}.` : ""
      }`,
      learning_activities: "Listen attentively, ask and answer questions, and connect the lesson to prior knowledge.",
      assessment_criteria: criteria || "Learners respond accurately to oral questions and show readiness to learn.",
    },
    "Competence Development": {
      teaching_activities: `Guide learners through the learning activities using the suggested methods: ${methods || "guided practice, demonstration and discussion"}. Provide support and clarify concepts.`,
      learning_activities: activityText || "Carry out the learning activities as guided by the teacher.",
      assessment_criteria: criteria || "Learners perform the activities correctly using the given instructions.",
    },
    Design: {
      teaching_activities: `Supervise learners as they organize and design their work based on the activity: ${source.activities.map((a) => a.activity_description).join("; ") || "the given task"}. Provide feedback.`,
      learning_activities: "Plan, design and organize the expected output in groups or individually using the given resources.",
      assessment_criteria: criteria || "The designed output matches the task requirements.",
    },
    Realisation: {
      teaching_activities: "Facilitate presentation of learners' work, correct mistakes and evaluate performance against the assessment criteria.",
      learning_activities: "Present their work, respond to feedback, and reflect on what they have learned.",
      assessment_criteria: criteria || "Learners successfully present their work and answer follow-up questions.",
    },
  };

  const stages: LessonStage[] =
    stagesFromContent(source.activities) ??
    STAGE_ORDER.map((stage) => ({
      stage,
      time_minutes: String(totalMinutes > 0 ? times[stage] ?? 0 : ""),
      ...stageContent[stage],
    }));

  return {
    main_activity: mainActivity,
    specific_activity: specificActivity,
    teaching_learning_resources:
      resources || "Chalkboard, textbooks, charts and other locally available teaching and learning materials.",
    references: `Tanzania Institute of Education (TIE) Syllabus for ${source.subjectName}, ${source.formName}.`,
    stages,
  };
}

export async function generateLessonPlanContent(source: GenerateSource): Promise<LessonPlanContent> {
  return organizeDeterministic(source);
}