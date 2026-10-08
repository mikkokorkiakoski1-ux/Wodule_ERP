import { describe, expect, it } from "vitest";
import { LASKENTARIVIT, LITTERAT, OLETUSSYOTE, laske, taydennaSyote, type Syote } from "./tarjouslaskenta";

// Vertailuarvot on laskettu alkuperäisellä laskurilla
// (taustamateriaali/Woodcomp_Kustannusarviolaskuri.html, calcEngine) samoilla
// syötteillä. Portaus täsmäsi kaikilla riveillä; nämä testit lukitsevat sen.
// Hajoava testi tarkoittaa, että laskenta poikkeaa alkuperäisestä laskurista.
const T = (m: Partial<Syote>): Syote => ({ ...OLETUSSYOTE, ...m });

const TAPAUKSET: { nimi: string; syote: Syote; omakustannus: number; tehdastyo: number; aliurakka: number; nollasta: number }[] = [
  { nimi: "oletus (harjakatto jyrkkä, parvi, KPH)", syote: T({}), omakustannus: 34673.31180054114, tehdastyo: 10185.912381867613, aliurakka: 3680, nollasta: 81 },
  {
    nimi: "iso pulpettikatto, terassi, sauna, varusteet",
    syote: T({
      leveys: 6000,
      pituus: 12000,
      katto: "Pulpetti 3° pidemmän lappeen suuntaa",
      sisakatto: "Tasakatto",
      terassi: 12,
      parvi: false,
      sauna: true,
      saunaAla: 3.2,
      keittio: "M Plus",
      eteisenKomero: 1,
      makuuhuoneenKomero: 2,
      takka: 1,
      ilp: 1,
      lattialammitysKuiva: true,
      umpiovet: 2,
      terassiovet: 1,
      ikkKiinteaKpl: 6,
      ikkKiinteaAla: 12,
      ikkAvattavaKpl: 3,
      ikkAvattavaAla: 2.5,
    }),
    omakustannus: 71835.67387871904,
    tehdastyo: 20933.937366787963,
    aliurakka: 6850,
    nollasta: 94,
  },
  {
    nimi: "loiva harjakatto ilman KPH:ta, kierreporras, päätykolmio 100 %",
    syote: T({ katto: "Harjakatto loiva 19,5°", kph: false, porras: "kierreporras Ø1200", paatykolmio: 100, ikkKiinteaKpl: 0, ikkAvattavaKpl: 0 }),
    omakustannus: 25512.396837899938,
    tehdastyo: 9097.120733945558,
    aliurakka: 3140,
    nollasta: 49,
  },
  {
    nimi: "lyhyen lappeen pulpetti, pitkä räystäs, XS-keittiö",
    syote: T({ katto: "Pulpetti 3° lyhemmän lappeen suuntaan", raystas: 400, sisakorkeus: 2600, keittio: "XS" }),
    omakustannus: 33502.62705564401,
    tehdastyo: 8907.97774846932,
    aliurakka: 3680,
    nollasta: 80,
  },
];

describe("laske (vastaa alkuperäistä laskuria)", () => {
  for (const t of TAPAUKSET) {
    it(t.nimi, () => {
      const l = laske(t.syote);
      expect(l.rivit).toHaveLength(104);
      expect(l.omakustannus).toBeCloseTo(t.omakustannus, 6);
      expect(l.tehdastyo).toBeCloseTo(t.tehdastyo, 6);
      expect(l.aliurakka).toBeCloseTo(t.aliurakka, 6);
      expect(l.rivit.filter((r) => r.summa !== 0)).toHaveLength(t.nollasta);
    });
  }

  it("päätykolmion kerroin vaikuttaa vain harjakattoon", () => {
    const harja = (k: number) => laske(T({ paatykolmio: k })).geometria.ulkoseinat;
    expect(harja(100)).toBeCloseTo(laske(T({})).geometria.ulkoseinatAlkuperainen, 10);
    expect(harja(0)).toBeLessThan(harja(50));
    const pulpetti = (k: number) => laske(T({ katto: "Pulpetti 3° lyhemmän lappeen suuntaan", paatykolmio: k })).omakustannus;
    expect(pulpetti(0)).toBe(pulpetti(100));
  });

  it("laskee katteet ja ALV:n kuten laskuri", () => {
    const l = laske(T({}));
    expect(l.myyntihinta).toBeCloseTo(l.omakustannus / 0.75, 8);
    expect(l.myyntihintaPuumesta).toBeCloseTo(l.myyntihinta / 0.9, 8);
    expect(l.myyntihintaPuumestaAlv).toBeCloseTo(l.myyntihintaPuumesta * 1.255, 8);
    expect(l.eurBm2).toBeCloseTo(l.omakustannus / 29.97, 8);
  });

  it("käyttää annettuja yksikköhintoja oletusten sijaan", () => {
    const perus = laske(T({}));
    const ulkoseina = perus.rivit.find((r) => r.avain === "3500-01")!;
    const korotettu = laske(T({}), { "3500-01": ulkoseina.hinta + 10 });
    expect(korotettu.omakustannus - perus.omakustannus).toBeCloseTo(10 * ulkoseina.maara, 8);
  });
});

describe("laskentarivit ja litterat", () => {
  it("jokainen rivi kuuluu tunnettuun litteraan ja avaimet ovat yksilöllisiä", () => {
    const koodit = new Set(LITTERAT.map((l) => l.koodi));
    for (const r of LASKENTARIVIT) expect(koodit.has(r.littera), r.avain).toBe(true);
    expect(new Set(LASKENTARIVIT.map((r) => r.avain)).size).toBe(LASKENTARIVIT.length);
  });
});

describe("taydennaSyote", () => {
  it("täydentää puuttuvat kentät oletuksilla ja hylkää väärät tyypit", () => {
    const s = taydennaSyote({ leveys: 5000, kph: "kyllä", katto: "Tuntematon" });
    expect(s.leveys).toBe(5000);
    expect(s.kph).toBe(OLETUSSYOTE.kph);
    expect(s.katto).toBe(OLETUSSYOTE.katto);
    expect(taydennaSyote(null)).toEqual(OLETUSSYOTE);
  });
});
