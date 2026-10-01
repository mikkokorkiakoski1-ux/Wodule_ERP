/**
 * Tuontimoottori.
 *
 * 1. Otsikot yhdistetään kohteen sarakkeisiin (otsikko, avain tai alias,
 *    kirjainkoolla ja ääkkösillä ei väliä).
 * 2. Jokainen solu tulkitaan sarakkeen tyypin mukaan (arvot.ts).
 * 3. Rivit ajetaan yhdessä tietokantatransaktiossa kohteiden
 *    riippuvuusjärjestyksessä. Jokainen rivi on oma savepointinsa, joten
 *    virheellinen rivi perutaan yksin eikä se kaada koko transaktiota.
 * 4. Esikatselu tekee kaiken saman mutta perii transaktion lopuksi. Siksi
 *    esikatselu näyttää täsmälleen, mitä tallennus tekisi, myös silloin
 *    kun rivit viittaavat samassa tiedostossa aiemmin luotuihin tietoihin.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jasennaArvo, normalisoi, type Sarake } from "./arvot";
import { KOHTEET, RiviVirhe, type Arvot, type Kohde, type RiviTulos, type Tuontitapa } from "./kohteet";
import { valilehdenNimi, type Muoto, type Taulukko } from "./tiedostot";

export const MAKSIMIRIVIT = 20000;

export interface TuontiAsetukset {
  /** Kohteen avain tai "automaattinen" (Excelin välilehdet / JSON-varmuuskopio). */
  kohde: string;
  tapa: Tuontitapa;
  /** peru = mikä tahansa virhe perii koko tuonnin; ohita = virheettömät rivit tallennetaan. */
  virheet: "peru" | "ohita";
  esikatselu: boolean;
  /**
   * Oletusarvot sarakkeille, joita tiedostossa ei ole tai jotka ovat tyhjiä
   * (sarakkeen avain -> arvo). Esim. projektisivun tuonnissa
   * { projekti: "Firstcamp iglut" }, koska projektin Excelissä ei ole
   * projektisaraketta.
   */
  oletukset?: Record<string, string>;
  /** Yhden kohteen tuonnissa käytettävä välilehti; oletuksena paras osuma. */
  taulukko?: string;
}

export interface RiviRaportti {
  rivi: number;
  tulos: RiviTulos | "virhe";
  tunniste: string;
  viesti?: string;
}

export type Yhteenveto = Record<RiviTulos | "virhe", number>;

export interface KohdeRaportti {
  kohde: string;
  nimi: string;
  taulukko?: string;
  tunnistetut: { otsikko: string; sarake: string }[];
  tuntemattomat: string[];
  vainVienti: string[];
  puuttuvatPakolliset: string[];
  rivit: RiviRaportti[];
  yhteenveto: Yhteenveto;
}

export interface TuontiRaportti {
  esikatselu: boolean;
  tallennettu: boolean;
  kohteet: KohdeRaportti[];
  /** Taulukot, joita ei tunnistettu miksikään kohteeksi. */
  ohitetutTaulukot: string[];
  yhteenveto: Yhteenveto;
  viesti: string;
  /** Tiedoston kaikki välilehdet, jotta käyttäjä voi valita toisen. */
  kaikkiTaulukot: string[];
}

interface ValmisRivi {
  rivi: number;
  arvot: Arvot;
  virheet: string[];
}

interface Valmisteltu {
  kohde: Kohde;
  raportti: KohdeRaportti;
  rivit: ValmisRivi[];
}

export class TuontiVirhe extends Error {}

function tyhjaYhteenveto(): Yhteenveto {
  return { luotu: 0, paivitetty: 0, ohitettu: 0, virhe: 0 };
}

// ------------------------------------------------------------
// Taulukoiden kohdistus kohteisiin
// ------------------------------------------------------------

function kohdeTaulukolle(nimi: string | undefined): Kohde | undefined {
  if (!nimi) return undefined;
  const n = normalisoi(nimi);
  return KOHTEET.find((k) => normalisoi(k.avain) === n || normalisoi(k.nimi) === n || normalisoi(valilehdenNimi(k)) === n);
}

/** Yhdistää luetut taulukot kohteisiin. Palauttaa myös ohitetut taulukot. */
/** Kuinka monta kohteen saraketta taulukon parhaalta otsikkoriviltä tunnistuu. */
function osumia(kohde: Kohde, taulukko: Taulukko): number {
  const hakemisto = sarakeHakemisto(kohde);
  const i = otsikkorivinIndeksi(taulukko, hakemisto);
  const r = taulukko.rivit[i];
  return r ? new Set(r.solut.map((s) => hakemisto.get(normalisoi(String(s ?? "")))).filter(Boolean)).size : 0;
}

export function kohdistaTaulukot(
  taulukot: Taulukko[],
  kohdeAvain: string,
  valittu?: string
): { parit: { kohde: Kohde; taulukko: Taulukko }[]; ohitetut: string[] } {
  if (kohdeAvain !== "automaattinen") {
    const kohde = KOHTEET.find((k) => k.avain === kohdeAvain);
    if (!kohde) throw new TuontiVirhe(`Tuntematon kohde: ${kohdeAvain}`);
    // Yhden kohteen tuonnissa: käyttäjän valitsema välilehti, kohteen niminen
    // välilehti tai se, jonka otsikoista tunnistuu eniten sarakkeita.
    const ehdokkaat = taulukot.filter((t) => t.rivit.length > 0 && normalisoi(t.nimi ?? "") !== "ohjeet");
    const taulukko =
      (valittu ? taulukot.find((t) => t.nimi === valittu) : undefined) ??
      taulukot.find((t) => kohdeTaulukolle(t.nimi) === kohde) ??
      ehdokkaat.map((t) => ({ t, n: osumia(kohde, t) })).sort((a, b) => b.n - a.n)[0]?.t;
    if (!taulukko) throw new TuontiVirhe("Tiedostossa ei ole rivejä");
    return {
      parit: [{ kohde, taulukko }],
      ohitetut: taulukot.filter((t) => t !== taulukko && t.nimi && t.rivit.length > 0).map((t) => t.nimi!),
    };
  }

  const parit: { kohde: Kohde; taulukko: Taulukko }[] = [];
  const ohitetut: string[] = [];
  for (const t of taulukot) {
    // Pelkkä otsikkorivi tai tyhjä lista (esim. tyhjä kohde varmuuskopiossa) ohitetaan hiljaa.
    if (t.rivit.length <= 1) continue;
    const kohde = kohdeTaulukolle(t.nimi);
    if (kohde && !parit.some((p) => p.kohde === kohde)) parit.push({ kohde, taulukko: t });
    else if (t.nimi && normalisoi(t.nimi) !== "ohjeet") ohitetut.push(t.nimi);
  }
  if (parit.length === 0) {
    throw new TuontiVirhe(
      "Tiedostosta ei tunnistettu yhtään kohdetta. Automaattinen tunnistus vaatii Excel-välilehdet tai JSON-varmuuskopion, joiden nimet vastaavat kohteita. Valitse muuten kohde itse."
    );
  }
  // Riippuvuusjärjestykseen: asiakkaat ennen tarjouksia jne.
  parit.sort((a, b) => KOHTEET.indexOf(a.kohde) - KOHTEET.indexOf(b.kohde));
  return { parit, ohitetut };
}

// ------------------------------------------------------------
// Otsikot ja arvot
// ------------------------------------------------------------

function sarakeHakemisto(kohde: Kohde): Map<string, Sarake> {
  const h = new Map<string, Sarake>();
  for (const s of kohde.sarakkeet) {
    for (const nimi of [s.otsikko, s.avain, ...(s.aliakset ?? [])]) {
      const n = normalisoi(nimi);
      if (!h.has(n)) h.set(n, s);
    }
  }
  return h;
}

/**
 * Otsikkorivi: se ensimmäisistä 15 rivistä, jonka soluista tunnistuu eniten
 * sarakkeita. Näin taulukon yläpuolella saa olla otsikkorivejä (esim.
 * projektinhallinnan Excelissä otsikot ovat rivillä 6). Jos mitään ei
 * tunnisteta, otsikkorivi on ensimmäinen rivi.
 */
function otsikkorivinIndeksi(taulukko: Taulukko, hakemisto: Map<string, Sarake>): number {
  let paras = 0;
  let parasMaara = 0;
  taulukko.rivit.slice(0, 15).forEach((r, i) => {
    const maara = new Set(r.solut.map((s) => hakemisto.get(normalisoi(String(s ?? "")))).filter(Boolean)).size;
    if (maara > parasMaara) {
      paras = i;
      parasMaara = maara;
    }
  });
  return paras;
}

export function valmistele(kohde: Kohde, taulukko: Taulukko, oletukset: Record<string, string> = {}): Valmisteltu {
  const raportti: KohdeRaportti = {
    kohde: kohde.avain,
    nimi: kohde.nimi,
    taulukko: taulukko.nimi,
    tunnistetut: [],
    tuntemattomat: [],
    vainVienti: [],
    puuttuvatPakolliset: [],
    rivit: [],
    yhteenveto: tyhjaYhteenveto(),
  };
  const hakemisto = sarakeHakemisto(kohde);
  const alku = otsikkorivinIndeksi(taulukko, hakemisto);
  const [otsikkorivi, ...datarivit] = taulukko.rivit.slice(alku);
  if (!otsikkorivi) return { kohde, raportti, rivit: [] };

  const sarakkeet: (Sarake | null)[] = otsikkorivi.solut.map((solu) => {
    // Vain tekstisolut ovat otsikoita (Excelin Gantt-ruudukon päivämäärät yms. ohitetaan).
    if (typeof solu !== "string") return null;
    const otsikko = solu.trim();
    if (!otsikko) return null;
    const s = hakemisto.get(normalisoi(otsikko));
    if (!s) {
      raportti.tuntemattomat.push(otsikko);
      return null;
    }
    if (s.vainVienti) {
      raportti.vainVienti.push(otsikko);
      return null;
    }
    if (raportti.tunnistetut.some((t) => t.sarake === s.otsikko)) {
      raportti.tuntemattomat.push(`${otsikko} (sarake on jo kertaalleen)`);
      return null;
    }
    raportti.tunnistetut.push({ otsikko, sarake: s.otsikko });
    return s;
  });

  // Oletusarvot täyttävät puuttuvat sarakkeet ja tyhjät solut.
  const oletusarvot = new Map<string, unknown>();
  for (const s of kohde.sarakkeet) {
    const o = oletukset[s.avain];
    if (o === undefined || o === "" || s.vainVienti) continue;
    const tulos = jasennaArvo(o, s);
    if ("virhe" in tulos) throw new TuontiVirhe(`Oletusarvo ${s.otsikko}: ${tulos.virhe}`);
    oletusarvot.set(s.avain, tulos.arvo);
    if (!sarakkeet.includes(s)) raportti.tunnistetut.push({ otsikko: `${s.otsikko} = ${o}`, sarake: s.otsikko });
  }

  raportti.puuttuvatPakolliset = kohde.sarakkeet
    .filter((s) => s.pakollinen && !sarakkeet.includes(s) && !oletusarvot.has(s.avain))
    .map((s) => s.otsikko);

  // Rivit, joilla ei ole arvoa yhdessäkään tunnistetussa sarakkeessa, ohitetaan
  // (esim. Excelin Gantt-ruudukko tai muotoillut tyhjät rivit taulukon alla).
  const tietorivit = datarivit.filter(({ solut }) =>
    sarakkeet.some((s, i) => s && solut[i] !== null && solut[i] !== undefined && String(solut[i]).trim() !== "")
  );
  const rivit = tietorivit.map(({ nro, solut }) => {
    const arvot: Arvot = {};
    const virheet: string[] = [];
    sarakkeet.forEach((s, i) => {
      if (!s) return;
      const tulos = jasennaArvo(solut[i], s);
      if ("virhe" in tulos) virheet.push(`${s.otsikko}: ${tulos.virhe}`);
      else if (tulos.arvo !== undefined) arvot[s.avain] = tulos.arvo;
    });
    oletusarvot.forEach((arvo, avain) => {
      if (arvot[avain] === undefined) arvot[avain] = arvo as Arvot[string];
    });
    for (const s of kohde.sarakkeet) {
      if (s.pakollinen && (sarakkeet.includes(s) || oletusarvot.has(s.avain)) && arvot[s.avain] === undefined && !virheet.some((v) => v.startsWith(s.otsikko + ":"))) {
        virheet.push(`${s.otsikko} on pakollinen`);
      }
    }
    return { rivi: nro, arvot, virheet };
  });

  return { kohde, raportti, rivit };
}

/** Rivin tunniste raporttiin ennen käsittelyä (virheellisille riveille). */
function alustavaTunniste(kohde: Kohde, arvot: Arvot): string {
  const pakolliset = kohde.sarakkeet.filter((s) => s.pakollinen && s.tyyppi === "teksti").map((s) => arvot[s.avain]);
  const osat = pakolliset.filter((v) => v !== undefined && v !== null).map(String);
  return osat.join(": ") || "–";
}

function virheteksti(e: unknown): string {
  if (e instanceof RiviVirhe) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const kentat = (e.meta?.target as string[] | undefined)?.join(", ");
      return `Arvo on jo käytössä toisella rivillä${kentat ? ` (${kentat})` : ""}`;
    }
    if (e.code === "P2003") return "Viittaus toiseen tietoon ei kelpaa";
    return `Tietokantavirhe ${e.code}`;
  }
  if (e instanceof Prisma.PrismaClientValidationError) return "Arvo ei kelpaa tietokantaan";
  return e instanceof Error ? e.message.split("\n")[0] : String(e);
}

// ------------------------------------------------------------
// Ajo
// ------------------------------------------------------------

/** Heitetään transaktion lopussa, kun muutokset halutaan perua. */
class Peru extends Error {}

export async function tuo(taulukot: Taulukko[], asetukset: TuontiAsetukset): Promise<TuontiRaportti> {
  const { parit, ohitetut } = kohdistaTaulukot(taulukot, asetukset.kohde, asetukset.taulukko);
  const valmistellut = parit.map(({ kohde, taulukko }) => valmistele(kohde, taulukko, asetukset.oletukset));

  const riveja = valmistellut.reduce((n, v) => n + v.rivit.length, 0);
  if (riveja === 0) throw new TuontiVirhe("Tiedostossa ei ole datarivejä otsikkorivin jälkeen");
  if (riveja > MAKSIMIRIVIT) throw new TuontiVirhe(`Tiedostossa on ${riveja} riviä, enintään ${MAKSIMIRIVIT} sallitaan kerralla`);

  const yhteenveto = tyhjaYhteenveto();
  const kirjaa = (v: Valmisteltu, r: RiviRaportti) => {
    v.raportti.rivit.push(r);
    v.raportti.yhteenveto[r.tulos]++;
    yhteenveto[r.tulos]++;
  };

  let tallennettu = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const v of valmistellut) {
          for (const r of v.rivit) {
            if (v.raportti.puuttuvatPakolliset.length > 0) {
              kirjaa(v, {
                rivi: r.rivi,
                tulos: "virhe",
                tunniste: alustavaTunniste(v.kohde, r.arvot),
                viesti: `Pakollinen sarake puuttuu: ${v.raportti.puuttuvatPakolliset.join(", ")}`,
              });
              continue;
            }
            if (r.virheet.length > 0) {
              kirjaa(v, { rivi: r.rivi, tulos: "virhe", tunniste: alustavaTunniste(v.kohde, r.arvot), viesti: r.virheet.join("; ") });
              continue;
            }
            await tx.$executeRawUnsafe("SAVEPOINT tuontirivi");
            try {
              const { tulos, tunniste } = await v.kohde.tuoRivi(r.arvot, tx, asetukset.tapa);
              await tx.$executeRawUnsafe("RELEASE SAVEPOINT tuontirivi");
              kirjaa(v, { rivi: r.rivi, tulos, tunniste });
            } catch (e) {
              await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT tuontirivi");
              kirjaa(v, { rivi: r.rivi, tulos: "virhe", tunniste: alustavaTunniste(v.kohde, r.arvot), viesti: virheteksti(e) });
            }
          }
        }
        if (asetukset.esikatselu) throw new Peru();
        if (asetukset.virheet === "peru" && yhteenveto.virhe > 0) throw new Peru();
        tallennettu = true;
      },
      { timeout: 10 * 60 * 1000, maxWait: 15000 }
    );
  } catch (e) {
    if (!(e instanceof Peru)) throw e;
  }

  let viesti: string;
  if (asetukset.esikatselu) {
    viesti = yhteenveto.virhe > 0 ? "Esikatselu valmis. Korjaa virheet tai valitse virheellisten rivien ohitus." : "Esikatselu valmis. Mitään ei ole vielä tallennettu.";
  } else if (tallennettu) {
    viesti = yhteenveto.virhe > 0 ? `Tuonti tallennettu. ${yhteenveto.virhe} virheellistä riviä ohitettiin.` : "Tuonti tallennettu.";
  } else {
    viesti = "Tuontia ei tallennettu, koska tiedostossa oli virheitä. Mitään ei muutettu.";
  }

  return {
    esikatselu: asetukset.esikatselu,
    tallennettu,
    kohteet: valmistellut.map((v) => v.raportti),
    ohitetutTaulukot: ohitetut,
    yhteenveto,
    viesti,
    kaikkiTaulukot: taulukot.map((t) => t.nimi).filter((n): n is string => !!n),
  };
}

export async function kirjaaTuonti(raportti: TuontiRaportti, kohde: string, muoto: Muoto, tiedostonimi: string) {
  const y = raportti.yhteenveto;
  await prisma.dataTransferLog.create({
    data: {
      direction: "TUONTI",
      target: kohde === "automaattinen" ? raportti.kohteet.map((k) => k.kohde).join(", ") : kohde,
      format: muoto,
      fileName: tiedostonimi,
      created: y.luotu,
      updated: y.paivitetty,
      skipped: y.ohitettu,
      failed: y.virhe,
    },
  });
}
