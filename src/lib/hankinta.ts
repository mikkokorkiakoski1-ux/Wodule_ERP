/**
 * Hankintasuunnitelman takarajat ja vaiheet.
 *
 * Vastaa projektinhallinnan Excelin Hankintasuunnitelma-välilehteä. Kaikki
 * lasketaan toimituspäivästä taaksepäin kalenteripäivinä:
 *
 *   Toimituspäivä = aikataulutehtävän ALOITUS (tai käsin annettu päivä)
 *   Sopimus       = Toimituspäivä - Toimitusaika vrk
 *   Vertailu      = Sopimus       - Urakkaneuvottelut
 *   Tarjous       = Vertailu      - Vertailuaika
 *   Pyyntö        = Tarjous       - Pyyntöaika
 *   Aineisto      = Pyyntö        - Aineiston keräys
 *
 * Kunkin vaiheen takaraja on päivä, johon mennessä vaihe pitää olla tehty.
 */
import { addDays, stripTime } from "@/lib/production-schedule";

export type Vaihe = "AINEISTO" | "PYYNTO" | "TARJOUS" | "VERTAILU" | "SOPIMUS" | "TOIMITUS" | "VALMIS" | "EI_TARVITA";

/** Vaiheet etenemisjärjestyksessä ja käyttäjälle näkyvät nimet. */
export const VAIHEET: { arvo: Vaihe; nimi: string; tehtava: string }[] = [
  { arvo: "AINEISTO", nimi: "Aineisto", tehtava: "Kerää aineisto" },
  { arvo: "PYYNTO", nimi: "Pyyntö", tehtava: "Lähetä tarjouspyyntö" },
  { arvo: "TARJOUS", nimi: "Tarjous", tehtava: "Odota tarjoukset" },
  { arvo: "VERTAILU", nimi: "Vertailu", tehtava: "Vertaile tarjoukset" },
  { arvo: "SOPIMUS", nimi: "Sopimus", tehtava: "Neuvottele ja sovi" },
  { arvo: "TOIMITUS", nimi: "Toimitus", tehtava: "Varmista toimitus" },
  { arvo: "VALMIS", nimi: "Valmis", tehtava: "Toimitettu" },
  { arvo: "EI_TARVITA", nimi: "Ei tarvita", tehtava: "Ei tarvita" },
];

export function vaiheenNimi(v: Vaihe): string {
  return VAIHEET.find((x) => x.arvo === v)?.nimi ?? v;
}

/** Seuraava vaihe; VALMIS ja EI_TARVITA ovat päätevaiheita. */
export function seuraavaVaihe(v: Vaihe): Vaihe | null {
  const etenevat: Vaihe[] = ["AINEISTO", "PYYNTO", "TARJOUS", "VERTAILU", "SOPIMUS", "TOIMITUS", "VALMIS"];
  const i = etenevat.indexOf(v);
  return i >= 0 && i < etenevat.length - 1 ? etenevat[i + 1] : null;
}

export function onPaattynyt(v: Vaihe): boolean {
  return v === "VALMIS" || v === "EI_TARVITA";
}

export interface VaiheidenKestot {
  materialDays: number;
  requestDays: number;
  comparisonDays: number;
  negotiationDays: number;
  deliveryDays: number;
}

export interface Takarajat {
  aineisto: Date;
  pyynto: Date;
  tarjous: Date;
  vertailu: Date;
  sopimus: Date;
  toimitus: Date;
}

export function laskeTakarajat(toimitus: Date, k: VaiheidenKestot): Takarajat {
  const sopimus = addDays(toimitus, -k.deliveryDays);
  const vertailu = addDays(sopimus, -k.negotiationDays);
  const tarjous = addDays(vertailu, -k.comparisonDays);
  const pyynto = addDays(tarjous, -k.requestDays);
  const aineisto = addDays(pyynto, -k.materialDays);
  return { aineisto, pyynto, tarjous, vertailu, sopimus, toimitus };
}

/** Vaiheen takaraja: päivä, johon mennessä nykyinen vaihe pitää saada tehdyksi. */
export function vaiheenTakaraja(v: Vaihe, t: Takarajat | null, sovittuToimitus: Date | null): Date | null {
  switch (v) {
    case "AINEISTO":
      return t?.aineisto ?? null;
    case "PYYNTO":
      return t?.pyynto ?? null;
    case "TARJOUS":
      return t?.tarjous ?? null;
    case "VERTAILU":
      return t?.vertailu ?? null;
    case "SOPIMUS":
      return t?.sopimus ?? null;
    case "TOIMITUS":
      // Sovittu toimituspäivä korvaa lasketun, kun se on tiedossa.
      return sovittuToimitus ?? t?.toimitus ?? null;
    default:
      return null;
  }
}

export type Kiireellisyys = "myohassa" | "lahestyy" | "ok" | "ei";

/** Myöhässä = takaraja ohi; lähestyy = takaraja seuraavan 7 päivän aikana. */
export function kiireellisyys(takaraja: Date | null, tanaan: Date = new Date()): Kiireellisyys {
  if (!takaraja) return "ei";
  const ero = (stripTime(takaraja) - stripTime(tanaan)) / 86400000;
  if (ero < 0) return "myohassa";
  if (ero <= 7) return "lahestyy";
  return "ok";
}
