import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions,
} from "docx";
import type { LessonPlanContent, LessonStage } from "@/lib/lesson-plan-server";

const FONT = "Times New Roman";
const BORDER: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: "000000" };

function cellBorders() {
  return { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
}

function labelCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: cellBorders(),
    verticalAlign: "center",
    shading: { fill: "F3F0FA" },
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text, bold: true, font: FONT, size: 22 }),
        ],
      }),
    ],
  });
}

function valueCell(text: string, widthPct: number, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: cellBorders(),
    verticalAlign: "center",
    children: [
      new Paragraph({
        alignment: options.align ?? AlignmentType.LEFT,
        children: [
          new TextRun({ text: text || "___________", font: FONT, size: 22, bold: options.bold ?? false }),
        ],
      }),
    ],
  });
}

function infoRow(label: string, value: string, labelPct = 30): TableRow {
  return new TableRow({
    children: [labelCell(label, labelPct), valueCell(value, 100 - labelPct)],
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 24 })],
  });
}

function stageRow(stage: LessonStage, index: number): TableRow {
  const widths = [14, 12, 26, 24, 24];
  const cells = [
    new TableCell({
      width: { size: widths[0], type: WidthType.PERCENTAGE },
      borders: cellBorders(),
      verticalAlign: "center",
      shading: { fill: "F3F0FA" },
      children: [
        new Paragraph({
          children: [new TextRun({ text: `${index}. ${stage.stage}`, bold: true, font: FONT, size: 20 })],
        }),
      ],
    }),
    new TableCell({
      width: { size: widths[1], type: WidthType.PERCENTAGE },
      borders: cellBorders(),
      verticalAlign: "center",
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: stage.time_minutes ? `${stage.time_minutes} min` : "—", font: FONT, size: 20 })],
        }),
      ],
    }),
    new TableCell({
      width: { size: widths[2], type: WidthType.PERCENTAGE },
      borders: cellBorders(),
      children: [new Paragraph({ children: [new TextRun({ text: stage.teaching_activities || "—", font: FONT, size: 20 })] })],
    }),
    new TableCell({
      width: { size: widths[3], type: WidthType.PERCENTAGE },
      borders: cellBorders(),
      children: [new Paragraph({ children: [new TextRun({ text: stage.learning_activities || "—", font: FONT, size: 20 })] })],
    }),
    new TableCell({
      width: { size: widths[4], type: WidthType.PERCENTAGE },
      borders: cellBorders(),
      children: [new Paragraph({ children: [new TextRun({ text: stage.assessment_criteria || "—", font: FONT, size: 20 })] })],
    }),
  ];
  return new TableRow({ children: cells });
}

export interface LessonPlanExportData {
  schoolName: string;
  teacherName: string;
  subjectName: string;
  formName: string;
  class_stream: string | null;
  lesson_time: string | null;
  remarks: string | null;
  reference: string | null;
  mainCompetenceCode: string;
  mainCompetenceTitle: string;
  specificCompetenceCode: string;
  specificCompetenceTitle: string;
  date: string | null;
  number_of_periods: number;
  time_minutes: number;
  registered_boys: number;
  registered_girls: number;
  present_boys: number;
  present_girls: number;
  activities: string[];
  content: LessonPlanContent;
}

function attendanceTable(data: LessonPlanExportData): Table {
  const absB = Math.max(0, data.registered_boys - data.present_boys);
  const absG = Math.max(0, data.registered_girls - data.present_girls);
  const regT = data.registered_boys + data.registered_girls;
  const presT = data.present_boys + data.present_girls;
  const absT = absB + absG;

  const headRow = new TableRow({
    children: [
      new TableCell({ columnSpan: 2, borders: cellBorders(), verticalAlign: "center", shading: { fill: "E9E4F7" },
        children: [new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: 20 })] })] }),
      new TableCell({ borders: cellBorders(), verticalAlign: "center", shading: { fill: "E9E4F7" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Girls", bold: true, font: FONT, size: 20 })] })] }),
      new TableCell({ borders: cellBorders(), verticalAlign: "center", shading: { fill: "E9E4F7" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Boys", bold: true, font: FONT, size: 20 })] })] }),
      new TableCell({ borders: cellBorders(), verticalAlign: "center", shading: { fill: "E9E4F7" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Total", bold: true, font: FONT, size: 20 })] })] }),
    ],
  });

  const row = (label: string, girls: number, boys: number, total: number): TableRow =>
    new TableRow({
      children: [
        new TableCell({ columnSpan: 2, borders: cellBorders(), verticalAlign: "center",
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: FONT, size: 20 })] })] }),
        new TableCell({ borders: cellBorders(), verticalAlign: "center",
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(girls), font: FONT, size: 20 })] })] }),
        new TableCell({ borders: cellBorders(), verticalAlign: "center",
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(boys), font: FONT, size: 20 })] })] }),
        new TableCell({ borders: cellBorders(), verticalAlign: "center",
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(total), font: FONT, size: 20 })] })] }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      headRow,
      row("Registered", data.registered_girls, data.registered_boys, regT),
      row("Present", data.present_girls, data.present_boys, presT),
      row("Absent", absG, absB, absT),
    ],
  });
}

export async function buildLessonPlanDocx(data: LessonPlanExportData): Promise<Buffer> {
  const header = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: data.schoolName || "SCHOOL NAME", bold: true, font: FONT, size: 30 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "LESSON PLAN", bold: true, font: FONT, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "(Tanzania Institute of Education — Lesson Plan Format)", font: FONT, size: 20, italics: true })],
    }),
  ];

  const timeLabel = `${data.number_of_periods} period${data.number_of_periods === 1 ? "" : "s"} × ${data.time_minutes} minutes${data.lesson_time ? ` · ${data.lesson_time}` : ""}`;
  const classLabel = `${data.formName}${data.class_stream ? ` ${data.class_stream}` : ""}`;

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [labelCell("School", 30), valueCell(data.schoolName, 70)] }),
      new TableRow({ children: [labelCell("Teacher's Name", 30), valueCell(data.teacherName, 70)] }),
      new TableRow({ children: [labelCell("Date", 30), valueCell(data.date ?? "", 70)] }),
      new TableRow({ children: [labelCell("Subject", 30), valueCell(data.subjectName, 70)] }),
      new TableRow({ children: [labelCell("Class / Form", 30), valueCell(classLabel, 70)] }),
      new TableRow({ children: [labelCell("Time", 30), valueCell(timeLabel, 70)] }),
    ],
  });

  const competenceRows = [
    infoRow("Main Competence", `${data.mainCompetenceCode}. ${data.mainCompetenceTitle}`, 30),
    infoRow("Specific Competence", `${data.specificCompetenceCode}. ${data.specificCompetenceTitle}`, 30),
    infoRow("Learning Activities", data.activities.map((a, i) => `${i + 1}. ${a}`).join("\n"), 30),
    infoRow("Teaching & Learning Resources", data.content.teaching_learning_resources, 30),
    infoRow("References", data.content.references, 30),
  ];
  const competenceTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: competenceRows,
  });

  const stageHeader = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 14, type: WidthType.PERCENTAGE },
        borders: cellBorders(),
        verticalAlign: "center",
        shading: { fill: "E9E4F7" },
        children: [new Paragraph({ children: [new TextRun({ text: "Stage", bold: true, font: FONT, size: 22 })] })],
      }),
      new TableCell({
        width: { size: 12, type: WidthType.PERCENTAGE },
        borders: cellBorders(),
        verticalAlign: "center",
        shading: { fill: "E9E4F7" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Time", bold: true, font: FONT, size: 22 })] })],
      }),
      new TableCell({
        width: { size: 26, type: WidthType.PERCENTAGE },
        borders: cellBorders(),
        verticalAlign: "center",
        shading: { fill: "E9E4F7" },
        children: [new Paragraph({ children: [new TextRun({ text: "Teaching Activities", bold: true, font: FONT, size: 22 })] })],
      }),
      new TableCell({
        width: { size: 24, type: WidthType.PERCENTAGE },
        borders: cellBorders(),
        verticalAlign: "center",
        shading: { fill: "E9E4F7" },
        children: [new Paragraph({ children: [new TextRun({ text: "Learning Activities", bold: true, font: FONT, size: 22 })] })],
      }),
      new TableCell({
        width: { size: 24, type: WidthType.PERCENTAGE },
        borders: cellBorders(),
        verticalAlign: "center",
        shading: { fill: "E9E4F7" },
        children: [new Paragraph({ children: [new TextRun({ text: "Assessment Criteria", bold: true, font: FONT, size: 22 })] })],
      }),
    ],
  });

  const stages = data.content.stages ?? [];
  const stageRows = stages.length > 0
    ? stages.map((stage, i) => stageRow(stage, i + 1))
    : [
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 5,
              borders: cellBorders(),
              children: [new Paragraph({ children: [new TextRun({ text: "No stages were generated for this plan.", font: FONT, size: 20 })] })],
            }),
          ],
        }),
      ];

  const stagesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [stageHeader, ...stageRows],
  });

  const signature = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          valueCell("\n\n\nTeacher's Signature: ______________________  Date: ____________", 50, { align: AlignmentType.LEFT }),
          valueCell("\n\n\nHeadmaster's Signature: _____________________  Date: ____________", 50, { align: AlignmentType.LEFT }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: "Amali School Portal",
    title: `Lesson Plan — ${data.subjectName} (${data.formName})`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children: [
          ...header,
          infoTable,
          sectionTitle("STUDENT ATTENDANCE"),
          attendanceTable(data),
          sectionTitle("COMPETENCES AND LEARNING ACTIVITY"),
          competenceTable,
          sectionTitle("LESSON STAGES"),
          stagesTable,
          ...(data.remarks
            ? [sectionTitle("REMARKS"), new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: data.remarks, font: FONT, size: 24 })] })]
            : []),
          sectionTitle("SIGNATURES"),
          signature,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}