"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WoduleLogo } from "@/components/WoduleLogo";

// Sivunavigaatio mirrorii suoraan liitteenä olleen kaavion rakennetta
// (docs/rakennekaavio.jpg). Pidä tämä ajan tasalla, jos kaavio muuttuu -
// se on ainoa paikka, jossa koko sivukartta on kirjoitettu auki.
const SECTIONS = [
  {
    title: "Asiakkuuksien hallinta",
    href: "/asiakkuuksien-hallinta",
    children: [
      { title: "Tarjoukset", href: "/asiakkuuksien-hallinta/tarjoukset" },
      { title: "Projektit", href: "/asiakkuuksien-hallinta/projektit" },
      {
        title: "Tuotantoaikataulu projektit",
        href: "/asiakkuuksien-hallinta/projektit/tuotantoaikataulu",
      },
    ],
  },
  {
    title: "Tuotehallinta",
    href: "/tuotehallinta",
    children: [
      { title: "Nimikkeistö", href: "/tuotehallinta/nimikkeisto" },
      { title: "Hinnastot", href: "/tuotehallinta/hinnastot" },
    ],
  },
  {
    title: "Reklamaatiot",
    href: "/reklamaatiot",
    children: [],
  },
  {
    title: "Laadunvarmistus",
    href: "/laadunvarmistus",
    children: [
      { title: "Tarkastuslistat", href: "/laadunvarmistus/tarkastuslistat" },
      { title: "Dopit", href: "/laadunvarmistus/dopit" },
    ],
  },
  {
    title: "Tuotannon ohjaus",
    href: "/tuotannon-ohjaus",
    children: [],
  },
] as const;

// Poikkileikkaavat työkalut, jotka eivät ole kaavion solmuja.
const JARJESTELMA = [
  { title: "Henkilöt", href: "/henkilot" },
  { title: "Tiedonsiirto", href: "/tiedonsiirto" },
] as const;

const KAIKKI_REITIT = [
  "/",
  ...SECTIONS.flatMap((s) => [s.href, ...s.children.map((c) => c.href)]),
  ...JARJESTELMA.map((j) => j.href),
];

/** Pisin reitti, joka vastaa nykyistä polkua - se korostetaan. */
function aktiivinenReitti(polku: string): string | undefined {
  return KAIKKI_REITIT.filter((r) => (r === "/" ? polku === "/" : polku === r || polku.startsWith(r + "/"))).sort(
    (a, b) => b.length - a.length
  )[0];
}

function NavLinkki({ href, aktiivinen, children, taso }: { href: string; aktiivinen: boolean; children: React.ReactNode; taso: 1 | 2 }) {
  return (
    <Link
      href={href}
      aria-current={aktiivinen ? "page" : undefined}
      className={[
        "relative block rounded-[3px] px-3 py-1.5 transition-colors",
        taso === 1 ? "font-heading text-[13px] font-semibold uppercase tracking-wide" : "text-[13.5px]",
        aktiivinen
          ? "bg-white/10 text-brand-light before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:bg-accent"
          : taso === 1
            ? "text-[#fdfbf6]/90 hover:bg-white/5 hover:text-brand-light"
            : "text-[#f0e7d5]/70 hover:bg-white/5 hover:text-brand-light",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export function SectionNav() {
  const aktiivinen = aktiivinenReitti(usePathname());

  return (
    <nav className="flex flex-col gap-6 w-64 shrink-0 bg-brand-dark text-brand-light min-h-screen px-4 py-6 sticky top-0 self-start max-h-screen overflow-y-auto">
      <Link href="/" className="flex flex-col gap-2 px-3 pb-2 border-b border-white/10">
        <WoduleLogo className="h-5 w-auto text-brand-light self-start" />
        <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          Toiminnanohjaus
        </span>
      </Link>

      <div className="flex flex-col gap-4">
        <NavLinkki href="/" aktiivinen={aktiivinen === "/"} taso={1}>
          Pääikkuna
        </NavLinkki>
        {SECTIONS.map((section) => (
          <div key={section.href} className="flex flex-col gap-0.5">
            <NavLinkki href={section.href} aktiivinen={aktiivinen === section.href} taso={1}>
              {section.title}
            </NavLinkki>
            {section.children.length > 0 && (
              <div className="flex flex-col gap-0.5 pl-3 ml-3 border-l border-white/10">
                {section.children.map((child) => (
                  <NavLinkki key={child.href} href={child.href} aktiivinen={aktiivinen === child.href} taso={2}>
                    {child.title}
                  </NavLinkki>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-white/10 pt-4 mt-auto">
        <span className="px-3 pb-1 font-heading text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f0e7d5]/60">
          Järjestelmä
        </span>
        {JARJESTELMA.map((item) => (
          <NavLinkki key={item.href} href={item.href} aktiivinen={aktiivinen === item.href} taso={2}>
            {item.title}
          </NavLinkki>
        ))}
      </div>
    </nav>
  );
}
