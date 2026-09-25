import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Staff Login",
  description:
    "Wafanyakazi wanaingia hapa kwenye portal ya Amali Kitukutu (Kitukutu Technical Secondary School). Staff sign in to the Amali Kitukutu school management portal.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}