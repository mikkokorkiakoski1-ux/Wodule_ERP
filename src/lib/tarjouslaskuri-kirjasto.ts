/**
 * Tarjouslaskurin ja rakenneosakirjaston yhteys.
 *
 * Laskurin jokainen laskentarivi on kirjastossa rakenneosa
 * (StructureType.laskuriAvain = rivin avain), jolla on littera, kiinteä
 * yksikköhinta ja kustannuslaji. Määrät laskee laskuri
 * (src/lib/tarjouslaskenta.ts); hinnat luetaan kirjastosta, joten niitä voi
 * päivittää Rakenneosat-sivulla ilman koodimuutosta.
 *
 * Ei tuo prisma-singletonia, jotta seed voi käyttää samaa koodia omalla
 * clientillaan.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { LASKENTARIVIT, LITTERAT } from "./tarjouslaskenta";

type Db = PrismaClient | Prisma.TransactionClient;

const KATEGORIA: Record<string, Prisma.StructureTypeCreateInput["category"]> = {
  "3300": "VALIPOHJA",
  "3500": "ULKOSEINA",
  "3700": "KATTO",
  "3801": "TILAELEMENTTI",
  "4100": "IKKUNA",
  "4200": "IKKUNA",
  "4300": "OVI",
  "5100": "KATTO",
  "6100": "KALUSTE",
  "6110": "KALUSTE",
  "6120": "KALUSTE",
  "6200": "KALUSTE",
  "6300": "TEKNIIKKA",
  "7100": "TEKNIIKKA",
  "7110": "TEKNIIKKA",
  "7120": "TEKNIIKKA",
  "7130": "TEKNIIKKA",
  "7200": "TEKNIIKKA",
  "7300": "TEKNIIKKA",
};

export interface SiirronTulos {
  litteratLuotu: number;
  rakenneosatLuotu: number;
  rakenneosatYhteensa: number;
}

/**
 * Varmistaa, että laskurin litterat ja laskentarivit ovat kirjastossa.
 * Luo puuttuvat; olemassa oleviin (laskuriAvain) ei kosketa, joten
 * kirjastossa muutetut hinnat säilyvät. Litteraan liitetään vain, jos
 * rakenneosalla ei vielä ole litteraa.
 */
export async function varmistaLaskurinKirjasto(db: Db): Promise<SiirronTulos> {
  const litterat = new Map<string, string>();
  let litteratLuotu = 0;
  for (const l of LITTERAT) {
    const olemassa = await db.littera.findUnique({ where: { code: l.koodi } });
    if (olemassa) {
      litterat.set(l.koodi, olemassa.id);
      continue;
    }
    const luotu = await db.littera.create({ data: { code: l.koodi, name: l.nimi } });
    litterat.set(l.koodi, luotu.id);
    litteratLuotu++;
  }

  const olemassa = new Map(
    (await db.structureType.findMany({ where: { laskuriAvain: { not: null } }, select: { id: true, laskuriAvain: true, litteraId: true } })).map(
      (t) => [t.laskuriAvain!, t]
    )
  );
  let rakenneosatLuotu = 0;
  for (const r of LASKENTARIVIT) {
    const o = olemassa.get(r.avain);
    if (o) {
      if (!o.litteraId) await db.structureType.update({ where: { id: o.id }, data: { litteraId: litterat.get(r.littera) } });
      continue;
    }
    // Koodi voi olla käytössä käsin luodulla rakenneosalla; silloin liitetään se laskuriin.
    const samaKoodi = await db.structureType.findUnique({ where: { code: r.avain } });
    if (samaKoodi) {
      await db.structureType.update({ where: { id: samaKoodi.id }, data: { laskuriAvain: r.avain, litteraId: samaKoodi.litteraId ?? litterat.get(r.littera) } });
      continue;
    }
    await db.structureType.create({
      data: {
        code: r.avain,
        name: r.nimi,
        kind: "RAKENNE",
        category: KATEGORIA[r.littera] ?? "MUU",
        unit: r.yksikko,
        laborHoursPerUnit: 0,
        // Pyöristys poistaa liukulukujäänteen (esim. 41,44 × 100 = 4144,000000000001).
        unitPriceCents: Math.round(r.hinta * 100 * 1e6) / 1e6,
        costType: r.laji,
        laskuriAvain: r.avain,
        litteraId: litterat.get(r.littera),
        description: "Tarjouslaskurin laskentarivi. Määrä lasketaan laskurissa, hinta muokattavissa täällä.",
      },
    });
    rakenneosatLuotu++;
  }
  return { litteratLuotu, rakenneosatLuotu, rakenneosatYhteensa: LASKENTARIVIT.length };
}

/** Kirjaston hinnat laskurin riveille (avain -> € per yksikkö). Puuttuvat käyttävät laskurin oletusta. */
export async function haeLaskurinHinnat(db: Db): Promise<Record<string, number>> {
  const rivit = await db.structureType.findMany({
    where: { laskuriAvain: { not: null }, unitPriceCents: { not: null } },
    select: { laskuriAvain: true, unitPriceCents: true },
  });
  return Object.fromEntries(rivit.map((r) => [r.laskuriAvain!, r.unitPriceCents! / 100]));
}
