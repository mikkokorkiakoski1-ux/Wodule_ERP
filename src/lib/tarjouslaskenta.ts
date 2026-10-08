/**
 * Tarjouslaskuri: Woodcomp Modulesin kustannusarviolaskurin laskenta.
 *
 * Suora portaus laskurista taustamateriaali/Woodcomp_Kustannusarviolaskuri.html
 * (joka puolestaan replikoi Excelin Laskuri / asetukset / Asetukset2
 * -välilehdet). Kaavat ja rivit on pidetty identtisinä: testit
 * (tarjouslaskenta.test.ts) vertaavat tuloksia alkuperäisen laskurin
 * laskemiin arvoihin. Harjakaton päätykolmion korjauskerroin (gableFactor)
 * on mukana kuten alkuperäisessä.
 *
 * Jokainen laskentarivi kuuluu litteraan (Talo 80) ja on rakenneosa
 * kirjastossa (StructureType.laskuriAvain = rivin avain). Määrät lasketaan
 * täällä syötteistä; yksikköhinnat tulevat kirjastosta (hinnat-parametri),
 * ja oletuksena ovat alkuperäisen laskurin hinnat.
 *
 * Puhdas moduuli ilman tietokantaa: käytössä sekä palvelimella että
 * selaimen laskurissa (TarjouslaskuriClient).
 */

export const KATOT = [
  "Pulpetti 3° lyhemmän lappeen suuntaan",
  "Pulpetti 3° pidemmän lappeen suuntaa",
  "Harjakatto loiva 19,5°",
  "Harjakatto jyrkkä 43°",
] as const;
export const SISAKATOT = ["Lappeen suuntainen", "Tasakatto"] as const;
export const PORTAAT: Record<string, { hinta: number; tunnit: number }> = {
  "Suora avoporras 600/60° (Loimu)": { hinta: 449.92, tunnit: 3 },
  "kierreporras Ø1200": { hinta: 1399.34, tunnit: 8 },
  "L-porras  umpi 650": { hinta: 1972.84, tunnit: 6 },
};
export const KEITTIOT: Record<string, number> = {
  ei: 0,
  XS: 977.89,
  "S Basic": 1587.1195219123508,
  "S Plus": 2796.93625498008,
  "M Basic": 1859.940239043825,
  "M Plus": 3399.5019920318728,
  "L Plus": 3934.9003984063747,
  "XL Plus": 4609.434262948207,
};

export interface Syote {
  leveys: number; // mm, ulkoseinien mukaan
  pituus: number; // mm
  terassi: number; // katetun terassin ala m2
  sisakorkeus: number; // mm, matalin reuna
  katto: (typeof KATOT)[number];
  sisakatto: (typeof SISAKATOT)[number];
  raystas: number; // mm
  parvi: boolean;
  parviAla: number; // m2
  porras: string;
  ikkKiinteaKpl: number;
  ikkKiinteaAla: number; // m2
  ikkAvattavaKpl: number;
  ikkAvattavaAla: number; // m2
  umpiovet: number;
  terassiovet: number;
  kph: boolean;
  kphAla: number; // m2
  sauna: boolean;
  saunaAla: number; // m2
  keittio: string;
  eteisenKomero: number;
  makuuhuoneenKomero: number;
  takka: number;
  ilp: number;
  lattialammitysKuiva: boolean;
  /** Harjakaton päätykolmion kustannuskerroin %, 0-100 (korjaus; alkuperäinen Excel = 100). */
  paatykolmio: number;
  /** Kate % myyntihinnasta. */
  kate: number;
  /** Jälleenmyyjän (Puumesta) kate %. */
  katePuumesta: number;
}

export const OLETUSSYOTE: Syote = {
  leveys: 3700,
  pituus: 8100,
  terassi: 0,
  sisakorkeus: 2400,
  katto: "Harjakatto jyrkkä 43°",
  sisakatto: "Lappeen suuntainen",
  raystas: 200,
  parvi: true,
  parviAla: 8.9,
  porras: "Suora avoporras 600/60° (Loimu)",
  ikkKiinteaKpl: 3,
  ikkKiinteaAla: 8.5,
  ikkAvattavaKpl: 1,
  ikkAvattavaAla: 0.08,
  umpiovet: 1,
  terassiovet: 0,
  kph: true,
  kphAla: 2.7,
  sauna: false,
  saunaAla: 2.7,
  keittio: "ei",
  eteisenKomero: 0,
  makuuhuoneenKomero: 0,
  takka: 0,
  ilp: 0,
  lattialammitysKuiva: false,
  paatykolmio: 50,
  kate: 25,
  katePuumesta: 10,
};

/** Tallennetusta (mahdollisesti vajaasta) JSONista täydellinen syöte oletuksilla. */
export function taydennaSyote(arvo: unknown): Syote {
  const o = arvo && typeof arvo === "object" ? (arvo as Record<string, unknown>) : {};
  const s = { ...OLETUSSYOTE } as Record<string, unknown>;
  for (const [k, v] of Object.entries(OLETUSSYOTE)) {
    const x = o[k];
    if (typeof v === "number" && typeof x === "number" && Number.isFinite(x)) s[k] = x;
    if (typeof v === "boolean" && typeof x === "boolean") s[k] = x;
    if (typeof v === "string" && typeof x === "string") s[k] = x;
  }
  if (!KATOT.includes(s.katto as Syote["katto"])) s.katto = OLETUSSYOTE.katto;
  if (!SISAKATOT.includes(s.sisakatto as Syote["sisakatto"])) s.sisakatto = OLETUSSYOTE.sisakatto;
  return s as unknown as Syote;
}

export type KustannusLaji = "MATERIAALI" | "TEHDASTYO" | "ALIURAKKA";

export interface Littera {
  koodi: string;
  nimi: string;
}

/** Laskurin litterat (Talo 80) järjestyksessä. */
export const LITTERAT: Littera[] = [
  { koodi: "300", nimi: "Suunnittelu ja tutkimukset" },
  { koodi: "3300", nimi: "Laatat ja palkit" },
  { koodi: "3500", nimi: "Elementtituotanto" },
  { koodi: "3700", nimi: "Ullakko- ja kattorakenteet" },
  { koodi: "3801", nimi: "Tilaelementit" },
  { koodi: "4100", nimi: "Ikkunat" },
  { koodi: "4200", nimi: "Erityisikkunat" },
  { koodi: "4300", nimi: "Ovet" },
  { koodi: "4750", nimi: "Kaiteet ja portaat" },
  { koodi: "5000", nimi: "Pintarakenteet" },
  { koodi: "5100", nimi: "Vesikaton pintarakenteet" },
  { koodi: "5200", nimi: "Laatoitus" },
  { koodi: "5300", nimi: "Sisäkattojen pintarakenteet" },
  { koodi: "5500", nimi: "Ulkoseinien pintarakenteet" },
  { koodi: "5600", nimi: "Lattian pintarakenteet" },
  { koodi: "5700", nimi: "Erityistilojen pintarakenteet" },
  { koodi: "5800", nimi: "Maalaus ja tasoitetyöt" },
  { koodi: "6100", nimi: "Asuintilojen kalusteet" },
  { koodi: "6110", nimi: "Kylpyhuone ja WC-kalusteet" },
  { koodi: "6120", nimi: "Muut kalusteet" },
  { koodi: "6200", nimi: "Varusteet" },
  { koodi: "6300", nimi: "Koneet ja laitteet" },
  { koodi: "7100", nimi: "LVI-asennustyöt" },
  { koodi: "7110", nimi: "Lämpöjohdot" },
  { koodi: "7120", nimi: "Käyttövesi" },
  { koodi: "7130", nimi: "Viemäri" },
  { koodi: "7200", nimi: "Ilmanvaihtotyöt" },
  { koodi: "7300", nimi: "Sähkötyöt" },
  { koodi: "9630", nimi: "Takuuajan kustannukset" },
];

export interface Laskentarivi {
  /** Pysyvä tunniste, myös rakenneosan koodi kirjastossa (esim. "3500-01"). */
  avain: string;
  littera: string;
  nimi: string;
  yksikko: string;
  /** Alkuperäisen laskurin yksikköhinta, € (alv 0 %). */
  hinta: number;
  laji: KustannusLaji;
}

const T = "TEHDASTYO" as const;
const A = "ALIURAKKA" as const;

// [avain, nimi, yksikkö, hinta €, laji]. Järjestys = alkuperäisen laskurin rivijärjestys.
const RIVIT_DATA: [string, string, string, number, KustannusLaji?][] = [
  ["300-01", "Rakennesuunnittelu", "erä", 481],
  ["300-02", "LVI-suunnittelu", "erä", 148],
  ["300-03", "Sähkösuunnittelu", "erä", 111],
  ["3300-01", "Tilaelementin yläpohja, tupa", "m2", 45],
  ["3300-02", "Tilaelementin yläpohja, terassi", "m2", 17.4],
  ["3300-03", "AP Tervas Airi", "m2", 44],
  ["3300-04", "AP terassi Tervas", "m2", 24],
  ["3300-05", "Kylppärin tulppalattia", "m2", 135],
  ["3300-06", "Saunan tulppalattia", "m2", 135],
  ["3300-07", "Tulppalattian asennustyöt", "m2", 15],
  ["3300-08", "Lattioiden suojaaminen", "m2", 1],
  ["3500-01", "Ulkoseinä, tupa", "m2", 41.44],
  ["3500-02", "Ulkoseinä, pieliseinät", "m2", 12.5],
  ["3500-03", "Väliseinä, KPH", "m2", 37],
  ["3500-04", "Väliseinä, sauna", "m2", 37],
  ["3500-05", "Ulkoverhous, materiaali", "m2", 14],
  ["3500-06", "Ulkoverhous, terassin alakatto", "m2", 14],
  ["3500-07", "Paneloinnit tehtaalla, työ", "m2", 6.9, T],
  ["3700-01", "Räystäät, työ", "jm", 10, T],
  ["3700-02", "Räystäät, materiaali", "jm", 15],
  ["3700-03", "Otsalaudat", "jm", 2],
  ["3700-04", "Ristikot", "m2", 11.84],
  ["3801-01", "Tilaelementtien tehdastyö", "m2", 100, T],
  ["3801-02", "Seinäelementtien rakennustyöt", "m2", 14, T],
  ["3801-03", "Saunan seinäelementtien rakennustyöt", "m2", 20, T],
  ["3801-04", "KPH seinäelementtien rakennustyöt", "m2", 19.98, T],
  ["3801-05", "Kattoelementin rakennustyöt", "m2", 15, T],
  ["3801-06", "Ristikkokaton lohkon lisärakennustyöt", "m2", 32.56, T],
  ["3801-07", "Varastokulutus", "erä", 50],
  ["3801-08", "Tilaelementin pakkausmateriaalit", "erä", 250],
  ["4100-01", "Ikkunat", "€", 1],
  ["4100-02", "Vesipellit", "kpl", 37],
  ["4100-03", "Tiivistys ja teippaus", "kpl", 25, T],
  ["4200-01", "Hätäpoistumisikkuna parvelle", "kpl", 185],
  ["4300-01", "Kokolasinen ulko-ovi", "kpl", 540],
  ["4300-02", "Väliovet, KPH", "kpl", 320],
  ["4300-03", "Painike, ulko-ovi", "kpl", 29],
  ["4300-04", "Lukitus Abloy Classic", "kpl", 125],
  ["4300-05", "Ulko-ovi, umpi", "kpl", 555],
  ["4300-06", "Saunan lasiovi", "kpl", 150],
  ["4750-01", "Parven kaide", "kpl", 96.2],
  ["4750-02", "Parven kaiteen työt", "kpl", 159.84, T],
  ["4750-03", "Porras parvelle", "€", 1],
  ["4750-04", "Portaan asennus", "h", 26.64, T],
  ["5000-01", "Peitelistat, ovi-/ikkunalistat", "jm", 2.5],
  ["5000-02", "Sisäseinäpaneelin asennus", "m2", 10.8, T],
  ["5100-01", "Huopakate tarvikkeineen", "m2", 12],
  ["5100-02", "Huopakate asennus tehtaalla", "m2", 9, T],
  ["5100-03", "Vesikourut P150", "jm", 13],
  ["5200-01", "Vedeneriste, materiaali", "m2", 23],
  ["5200-02", "Vedeneriste, työ", "m2", 20, T],
  ["5200-03", "Laattalattia", "m2", 33],
  ["5200-04", "Lattialaatan asennus", "m2", 30, T],
  ["5200-05", "Lattian tasoitus", "m2", 20, T],
  ["5200-06", "Lattian tasoite", "m2", 35],
  ["5200-07", "Lattiakaivon kannet", "kpl", 15],
  ["5200-08", "Silikoni", "m2", 6.4],
  ["5200-09", "Saumausaineet", "m2", 3.06],
  ["5300-01", "Sisäkatot, kuusipaneeli", "m2", 15.5],
  ["5300-02", "Sisäkattopaneelin asennus", "m2", 17.15, T],
  ["5300-03", "Kattolistat", "jm", 1.15],
  ["5500-01", "Ulkopuolen smyygit", "kpl", 15],
  ["5600-01", "Vinyyli, kuivat tilat", "m2", 25.5],
  ["5600-02", "Jalkalistat tupaan", "jm", 1.2],
  ["5600-03", "Lattian asennus", "m2", 13, T],
  ["5600-04", "Parven lautalattia", "m2", 19.684],
  ["5600-05", "Lautalattian asennus", "m2", 8.88, T],
  ["5700-01", "Pesuhuoneen koolaus + tinapaperi", "m2", 6],
  ["5800-01", "Sisäpuolen maalaus, puunsuoja (tupa)", "m2", 8, T],
  ["5800-02", "Maalit / puunsuojat (tupa)", "m2", 2.5],
  ["5800-03", "Sisäpuolen maalaus, puunsuoja (sauna)", "m2", 8, T],
  ["5800-04", "Maalit / puunsuojat (sauna)", "m2", 2.5],
  ["6100-01", "Keittiökalusteet (sis. sähköt)", "€", 1],
  ["6110-01", "Talotekniikan peiteseinät", "kpl", 148],
  ["6110-02", "Allaskaappi", "kpl", 296],
  ["6110-03", "Allas kaappiin", "kpl", 115.2],
  ["6120-01", "Eteisen tankokomero", "kpl", 281.2],
  ["6120-02", "Komero, makuuhuone", "kpl", 236.8],
  ["6200-01", "Suihkukaappi", "kpl", 681.6],
  ["6200-02", "Koukusto 2-os., WC", "kpl", 10],
  ["6200-03", "WC-paperitelineet", "kpl", 10],
  ["6200-04", "Peili 600×600, WC", "kpl", 65],
  ["6200-05", "Lauteiden asennus", "kpl", 108.04, T],
  ["6200-06", "Takka Contura 810 + piippu", "kpl", 1850, T],
  ["6200-07", "Valmislauteet Thermory", "kpl", 450],
  ["6300-01", "Kiukaan asennus", "kpl", 27, T],
  ["6300-02", "Sähkökiuas Harvia Vega Compact", "kpl", 180],
  ["7100-01", "Lämpö-, vesi- ja viemäriasennustyöt", "h", 27, A],
  ["7110-01", "Ilmalämpöpumppu", "kpl", 1890],
  ["7120-01", "LVI-kalusteet", "erä", 650],
  ["7120-02", "Käyttövesiputket", "erä", 450],
  ["7120-03", "Varaaja", "kpl", 410],
  ["7130-01", "Viemärin putket", "erä", 200],
  ["7130-02", "Vilpet", "erä", 94],
  ["7200-01", "IV-kanavat + osat", "m2", 7.4],
  ["7200-02", "PAX passad 31", "kpl", 144.34],
  ["7200-03", "Seinäventtiili Ø125mm", "kpl", 30.26],
  ["7300-01", "Sähkötyöt ja materiaalit tehtaalla", "€", 1, A],
  ["7300-02", "Sähkötyöt KPH", "erä", 703],
  ["7300-03", "Lattialämmitys KPH", "erä", 225],
  ["7300-04", "Parven sähköt", "erä", 192.4, A],
  ["7300-05", "Lattialämmitys, kuiva tila", "m2", 77.34],
  ["7300-06", "Saunan sähköt", "erä", 140],
  ["9630-01", "Takuukorjaukset töineen", "erä", 400],
];

export const LASKENTARIVIT: Laskentarivi[] = RIVIT_DATA.map(([avain, nimi, yksikko, hinta, laji]) => ({
  avain,
  littera: avain.split("-")[0],
  nimi,
  yksikko,
  hinta,
  laji: laji ?? "MATERIAALI",
}));

export interface Geometria {
  /** Bruttoala (B-m2) = leveys × pituus. */
  bruttoala: number;
  /** Sisämittojen ala. */
  sisaala: number;
  /** Ulkoseinien ala (korjattu päätykolmiolla). */
  ulkoseinat: number;
  ulkoseinatAlkuperainen: number;
  vesikatto: number;
  sisakatto: number;
  raystaat: number;
  paatykolmio: number;
  harjakatto: boolean;
}

/** Laskurin määrät riveittäin (avain -> määrä) ja geometria. Kaavat kuten alkuperäisessä. */
export function laskeMaarat(s: Syote): { maarat: Record<string, number>; geometria: Geometria } {
  const deg = (d: number) => (d * Math.PI) / 180;
  const C7 = s.leveys / 1000;
  const C8 = s.pituus / 1000;
  const C3 = C7 * C8;
  const C4 = (C7 - 0.47) * (C8 - 0.47);
  const C9 = 2 * (C7 + C8);
  const C13 = s.raystas / 1000;
  const C12 = s.sisakorkeus / 1000;
  const C10 = C7 ? s.terassi / C7 : 0;

  const F7 = C7 * C8;
  const F9 = C9 * C12;
  const F10 = C7 * C10;
  const F11 = s.terassi === 0 ? 0 : (C7 + 2 * C13) * (C10 + C13);

  const jyrkka = s.katto === "Harjakatto jyrkkä 43°";
  const loiva = s.katto === "Harjakatto loiva 19,5°";
  const harja = jyrkka || loiva;

  let tri: number, F_lap: number, H_sk: number;
  if (s.katto === "Pulpetti 3° lyhemmän lappeen suuntaan") {
    tri = Math.tan(deg(3)) * C7 * C7;
    F_lap = ((C7 + 2 * C13) / Math.cos(deg(3))) * (2 * C13 + C8);
    H_sk = ((C7 - 0.4) / Math.cos(deg(3))) * (C8 - 0.4);
  } else if (s.katto === "Pulpetti 3° pidemmän lappeen suuntaa") {
    tri = Math.tan(deg(3)) * C8 * C8;
    F_lap = ((C8 + 2 * C13) / Math.cos(deg(3))) * (2 * C13 + C7);
    H_sk = ((C8 - 0.4) / Math.cos(deg(3))) * (C7 - 0.4);
  } else if (loiva) {
    tri = Math.tan(deg(19.5)) * (C7 / 2) * C7;
    F_lap = ((C7 / 2 + C13) / Math.cos(deg(19.5))) * 2 * (C8 + 2 * C13);
    H_sk = ((C7 - 0.4) / Math.cos(deg(19.5))) * (C8 - 0.4);
  } else {
    tri = Math.tan(deg(43)) * (C7 / 2) * C7;
    F_lap = ((C7 / 2 + C13) / Math.cos(deg(43))) * 2 * (C8 + 2 * C13);
    H_sk = ((C7 - 0.4) / Math.cos(deg(43))) * (C8 - 0.4);
  }

  const F12 = F_lap + F11;
  const F13 = s.sisakatto === "Tasakatto" ? C4 : H_sk;
  const F14 = Math.sqrt(F12) * 4;

  const gf = harja ? s.paatykolmio / 100 : 1.0;
  const F8 = 2 * (C7 + C8) * (C12 + 0.3) + tri * gf;
  const F8_alkup = 2 * (C7 + C8) * (C12 + 0.3) + tri;

  const B21 = harja ? 1 : 0;

  const B35w = s.ikkKiinteaKpl;
  const D35 = B35w * 300;
  const B36w = s.ikkKiinteaAla;
  const D36 = B36w * 210;
  const F35 = B35w === 0 ? 0 : Math.max(D35, D36);
  const B37w = s.ikkAvattavaKpl;
  const D37 = B37w * 251;
  const B38w = s.ikkAvattavaAla;
  const D38 = B38w * 353;
  const F37 = B37w === 0 ? 0 : Math.max(D37, D38);
  const H35 = F35 + F37;

  const B41 = s.umpiovet;
  const B42 = s.terassiovet;
  const B46 = s.kph ? s.kphAla : 0;
  const F44 = B46 > 0 ? Math.sqrt(B46) * 2 * 2.4 : 0;
  const B49 = s.sauna ? s.saunaAla : 0;
  const F49 = B49 > 0 ? Math.sqrt(B49) * 2 * 2.4 : 0;
  const B53 = C4 - B46 - B49;

  const E57 = s.keittio in KEITTIOT ? KEITTIOT[s.keittio] : 0;
  const porras = PORTAAT[s.porras] ?? { hinta: 0, tunnit: 0 };
  const C30 = s.parvi ? porras.hinta : 0;
  const E30 = s.parvi ? porras.tunnit : 0;
  const B28 = s.parviAla;
  const kph = s.kph ? 1 : 0;
  const sauna = s.sauna ? 1 : 0;
  const parvi = s.parvi ? 1 : 0;

  const K21 = B46;
  const K22 = B49;
  const K32 = s.terassi === 0 ? 0 : 5;
  const K34 = F49;
  const K35 = F8 + 2 * K32;
  const K37 = s.terassi === 0 ? 0 : F10;
  const K75 = B42;
  const K80 = B41;
  const K107 = B36w + B38w > 0 ? Math.sqrt(B36w + B38w) * 4 * 1.5 : 0;
  const Kwet = s.kph ? B46 * 1.2 : 0;
  const K141 = F7 - B46 - B49;
  const K144 = s.parvi ? B28 : 0;
  const K152 = F9 + F13 + 2 * F44;
  const K154 = s.sauna ? B49 + F49 * 2 : 0;

  const maarat: Record<string, number> = {
    "300-01": 1,
    "300-02": 1,
    "300-03": 1,
    "3300-01": F13,
    "3300-02": F10,
    "3300-03": F7,
    "3300-04": F10,
    "3300-05": K21,
    "3300-06": K22,
    "3300-07": K21 + K22,
    "3300-08": C4,
    "3500-01": F8,
    "3500-02": K32,
    "3500-03": F44,
    "3500-04": K34,
    "3500-05": K35,
    "3500-06": K37,
    "3500-07": K35 + K37,
    "3700-01": F14,
    "3700-02": F14,
    "3700-03": F14,
    "3700-04": (C4 + F10) * B21,
    "3801-01": F7 + F10,
    "3801-02": F8,
    "3801-03": K34,
    "3801-04": s.kph ? F44 : 0,
    "3801-05": F12,
    "3801-06": B21 * C3,
    "3801-07": 1,
    "3801-08": 1,
    "4100-01": H35,
    "4100-02": B35w + B38w,
    "4100-03": B35w + B38w + B41 + B42,
    "4200-01": parvi,
    "4300-01": K75,
    "4300-02": kph,
    "4300-03": K75 + K80,
    "4300-04": K75 + K80,
    "4300-05": K80,
    "4300-06": sauna,
    "4750-01": parvi,
    "4750-02": parvi,
    "4750-03": C30,
    "4750-04": E30,
    "5000-01": K107,
    "5000-02": F9 + (F44 + F49) * 2,
    "5100-01": F12,
    "5100-02": F12,
    "5100-03": s.katto === "Pulpetti 3° pidemmän lappeen suuntaa" ? 4 : 0,
    "5200-01": Kwet,
    "5200-02": Kwet,
    "5200-03": Kwet,
    "5200-04": Kwet,
    "5200-05": Kwet,
    "5200-06": Kwet,
    "5200-07": kph,
    "5200-08": s.kph ? B46 : 0,
    "5200-09": s.kph ? B46 : 0,
    "5300-01": F13,
    "5300-02": F13,
    "5300-03": 40,
    "5500-01": B35w + B38w + B41 + B42,
    "5600-01": K141,
    "5600-02": 21,
    "5600-03": K141,
    "5600-04": K144,
    "5600-05": K144,
    "5700-01": s.kph ? F44 : 0,
    "5800-01": K152,
    "5800-02": K152,
    "5800-03": K154,
    "5800-04": K154,
    "6100-01": E57,
    "6110-01": kph,
    "6110-02": kph,
    "6110-03": kph,
    "6120-01": s.eteisenKomero,
    "6120-02": s.makuuhuoneenKomero,
    "6200-01": kph,
    "6200-02": kph,
    "6200-03": kph,
    "6200-04": kph,
    "6200-05": sauna,
    "6200-06": s.takka,
    "6200-07": sauna,
    "6300-01": sauna,
    "6300-02": sauna,
    "7100-01": s.kph ? 20 : 0,
    "7110-01": s.ilp,
    "7120-01": kph,
    "7120-02": kph,
    "7120-03": kph,
    "7130-01": kph,
    "7130-02": kph,
    "7200-01": C3,
    "7200-02": kph,
    "7200-03": C3 / 6,
    "7300-01": 550 + C3 * 80,
    "7300-02": kph,
    "7300-03": kph,
    "7300-04": parvi,
    "7300-05": s.lattialammitysKuiva ? B53 : 0,
    "7300-06": sauna,
    "9630-01": 1,
  };

  return {
    maarat,
    geometria: {
      bruttoala: C3,
      sisaala: C4,
      ulkoseinat: F8,
      ulkoseinatAlkuperainen: F8_alkup,
      vesikatto: F12,
      sisakatto: F13,
      raystaat: F14,
      paatykolmio: tri,
      harjakatto: harja,
    },
  };
}

export interface LaskettuRivi extends Laskentarivi {
  maara: number;
  /** Yksikköhinta, jolla laskettiin (kirjasto tai oletus). */
  yksikkohinta: number;
  summa: number;
}

export interface Laskelma {
  rivit: LaskettuRivi[];
  geometria: Geometria;
  omakustannus: number;
  tehdastyo: number;
  aliurakka: number;
  kateEur: number;
  myyntihinta: number;
  katePuumestaEur: number;
  myyntihintaPuumesta: number;
  myyntihintaPuumestaAlv: number;
  /** € per bruttoala. */
  eurBm2: number;
}

export const ALV = 0.255;

/** Toteutuneet Woodcomp-projektit 2025, €/B-m2 ennen katetta (B-m2 < 100). */
export const VERTAILU = { min: 471.0, q1: 694.1, mediaani: 746.8, q3: 1093.4, max: 1723.8, keskiarvo: 863.9, n: 19 };

/**
 * Laskee laskelman. `hinnat` korvaa rivien yksikköhinnat (avain -> €),
 * esim. rakenneosakirjaston hinnoilla; puuttuvat käyttävät oletusta.
 */
export function laske(s: Syote, hinnat: Record<string, number> = {}): Laskelma {
  const { maarat, geometria } = laskeMaarat(s);
  const rivit = LASKENTARIVIT.map((r) => {
    const yksikkohinta = hinnat[r.avain] ?? r.hinta;
    const maara = maarat[r.avain] ?? 0;
    return { ...r, maara, yksikkohinta, summa: yksikkohinta * maara };
  });
  const summa = (ehto: (r: LaskettuRivi) => boolean) => rivit.filter(ehto).reduce((a, r) => a + r.summa, 0);
  const omakustannus = summa(() => true);
  const myyntihinta = omakustannus / (1 - s.kate / 100);
  const myyntihintaPuumesta = myyntihinta / (1 - s.katePuumesta / 100);
  return {
    rivit,
    geometria,
    omakustannus,
    tehdastyo: summa((r) => r.laji === "TEHDASTYO"),
    aliurakka: summa((r) => r.laji === "ALIURAKKA"),
    kateEur: myyntihinta - omakustannus,
    myyntihinta,
    katePuumestaEur: myyntihintaPuumesta - myyntihinta,
    myyntihintaPuumesta,
    myyntihintaPuumestaAlv: (1 + ALV) * myyntihintaPuumesta,
    eurBm2: geometria.bruttoala ? omakustannus / geometria.bruttoala : 0,
  };
}
