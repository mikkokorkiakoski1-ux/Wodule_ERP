import Link from "next/link";

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

export function SectionNav() {
  return (
    <nav className="flex flex-col gap-5 p-4 w-64 shrink-0 border-r border-line bg-surface min-h-screen">
      <Link href="/" className="font-semibold text-ink px-2">
        Pääikkuna
      </Link>
      {SECTIONS.map((section) => (
        <div key={section.href} className="flex flex-col gap-1">
          <Link
            href={section.href}
            className="px-2 py-1 rounded-md text-sm font-semibold text-ink hover:bg-page"
          >
            {section.title}
          </Link>
          {section.children.length > 0 && (
            <div className="flex flex-col gap-0.5 pl-4">
              {section.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className="px-2 py-1 rounded-md text-[13px] text-ink-2 hover:bg-page hover:text-ink"
                >
                  {child.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
