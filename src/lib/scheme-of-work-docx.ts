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

const FONT = "Times New Roman";
const BORDER: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const cellBorders = () => ({ top: BORDER, bottom: BORDER, left: BORDER, right: BORDER });

export type SowRowType = "row" | "break";

// One database row of a saved Scheme of Work (stored in generated_sow_plans.sow_data).
export interface SowRow {
  type: SowRowType;
  mainCompetence?: string;
  specificCompetence?: string;
  mainLearningActivity?: string;
  specificLearningActivity?: string;
  month?: string;
  week?: string;
  periods?: string;
  methods?: string;
  resources?: string;
  remarks?: string;
  breakText?: string;
}

export interface SowExportData {
  schoolName: string;
  title: string;
  subjectName: string;
  form: string;
  classStream: string;
  term: string;
  year: string;
  teacherName: string;
  rows: SowRow[];
}

const HEADER_CELLS = [
  "No.",
  "Main Competence",
  "Specific Competence",
  "Main Learning Activity",
  "Specific Learning Activity",
  "Month",
  "Week",
  "Periods",
  "Methods",
  "Resources",
  "Remarks",
] as const;

const CELL_WIDTHS = [4, 14, 12, 12, 14, 8, 7, 8, 8, 8, 5];

function textCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: cellBorders(),
    verticalAlign: "center",
    children: [new Paragraph({ children: [new TextRun({ text: text || "", font: FONT, size: 18 })] })],
  });
}

export async function buildSchemeOfWorkDocx(data: SowExportData): Promise<Buffer> {
  const header = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: data.schoolName || "SCHOOL NAME", bold: true, font: FONT, size: 30 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: data.title || "SCHEME OF WORK", bold: true, font: FONT, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${data.subjectName} — ${data.form}${data.classStream ? ` ${data.classStream}` : ""} · ${data.term}${data.year ? ` · ${data.year}` : ""} · ${data.teacherName || "Teacher"}`,
          font: FONT,
          size: 20,
          italics: true,
        }),
      ],
    }),
  ];

  const headRow = new TableRow({
    tableHeader: true,
    children: HEADER_CELLS.map((label, i) =>
      new TableCell({
        width: { size: CELL_WIDTHS[i], type: WidthType.PERCENTAGE },
        borders: cellBorders(),
        verticalAlign: "center",
        shading: { fill: "E9E4F7" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, font: FONT, size: 18 })] })],
      }),
    ),
  });

  const bodyRows: TableRow[] = (data.rows ?? []).map((row, i) => {
    if (row.type === "break") {
      return new TableRow({
        children: [
          new TableCell({
            columnSpan: HEADER_CELLS.length,
            borders: cellBorders(),
            shading: { fill: "F3F0FA" },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: row.breakText || "", bold: true, font: FONT, size: 18 })] })],
          }),
        ],
      });
    }
    const values = [
      String(i + 1),
      row.mainCompetence ?? "",
      row.specificCompetence ?? "",
      row.mainLearningActivity ?? "",
      row.specificLearningActivity ?? "",
      row.month ?? "",
      row.week ?? "",
      row.periods ?? "",
      row.methods ?? "",
      row.resources ?? "",
      row.remarks ?? "",
    ];
    return new TableRow({ children: values.map((v, c) => textCell(v, CELL_WIDTHS[c])) });
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headRow, ...bodyRows],
  });

  const doc = new Document({
    creator: "Amali School Portal",
    title: `${data.title || "Scheme of Work"} — ${data.subjectName} (${data.form})`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 567, bottom: 567, left: 567, right: 567 } } },
        children: [...header, table],
      },
    ],
  });

  return Packer.toBuffer(doc);
}