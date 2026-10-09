import { describe, expect, it } from "vitest";
import {
  laskeKiinteatRivit,
  laskeKustannus,
  laskeMateriaalitarve,
  laskeTuntimenekki,
  materiaalienYksikkokustannus,
  myyntihinta,
  valitseHinnasto,
  yksikkokustannus,
  type Maararivi,
  type Rakenneosa,
} from "./rakenteet";
import { OLETUSSYOTE, laske } from "./tarjouslaskenta";

const runko = { id: "p1", code: "RUNKO-48x198", name: "Runkopuu 48x198", unit: "jm" };
const villa = { id: "p2", code: "VILLA-200", name: "Mineraalivilla 200", unit: "m2" };
const levy = { id: "p3", code: "KIPSI-13", name: "Kipsilevy 13", unit: "m2" };

const ulkoseina: Rakenneosa = {
  id: "s1",
  code: "US-1",
  name: "Ulkoseinä 200",
  unit: "m2",
  laborHoursPerUnit: 0.8,
  materials: [
    { productId: "p1", quantityPerUnit: 2.5, wastePct: 10, product: runko },
    { productId: "p2", quantityPerUnit: 1, wastePct: 5, product: villa },
    { productId: "p3", quantityPerUnit: 1, wastePct: 0, product: levy },
  ],
};

const valiseina: Rakenneosa = {
  id: "s2",
  code: "VS-1",
  name: "Väliseinä",
  unit: "m2",
  laborHoursPerUnit: 0.5,
  materials: [
    { productId: "p1", quantityPerUnit: 2, wastePct: 0, product: runko },
    { productId: "p3", quantityPerUnit: 2, wastePct: 0, product: levy },
  ],
};

const osat: Maararivi[] = [
  { quantity: 100, structureType: ulkoseina },
  { quantity: 40, structureType: valiseina },
];

describe("laskeMateriaalitarve", () => {
  it("summaa saman nimikkeen eri rakenneosista hukka mukaan lukien", () => {
    const tarve = laskeMateriaalitarve(osat);
    const maarat = Object.fromEntries(tarve.map((t) => [t.nimike.code, t.maara]));
    // runko: 100 × 2,5 × 1,10 + 40 × 2 = 275 + 80
    expect(maarat["RUNKO-48x198"]).toBe(355);
    // villa: 100 × 1 × 1,05
    expect(maarat["VILLA-200"]).toBe(105);
    // kipsi: 100 × 1 + 40 × 2
    expect(maarat["KIPSI-13"]).toBe(180);
  });

  it("kertoo, mistä rakenteista tarve syntyy, ja järjestää koodin mukaan", () => {
    const tarve = laskeMateriaalitarve(osat);
    expect(tarve.map((t) => t.nimike.code)).toEqual(["KIPSI-13", "RUNKO-48x198", "VILLA-200"]);
    expect(tarve.find((t) => t.nimike.id === "p1")!.rakenteet).toEqual(["US-1", "VS-1"]);
  });

  it("palauttaa tyhjän ilman rakenneosia", () => {
    expect(laskeMateriaalitarve([])).toEqual([]);
  });
});

describe("laskeTuntimenekki", () => {
  it("kertoo määrät työtuntinormeilla", () => {
    // 100 × 0,8 + 40 × 0,5
    expect(laskeTuntimenekki(osat)).toBe(100);
  });
});

describe("ostonimike rakenneosana", () => {
  const ilp = { id: "p9", code: "ILP-35", name: "Ilmalämpöpumppu 3,5 kW", unit: "kpl" };
  const ostonimike: Rakenneosa = {
    id: "s9",
    code: "ILP-35",
    name: "Ilmalämpöpumppu asennettuna",
    unit: "kpl",
    laborHoursPerUnit: 3,
    materials: [{ productId: "p9", quantityPerUnit: 1, wastePct: 0, product: ilp }],
  };

  it("tuo nimikkeen materiaalitarpeeseen kappalemääränä ja asennuksen tunteihin", () => {
    const rivit: Maararivi[] = [...osat, { quantity: 2, structureType: ostonimike }];
    expect(laskeMateriaalitarve(rivit).find((t) => t.nimike.code === "ILP-35")).toMatchObject({ maara: 2, rakenteet: ["ILP-35"] });
    expect(laskeTuntimenekki(rivit)).toBe(100 + 6);
    const k = laskeKustannus(rivit, new Map([["p9", 150000]]), 5500);
    expect(k.materiaalitSentit).toBe(300000);
  });
});

describe("laskeKustannus", () => {
  const hinnat = new Map([
    ["p1", 350], // 3,50 €/jm
    ["p2", 900], // 9,00 €/m2
    ["p3", 600], // 6,00 €/m2
  ]);

  it("laskee materiaalit ja työn senteissä", () => {
    const k = laskeKustannus(osat, hinnat, 5500);
    // 355 × 350 + 105 × 900 + 180 × 600 = 124250 + 94500 + 108000
    expect(k.materiaalitSentit).toBe(326750);
    expect(k.tyoSentit).toBe(100 * 5500);
    expect(k.yhteensaSentit).toBe(326750 + 550000);
    expect(k.puuttuvatHinnat).toEqual([]);
    expect(k.tuntihintaPuuttuu).toBe(false);
  });

  it("listaa hinnattomat nimikkeet eikä laske niitä summaan", () => {
    const k = laskeKustannus(osat, new Map([["p1", 350]]), 5500);
    expect(k.materiaalitSentit).toBe(124250);
    expect(k.puuttuvatHinnat.map((n) => n.code).sort()).toEqual(["KIPSI-13", "VILLA-200"]);
  });

  it("merkitsee puuttuvan tuntihinnan", () => {
    const k = laskeKustannus(osat, hinnat, null);
    expect(k.tyoSentit).toBe(0);
    expect(k.tuntihintaPuuttuu).toBe(true);
  });

  it("laskee rakenneosan hinnan yksikköä kohti", () => {
    const k = yksikkokustannus(ulkoseina, hinnat, 5500);
    // 2,75 × 350 + 1,05 × 900 + 1 × 600 + 0,8 × 5500
    expect(k.materiaalitSentit).toBe(Math.round(962.5 + 945 + 600));
    expect(k.tyoSentit).toBe(4400);
  });
});

describe("valitseHinnasto", () => {
  const h = (id: string, alkaa: string, paattyy: string | null) => ({
    id,
    name: id,
    validFrom: new Date(alkaa),
    validTo: paattyy ? new Date(paattyy) : null,
  });
  const paiva = new Date("2026-10-06");

  it("valitsee uusimman voimassa olevan", () => {
    const valittu = valitseHinnasto(
      [h("2025", "2025-01-01", "2025-12-31"), h("2026", "2026-01-01", null), h("2027", "2027-01-01", null)],
      paiva
    );
    expect(valittu?.id).toBe("2026");
  });

  it("käyttää uusinta alkanutta, jos mikään ei ole voimassa", () => {
    expect(valitseHinnasto([h("vanha", "2025-01-01", "2025-12-31")], paiva)?.id).toBe("vanha");
  });

  it("palauttaa null, jos yksikään ei ole alkanut", () => {
    expect(valitseHinnasto([h("2027", "2027-01-01", null)], paiva)).toBeNull();
  });
});

describe("kiinteähintaiset rakenneosat", () => {
  const valmisseina: Rakenneosa = {
    id: "k1",
    code: "3500-01",
    name: "Ulkoseinä, tupa",
    unit: "m2",
    laborHoursPerUnit: 0,
    materials: [{ productId: "p1", quantityPerUnit: 99, wastePct: 0, product: runko }],
    unitPriceCents: 4144,
    costType: "MATERIAALI",
    littera: { code: "3500", name: "Elementtituotanto" },
  };
  const tehdastyo: Rakenneosa = { ...valmisseina, id: "k2", code: "3801-01", materials: [], unitPriceCents: 10000, costType: "TEHDASTYO", littera: { code: "3801", name: "Tilaelementit" } };
  const aliurakka: Rakenneosa = { ...valmisseina, id: "k3", code: "7300-01", materials: [], unitPriceCents: 100, costType: "ALIURAKKA", littera: { code: "7300", name: "Sähkötyöt" } };

  it("hinnoittelee määrä × kiinteä hinta; materiaaliluettelo vain materiaalitarpeeseen", () => {
    const rivit: Maararivi[] = [
      { quantity: 10, structureType: valmisseina },
      { quantity: 5, structureType: valmisseina },
      { quantity: 2, structureType: tehdastyo },
      { quantity: 3000, structureType: aliurakka },
    ];
    // Materiaaliluettelo (runko 99 jm / m2) näkyy materiaalitarpeessa, mutta ei vaikuta hintaan.
    expect(laskeMateriaalitarve(rivit)).toEqual([{ nimike: runko, maara: 15 * 99, rakenteet: ["3500-01"] }]);
    const k = laskeKustannus(rivit, new Map([["p1", 100000]]), null);
    expect(k.materiaalitSentit).toBe(15 * 4144);
    expect(k.tyoSentit).toBe(20000);
    expect(k.aliurakkaSentit).toBe(300000);
    expect(k.yhteensaSentit).toBe(15 * 4144 + 20000 + 300000);
    expect(k.tuntihintaPuuttuu).toBe(false);
  });

  it("yhdistää saman rakenneosan rivit ja lajittelee litteran mukaan", () => {
    const k = laskeKiinteatRivit([
      { quantity: 1, structureType: aliurakka },
      { quantity: 10, structureType: valmisseina },
      { quantity: 5, structureType: valmisseina },
    ]);
    expect(k.map((r) => [r.koodi, r.maara])).toEqual([
      ["3500-01", 15],
      ["7300-01", 1],
    ]);
  });

  it("tarjouslaskurin rivit määräluettelona tuottavat laskurin omakustannuksen", () => {
    const laskelma = laske(OLETUSSYOTE);
    const rivit: Maararivi[] = laskelma.rivit
      .filter((r) => r.maara !== 0)
      .map((r) => ({
        quantity: r.maara,
        structureType: { id: r.avain, code: r.avain, name: r.nimi, unit: r.yksikko, laborHoursPerUnit: 0, materials: [], unitPriceCents: r.hinta * 100, costType: r.laji },
      }));
    const k = laskeKustannus(rivit, new Map(), null);
    expect(k.yhteensaSentit).toBe(Math.round(laskelma.omakustannus * 100));
    expect(Math.abs(k.tyoSentit - laskelma.tehdastyo * 100)).toBeLessThanOrEqual(1);
    expect(k.aliurakkaSentit).toBe(Math.round(laskelma.aliurakka * 100));
  });
});

describe("manuaaliset rivit (nimike, vapaa rivi, oma hinta)", () => {
  const hinnat = new Map([
    ["p1", 350],
    ["p2", 900],
    ["p3", 600],
  ]);
  const littera = { code: "6200", name: "Varusteet" };

  it("nimikerivi: määrä × hinnaston hinta, näkyy materiaalitarpeessa", () => {
    const rivit: Maararivi[] = [{ quantity: 4, product: villa }];
    expect(laskeKustannus(rivit, hinnat, 5500).materiaalitSentit).toBe(3600);
    expect(laskeMateriaalitarve(rivit)).toEqual([{ nimike: villa, maara: 4, rakenteet: ["suora rivi"] }]);
    expect(laskeKiinteatRivit(rivit)).toEqual([]);
  });

  it("nimikerivi ilman hintaa listataan puuttuvaksi", () => {
    const k = laskeKustannus([{ quantity: 1, product: villa }], new Map(), null);
    expect(k.yhteensaSentit).toBe(0);
    expect(k.puuttuvatHinnat).toEqual([villa]);
  });

  it("vapaa rivi: oma hinta, laji ja littera, kiinteänä rivinä", () => {
    const rivit: Maararivi[] = [
      { quantity: 2, description: "Asennusmatka", unit: "erä", unitPriceCents: 25000, costType: "ALIURAKKA", littera },
      { quantity: 1, description: "Asennusmatka", unit: "erä", unitPriceCents: 25000, costType: "ALIURAKKA", littera },
    ];
    const k = laskeKustannus(rivit, hinnat, null);
    expect(k.aliurakkaSentit).toBe(75000);
    expect(k.yhteensaSentit).toBe(75000);
    const kiinteat = laskeKiinteatRivit(rivit);
    expect(kiinteat).toHaveLength(1);
    expect(kiinteat[0]).toMatchObject({ rakenneosaId: null, koodi: null, nimi: "Asennusmatka", yksikko: "erä", maara: 3, summaSentit: 75000, laji: "ALIURAKKA", littera });
  });

  it("oma hinta korvaa rakenneosan hinnan ja työtunnit, materiaalitarve säilyy", () => {
    const rivit: Maararivi[] = [{ quantity: 10, structureType: ulkoseina, unitPriceCents: 10000 }];
    const k = laskeKustannus(rivit, hinnat, 5500);
    expect(k.yhteensaSentit).toBe(100000);
    expect(k.tunnit).toBe(0);
    expect(laskeMateriaalitarve(rivit).map((t) => [t.nimike.code, t.maara])).toEqual([
      ["KIPSI-13", 10],
      ["RUNKO-48x198", 27.5],
      ["VILLA-200", 10.5],
    ]);
    expect(laskeKiinteatRivit(rivit)[0]).toMatchObject({ rakenneosaId: "s1", koodi: "US-1", maara: 10, summaSentit: 100000, materiaaleina: true });
  });

  it("kiinteä rivi ilman materiaaliluetteloa hankitaan rakenneosana", () => {
    const rivit: Maararivi[] = [{ quantity: 2, description: "Kuljetus", unitPriceCents: 1000 }];
    expect(laskeKiinteatRivit(rivit)[0].materiaaleina).toBe(false);
  });

  it("materiaalien yksikkökustannus kiinteästä hinnasta riippumatta", () => {
    const kiintea: Rakenneosa = { ...ulkoseina, unitPriceCents: 1, laborHoursPerUnit: 5 };
    // 2,75 × 350 + 1,05 × 900 + 1 × 600 = 2507,5 -> 2508; työtunnit eivät mukana
    expect(materiaalienYksikkokustannus(kiintea, hinnat).yhteensaSentit).toBe(2508);
  });

  it("rivin oma littera ja kustannuslaji korvaavat rakenneosan tiedot", () => {
    const kiintea: Rakenneosa = { ...ulkoseina, unitPriceCents: 1000, costType: "MATERIAALI", littera: { code: "3500", name: "Elementtituotanto" } };
    const rivit: Maararivi[] = [{ quantity: 1, structureType: kiintea, costType: "TEHDASTYO", littera }];
    expect(laskeKustannus(rivit, hinnat, null).tyoSentit).toBe(1000);
    expect(laskeKiinteatRivit(rivit)[0].littera).toEqual(littera);
  });

  it("myyntihinta katteella", () => {
    expect(myyntihinta(75000, 25)).toBe(100000);
    expect(myyntihinta(75000, 0)).toBe(75000);
  });
});
