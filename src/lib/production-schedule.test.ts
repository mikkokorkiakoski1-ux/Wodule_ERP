/**
 * Tuotantoaikataulun laskennan testit.
 *
 * Testit lukitsevat alkuperäisen Artifact-työkalun toiminnan (ks.
 * production-schedule.ts). Jos jokin testi hajoaa, kyse on todennäköisesti
 * laskennan muutoksesta, jota ei saa tehdä - ei testin virheestä.
 *
 * Päivämäärät ovat paikallista aikaa. 29.6.2026 on maanantai.
 */
import { describe, expect, it } from "vitest";
import {
  addWorkdays,
  computeKpis,
  ennusteFromAloitusKesto,
  laskennallinenKesto,
  recompute,
  statusLabel,
  type ScheduleInput,
} from "./production-schedule";

/** Paikallinen päivämäärä, kuukausi 1-12. */
function pvm(v: number, kk: number, pv: number): Date {
  return new Date(v, kk - 1, pv);
}

function rivi(osat: Partial<ScheduleInput> & { id: string; seq: number }): ScheduleInput {
  return {
    tilaaja: "Tilaaja",
    projekti: "Projekti",
    rakennuksia: 1,
    aloitus: null,
    siirto: 0,
    tuntimenekki: 420,
    tyontekijoita: 8,
    tyopisteita: 4,
    kesto: 5,
    valmiusaste: null,
    ...osat,
  };
}

describe("addWorkdays", () => {
  it("ohittaa viikonlopun eteenpäin", () => {
    expect(addWorkdays(pvm(2026, 7, 3), 1)).toEqual(pvm(2026, 7, 6)); // pe -> ma
  });

  it("ohittaa viikonlopun taaksepäin", () => {
    expect(addWorkdays(pvm(2026, 7, 6), -1)).toEqual(pvm(2026, 7, 3)); // ma -> pe
  });

  it("nolla palauttaa saman päivän", () => {
    expect(addWorkdays(pvm(2026, 7, 4), 0)).toEqual(pvm(2026, 7, 4));
  });

  it("ei muuta syötettä", () => {
    const alku = pvm(2026, 6, 29);
    addWorkdays(alku, 10);
    expect(alku).toEqual(pvm(2026, 6, 29));
  });
});

describe("ennusteFromAloitusKesto (WORKDAY.INTL(aloitus, kesto, 1) - 1)", () => {
  it("kesto 1 maanantaina päättyy samana päivänä", () => {
    expect(ennusteFromAloitusKesto(pvm(2026, 6, 29), 1)).toEqual(pvm(2026, 6, 29));
  });

  it("kesto 4 ma -> to", () => {
    expect(ennusteFromAloitusKesto(pvm(2026, 6, 29), 4)).toEqual(pvm(2026, 7, 2));
  });

  it("kesto 5 ma -> su (Excel-kaavan mukainen: seuraava ma - 1 kalenteripäivä)", () => {
    expect(ennusteFromAloitusKesto(pvm(2026, 6, 29), 5)).toEqual(pvm(2026, 7, 5));
  });

  it("kesto 26 ma 29.6. -> ma 3.8.", () => {
    expect(ennusteFromAloitusKesto(pvm(2026, 6, 29), 26)).toEqual(pvm(2026, 8, 3));
  });

  it("lauantaina alkava kesto 1 -> sunnuntai", () => {
    expect(ennusteFromAloitusKesto(pvm(2026, 7, 4), 1)).toEqual(pvm(2026, 7, 5));
  });
});

describe("laskennallinenKesto", () => {
  it("tuntimenekki / ((työntekijöitä / työpisteitä) * 7,5)", () => {
    expect(laskennallinenKesto(420, 8, 4)).toBe(28);
    expect(laskennallinenKesto(300, 4, 4)).toBe(40);
  });

  it("palauttaa null, jos työpisteitä tai työntekijöitä on 0", () => {
    expect(laskennallinenKesto(420, 8, 0)).toBeNull();
    expect(laskennallinenKesto(420, 0, 4)).toBeNull();
  });

  it("palauttaa null ei-numeerisella syötteellä", () => {
    expect(laskennallinenKesto(NaN, 8, 4)).toBeNull();
  });
});

describe("recompute", () => {
  const tanaan = pvm(2026, 6, 1);

  it("ketjuttaa rivit: aloitus = edellinen ennuste + siirto kalenteripäivää", () => {
    const [a, b, c] = recompute(
      [
        rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29), kesto: 5 }),
        rivi({ id: "b", seq: 2, siirto: 1, kesto: 5 }),
        rivi({ id: "c", seq: 3, siirto: 0, kesto: 1 }),
      ],
      tanaan
    );
    expect(a.ennusteDate).toEqual(pvm(2026, 7, 5));
    expect(b.aloitusDate).toEqual(pvm(2026, 7, 6));
    expect(b.ennusteDate).toEqual(pvm(2026, 7, 12));
    expect(c.aloitusDate).toEqual(pvm(2026, 7, 12));
    expect(c.ennusteDate).toEqual(pvm(2026, 7, 12));
  });

  it("siirto lasketaan kalenteripäivinä, ei työpäivinä", () => {
    const [, b] = recompute(
      [
        rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29), kesto: 4 }), // ennuste to 2.7.
        rivi({ id: "b", seq: 2, siirto: 2 }),
      ],
      tanaan
    );
    expect(b.aloitusDate).toEqual(pvm(2026, 7, 4)); // la, ei ma 6.7.
  });

  it("rivin oma kiinteä aloitus ohittaa ketjun", () => {
    const [, b, c] = recompute(
      [
        rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29), kesto: 5 }),
        rivi({ id: "b", seq: 2, aloitus: pvm(2026, 9, 7), siirto: 3, kesto: 4 }),
        rivi({ id: "c", seq: 3, siirto: 1 }),
      ],
      tanaan
    );
    expect(b.aloitusDate).toEqual(pvm(2026, 9, 7));
    expect(b.ennusteDate).toEqual(pvm(2026, 9, 10));
    expect(c.aloitusDate).toEqual(pvm(2026, 9, 11));
  });

  it("järjestää rivit seq:n mukaan ja asettaa prevId/nextId/isRoot", () => {
    const tulos = recompute(
      [
        rivi({ id: "c", seq: 3 }),
        rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29) }),
        rivi({ id: "b", seq: 2 }),
      ],
      tanaan
    );
    expect(tulos.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(tulos.map((r) => r.isRoot)).toEqual([true, false, false]);
    expect(tulos.map((r) => r.prevId)).toEqual([null, "a", "b"]);
    expect(tulos.map((r) => r.nextId)).toEqual(["b", "c", null]);
  });

  it("ilman aloitusta alkava ketju on invalid", () => {
    const tulos = recompute([rivi({ id: "a", seq: 1 }), rivi({ id: "b", seq: 2 })], tanaan);
    for (const r of tulos) {
      expect(r.invalid).toBe(true);
      expect(r.aloitusDate).toBeNull();
      expect(r.ennusteDate).toBeNull();
    }
  });

  it("kesto 0 käsitellään kestona 1", () => {
    const [a] = recompute([rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29), kesto: 0 })], tanaan);
    expect(a.ennusteDate).toEqual(pvm(2026, 6, 29));
  });

  it("laskennallinen kesto EI vaikuta ennusteeseen", () => {
    const [pieni] = recompute(
      [rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29), kesto: 5, tuntimenekki: 10 })],
      tanaan
    );
    const [suuri] = recompute(
      [rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29), kesto: 5, tuntimenekki: 99999 })],
      tanaan
    );
    expect(pieni.laskennallinenKesto).not.toBe(suuri.laskennallinenKesto);
    expect(pieni.ennusteDate).toEqual(suuri.ennusteDate);
    expect(pieni.kesto).toBe(5);
    expect(suuri.kesto).toBe(5);
  });

  it("ei muuta syöterivejä", () => {
    const syote = [rivi({ id: "b", seq: 2 }), rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29) })];
    recompute(syote, tanaan);
    expect(syote.map((r) => r.id)).toEqual(["b", "a"]);
    expect(syote[0].aloitus).toBeNull();
  });
});

describe("tila ja KPI:t", () => {
  // a: 29.6.-5.7., b: 6.7.-12.7., c: 13.7.-19.7., d: ei aloitusta
  function laske(tanaan: Date, valmiusasteet: (number | null)[] = [null, null, null]) {
    return recompute(
      [
        rivi({ id: "a", seq: 1, aloitus: pvm(2026, 6, 29), kesto: 5, valmiusaste: valmiusasteet[0] }),
        rivi({ id: "b", seq: 2, siirto: 1, kesto: 5, valmiusaste: valmiusasteet[1] }),
        rivi({ id: "c", seq: 3, siirto: 1, kesto: 5, valmiusaste: valmiusasteet[2] }),
      ],
      tanaan
    );
  }

  it("Myöhässä / Käynnissä / Tulossa päivämäärän mukaan", () => {
    const tulos = laske(pvm(2026, 7, 8));
    expect(tulos.map(statusLabel)).toEqual(["Myöhässä", "Käynnissä", "Tulossa"]);
  });

  it("ennustepäivä itse on vielä Käynnissä", () => {
    const [a] = laske(pvm(2026, 7, 5));
    expect(statusLabel(a)).toBe("Käynnissä");
  });

  it("valmiusaste 100 on Valmis, vaikka ennuste olisi mennyt", () => {
    const [a] = laske(pvm(2026, 7, 8), [100, null, null]);
    expect(statusLabel(a)).toBe("Valmis");
    expect(a.isLate).toBe(false);
  });

  it("invalid rivi on Aseta pvm", () => {
    const [a] = recompute([rivi({ id: "a", seq: 1 })], pvm(2026, 7, 8));
    expect(statusLabel(a)).toBe("Aseta pvm");
  });

  it("computeKpis laskee rivit, käynnissä olevat, myöhässä olevat ja kirjatut valmiusasteet", () => {
    const kpis = computeKpis(laske(pvm(2026, 7, 8), [50, 0, null]));
    expect(kpis).toEqual({ total: 3, activeToday: 1, late: 1, progressRecorded: 2 });
  });
});
