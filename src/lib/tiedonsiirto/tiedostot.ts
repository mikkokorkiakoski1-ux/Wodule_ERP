/**
 * Tiedostojen luku (tuonti) ja kirjoitus (vienti): CSV, Excel (xlsx) ja JSON.
 *
 * Luku palauttaa aina listan taulukoita, joissa ensimmäinen rivi on otsikko.
 * Excel-työkirjassa jokainen välilehti on oma taulukkonsa, ja JSON-
 * varmuuskopiossa jokainen kohde. Näin yhden kohteen tiedosto ja koko
 * järjestelmän vienti kulkevat saman tuontimoottorin läpi.
 */
import ExcelJS from "exceljs";
import { jasennaCsv, muodostaCsv, puraTeksti } from "./csv";
import { muotoileCsv, muotoileJson, muotoileXlsx, tyypinKuvaus, type Sarake } from "./arvot";
import type { Arvot, Kohde } from "./kohteet";

export type Muoto = "csv" | "xlsx" | "json";

export interface Taulukko {
  /** Välilehden tai JSON-kohteen nimi; CSV:llä tyhjä. */
  nimi?: string;
  rivit: { nro: number; solut: unknown[] }[];
}

/** JSON-varmuuskopion tunniste, jotta tiedoston tunnistaa tuonnissa. */
export const JSON_MUOTO = "wodule-erp-tiedonsiirto";

export class TiedostoVirhe extends Error {}

export function tunnistaMuoto(tiedostonimi: string): Muoto | null {
  const paate = tiedostonimi.toLowerCase().split(".").pop();
  if (paate === "csv" || paate === "txt" || paate === "tsv") return "csv";
  if (paate === "xlsx" || paate === "xlsm") return "xlsx";
  if (paate === "json") return "json";
  return null;
}

// ------------------------------------------------------------
// Luku
// ------------------------------------------------------------

/** Excel-solun arvo tavalliseksi arvoksi (kaavat, linkit, muotoiltu teksti). */
function solunArvo(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  if ("result" in v) return solunArvo(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("text" in v) return typeof v.text === "string" ? v.text : solunArvo(v.text as ExcelJS.CellValue);
  if ("error" in v) return null;
  return String(v);
}

async function lueXlsx(tavut: Uint8Array): Promise<Taulukko[]> {
  const kirja = new ExcelJS.Workbook();
  try {
    await kirja.xlsx.load(tavut.buffer.slice(tavut.byteOffset, tavut.byteOffset + tavut.byteLength) as ArrayBuffer);
  } catch {
    throw new TiedostoVirhe("Excel-tiedostoa ei voitu lukea. Tallenna se .xlsx-muodossa.");
  }
  const taulukot: Taulukko[] = [];
  kirja.eachSheet((lehti) => {
    const rivit: Taulukko["rivit"] = [];
    lehti.eachRow({ includeEmpty: false }, (rivi, nro) => {
      const solut: unknown[] = [];
      for (let i = 1; i <= lehti.columnCount; i++) solut.push(solunArvo(rivi.getCell(i).value));
      if (solut.some((s) => s !== null && String(s).trim() !== "")) rivit.push({ nro, solut });
    });
    taulukot.push({ nimi: lehti.name, rivit });
  });
  return taulukot;
}

function lueCsv(tavut: Uint8Array): Taulukko[] {
  const rivit = jasennaCsv(puraTeksti(tavut));
  return [
    {
      rivit: rivit
        .map((solut, i) => ({ nro: i + 1, solut }))
        .filter(({ solut }) => solut.some((k) => k.trim() !== "")),
    },
  ];
}

/** Olioiden lista taulukoksi: otsikot ovat avainten yhdiste. */
function oliotTaulukoksi(nimi: string | undefined, oliot: unknown): Taulukko {
  if (!Array.isArray(oliot)) throw new TiedostoVirhe(`JSON-kohteen "${nimi ?? ""}" pitää olla lista rivejä`);
  const otsikot: string[] = [];
  for (const o of oliot) {
    if (typeof o !== "object" || o === null) throw new TiedostoVirhe("JSON-rivin pitää olla olio");
    for (const k of Object.keys(o)) if (!otsikot.includes(k)) otsikot.push(k);
  }
  return {
    nimi,
    rivit: [
      { nro: 1, solut: otsikot },
      ...oliot.map((o, i) => ({ nro: i + 2, solut: otsikot.map((k) => (o as Record<string, unknown>)[k] ?? null) })),
    ],
  };
}

function lueJson(tavut: Uint8Array): Taulukko[] {
  let data: unknown;
  try {
    data = JSON.parse(puraTeksti(tavut));
  } catch {
    throw new TiedostoVirhe("JSON-tiedosto ei ole kelvollista JSONia");
  }
  if (Array.isArray(data)) return [oliotTaulukoksi(undefined, data)];
  if (typeof data === "object" && data !== null && "kohteet" in data) {
    const kohteet = (data as { kohteet: Record<string, unknown> }).kohteet;
    return Object.entries(kohteet).map(([nimi, rivit]) => oliotTaulukoksi(nimi, rivit));
  }
  throw new TiedostoVirhe('JSON-tiedoston pitää olla lista rivejä tai varmuuskopio, jossa on "kohteet"');
}

export async function lueTiedosto(tavut: Uint8Array, muoto: Muoto): Promise<Taulukko[]> {
  if (muoto === "xlsx") return lueXlsx(tavut);
  if (muoto === "json") return lueJson(tavut);
  return lueCsv(tavut);
}

// ------------------------------------------------------------
// Kirjoitus
// ------------------------------------------------------------

export interface VietavaKohde {
  kohde: Kohde;
  rivit: Arvot[];
}

export const SISALTOTYYPIT: Record<Muoto, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json; charset=utf-8",
};

export function kirjoitaCsv({ kohde, rivit }: VietavaKohde): string {
  const s = kohde.sarakkeet;
  return muodostaCsv([s.map((x) => x.otsikko), ...rivit.map((r) => s.map((x) => muotoileCsv(r[x.avain], x)))]);
}

export function kirjoitaJson(kohteet: VietavaKohde[], viety: Date): string {
  const data = {
    muoto: JSON_MUOTO,
    versio: 1,
    viety: viety.toISOString(),
    kohteet: Object.fromEntries(
      kohteet.map(({ kohde, rivit }) => [
        kohde.avain,
        rivit.map((r) => Object.fromEntries(kohde.sarakkeet.map((s) => [s.avain, muotoileJson(r[s.avain], s)]))),
      ])
    ),
  };
  return JSON.stringify(data, null, 2);
}

function xlsxMuotoilu(s: Sarake): string | undefined {
  if (s.tyyppi === "euro") return '#,##0.00 "€"';
  if (s.tyyppi === "pvm") return "d.m.yyyy";
  return undefined;
}

/** Excel-välilehden nimi: enintään 31 merkkiä, ei merkkejä \ / ? * [ ] : */
export function valilehdenNimi(kohde: Kohde): string {
  return kohde.nimi.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
}

function lisaaValilehti(kirja: ExcelJS.Workbook, { kohde, rivit }: VietavaKohde) {
  const lehti = kirja.addWorksheet(valilehdenNimi(kohde), { views: [{ state: "frozen", ySplit: 1 }] });
  lehti.columns = kohde.sarakkeet.map((s) => ({
    header: s.otsikko,
    key: s.avain,
    width: Math.max(12, Math.min(40, s.otsikko.length + 4)),
    style: { numFmt: xlsxMuotoilu(s) },
  }));
  const otsikko = lehti.getRow(1);
  otsikko.font = { bold: true };
  kohde.sarakkeet.forEach((s, i) => {
    const solu = otsikko.getCell(i + 1);
    // Vain viennissä olevat sarakkeet harmaalla, pakolliset lihavoituna ja tähdellä huomautuksessa.
    solu.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.vainVienti ? "FFE7E6E1" : "FFF4F3EF" } };
    const huom = [tyypinKuvaus(s), s.pakollinen ? "pakollinen" : null, s.vainVienti ? "vain vienti, ohitetaan tuonnissa" : null, s.kuvaus]
      .filter(Boolean)
      .join(". ");
    solu.note = huom;
  });
  for (const r of rivit) {
    lehti.addRow(Object.fromEntries(kohde.sarakkeet.map((s) => [s.avain, muotoileXlsx(r[s.avain], s)])));
  }
  if (rivit.length > 0) lehti.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kohde.sarakkeet.length } };
}

function lisaaOhjeet(kirja: ExcelJS.Workbook, kohteet: Kohde[]) {
  const lehti = kirja.addWorksheet("Ohjeet");
  lehti.columns = [
    { header: "Välilehti", key: "lehti", width: 28 },
    { header: "Sarake", key: "sarake", width: 26 },
    { header: "Muoto", key: "muoto", width: 34 },
    { header: "Pakollinen", key: "pakollinen", width: 11 },
    { header: "Selite", key: "selite", width: 70 },
  ];
  lehti.getRow(1).font = { bold: true };
  lehti.addRow({
    lehti: "Yleistä",
    selite:
      "Tyhjä solu tai puuttuva sarake jättää kentän ennalleen. Harmaat sarakkeet ovat vain vientiä varten. Välilehtiä voi poistaa, ja ne tuodaan tässä järjestyksessä.",
  });
  for (const k of kohteet) {
    lehti.addRow({ lehti: valilehdenNimi(k), selite: `${k.kuvaus} Tunnistus: ${k.tunnistus}` }).font = { bold: true };
    for (const s of k.sarakkeet) {
      lehti.addRow({
        lehti: "",
        sarake: s.otsikko,
        muoto: tyypinKuvaus(s),
        pakollinen: s.pakollinen ? "kyllä" : "",
        selite: [s.vainVienti ? "Vain vienti." : null, s.kuvaus].filter(Boolean).join(" "),
      });
    }
  }
}

export async function kirjoitaXlsx(kohteet: VietavaKohde[], ohjeet = true): Promise<Uint8Array> {
  const kirja = new ExcelJS.Workbook();
  kirja.creator = "Toiminnanohjaus";
  kirja.created = new Date();
  for (const k of kohteet) lisaaValilehti(kirja, k);
  if (ohjeet) lisaaOhjeet(kirja, kohteet.map((k) => k.kohde));
  return new Uint8Array(await kirja.xlsx.writeBuffer());
}

/** Tuontipohja: otsikot ja yksi esimerkkirivi. */
export function pohjanRivit(kohde: Kohde): Arvot[] {
  const esimerkki: Arvot = {};
  for (const s of kohde.sarakkeet) {
    if (s.vainVienti || s.esimerkki === undefined) continue;
    esimerkki[s.avain] = s.tyyppi === "euro" && typeof s.esimerkki === "number" ? s.esimerkki * 100 : s.esimerkki;
  }
  return [esimerkki];
}
