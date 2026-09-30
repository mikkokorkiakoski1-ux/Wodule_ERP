/**
 * Tuotantoaikataulun laskentalogiikka.
 *
 * Tämä on suora TypeScript-portaus aiemmin Artifact-työkaluna (Gantt +
 * taulukko, https://claude.ai/artifact/...) rakennetusta ja tuotannossa
 * validoidusta logiikasta. Kaavat ja käyttäytyminen on tarkoituksella
 * pidetty identtisinä, jotta olemassa oleva data ja käyttäjien odotukset
 * (esim. mitä "Kesto" ja "Laskennallinen kesto" tarkoittavat) siirtyvät
 * suoraan tähän järjestelmään.
 *
 * Kuuluu kaavion "Tuotantoaikataulu projektit" -osioon (Asiakkuuksien
 * hallinta > Projektit alla) - EI Tuotannon ohjaus -osioon.
 *
 * TÄRKEÄÄ SÄILYTTÄÄ MUUTTUMATTOMANA:
 *  - "Kesto" (work_days) on AINOA aikataulua/ennustetta ohjaava kestoarvo.
 *  - "Laskennallinen kesto" on pelkkä tukitieto (vertailua varten) eikä saa
 *    koskaan syöttää arvoa "Kesto"-kenttään tai ennusteen laskentaan.
 */

export interface ScheduleInput {
  id: string;
  seq: number;
  tilaaja: string;
  projekti: string;
  rakennuksia: number | null;
  aloitus: Date | null; // kiinteä aloituspäivä (vain ketjun ensimmäisellä pakollinen)
  siirto: number; // kalenteripäivää edellisen rivin ennusteesta
  tuntimenekki: number;
  tyontekijoita: number;
  tyopisteita: number;
  kesto: number; // työpäivää - AINOA aikataulua ohjaava arvo
  valmiusaste: number | null; // 0-100
}

export interface ScheduleComputed extends ScheduleInput {
  aloitusDate: Date | null;
  ennusteDate: Date | null;
  invalid: boolean; // true = aloituspäivää ei voitu johtaa (esim. edellinen rivi puuttuu)
  isRoot: boolean;
  laskennallinenKesto: number | null; // TUKITIETO - ei ohjaa aikataulua
  isDone: boolean;
  isLate: boolean;
  isActiveToday: boolean;
  prevId: string | null;
  nextId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function stripTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((stripTime(b) - stripTime(a)) / DAY_MS);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Lisää n TYÖPÄIVÄÄ (ma-pe) päivämäärään. Negatiivinen n = taaksepäin. */
export function addWorkdays(start: Date, n: number): Date {
  const d = new Date(start);
  let remaining = Math.abs(n);
  const dir = n >= 0 ? 1 : -1;
  while (remaining > 0) {
    d.setDate(d.getDate() + dir);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

/**
 * Vastaa Excelin WORKDAY.INTL(aloitus, kesto, 1) - 1 -kaavaa: ennuste on
 * viimeinen työpäivä, kun aloituspäivästä lasketaan "kesto" työpäivää eteenpäin.
 */
export function ennusteFromAloitusKesto(aloitus: Date, kesto: number): Date {
  const w = addWorkdays(aloitus, kesto);
  w.setDate(w.getDate() - 1);
  return w;
}

/**
 * Laskennallinen kesto: tuntimenekki / ((työntekijöitä / työpisteitä linjalla) * 7,5).
 * VAIN tukitieto - ei koskaan ohjaa aikataulua tai korvaa "kesto"-kenttää.
 */
export function laskennallinenKesto(
  tuntimenekki: number,
  tyontekijoita: number,
  tyopisteita: number
): number | null {
  const t = Number(tuntimenekki);
  const w = Number(tyontekijoita);
  const s = Number(tyopisteita);
  if (!isFinite(t) || !isFinite(w) || !isFinite(s) || s <= 0) return null;
  const denom = (w / s) * 7.5;
  if (!isFinite(denom) || denom <= 0) return null;
  return t / denom;
}

/**
 * Laskee koko ketjun: järjestää rivit seq:n mukaan, ja johtaa jokaiselle
 * riville aloitus- ja ennustepäivän. Rivin aloitus tulee joko sen omasta
 * kiinteästä "aloitus"-arvosta, tai edellisen rivin ennusteesta + "siirto"
 * kalenteripäivää (EI työpäivää).
 */
export function recompute(
  items: ScheduleInput[],
  today: Date = new Date()
): ScheduleComputed[] {
  const sorted = [...items].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  let prevEnnuste: Date | null = null;
  const out: ScheduleComputed[] = [];

  sorted.forEach((d, i) => {
    let aloitus: Date | null = null;
    if (d.aloitus) aloitus = d.aloitus;
    else if (prevEnnuste) aloitus = addDays(prevEnnuste, d.siirto || 0);

    const ennuste = aloitus ? ennusteFromAloitusKesto(aloitus, d.kesto || 1) : null;
    const isDone = d.valmiusaste === 100;
    const isLate = !isDone && !!ennuste && stripTime(ennuste) < stripTime(today);
    const isActiveToday =
      !isDone &&
      !!aloitus &&
      !!ennuste &&
      stripTime(aloitus) <= stripTime(today) &&
      stripTime(today) <= stripTime(ennuste);

    out.push({
      ...d,
      aloitusDate: aloitus,
      ennusteDate: ennuste,
      invalid: !aloitus,
      isRoot: i === 0,
      laskennallinenKesto: laskennallinenKesto(d.tuntimenekki, d.tyontekijoita, d.tyopisteita),
      isDone,
      isLate,
      isActiveToday,
      prevId: i > 0 ? sorted[i - 1].id : null,
      nextId: i < sorted.length - 1 ? sorted[i + 1].id : null,
    });

    if (ennuste) prevEnnuste = ennuste;
  });

  return out;
}

export interface ScheduleKpis {
  total: number;
  activeToday: number;
  late: number;
  progressRecorded: number;
}

export function computeKpis(computed: ScheduleComputed[]): ScheduleKpis {
  return {
    total: computed.length,
    activeToday: computed.filter((p) => p.isActiveToday).length,
    late: computed.filter((p) => p.isLate).length,
    progressRecorded: computed.filter((p) => p.valmiusaste !== null && p.valmiusaste !== undefined)
      .length,
  };
}

export function statusLabel(p: ScheduleComputed): "Aseta pvm" | "Valmis" | "Myöhässä" | "Käynnissä" | "Tulossa" {
  if (p.invalid) return "Aseta pvm";
  if (p.isDone) return "Valmis";
  if (p.isLate) return "Myöhässä";
  if (p.isActiveToday) return "Käynnissä";
  return "Tulossa";
}
