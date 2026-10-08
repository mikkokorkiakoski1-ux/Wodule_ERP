/**
 * Rakennusten ja vakiorakenteiden tietokantahaut. Laskenta on puhtaana
 * tiedostossa src/lib/rakenteet.ts.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  laskeKiinteatRivit,
  laskeKustannus,
  laskeMateriaalitarve,
  valitseHinnasto,
  type Hinnat,
  type KiinteaRivi,
  type Kustannus,
  type Materiaalitarve,
} from "@/lib/rakenteet";

/** Rakenneosa (StructureType) materiaaliluetteloineen (laskennan tarvitsema muoto). */
export const RAKENNEOSA_INCLUDE = {
  materials: { include: { product: true }, orderBy: { seq: "asc" } },
  littera: true,
} satisfies Prisma.StructureTypeInclude;

export const MAARARIVI_INCLUDE = {
  structureType: { include: RAKENNEOSA_INCLUDE },
} satisfies Prisma.BuildingPartInclude;

export const RAKENNUS_INCLUDE = {
  parts: { include: MAARARIVI_INCLUDE, orderBy: [{ seq: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.BuildingInclude;

export type RakennusOsineen = Prisma.BuildingGetPayload<{ include: typeof RAKENNUS_INCLUDE }>;

export interface Hinnoittelu {
  hinnasto: { id: string; name: string } | null;
  hinnat: Hinnat;
  tuntihintaSentit: number | null;
}

/** Laskennassa käytettävä hinnasto (uusin voimassa oleva) ja sen hinnat. */
export async function haeHinnoittelu(paiva = new Date()): Promise<Hinnoittelu> {
  const hinnastot = await prisma.priceList.findMany();
  const valittu = valitseHinnasto(hinnastot, paiva);
  if (!valittu) return { hinnasto: null, hinnat: new Map(), tuntihintaSentit: null };
  const rivit = await prisma.priceListItem.findMany({ where: { priceListId: valittu.id } });
  return {
    hinnasto: { id: valittu.id, name: valittu.name },
    hinnat: new Map(rivit.map((r) => [r.productId, r.unitPriceCents])),
    tuntihintaSentit: valittu.laborHourCents,
  };
}

export interface RakennuksenLaskenta {
  rakennus: RakennusOsineen;
  tarve: Materiaalitarve[];
  kiinteat: KiinteaRivi[];
  kustannus: Kustannus;
}

export interface Laskenta {
  rakennukset: RakennuksenLaskenta[];
  /** Kaikkien rakennusten materiaalitarve yhteensä. */
  tarve: Materiaalitarve[];
  /** Kiinteähintaiset rivit (esim. tarjouslaskurin) rakenneosittain, litteroittain. */
  kiinteat: KiinteaRivi[];
  kustannus: Kustannus;
  hinnoittelu: Hinnoittelu;
}

/** Hakee rakennukset määräluetteloineen ja laskee tarpeen ja kustannukset. */
export async function laskeRakennukset(where: Prisma.BuildingWhereInput): Promise<Laskenta> {
  const [rakennukset, hinnoittelu] = await Promise.all([
    prisma.building.findMany({ where, include: RAKENNUS_INCLUDE, orderBy: [{ seq: "asc" }, { code: "asc" }] }),
    haeHinnoittelu(),
  ]);
  const { hinnat, tuntihintaSentit } = hinnoittelu;
  const kaikkiOsat = rakennukset.flatMap((r) => r.parts);
  return {
    rakennukset: rakennukset.map((rakennus) => ({
      rakennus,
      tarve: laskeMateriaalitarve(rakennus.parts),
      kiinteat: laskeKiinteatRivit(rakennus.parts),
      kustannus: laskeKustannus(rakennus.parts, hinnat, tuntihintaSentit),
    })),
    tarve: laskeMateriaalitarve(kaikkiOsat),
    kiinteat: laskeKiinteatRivit(kaikkiOsat),
    kustannus: laskeKustannus(kaikkiOsat, hinnat, tuntihintaSentit),
    hinnoittelu,
  };
}

export const RAKENNUKSEN_TILAT: Record<string, string> = {
  SUUNNITTELU: "Suunnittelu",
  VALMISTUKSESSA: "Valmistuksessa",
  TOIMITETTU: "Toimitettu",
  VALMIS: "Valmis",
};

export const ELEMENTIN_TILAT: Record<string, string> = {
  SUUNNITTEILLA: "Suunnitteilla",
  VALMISTUKSESSA: "Valmistuksessa",
  VALMIS: "Valmis",
  TOIMITETTU: "Toimitettu",
  ASENNETTU: "Asennettu",
};

export const RAKENNEKATEGORIAT: Record<string, string> = {
  ULKOSEINA: "Ulkoseinä",
  VALISEINA: "Väliseinä",
  ALAPOHJA: "Alapohja",
  VALIPOHJA: "Välipohja",
  YLAPOHJA: "Yläpohja",
  KATTO: "Katto",
  TILAELEMENTTI: "Tilaelementti",
  IKKUNA: "Ikkuna",
  OVI: "Ovi",
  TEKNIIKKA: "Tekniikka",
  KALUSTE: "Kaluste",
  MUU: "Muu",
};

export const RAKENNEOSAN_LAJIT: Record<string, string> = { RAKENNE: "Rakenne", OSTONIMIKE: "Ostonimike" };

export const MAARAN_LAHTEET: Record<string, string> = { KASIN: "Käsin", BIM: "BIM", LASKURI: "Laskuri" };

export const KUSTANNUSLAJIT: Record<string, string> = { MATERIAALI: "Materiaali / osto", TEHDASTYO: "Tehdastyö", ALIURAKKA: "Aliurakka" };

/** Litteran näyttönimi, esim. "3500 Elementtituotanto". */
export function litteranNimi(l: { code: string; name: string } | null | undefined): string {
  return l ? `${l.code} ${l.name}` : "Ei litteraa";
}

/** Lajittelu litteran koodin mukaan (numeerisesti), litterattomat viimeisiksi. */
export function litterajarjestys(a: { code: string } | null | undefined, b: { code: string } | null | undefined): number {
  return (a?.code ?? "~").localeCompare(b?.code ?? "~", "fi", { numeric: true });
}

/** Rakennuksen näyttönimi: "A – Paritalo" tai pelkkä tunnus. */
export function rakennuksenNimi(r: { code: string; name: string | null }): string {
  return r.name ? `${r.code} – ${r.name}` : r.code;
}

/** Rakennukset ja elementit valintalistoihin (reklamaatiot, tarkastukset, piirustukset). */
export async function haeKohdistukset(projectId?: string) {
  return prisma.building.findMany({
    where: projectId ? { projectId } : { projectId: { not: null } },
    orderBy: [{ project: { name: "asc" } }, { seq: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      projectId: true,
      project: { select: { name: true } },
      elements: { select: { id: true, code: true }, orderBy: [{ seq: "asc" }, { code: "asc" }] },
    },
  });
}
