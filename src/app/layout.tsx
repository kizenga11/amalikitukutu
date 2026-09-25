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

const siteUrl = "https://www.amalikitukutu.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Amali Kitukutu – Kitukutu Technical Secondary School",
    template: "%s – Amali Kitukutu",
  },
  description:
    "Amali Kitukutu, Kitukutu Technical Secondary School, Kitukutu, Iramba, Singida. Angalia matokeo ya mitihani bila kuingia, wasiliana nasi, na wafanyakazi wanaweza kuingia kwenye portal ya shule. View exam results, contact the school, and staff can sign in to the school portal.",
  keywords: [
    "Amali Kitukutu",
    "Kitukutu Technical School",
    "Kitukutu Secondary Technical School",
    "Kitukutu Secondary School",
    "Shule ya Amali Kitukutu",
    "Matokeo ya Mitihani",
    "Amali School Portal",
    "Kitukutu Iramba Singida",
    "Staff Login",
  ],
  applicationName: "Amali Kitukutu",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    siteName: "Amali Kitukutu",
    title: "Amali Kitukutu – Kitukutu Technical Secondary School",
    description:
      "Kitukutu Technical Secondary School (Amali Kitukutu), Kitukutu, Iramba, Singida. Angalia matokeo ya mitihani, wasiliana nasi, na wafanyakazi wanaweza kuingia kwenye portal ya shule.",
    type: "website",
    locale: "en_US",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Amali Kitukutu – Kitukutu Technical Secondary School",
    description:
      "Kitukutu Technical Secondary School (Amali Kitukutu), Kitukutu, Iramba, Singida. View exam results, contact the school, and staff can sign in to the school portal.",
  },
};

const jsonLd = `{"@context":"https://schema.org","@type":"EducationalOrganization","@id":"${siteUrl}/#organization","name":"Amali Kitukutu Technical Secondary School","alternateName":["Amali Kitukutu","Kitukutu Technical School","Kitukutu Secondary Technical School","Kitukutu Secondary School"],"url":"${siteUrl}","email":"info@amalikitukutu.unaux.com","address":{"@type":"PostalAddress","addressLocality":"Kitukutu","addressRegion":"Singida","addressCountry":"TZ"},"openingHours":["Mo-Fr 07:30-17:00","Sa 08:00-13:00"],"contactPoint":[{"@type":"ContactPoint","contactType":"Head of School","telephone":"+255714951475"},{"@type":"ContactPoint","contactType":"Second Master's Office","telephone":"+255752463910"},{"@type":"ContactPoint","contactType":"Academic Office","telephone":"+255712978722"}]}`;

const webSiteJsonLd = `{"@context":"https://schema.org","@type":"WebSite","@id":"${siteUrl}/#website","name":"Amali Kitukutu","url":"${siteUrl}","publisher":{"@id":"${siteUrl}/#organization"}}`;

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
          suppressHydrationWarning
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: webSiteJsonLd }}
          suppressHydrationWarning
        />
        {children}
      </body>
    </html>
  );
}
