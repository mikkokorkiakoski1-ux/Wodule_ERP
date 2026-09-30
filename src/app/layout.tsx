import type { Metadata } from "next";
import "./globals.css";
import { SectionNav } from "@/components/SectionNav";

export const metadata: Metadata = {
  title: "Toiminnanohjaus",
  description: "Sisäinen toiminnanohjausjärjestelmä",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;650;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="flex min-h-screen">
        <SectionNav />
        <main className="flex-1 p-8 max-w-5xl">{children}</main>
      </body>
    </html>
  );
}
