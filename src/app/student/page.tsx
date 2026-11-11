import type { Metadata } from "next";
import StudentPortal from "@/components/student-portal";

export const metadata: Metadata = {
  title: "Student Portal | Amali Kitukutu",
  description: "Student results, progress and assignments.",
};

export default function StudentHomePage() {
  return <StudentPortal />;
}
