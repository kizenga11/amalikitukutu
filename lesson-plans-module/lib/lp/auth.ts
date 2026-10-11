export const SCHOOL_NAME = "Kitukutu Technical Secondary School";

export type LpUser = {
  id: string;
  name: string;
  role: "management" | "teacher";
  // majina ya masomo aliyopangiwa mwalimu (lazima yafanane na "Somo" kwenye seed). null = masomo yote
  subjects: string[] | null;
};

export async function getLpUser(): Promise<LpUser | null> {
  // TODO: unganisha na session ya mfumo wako uliopo (soma tu, usibadilishe auth).
  // - mkuu wa shule/management  -> role: "management", subjects: null
  // - mwalimu -> role: "teacher", subjects: [masomo yake kutoka teacher-subject assignment]
  return null;
}
