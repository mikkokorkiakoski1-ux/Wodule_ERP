/**
 * Projektiaikataulun (ScheduleTask) laskenta.
 *
 * Vastaa projektinhallinnan Excelin aikataulu-välilehteä:
 *   ALOITUS  = kiinteä aloitus TAI XLOOKUP(edeltäjä, tunnus, ENNUSTE) + siirto
 *   ENNUSTE  = WORKDAY.INTL(ALOITUS, KESTO, 1) - 1
 *
 * Ero tuotantoaikatauluun (production-schedule.ts): rivit eivät ketjuunnu
 * järjestyksessä, vaan jokainen tehtävä nimeää edeltäjänsä tunnuksella.
 * Kaavat (työpäivät ma-pe, siirto kalenteripäivinä) ovat samat, ja ne
 * tulevat suoraan production-schedule.ts:stä, jota tämä moduuli ei muuta.
 */
import { addDays, ennusteFromAloitusKesto, stripTime } from "@/lib/production-schedule";

export interface AikataulutehtavaInput {
  code: string;
  predecessorCode: string | null;
  offsetDays: number;
  durationDays: number;
  fixedStart: Date | null;
  progress: number;
}

export interface Laskettu {
  aloitus: Date | null;
  ennuste: Date | null;
  /** Syy, miksi aloitusta ei voitu laskea; null = kunnossa. */
  virhe: string | null;
  valmis: boolean;
  myohassa: boolean;
  kaynnissa: boolean;
}

/** Laskee aloituksen ja ennusteen jokaiselle tehtävälle. Avaimena tehtävätunnus. */
export function laskeProjektiaikataulu<T extends AikataulutehtavaInput>(
  tehtavat: T[],
  tanaan: Date = new Date()
): Map<string, Laskettu> {
  const tunnuksella = new Map(tehtavat.map((t) => [t.code, t]));
  const tulos = new Map<string, Laskettu>();
  const kesken = new Set<string>();

  function laske(t: T): Laskettu {
    const valmis = tulos.get(t.code);
    if (valmis) return valmis;

    let aloitus: Date | null = null;
    let virhe: string | null = null;

    if (t.fixedStart) {
      aloitus = t.fixedStart;
    } else if (!t.predecessorCode) {
      virhe = "Anna kiinteä aloitus tai edeltävä tehtävä";
    } else if (kesken.has(t.code)) {
      virhe = "Kehäviittaus edeltäjissä";
    } else {
      const edeltaja = tunnuksella.get(t.predecessorCode);
      if (!edeltaja) {
        virhe = `Edeltävää tehtävää ${t.predecessorCode} ei ole`;
      } else {
        kesken.add(t.code);
        const e = laske(edeltaja);
        kesken.delete(t.code);
        if (e.ennuste) aloitus = addDays(e.ennuste, t.offsetDays || 0);
        else virhe = e.virhe?.startsWith("Kehäviittaus") ? e.virhe : `Edeltäjän ${t.predecessorCode} aloitus puuttuu`;
      }
    }

    const ennuste = aloitus ? ennusteFromAloitusKesto(aloitus, t.durationDays || 1) : null;
    const tehty = t.progress >= 100;
    const l: Laskettu = {
      aloitus,
      ennuste,
      virhe,
      valmis: tehty,
      myohassa: !tehty && !!ennuste && stripTime(ennuste) < stripTime(tanaan),
      kaynnissa:
        !tehty && !!aloitus && !!ennuste && stripTime(aloitus) <= stripTime(tanaan) && stripTime(tanaan) <= stripTime(ennuste),
    };
    tulos.set(t.code, l);
    return l;
  }

  for (const t of tehtavat) laske(t);
  return tulos;
}

/** ISO-viikkonumero (kuten Excelin ISOWEEKNUM). */
export function isoViikko(d: Date): number {
  const p = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const viikonpaiva = p.getUTCDay() || 7;
  p.setUTCDate(p.getUTCDate() + 4 - viikonpaiva);
  const vuodenAlku = new Date(Date.UTC(p.getUTCFullYear(), 0, 1));
  return Math.ceil(((p.getTime() - vuodenAlku.getTime()) / 86400000 + 1) / 7);
}
