import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poppins",
});

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_ID ?? "G-XXXXXXXXXX";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.amalikitukutu.com"),
  title: "Kitukutu Secondary Technical School | Amali Kitukutu",
  description:
    "Amali Kitukutu, Kitukutu Technical School, and Kitukutu Secondary Technical School portal for students, staff, and parents.",
  keywords: [
    "Kitukutu Secondary School",
    "Kitukutu Technical School",
    "Kitukutu Secondary Technical School",
    "Amali Kitukutu",
    "Shule ya Amali Kitukutu",
    "Amali School Portal",
  ],
  applicationName: "Amali Kitukutu",
  openGraph: {
    title: "Kitukutu Secondary Technical School | Amali Kitukutu",
    description:
      "A welcoming and accessible school homepage for Kitukutu Technical School, Kitukutu Secondary Technical School, and Amali Kitukutu.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kitukutu Secondary Technical School | Amali Kitukutu",
    description:
      "A welcoming and accessible school homepage for Kitukutu Technical School, Kitukutu Secondary Technical School, and Amali Kitukutu.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.variable} ${poppins.variable} min-h-full flex flex-col`}>
        <Script
          id="ga-script"
          strategy="beforeInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
        />
        <Script
          id="ga-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaMeasurementId}');
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
