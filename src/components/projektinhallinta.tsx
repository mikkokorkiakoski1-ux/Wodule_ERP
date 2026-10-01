// Projektinhallinnan sivujen (Projektiaikataulu, Hankintasuunnitelma,
// Tehtäväluettelo) yhteiset palvelinkomponentit.
import { prisma } from "@/lib/prisma";
import type { Kiireellisyys } from "@/lib/hankinta";
import { pvm } from "@/lib/muotoilu";
import { KOHTEET } from "@/lib/tiedonsiirto/kohteet";
import { TiedonsiirtoTuontiClient } from "@/components/TiedonsiirtoTuontiClient";

/**
 * Excel-tuonti projektiin: projekti ja asiakas annetaan oletusarvoina, joten
 * projektinhallinnan Excelin välilehdet (aikataulu, Hankintasuunnitelma)
 * voi tuoda sellaisenaan.
 */
export async function ProjektinExceltuonti({ projectId, kohde }: { projectId: string; kohde: string }) {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { customer: true } });
  const kohteet = KOHTEET.filter((k) => ["aikataulutehtavat", "hankintarivit", "projektitehtavat", "projektiorganisaatio"].includes(k.avain));
  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-heading font-semibold">Tuo Excelistä</summary>
      <p className="text-sm text-ink-2 mt-2 mb-4 max-w-3xl">
        Tuo projektinhallinnan Excelin välilehti suoraan tähän projektiin. Otsikkorivi ja oikea välilehti tunnistetaan
        automaattisesti, eikä projektisaraketta tarvita. Hankintasuunnitelman x-merkinnät (tarjous kysytty, sopimus valmis)
        muutetaan vaiheiksi. Tuo aikataulu ennen hankintasuunnitelmaa, jotta toimituspäivät löytyvät heti.
      </p>
      <TiedonsiirtoTuontiClient
        kohteet={kohteet.map((k) => ({ avain: k.avain, nimi: k.nimi, osio: "Projekti " + p.name }))}
        oletusKohde={kohde}
        oletukset={{ projekti: p.name, asiakas: p.customer.businessId ?? p.customer.name }}
        automaattinen={false}
      />
    </details>
  );
}

const KIIREEN_TYYLI: Record<Kiireellisyys, string> = { myohassa: "crit", lahestyy: "info", ok: "muted", ei: "muted" };

/** Takaraja merkkinä: punainen = myöhässä, oranssi = viikon sisällä. */
export function Takaraja({ paiva, kiire }: { paiva: Date | null; kiire: Kiireellisyys }) {
  if (!paiva) return <span className="text-ink-muted">–</span>;
  return (
    <span className={`badge ${KIIREEN_TYYLI[kiire]}`} title={kiire === "myohassa" ? "Myöhässä" : kiire === "lahestyy" ? "Seuraavan 7 päivän aikana" : undefined}>
      {pvm(paiva)}
    </span>
  );
}

/** Näyttää ?virhe=-parametrin viestin (Server Actionien virheet). */
export function Virhe({ viesti }: { viesti?: string }) {
  if (!viesti) return null;
  return (
    <div role="alert" className="card border-critical px-4 py-3 text-sm text-critical">
      {viesti}
    </div>
  );
}

/** Henkilövalinta lomakkeisiin. Ei-aktiiviset näytetään vain, jos ne ovat jo valittuna. */
export function HenkiloValinta({
  henkilot,
  valittu,
  name = "assigneeId",
  tyhja = "Ei vastuuhenkilöä",
  className = "field",
}: {
  henkilot: { id: string; name: string; active: boolean }[];
  valittu?: string | null;
  name?: string;
  tyhja?: string;
  className?: string;
}) {
  return (
    <select name={name} defaultValue={valittu ?? ""} className={className}>
      <option value="">{tyhja}</option>
      {henkilot
        .filter((h) => h.active || h.id === valittu)
        .map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
            {!h.active ? " (ei aktiivinen)" : ""}
          </option>
        ))}
    </select>
  );
}

/** Lomakkeen kenttä otsikolla. */
export function Kentta({ otsikko, children, leveys = 1 }: { otsikko: string; children: React.ReactNode; leveys?: 1 | 2 | 3 | 4 }) {
  const span = { 1: "", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4" }[leveys];
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-2 ${span}`}>
      {otsikko}
      {children}
    </label>
  );
}
