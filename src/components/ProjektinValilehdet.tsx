"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Projektin alasivujen välilehdet. Rakennekaavion solmut Yhteenvetosivu,
// Projektiaikataulu ja Hankintasuunnitelma sekä kaavion ulkopuoliset
// lisäykset Rakennukset, Materiaalitarve ja Tehtäväluettelo (ks.
// docs/ARKKITEHTUURI.md).
export function ProjektinValilehdet({ projectId }: { projectId: string }) {
  const polku = usePathname();
  const pohja = `/projektit/${projectId}`;
  const valilehdet = [
    { nimi: "Yhteenveto", href: pohja },
    { nimi: "Rakennukset", href: `${pohja}/rakennukset` },
    { nimi: "Projektiaikataulu", href: `${pohja}/aikataulu` },
    { nimi: "Hankintasuunnitelma", href: `${pohja}/hankintasuunnitelma` },
    { nimi: "Materiaalitarve", href: `${pohja}/materiaalitarve` },
    { nimi: "Tehtäväluettelo", href: `${pohja}/tehtavat` },
  ];
  return (
    <nav className="flex gap-1 border-b border-line">
      {valilehdet.map((v) => {
        // Rakennuksen sivu (rakennukset/[id]) pitää Rakennukset-välilehden aktiivisena.
        const aktiivinen = v.href === pohja ? polku === v.href : polku === v.href || polku.startsWith(v.href + "/");
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={aktiivinen ? "page" : undefined}
            className={`px-4 py-2 -mb-px border-b-2 font-heading text-[13px] font-semibold uppercase tracking-wide transition-colors ${
              aktiivinen ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink hover:border-line-strong"
            }`}
          >
            {v.nimi}
          </Link>
        );
      })}
    </nav>
  );
}
