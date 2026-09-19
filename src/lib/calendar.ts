export const TERMS_PER_YEAR = 2;

export type TermNumber = 1 | 2;

export interface AcademicYear {
  id: string;
  label: string;
  terms: TermNumber[];
}

export const academicYears: AcademicYear[] = [
  { id: "2025", label: "2025", terms: [1, 2] },
  { id: "2026", label: "2026", terms: [1, 2] },
  { id: "2027", label: "2027", terms: [1, 2] },
  { id: "2028", label: "2028", terms: [1, 2] },
  { id: "2029", label: "2029", terms: [1, 2] },
  { id: "2030", label: "2030", terms: [1, 2] },
  { id: "2031", label: "2031", terms: [1, 2] },
  { id: "2032", label: "2032", terms: [1, 2] },
  { id: "2033", label: "2033", terms: [1, 2] },
  { id: "2034", label: "2034", terms: [1, 2] },
  { id: "2035", label: "2035", terms: [1, 2] },
  { id: "2036", label: "2036", terms: [1, 2] },
  { id: "2037", label: "2037", terms: [1, 2] },
  { id: "2038", label: "2038", terms: [1, 2] },
  { id: "2039", label: "2039", terms: [1, 2] },
  { id: "2040", label: "2040", terms: [1, 2] },
];

export const currentYearId = "2026";
export const currentTerm: TermNumber = 2;

export function getYear(yearId: string): AcademicYear {
  return academicYears.find((year) => year.id === yearId) ?? academicYears[academicYears.length - 1];
}

export function yearLabel(yearId: string): string {
  return getYear(yearId).label;
}

export function termLabel(term: TermNumber): string {
  return `Term ${term}`;
}