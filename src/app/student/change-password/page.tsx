import type { Metadata } from "next";
import StudentChangePasswordForm from "@/components/student-change-password-form";

export const metadata: Metadata = {
  title: "Change Password | Amali Kitukutu",
};

export default function StudentChangePasswordPage() {
  return <StudentChangePasswordForm />;
}
