/**
 * Rakenneosien laskenta: rakennuksen määräluettelosta (rakenneosa ×
 * määrä) johdetaan materiaalitarve nimikkeittäin, tehtaan tuntimenekki ja
 * omakustannus.
 *
 *   materiaalin määrä = määrärivin määrä × menekki per yksikkö × (1 + hukka-% / 100)
 *   tuntimenekki      = määrärivin määrä × työtuntinormi
 *   omakustannus      = Σ materiaalin määrä × yksikköhinta + tuntimenekki × tuntihinta
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

export interface Rakenneosa {
  id: string;
  code: string;
  name: string;
  unit: string;
  laborHoursPerUnit: number;
  materials: Materiaalirivi[];
}

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
  materiaalitSentit: number;
  tyoSentit: number;
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
  const tyo = tuntihintaSentit === null ? 0 : tunnit * tuntihintaSentit;
  const materiaalitSentit = Math.round(materiaalit);
  const tyoSentit = Math.round(tyo);
  return {
    materiaalitSentit,
    tyoSentit,
    yhteensaSentit: materiaalitSentit + tyoSentit,
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
