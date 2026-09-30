import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [customers, projects, complaintsOpen, products, checklists, folders] = await Promise.all([
    prisma.customer.count(),
    prisma.project.count(),
    prisma.complaint.count({ where: { status: { in: ["AVOIN", "SELVITYKSESSA"] } } }),
    prisma.product.count(),
    prisma.qaChecklist.count(),
    prisma.productionFolder.count(),
  ]);
  return { customers, projects, complaintsOpen, products, checklists, folders };
}

const TILES = [
  {
    title: "Asiakkuuksien hallinta",
    href: "/asiakkuuksien-hallinta",
    desc: "Tarjoukset, projektit, tilausvahvistukset, tuotantoaikataulu",
    key: "customers" as const,
    label: "asiakasta",
  },
  {
    title: "Tuotehallinta",
    href: "/tuotehallinta",
    desc: "Nimikkeistö ja hinnastot",
    key: "products" as const,
    label: "nimikettä",
  },
  {
    title: "Reklamaatiot",
    href: "/reklamaatiot",
    desc: "Avoimet ja käsitellyt reklamaatiot",
    key: "complaintsOpen" as const,
    label: "avointa",
  },
  {
    title: "Laadunvarmistus",
    href: "/laadunvarmistus",
    desc: "Tarkastuslistat ja dokumentit",
    key: "checklists" as const,
    label: "tarkastuslistaa",
  },
  {
    title: "Tuotannon ohjaus",
    href: "/tuotannon-ohjaus",
    desc: "Sharepoint-tuotantokansiot, työmääräimet, piirustukset",
    key: "folders" as const,
    label: "tuotantokansiota",
  },
];

export default async function HomePage() {
  const counts = await getCounts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pääikkuna</h1>
        <p className="text-ink-2 text-sm mt-1">
          Toiminnanohjausjärjestelmän viisi pääosiota. Rakenne perustuu liitteenä olleeseen
          kaavioon - ks. <code>docs/ARKKITEHTUURI.md</code>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card p-5 flex flex-col gap-2 group hover:border-accent transition-colors"
          >
            <span className="font-heading text-base font-bold uppercase tracking-wide group-hover:text-accent-text transition-colors">{t.title}</span>
            <span className="text-sm text-ink-2">{t.desc}</span>
            <span className="font-heading text-3xl font-bold mt-2">
              {counts[t.key]}
              <span className="text-xs text-ink-muted font-sans ml-2">{t.label}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
