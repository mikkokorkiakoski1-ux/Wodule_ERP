/**
 * Vientien ja tuontipohjien muodostus.
 *
 * Koko järjestelmän vienti luetaan yhdessä REPEATABLE READ -transaktiossa,
 * jotta kaikki välilehdet kuvaavat samaa hetkeä (esim. hinnastorivit
 * vastaavat nimikkeitä).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KOHTEET, haeKohde, type Kohde } from "./kohteet";
import {
  SISALTOTYYPIT,
  kirjoitaCsv,
  kirjoitaJson,
  kirjoitaXlsx,
  pohjanRivit,
  type Muoto,
  type VietavaKohde,
} from "./tiedostot";

export class VientiVirhe extends Error {}

export interface Tiedosto {
  sisalto: Uint8Array | string;
  tiedostonimi: string;
  sisaltotyyppi: string;
  riveja: number;
}

function paivays(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" }); // YYYY-MM-DD
}

function valitseKohteet(avain: string): Kohde[] {
  if (avain === "kaikki") return KOHTEET;
  const kohde = haeKohde(avain);
  if (!kohde) throw new VientiVirhe(`Tuntematon kohde: ${avain}`);
  return [kohde];
}

async function kirjoita(vietavat: VietavaKohde[], avain: string, muoto: Muoto, nimenAlku: string, ohjeet: boolean): Promise<Tiedosto> {
  const nyt = new Date();
  const riveja = vietavat.reduce((n, v) => n + v.rivit.length, 0);
  const tiedostonimi = `${nimenAlku}_${paivays(nyt)}.${muoto}`;
  const perus = { tiedostonimi, sisaltotyyppi: SISALTOTYYPIT[muoto], riveja };
  if (muoto === "xlsx") return { ...perus, sisalto: await kirjoitaXlsx(vietavat, ohjeet) };
  if (muoto === "json") return { ...perus, sisalto: kirjoitaJson(vietavat, nyt) };
  if (vietavat.length !== 1) throw new VientiVirhe(`CSV-muodossa voi viedä vain yhden kohteen kerrallaan (${avain})`);
  return { ...perus, sisalto: kirjoitaCsv(vietavat[0]) };
}

export async function muodostaVienti(avain: string, muoto: Muoto): Promise<Tiedosto> {
  const kohteet = valitseKohteet(avain);
  const vietavat = await prisma.$transaction(
    async (tx) => {
      const tulos: VietavaKohde[] = [];
      for (const kohde of kohteet) tulos.push({ kohde, rivit: await kohde.hae(tx) });
      return tulos;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 5 * 60 * 1000 }
  );
  const tiedosto = await kirjoita(vietavat, avain, muoto, avain === "kaikki" ? "toiminnanohjaus" : avain, avain === "kaikki");

  await prisma.dataTransferLog.create({
    data: { direction: "VIENTI", target: avain, format: muoto, fileName: tiedosto.tiedostonimi, created: tiedosto.riveja },
  });
  return tiedosto;
}

export async function muodostaPohja(avain: string, muoto: Muoto): Promise<Tiedosto> {
  const kohteet = valitseKohteet(avain);
  const vietavat = kohteet.map((kohde) => ({ kohde, rivit: pohjanRivit(kohde) }));
  return kirjoita(vietavat, avain, muoto, `pohja_${avain}`, true);
}

/** Tiedosto ladattavaksi HTTP-vastaukseksi. */
export function latausvastaus(t: Tiedosto): Response {
  const runko = typeof t.sisalto === "string" ? t.sisalto : new Blob([t.sisalto as Uint8Array<ArrayBuffer>]);
  return new Response(runko, {
    headers: {
      "Content-Type": t.sisaltotyyppi,
      "Content-Disposition": `attachment; filename="${t.tiedostonimi}"`,
      "Cache-Control": "no-store",
    },
  });
}
