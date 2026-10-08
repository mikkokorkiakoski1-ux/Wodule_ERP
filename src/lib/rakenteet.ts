/**
 * Rakenneosien laskenta: rakennuksen määräluettelosta (rakenneosa ×
 * määrä) johdetaan materiaalitarve nimikkeittäin, tehtaan tuntimenekki ja
 * omakustannus.
 *
 *   materiaalin määrä = määrärivin määrä × menekki per yksikkö × (1 + hukka-% / 100)
 *   tuntimenekki      = määrärivin määrä × työtuntinormi
 *   omakustannus      = Σ materiaalin määrä × yksikköhinta + tuntimenekki × tuntihinta
 *                       + Σ kiinteähintaisten rivien määrä × kiinteä yksikköhinta
 *
 * Kiinteähintainen rakenneosa (unitPriceCents, esim. tarjouslaskurin
 * laskentarivit) hinnoitellaan kokonaisuutena: sen materiaaliluetteloa ei
 * käytetä, eikä se näy materiaalitarpeessa vaan kiinteähintaisissa riveissä
 * (laskeKiinteatRivit). Kustannuslaji erittelee tehdastyön ja aliurakan.
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

const kiintea = (r: Rakenneosa) => r.unitPriceCents !== null && r.unitPriceCents !== undefined;

export interface Maararivi {
  quantity: number;
  structureType: Rakenneosa;
}

export interface Materiaalitarve {
  nimike: Nimike;
  maara: number;
  /** Rakenneosien koodit, joista tarve syntyy. */
  rakenteet: string[];
}

/** Hinnat nimikkeittäin (productId -> senttiä per nimikkeen yksikkö). */
export type Hinnat = Map<string, number>;

export interface Kustannus {
  /** Materiaalit ja ostot (materiaaliluettelot + kiinteähintaiset materiaalirivit). */
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

function materiaalinMaara(osanMaara: number, m: Materiaalirivi): number {
  return osanMaara * m.quantityPerUnit * (1 + m.wastePct / 100);
}

/** Pyöristää näytettävän määrän kolmeen desimaaliin (liukulukujäänteet pois). */
export function pyorista(n: number, desimaaleja = 3): number {
  const k = 10 ** desimaaleja;
  return Math.round(n * k) / k;
}

/** Materiaalitarve nimikkeittäin, järjestettynä nimikekoodin mukaan. */
export function laskeMateriaalitarve(osat: Maararivi[]): Materiaalitarve[] {
  const tarpeet = new Map<string, Materiaalitarve>();
  for (const osa of osat) {
    if (kiintea(osa.structureType)) continue;
    for (const m of osa.structureType.materials) {
      const t = tarpeet.get(m.productId) ?? { nimike: m.product, maara: 0, rakenteet: [] };
      t.maara += materiaalinMaara(osa.quantity, m);
      if (!t.rakenteet.includes(osa.structureType.code)) t.rakenteet.push(osa.structureType.code);
      tarpeet.set(m.productId, t);
    }
  }
  return [...tarpeet.values()]
    .map((t) => ({ ...t, maara: pyorista(t.maara) }))
    .sort((a, b) => a.nimike.code.localeCompare(b.nimike.code, "fi"));
}

export interface KiinteaRivi {
  rakenneosa: Rakenneosa;
  maara: number;
  /** Tarkka summa senteissä (pyöristys vasta yhteissummassa). */
  summaSentit: number;
  laji: Kustannuslaji;
}

/** Kiinteähintaiset rivit rakenneosittain (samat rakenneosat yhdistetään), litteran ja koodin mukaan. */
export function laskeKiinteatRivit(osat: Maararivi[]): KiinteaRivi[] {
  const rivit = new Map<string, KiinteaRivi>();
  for (const o of osat) {
    const r = o.structureType;
    if (!kiintea(r)) continue;
    const k = rivit.get(r.id) ?? { rakenneosa: r, maara: 0, summaSentit: 0, laji: r.costType ?? "MATERIAALI" };
    k.maara += o.quantity;
    k.summaSentit += o.quantity * r.unitPriceCents!;
    rivit.set(r.id, k);
  }
  return [...rivit.values()].sort(
    (a, b) =>
      (a.rakenneosa.littera?.code ?? "~").localeCompare(b.rakenneosa.littera?.code ?? "~", "fi", { numeric: true }) ||
      a.rakenneosa.code.localeCompare(b.rakenneosa.code, "fi", { numeric: true })
  );
}

/** Tehtaan työtunnit rakenteiden normeista. */
export function laskeTuntimenekki(osat: Maararivi[]): number {
  return pyorista(
    osat.reduce((s, o) => s + o.quantity * o.structureType.laborHoursPerUnit, 0),
    1
  );
}

/** Omakustannus hinnaston hinnoilla ja tuntihinnalla. */
export function laskeKustannus(osat: Maararivi[], hinnat: Hinnat, tuntihintaSentit: number | null): Kustannus {
  let materiaalit = 0;
  const puuttuvat = new Map<string, Nimike>();
  for (const t of laskeMateriaalitarve(osat)) {
    const hinta = hinnat.get(t.nimike.id);
    if (hinta === undefined) puuttuvat.set(t.nimike.id, t.nimike);
    else materiaalit += t.maara * hinta;
  }
  const tunnit = laskeTuntimenekki(osat);
  let tyo = tuntihintaSentit === null ? 0 : tunnit * tuntihintaSentit;
  let aliurakka = 0;
  for (const k of laskeKiinteatRivit(osat)) {
    if (k.laji === "TEHDASTYO") tyo += k.summaSentit;
    else if (k.laji === "ALIURAKKA") aliurakka += k.summaSentit;
    else materiaalit += k.summaSentit;
  }
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
