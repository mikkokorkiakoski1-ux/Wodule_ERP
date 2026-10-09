/**
 * Määräluettelon laskenta: rakennuksen riveistä johdetaan omakustannus,
 * materiaalitarve nimikkeittäin, kiinteähintaiset rivit ja tehtaan
 * tuntimenekki.
 *
 * Määräluettelon rivi on yksi kolmesta:
 *  - rakenneosa: hinta rakenneosan kiinteästä yksikköhinnasta tai sen
 *    materiaaliluettelosta (menekki × (1 + hukka-%) × nimikkeen hinta) ja
 *    työtunneista (määrä × työtuntinormi × tuntihinta)
 *  - nimike: määrä × nimikkeen hinnaston hinta
 *  - vapaa rivi: määrä × rivin oma yksikköhinta
 * Rivin oma yksikköhinta (unitPriceCents) korvaa aina muun hinnan, ja rivin
 * oma kustannuslaji ja littera korvaavat rakenneosan tiedot.
 *
 * Hinnoittelu ja materiaalitarve ovat erillään:
 *  - Hinta: kiinteähintainen rivi (oma hinta, kiinteähintainen rakenneosa
 *    tai vapaa rivi) hinnoitellaan kokonaisuutena, eikä materiaaliluettelo
 *    vaikuta hintaan. Näin tarjouslaskurin rivien hinnat pysyvät laskurin
 *    mukaisina.
 *  - Materiaalitarve: rakenneosan materiaaliluettelo lasketaan aina
 *    nimikkeittäin, myös kiinteähintaisilta riveiltä. Nimikerivit näkyvät
 *    aina materiaalitarpeessa.
 * Kiinteähintaiset rivit (laskeKiinteatRivit) kertovat, hankitaanko rivi
 * rakenneosana vai nimikkeinä (materiaaleina = rakenneosalla on
 * materiaaliluettelo). Kustannuslaji erittelee tehdastyön ja aliurakan.
 *
 * Puhtaita funktioita ilman tietokantaa, jotta ne voi testata
 * (src/lib/rakenteet.test.ts). Tietokantahaut ovat tiedostossa
 * src/lib/rakennukset.ts.
 *
 * HUOM: laskettu tuntimenekki on vertailuluku. Se ei kirjoitu
 * tuotantoaikataulun tuntimenekki- tai kesto-kenttiin (ks. CLAUDE.md,
 * tuotantoaikataulun laskenta).
 */

export interface Nimike {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface Materiaalirivi {
  productId: string;
  quantityPerUnit: number;
  wastePct: number;
  product: Nimike;
}

export type Kustannuslaji = "MATERIAALI" | "TEHDASTYO" | "ALIURAKKA";

export interface Littera {
  code: string;
  name: string;
}

export interface Rakenneosa {
  id: string;
  code: string;
  name: string;
  unit: string;
  laborHoursPerUnit: number;
  materials: Materiaalirivi[];
  /** Kiinteä yksikköhinta senteissä; null = hinta materiaaliluettelosta. */
  unitPriceCents?: number | null;
  costType?: Kustannuslaji;
  littera?: Littera | null;
}

/** Määräluettelon rivi (BuildingPart tai laskentapohjan rivi). */
export interface Maararivi {
  id?: string;
  quantity: number;
  structureType?: Rakenneosa | null;
  product?: Nimike | null;
  /** Vapaan rivin nimi; rakenneosa- ja nimikeriveillä lisäkuvaus. */
  description?: string | null;
  /** Vapaan rivin yksikkö. */
  unit?: string | null;
  /** Rivin oma yksikköhinta senteissä; korvaa muun hinnan. */
  unitPriceCents?: number | null;
  costType?: Kustannuslaji | null;
  littera?: Littera | null;
}

export interface Materiaalitarve {
  nimike: Nimike;
  maara: number;
  /** Rakenneosien koodit (tai "suora rivi"), joista tarve syntyy. */
  rakenteet: string[];
}

/** Hinnat nimikkeittäin (productId -> senttiä per nimikkeen yksikkö). */
export type Hinnat = Map<string, number>;

export interface Kustannus {
  /** Materiaalit ja ostot (materiaaliluettelot, nimikkeet, kiinteähintaiset materiaalirivit). */
  materiaalitSentit: number;
  /** Tehdastyö (työtunnit × tuntihinta + kiinteähintaiset tehdastyörivit). */
  tyoSentit: number;
  /** Kiinteähintaiset aliurakkarivit. */
  aliurakkaSentit: number;
  yhteensaSentit: number;
  tunnit: number;
  /** Nimikkeet, joille hinnastossa ei ole hintaa (eivät ole summassa). */
  puuttuvatHinnat: Nimike[];
  /** Tuntihinta puuttuu, joten työ ei ole summassa. */
  tuntihintaPuuttuu: boolean;
}

const annettu = (v: number | null | undefined): v is number => v !== null && v !== undefined;

// ------------------------------------------------------------
// Rivin tiedot
// ------------------------------------------------------------

export function rivinNimi(o: Maararivi): string {
  return o.structureType?.name ?? o.product?.name ?? o.description ?? "Nimetön rivi";
}

/** Rakenneosan tai nimikkeen koodi; vapaalla rivillä null. */
export function rivinKoodi(o: Maararivi): string | null {
  return o.structureType?.code ?? o.product?.code ?? null;
}

export function rivinYksikko(o: Maararivi): string {
  return o.structureType?.unit ?? o.product?.unit ?? o.unit ?? "kpl";
}

export function rivinLittera(o: Maararivi): Littera | null {
  return o.littera ?? o.structureType?.littera ?? null;
}

export function rivinLaji(o: Maararivi): Kustannuslaji {
  return o.costType ?? o.structureType?.costType ?? "MATERIAALI";
}

/** Rivi hinnoitellaan kokonaisuutena (oma hinta, kiinteähintainen rakenneosa tai vapaa rivi). */
export function onKiintea(o: Maararivi): boolean {
  if (annettu(o.unitPriceCents)) return true;
  if (o.product) return false;
  if (o.structureType) return annettu(o.structureType.unitPriceCents);
  return true;
}

function materiaalinMaara(osanMaara: number, m: Materiaalirivi): number {
  return osanMaara * m.quantityPerUnit * (1 + m.wastePct / 100);
}

/** Pyöristää näytettävän määrän kolmeen desimaaliin (liukulukujäänteet pois). */
export function pyorista(n: number, desimaaleja = 3): number {
  const k = 10 ** desimaaleja;
  return Math.round(n * k) / k;
}

interface RivinKustannus {
  materiaalit: number;
  tyo: number;
  aliurakka: number;
  tunnit: number;
  puuttuvat: Nimike[];
}

/** Yhden rivin kustannus senteissä (pyöristämättä). */
export function rivinKustannus(o: Maararivi, hinnat: Hinnat, tuntihintaSentit: number | null): RivinKustannus {
  const k: RivinKustannus = { materiaalit: 0, tyo: 0, aliurakka: 0, tunnit: 0, puuttuvat: [] };
  const kiintea = (summa: number) => {
    const laji = rivinLaji(o);
    if (laji === "TEHDASTYO") k.tyo += summa;
    else if (laji === "ALIURAKKA") k.aliurakka += summa;
    else k.materiaalit += summa;
  };
  if (annettu(o.unitPriceCents)) {
    kiintea(o.quantity * o.unitPriceCents);
  } else if (o.product) {
    const hinta = hinnat.get(o.product.id);
    if (hinta === undefined) k.puuttuvat.push(o.product);
    else k.materiaalit += o.quantity * hinta;
  } else if (o.structureType && annettu(o.structureType.unitPriceCents)) {
    kiintea(o.quantity * o.structureType.unitPriceCents);
  } else if (o.structureType) {
    for (const m of o.structureType.materials) {
      const hinta = hinnat.get(m.productId);
      if (hinta === undefined) k.puuttuvat.push(m.product);
      else k.materiaalit += materiaalinMaara(o.quantity, m) * hinta;
    }
    k.tunnit = o.quantity * o.structureType.laborHoursPerUnit;
    if (tuntihintaSentit !== null) k.tyo += k.tunnit * tuntihintaSentit;
  }
  return k;
}

// ------------------------------------------------------------
// Koko määräluettelo
// ------------------------------------------------------------

/** Materiaalitarve nimikkeittäin, järjestettynä nimikekoodin mukaan. */
export function laskeMateriaalitarve(osat: Maararivi[]): Materiaalitarve[] {
  const tarpeet = new Map<string, Materiaalitarve>();
  const lisaa = (nimike: Nimike, maara: number, lahde: string) => {
    const t = tarpeet.get(nimike.id) ?? { nimike, maara: 0, rakenteet: [] };
    t.maara += maara;
    if (!t.rakenteet.includes(lahde)) t.rakenteet.push(lahde);
    tarpeet.set(nimike.id, t);
  };
  for (const osa of osat) {
    if (osa.product) {
      lisaa(osa.product, osa.quantity, "suora rivi");
      continue;
    }
    // Materiaaliluettelo kertoo materiaalitarpeen myös kiinteähintaiselle riville; hinta ei vaikuta tähän.
    if (!osa.structureType) continue;
    for (const m of osa.structureType.materials) lisaa(m.product, materiaalinMaara(osa.quantity, m), osa.structureType.code);
  }
  return [...tarpeet.values()]
    .map((t) => ({ ...t, maara: pyorista(t.maara) }))
    .sort((a, b) => a.nimike.code.localeCompare(b.nimike.code, "fi"));
}

export interface KiinteaRivi {
  /** Yhdistämisavain: rakenneosan id tai vapaan rivin littera + nimi. */
  avain: string;
  /** Rakenneosa, jos rivi on rakenneosa (hankintarivin linkki). */
  rakenneosaId: string | null;
  koodi: string | null;
  nimi: string;
  yksikko: string;
  littera: Littera | null;
  maara: number;
  /** Tarkka summa senteissä (pyöristys vasta yhteissummassa). */
  summaSentit: number;
  laji: Kustannuslaji;
  /**
   * Rakenneosalla on materiaaliluettelo: se hankitaan nimikkeinä
   * materiaalitarpeen kautta, ei rakenneosana.
   */
  materiaaleina: boolean;
}

/**
 * Kiinteähintaiset rivit (ei nimikerivejä) yhdistettynä: samat rakenneosat
 * yhdeksi, vapaat rivit litteran ja nimen mukaan. Järjestys litteran ja
 * koodin mukaan.
 */
export function laskeKiinteatRivit(osat: Maararivi[]): KiinteaRivi[] {
  const rivit = new Map<string, KiinteaRivi>();
  for (const o of osat) {
    if (o.product || !onKiintea(o)) continue;
    const littera = rivinLittera(o);
    const laji = rivinLaji(o);
    const avain = o.structureType ? `osa:${o.structureType.id}:${laji}` : `vapaa:${littera?.code ?? ""}:${rivinNimi(o)}:${laji}`;
    const r = rivit.get(avain) ?? {
      avain,
      rakenneosaId: o.structureType?.id ?? null,
      koodi: rivinKoodi(o),
      nimi: rivinNimi(o),
      yksikko: rivinYksikko(o),
      littera,
      maara: 0,
      summaSentit: 0,
      laji,
      materiaaleina: (o.structureType?.materials.length ?? 0) > 0,
    };
    r.maara += o.quantity;
    r.summaSentit += o.quantity * (o.unitPriceCents ?? o.structureType?.unitPriceCents ?? 0);
    rivit.set(avain, r);
  }
  return [...rivit.values()].sort(
    (a, b) =>
      (a.littera?.code ?? "~").localeCompare(b.littera?.code ?? "~", "fi", { numeric: true }) ||
      (a.koodi ?? a.nimi).localeCompare(b.koodi ?? b.nimi, "fi", { numeric: true })
  );
}

/** Tehtaan työtunnit rakenteiden normeista (ei kiinteähintaisilta riveiltä). */
export function laskeTuntimenekki(osat: Maararivi[]): number {
  return pyorista(
    osat.reduce((s, o) => s + (o.structureType && !onKiintea(o) ? o.quantity * o.structureType.laborHoursPerUnit : 0), 0),
    1
  );
}

/** Omakustannus hinnaston hinnoilla ja tuntihinnalla. */
export function laskeKustannus(osat: Maararivi[], hinnat: Hinnat, tuntihintaSentit: number | null): Kustannus {
  let materiaalit = 0;
  let tyo = 0;
  let aliurakka = 0;
  const puuttuvat = new Map<string, Nimike>();
  for (const o of osat) {
    const k = rivinKustannus(o, hinnat, tuntihintaSentit);
    materiaalit += k.materiaalit;
    tyo += k.tyo;
    aliurakka += k.aliurakka;
    for (const n of k.puuttuvat) puuttuvat.set(n.id, n);
  }
  const tunnit = laskeTuntimenekki(osat);
  const materiaalitSentit = Math.round(materiaalit);
  const tyoSentit = Math.round(tyo);
  const aliurakkaSentit = Math.round(aliurakka);
  return {
    materiaalitSentit,
    tyoSentit,
    aliurakkaSentit,
    yhteensaSentit: materiaalitSentit + tyoSentit + aliurakkaSentit,
    tunnit,
    puuttuvatHinnat: [...puuttuvat.values()],
    tuntihintaPuuttuu: tuntihintaSentit === null && tunnit > 0,
  };
}

/** Yhden rakenneosan omakustannus yksikköä kohti (Rakenneosat-sivun hinta). */
export function yksikkokustannus(tyyppi: Rakenneosa, hinnat: Hinnat, tuntihintaSentit: number | null): Kustannus {
  return laskeKustannus([{ quantity: 1, structureType: tyyppi }], hinnat, tuntihintaSentit);
}

/**
 * Rakenneosan materiaaliluettelon hinta yksikköä kohti hinnaston hinnoilla
 * kiinteästä hinnasta riippumatta (vertailuun kiinteän hinnan kanssa).
 */
export function materiaalienYksikkokustannus(tyyppi: Rakenneosa, hinnat: Hinnat): Kustannus {
  return laskeKustannus([{ quantity: 1, structureType: { ...tyyppi, unitPriceCents: null, laborHoursPerUnit: 0 } }], hinnat, null);
}

/** Myyntihinta katteella: omakustannus / (1 - kate). */
export function myyntihinta(omakustannusSentit: number, katePct: number): number {
  return katePct >= 100 ? 0 : omakustannusSentit / (1 - katePct / 100);
}

export interface Hinnasto {
  id: string;
  name: string;
  validFrom: Date;
  validTo: Date | null;
}

/**
 * Laskennassa käytettävä hinnasto: uusin, joka on voimassa annettuna
 * päivänä. Jos mikään ei ole voimassa, uusin alkanut; muuten null.
 */
export function valitseHinnasto<T extends Hinnasto>(hinnastot: T[], paiva: Date): T | null {
  const alkaneet = hinnastot
    .filter((h) => h.validFrom <= paiva)
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
  return alkaneet.find((h) => !h.validTo || h.validTo >= paiva) ?? alkaneet[0] ?? null;
}
