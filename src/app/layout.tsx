import type { Metadata } from "next";
import "./globals.css";
import { SectionNav } from "@/components/SectionNav";

export const metadata: Metadata = {
  title: { default: "Wodule · Toiminnanohjaus", template: "%s · Wodule" },
  description: "Sisäinen toiminnanohjausjärjestelmä",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Reddit+Sans:ital,wght@0,300..800;1,300..800&family=Reddit+Mono:wght@400..700&display=swap"
        />
      </head>
      <body className="flex min-h-screen">
        <SectionNav />
        <main className="flex-1 min-w-0 px-10 py-8">
          <div className="max-w-6xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
