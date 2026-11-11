import type { Metadata } from "next";
import StudentLoginForm from "@/components/student-login-form";

export const metadata: Metadata = {
  title: "Student Portal | Amali Kitukutu",
  description: "Sign in to the student portal to view results, progress and assignments.",
};

export default function StudentLoginPage() {
  return <StudentLoginForm />;
}
