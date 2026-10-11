export const STAGES = [
  "Introduction",
  "Competence Development",
  "Design",
  "Realisation",
] as const;

export function splitMinutes(total: number): number[] {
  const w = [0.125, 0.5, 0.25, 0.125];
  const m = w.map((x) => Math.round(total * x));
  m[1] += total - m.reduce((a, b) => a + b, 0);
  return m;
}

const pick = (v: unknown, d: string) =>
  typeof v === "string" && v.trim() ? v : d;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildStages(sub: Record<string, any>, lessonNo: number, total: number, minutes: number) {
  const n = sub.name as string;
  const first = lessonNo === 1;
  const last = lessonNo === total;
  const mins = splitMinutes(minutes);

  const intro = first
    ? [
        `Greet students, ask questions linking their prior knowledge to "${n}", and state the lesson objectives.`,
        `Answer questions and recall prior knowledge.`,
        `Students recall prior knowledge correctly.`,
      ]
    : [
        `Revise the previous lesson through short questions and introduce today's part of "${n}".`,
        `Answer revision questions and recall the previous lesson.`,
        `Students recall the previous lesson correctly.`,
      ];

  let develop: string[];
  if (total === 1) {
    develop = [
      `Explain and demonstrate the key ideas of "${n}" step by step using examples, then give guided practice.`,
      `Listen, take notes, ask questions and practise the examples individually or in pairs.`,
      `Students explain key terms of "${n}" and solve examples correctly.`,
    ];
  } else if (first) {
    develop = [
      `Explain and demonstrate the key ideas of "${n}" step by step using examples; guide students through the first examples.`,
      `Listen, take notes, ask questions and try the first examples in pairs.`,
      `Students explain key terms of "${n}" correctly.`,
    ];
  } else if (last) {
    develop = [
      `Summarise "${n}", clarify misconceptions and give a short exercise.`,
      `Share findings, answer questions and complete the exercise.`,
      `Exercise scores; students explain and apply "${n}" independently.`,
    ];
  } else {
    develop = [
      `Give graded tasks on "${n}", move around, give feedback and correct errors.`,
      `Work in groups or individually on tasks and present solutions.`,
      `Tasks completed correctly; students apply the concept to new cases.`,
    ];
  }

  const design = [
    `Guide students to design or produce a solution/product applying "${n}".`,
    `Design and produce a solution/product in groups using available resources.`,
    `Solution/product is correct, complete and well presented.`,
  ];
  const realise = [
    `Let students present their work, summarise the lesson and give a follow-up task.`,
    `Present work, ask questions, record the summary and the follow-up task.`,
    `Students present correctly and state what they have learned.`,
  ];

  const keys: [string, string, string][] = [
    ["intro_teaching", "intro_learning", "intro_assessment"],
    ["develop_teaching", "develop_learning", "develop_assessment"],
    ["design_teaching", "design_learning", "design_assessment"],
    ["realise_teaching", "realise_learning", "realise_assessment"],
  ];
  const defaults = [intro, develop, design, realise];

  return STAGES.map((stage, i) => ({
    stage,
    minutes: mins[i],
    teaching_activities: pick(sub[keys[i][0]], defaults[i][0]),
    learning_activities: pick(sub[keys[i][1]], defaults[i][1]),
    assessment_criteria: pick(sub[keys[i][2]], defaults[i][2]),
  }));
}
