/**
 * Projektiaikataulun ja hankintasuunnitelman laskennan testit.
 *
 * Odotusarvot ovat projektinhallinnan Excelin (Firstcamp iglut) laskemia
 * arvoja, joten testit varmistavat, että järjestelmä laskee kuten Excel.
 */
import { describe, expect, it } from "vitest";
import { isoViikko, laskeProjektiaikataulu, type AikataulutehtavaInput } from "./projektiaikataulu";
import { kiireellisyys, laskeTakarajat, seuraavaVaihe, vaiheenTakaraja } from "./hankinta";

const pvm = (v: number, kk: number, pv: number) => new Date(v, kk - 1, pv);
const t = (code: string, osat: Partial<AikataulutehtavaInput> = {}): AikataulutehtavaInput => ({
  code,
  predecessorCode: null,
  offsetDays: 0,
  durationDays: 1,
  fixedStart: null,
  progress: 0,
  ...osat,
});

describe("laskeProjektiaikataulu", () => {
  // Excelin "aikataulu tehdas-työmaa" -välilehti
  const excel = [
    t("T1", { fixedStart: pvm(2026, 8, 17), durationDays: 12 }),
    t("T2", { predecessorCode: "T1", offsetDays: 7, durationDays: 5 }),
    t("T3", { predecessorCode: "T2", offsetDays: 1, durationDays: 15 }),
    t("T4", { predecessorCode: "T3", offsetDays: -13, durationDays: 15 }),
    t("T5", { predecessorCode: "T4", offsetDays: -13, durationDays: 15 }),
    t("T6", { predecessorCode: "T5", offsetDays: -10, durationDays: 9 }),
  ];

  it("laskee samat aloitukset ja ennusteet kuin Excel", () => {
    const l = laskeProjektiaikataulu(excel, pvm(2026, 10, 1));
    const odotetut: [string, Date, Date][] = [
      ["T1", pvm(2026, 8, 17), pvm(2026, 9, 1)],
      ["T2", pvm(2026, 9, 8), pvm(2026, 9, 14)],
      ["T3", pvm(2026, 9, 15), pvm(2026, 10, 5)],
      ["T4", pvm(2026, 9, 22), pvm(2026, 10, 12)],
      ["T5", pvm(2026, 9, 29), pvm(2026, 10, 19)],
      ["T6", pvm(2026, 10, 9), pvm(2026, 10, 21)],
    ];
    for (const [code, aloitus, ennuste] of odotetut) {
      expect(l.get(code)?.aloitus, code).toEqual(aloitus);
      expect(l.get(code)?.ennuste, code).toEqual(ennuste);
    }
  });

  it("järjestyksellä ei ole väliä: edeltäjä voi olla listassa myöhemmin", () => {
    const l = laskeProjektiaikataulu([...excel].reverse());
    expect(l.get("T6")?.ennuste).toEqual(pvm(2026, 10, 21));
  });

  it("kiinteä aloitus ohittaa edeltäjän", () => {
    const l = laskeProjektiaikataulu([excel[0], t("T2", { predecessorCode: "T1", fixedStart: pvm(2026, 9, 16), durationDays: 10 })]);
    expect(l.get("T2")?.aloitus).toEqual(pvm(2026, 9, 16));
    expect(l.get("T2")?.ennuste).toEqual(pvm(2026, 9, 29));
  });

  it("ilmoittaa puuttuvan edeltäjän, puuttuvan aloituksen ja kehäviittauksen", () => {
    const l = laskeProjektiaikataulu([
      t("A"),
      t("B", { predecessorCode: "X" }),
      t("C", { predecessorCode: "D" }),
      t("D", { predecessorCode: "C" }),
      t("E", { predecessorCode: "B" }),
    ]);
    expect(l.get("A")?.virhe).toMatch(/kiinteä aloitus/);
    expect(l.get("B")?.virhe).toMatch(/X ei ole/);
    expect(l.get("C")?.virhe).toMatch(/Kehäviittaus/);
    expect(l.get("D")?.virhe).toMatch(/Kehäviittaus/);
    expect(l.get("E")?.virhe).toMatch(/B aloitus puuttuu/);
    expect(l.get("E")?.ennuste).toBeNull();
  });

  it("tila: valmis, myöhässä, käynnissä", () => {
    const l = laskeProjektiaikataulu(
      [
        t("V", { fixedStart: pvm(2026, 9, 1), durationDays: 5, progress: 100 }),
        t("M", { fixedStart: pvm(2026, 9, 1), durationDays: 5 }),
        t("K", { fixedStart: pvm(2026, 9, 28), durationDays: 10 }),
      ],
      pvm(2026, 10, 1)
    );
    expect(l.get("V")).toMatchObject({ valmis: true, myohassa: false });
    expect(l.get("M")).toMatchObject({ valmis: false, myohassa: true });
    expect(l.get("K")).toMatchObject({ kaynnissa: true, myohassa: false });
  });
});

describe("isoViikko", () => {
  it("vastaa Excelin ISOWEEKNUM-funktiota", () => {
    expect(isoViikko(pvm(2026, 10, 1))).toBe(40);
    expect(isoViikko(pvm(2026, 9, 8))).toBe(37);
    expect(isoViikko(pvm(2027, 1, 1))).toBe(53);
    expect(isoViikko(pvm(2027, 1, 4))).toBe(1);
  });
});

describe("hankinnan takarajat", () => {
  const kestot = { materialDays: 1, requestDays: 5, comparisonDays: 1, negotiationDays: 2, deliveryDays: 14 };

  it("laskee taaksepäin kuten Excel (Sähkösuunnittelu, toimitus T2:n aloituksena 8.9.2026)", () => {
    expect(laskeTakarajat(pvm(2026, 9, 8), kestot)).toEqual({
      aineisto: pvm(2026, 8, 16),
      pyynto: pvm(2026, 8, 17),
      tarjous: pvm(2026, 8, 22),
      vertailu: pvm(2026, 8, 23),
      sopimus: pvm(2026, 8, 25),
      toimitus: pvm(2026, 9, 8),
    });
  });

  it("vaiheen takaraja ja sovitun toimituspäivän etusija", () => {
    const tr = laskeTakarajat(pvm(2026, 9, 8), kestot);
    expect(vaiheenTakaraja("PYYNTO", tr, null)).toEqual(pvm(2026, 8, 17));
    expect(vaiheenTakaraja("TOIMITUS", tr, null)).toEqual(pvm(2026, 9, 8));
    expect(vaiheenTakaraja("TOIMITUS", tr, pvm(2026, 9, 23))).toEqual(pvm(2026, 9, 23));
    expect(vaiheenTakaraja("VALMIS", tr, null)).toBeNull();
    expect(vaiheenTakaraja("AINEISTO", null, null)).toBeNull();
  });

  it("vaiheet etenevät järjestyksessä ja päättyvät valmiiseen", () => {
    expect(seuraavaVaihe("AINEISTO")).toBe("PYYNTO");
    expect(seuraavaVaihe("TOIMITUS")).toBe("VALMIS");
    expect(seuraavaVaihe("VALMIS")).toBeNull();
    expect(seuraavaVaihe("EI_TARVITA")).toBeNull();
  });

  it("kiireellisyys", () => {
    const tanaan = pvm(2026, 10, 1);
    expect(kiireellisyys(pvm(2026, 9, 30), tanaan)).toBe("myohassa");
    expect(kiireellisyys(pvm(2026, 10, 1), tanaan)).toBe("lahestyy");
    expect(kiireellisyys(pvm(2026, 10, 8), tanaan)).toBe("lahestyy");
    expect(kiireellisyys(pvm(2026, 10, 9), tanaan)).toBe("ok");
    expect(kiireellisyys(null, tanaan)).toBe("ei");
  });
});
