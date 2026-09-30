/**
 * Sarakkeiden tyypit sekä arvojen tulkinta (tuonti) ja muotoilu (vienti).
 *
 * Tuonti on salliva: se hyväksyy suomalaiset ja kansainväliset muodot
 * (1 234,50 ja 1234.50; 31.12.2026 ja 2026-12-31; kyllä/ei ja true/false) sekä
 * Excelin natiivit luvut ja päivämäärät. Vienti on yksiselitteinen: CSV
 * noudattaa suomenkielisen Excelin muotoja, JSON kansainvälisiä muotoja.
 */

export type SarakeTyyppi =
  | "teksti"
  | "sahkoposti"
  | "url"
  | "ytunnus"
  | "luku"
  | "kokonaisluku"
  | "euro" // tallennetaan sentteinä, syötetään ja näytetään euroina
  | "pvm" // päivämäärä ilman kellonaikaa, tallennetaan UTC-keskiyönä
  | "aikaleima" // vain vienti (createdAt yms.)
  | "totuus"
  | "valinta";

export interface Valinta {
  arvo: string; // Prisma-enumin arvo, esim. "HYVAKSYTTY"
  nimi: string; // käyttäjälle näkyvä nimi, esim. "Hyväksytty"
}

export interface Sarake {
  avain: string;
  otsikko: string;
  tyyppi: SarakeTyyppi;
  pakollinen?: boolean;
  /** Sarake viedään mutta tuonnissa se ohitetaan (esim. lasketut arvot). */
  vainVienti?: boolean;
  kuvaus?: string;
  /** Muut hyväksytyt otsikot tuonnissa, esim. englanninkieliset. */
  aliakset?: string[];
  valinnat?: Valinta[];
  min?: number;
  max?: number;
  esimerkki?: Arvo;
}

/** Sarakkeen arvo sisäisessä muodossa. Euro-sarakkeissa arvo on sentteinä. */
export type Arvo = string | number | boolean | Date | null;

export type Jasennetty = { arvo: Arvo | undefined } | { virhe: string };

/** Pienet kirjaimet, ei aksentteja eikä välimerkkejä: "Y-tunnus" -> "ytunnus". */
export function normalisoi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function onTyhja(raaka: unknown): boolean {
  return raaka === null || raaka === undefined || (typeof raaka === "string" && raaka.trim() === "");
}

/** Tulkitsee luvun: "1 234,50", "1234.50", "1.234,50", "12,5 €". */
export function jasennaLuku(raaka: unknown): number | null {
  if (typeof raaka === "number") return isFinite(raaka) ? raaka : null;
  if (typeof raaka !== "string") return null;
  let s = raaka.replace(/[\s  €]|eur/gi, "").replace(/−/g, "-");
  if (s === "") return null;
  const pilkku = s.lastIndexOf(",");
  const piste = s.lastIndexOf(".");
  if (pilkku >= 0 && piste >= 0) {
    // Jälkimmäinen merkki on desimaalierotin, toinen tuhaterotin.
    s = pilkku > piste ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (pilkku >= 0) {
    s = s.replace(",", ".");
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

function utcPvm(v: number, kk: number, pv: number): Date | null {
  const d = new Date(Date.UTC(v, kk - 1, pv));
  if (d.getUTCFullYear() !== v || d.getUTCMonth() !== kk - 1 || d.getUTCDate() !== pv) return null;
  return d;
}

/** Excelin päivämääräsarjanumero (1900-järjestelmä) -> päivämäärä. */
function excelSarjanumerosta(n: number): Date | null {
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return utcPvm(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Tulkitsee päivämäärän: 31.12.2026, 31.12.26, 2026-12-31, ISO-aikaleima, Excelin Date tai sarjanumero. */
export function jasennaPvm(raaka: unknown): Date | null {
  if (raaka instanceof Date) {
    if (isNaN(raaka.getTime())) return null;
    return utcPvm(raaka.getUTCFullYear(), raaka.getUTCMonth() + 1, raaka.getUTCDate());
  }
  if (typeof raaka === "number") return excelSarjanumerosta(raaka);
  if (typeof raaka !== "string") return null;
  const s = raaka.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const vuosi = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return utcPvm(vuosi, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return utcPvm(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

const TOSI = new Set(["kylla", "k", "joo", "x", "true", "yes", "y", "1", "tosi", "on"]);
const EPATOSI = new Set(["ei", "e", "false", "no", "n", "0", "epatosi", "off"]);

export function jasennaTotuus(raaka: unknown): boolean | null {
  if (typeof raaka === "boolean") return raaka;
  if (typeof raaka === "number") return raaka === 1 ? true : raaka === 0 ? false : null;
  if (typeof raaka !== "string") return null;
  const s = normalisoi(raaka);
  if (TOSI.has(s)) return true;
  if (EPATOSI.has(s)) return false;
  return null;
}

/** Tarkistaa Y-tunnuksen tarkisteen ja palauttaa sen muodossa 1234567-8. */
export function jasennaYtunnus(raaka: string): string | null {
  const m = /^(\d{6,7})-?(\d)$/.exec(raaka.replace(/\s/g, ""));
  if (!m) return null;
  const numerot = m[1].padStart(7, "0");
  const painot = [7, 9, 10, 5, 8, 4, 2];
  const summa = painot.reduce((acc, p, i) => acc + p * Number(numerot[i]), 0);
  const jakojaannos = summa % 11;
  if (jakojaannos === 1) return null;
  const tarkiste = jakojaannos === 0 ? 0 : 11 - jakojaannos;
  if (tarkiste !== Number(m[2])) return null;
  return `${numerot}-${tarkiste}`;
}

/** Excel-/CSV-kaavojen suojaus: vienti lisää heittomerkin, tuonti poistaa sen. */
const KAAVAN_ALKU = /^[=+\-@\t\r]/;

function tekstiksi(raaka: unknown): string {
  if (raaka instanceof Date) return raaka.toISOString().slice(0, 10);
  const s = String(raaka).trim();
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

function rajatarkistus(n: number, s: Sarake): string | null {
  if (s.min !== undefined && n < s.min) return `pienin sallittu arvo on ${s.min}`;
  if (s.max !== undefined && n > s.max) return `suurin sallittu arvo on ${s.max}`;
  return null;
}

/**
 * Tulkitsee yhden solun. Tyhjä solu palauttaa `{ arvo: undefined }`, mikä
 * tarkoittaa "ei muutosta" (päivityksessä kenttään ei kosketa).
 */
export function jasennaArvo(raaka: unknown, s: Sarake): Jasennetty {
  if (onTyhja(raaka)) return { arvo: undefined };

  switch (s.tyyppi) {
    case "teksti":
      return { arvo: tekstiksi(raaka) };

    case "sahkoposti": {
      const t = tekstiksi(raaka);
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? { arvo: t } : { virhe: `"${t}" ei ole sähköpostiosoite` };
    }

    case "url": {
      const t = tekstiksi(raaka);
      try {
        const u = new URL(t);
        if (u.protocol === "http:" || u.protocol === "https:") return { arvo: t };
      } catch {
        // käsitellään alla
      }
      return { virhe: `"${t}" ei ole http(s)-osoite` };
    }

    case "ytunnus": {
      const t = tekstiksi(raaka);
      const y = jasennaYtunnus(t);
      return y ? { arvo: y } : { virhe: `"${t}" ei ole kelvollinen Y-tunnus (muoto 1234567-8, tarkiste)` };
    }

    case "luku":
    case "kokonaisluku":
    case "euro": {
      const n = jasennaLuku(raaka);
      if (n === null) return { virhe: `"${String(raaka)}" ei ole luku` };
      if (s.tyyppi === "kokonaisluku" && !Number.isInteger(n)) return { virhe: `${n} ei ole kokonaisluku` };
      const raja = rajatarkistus(n, s);
      if (raja) return { virhe: raja };
      return { arvo: s.tyyppi === "euro" ? Math.round(n * 100) : n };
    }

    case "pvm": {
      const d = jasennaPvm(raaka);
      return d ? { arvo: d } : { virhe: `"${String(raaka)}" ei ole päivämäärä (esim. 31.12.2026 tai 2026-12-31)` };
    }

    case "aikaleima":
      return { arvo: undefined };

    case "totuus": {
      const b = jasennaTotuus(raaka);
      return b === null ? { virhe: `"${String(raaka)}" ei ole kyllä/ei-arvo` } : { arvo: b };
    }

    case "valinta": {
      const n = normalisoi(String(raaka));
      const osuma = (s.valinnat ?? []).find((v) => normalisoi(v.arvo) === n || normalisoi(v.nimi) === n);
      if (osuma) return { arvo: osuma.arvo };
      const sallitut = (s.valinnat ?? []).map((v) => v.nimi).join(", ");
      return { virhe: `"${String(raaka)}" ei ole sallittu arvo (sallitut: ${sallitut})` };
    }
  }
}

// ------------------------------------------------------------
// Vienti
// ------------------------------------------------------------

function pvmSuomeksi(d: Date): string {
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

/** Aikaleima Suomen aikaan, esim. "30.9.2026 14.05". */
export function aikaleimaSuomeksi(d: Date): string {
  return d.toLocaleString("fi-FI", {
    timeZone: "Europe/Helsinki",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lukuSuomeksi(n: number, desimaalit?: number): string {
  const s = desimaalit === undefined ? String(n) : n.toFixed(desimaalit);
  return s.replace(".", ",");
}

function valinnanNimi(arvo: string, s: Sarake): string {
  return s.valinnat?.find((v) => v.arvo === arvo)?.nimi ?? arvo;
}

/** CSV-solu suomenkielisen Excelin muodossa. */
export function muotoileCsv(arvo: Arvo | undefined, s: Sarake): string {
  if (arvo === null || arvo === undefined) return "";
  switch (s.tyyppi) {
    case "euro":
      return lukuSuomeksi(Number(arvo) / 100, 2);
    case "luku":
    case "kokonaisluku":
      return lukuSuomeksi(Number(arvo));
    case "pvm":
      return arvo instanceof Date ? pvmSuomeksi(arvo) : String(arvo);
    case "aikaleima":
      return arvo instanceof Date ? aikaleimaSuomeksi(arvo) : String(arvo);
    case "totuus":
      return arvo ? "kyllä" : "ei";
    case "valinta":
      return valinnanNimi(String(arvo), s);
    default: {
      const t = String(arvo);
      return KAAVAN_ALKU.test(t) ? "'" + t : t;
    }
  }
}

/** JSON-arvo: ISO-päivämäärät, luvut lukuina, valinnat koodeina, eurot euroina. */
export function muotoileJson(arvo: Arvo | undefined, s: Sarake): string | number | boolean | null {
  if (arvo === null || arvo === undefined) return null;
  if (s.tyyppi === "euro") return Number(arvo) / 100;
  if (arvo instanceof Date) return s.tyyppi === "pvm" ? arvo.toISOString().slice(0, 10) : arvo.toISOString();
  return arvo;
}

/** Excel-solun arvo: luvut ja päivämäärät natiiveina, jotta niillä voi laskea. */
export function muotoileXlsx(arvo: Arvo | undefined, s: Sarake): string | number | Date | null {
  if (arvo === null || arvo === undefined) return null;
  switch (s.tyyppi) {
    case "euro":
      return Number(arvo) / 100;
    case "luku":
    case "kokonaisluku":
      return Number(arvo);
    case "pvm":
      return arvo instanceof Date ? arvo : String(arvo);
    case "aikaleima":
      return arvo instanceof Date ? aikaleimaSuomeksi(arvo) : String(arvo);
    case "totuus":
      return arvo ? "kyllä" : "ei";
    case "valinta":
      return valinnanNimi(String(arvo), s);
    default:
      return String(arvo);
  }
}

/** Sarakkeen tyypin kuvaus ohjeisiin ja pohjiin. */
export function tyypinKuvaus(s: Sarake): string {
  switch (s.tyyppi) {
    case "teksti":
      return "teksti";
    case "sahkoposti":
      return "sähköpostiosoite";
    case "url":
      return "verkko-osoite (http/https)";
    case "ytunnus":
      return "Y-tunnus, esim. 1234567-8";
    case "luku":
      return "luku, esim. 12,5";
    case "kokonaisluku":
      return "kokonaisluku";
    case "euro":
      return "euroa, esim. 1 234,50";
    case "pvm":
      return "päivämäärä, esim. 31.12.2026";
    case "aikaleima":
      return "aikaleima";
    case "totuus":
      return "kyllä / ei";
    case "valinta":
      return (s.valinnat ?? []).map((v) => v.nimi).join(" / ");
  }
}
