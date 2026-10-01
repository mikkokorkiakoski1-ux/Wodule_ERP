/**
 * Tiedonsiirron puhtaan logiikan testit: CSV, arvojen tulkinta ja muotoilu,
 * otsikoiden tunnistus. Tietokantaa käyttävää tuontia (kohteet.ts,
 * tuonti.ts:n tuo()) ei testata tässä.
 */
import { describe, expect, it } from "vitest";
import { jasennaCsv, muodostaCsv, puraTeksti, tunnistaErotin } from "./csv";
import {
  jasennaArvo,
  jasennaLuku,
  jasennaPvm,
  jasennaYtunnus,
  muotoileCsv,
  muotoileJson,
  normalisoi,
  type Sarake,
} from "./arvot";
import { KOHTEET, haeKohde } from "./kohteet";
import { kohdistaTaulukot, valmistele } from "./tuonti";
import { valilehdenNimi, type Taulukko } from "./tiedostot";

const utc = (v: number, kk: number, pv: number) => new Date(Date.UTC(v, kk - 1, pv));
const sarake = (tyyppi: Sarake["tyyppi"], lisa: Partial<Sarake> = {}): Sarake => ({ avain: "x", otsikko: "X", tyyppi, ...lisa });

describe("CSV", () => {
  it("tunnistaa erottimen otsikkoriviltä", () => {
    expect(tunnistaErotin("a;b;c\n1,5;2;3")).toBe(";");
    expect(tunnistaErotin("a,b,c\n1;2;3")).toBe(",");
    expect(tunnistaErotin("a\tb\n1\t2")).toBe("\t");
    expect(tunnistaErotin('"a;b",c,d')).toBe(",");
  });

  it("jäsentää lainaukset, rivinvaihdot ja tuplatut lainausmerkit", () => {
    expect(jasennaCsv('nimi;kuvaus\r\n"A; Oy";"rivi 1\nrivi 2"\r\n"Sanoi ""hei""";x\r\n')).toEqual([
      ["nimi", "kuvaus"],
      ["A; Oy", "rivi 1\nrivi 2"],
      ['Sanoi "hei"', "x"],
    ]);
  });

  it("säilyttää tyhjät rivit, jotta rivinumerot täsmäävät", () => {
    expect(jasennaCsv("a\n\nb\n")).toEqual([["a"], [""], ["b"]]);
  });

  it("muodostaa BOMin ja lainaa tarvittaessa, ja tulos jäsentyy takaisin samaksi", () => {
    const rivit = [
      ["Nimi", "Kuvaus"],
      ["A; Oy", 'Sanoi "hei"'],
    ];
    const csv = muodostaCsv(rivit);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(jasennaCsv(csv.slice(1))).toEqual(rivit);
  });

  it("purkaa UTF-8:n (BOM pois) ja Windows-1252:n", () => {
    expect(puraTeksti(new TextEncoder().encode("﻿Ääö"))).toBe("Ääö");
    expect(puraTeksti(new Uint8Array([0xc4, 0xe4, 0xf6]))).toBe("Ääö");
  });
});

describe("arvojen tulkinta", () => {
  it("luvut suomalaisessa ja kansainvälisessä muodossa", () => {
    expect(jasennaLuku("1 234,50")).toBe(1234.5);
    expect(jasennaLuku("1234.50")).toBe(1234.5);
    expect(jasennaLuku("1.234,50")).toBe(1234.5);
    expect(jasennaLuku("1,234.50")).toBe(1234.5);
    expect(jasennaLuku("12,5 €")).toBe(12.5);
    expect(jasennaLuku("−3")).toBe(-3);
    expect(jasennaLuku(7)).toBe(7);
    expect(jasennaLuku("abc")).toBeNull();
    expect(jasennaLuku("1,2,3")).toBeNull();
  });

  it("päivämäärät eri muodoissa UTC-keskiyöksi", () => {
    expect(jasennaPvm("31.12.2026")).toEqual(utc(2026, 12, 31));
    expect(jasennaPvm("1.2.26")).toEqual(utc(2026, 2, 1));
    expect(jasennaPvm("2026-06-29")).toEqual(utc(2026, 6, 29));
    expect(jasennaPvm("2026-06-29T00:00:00.000Z")).toEqual(utc(2026, 6, 29));
    expect(jasennaPvm(46202)).toEqual(utc(2026, 6, 29)); // Excelin sarjanumero
    expect(jasennaPvm(utc(2026, 6, 29))).toEqual(utc(2026, 6, 29));
    expect(jasennaPvm("31.2.2026")).toBeNull();
    expect(jasennaPvm("huomenna")).toBeNull();
  });

  it("Y-tunnuksen tarkiste", () => {
    expect(jasennaYtunnus("0112038-9")).toBe("0112038-9");
    expect(jasennaYtunnus("112038-9")).toBe("0112038-9");
    expect(jasennaYtunnus("01120389")).toBe("0112038-9");
    expect(jasennaYtunnus("0112038-8")).toBeNull();
    expect(jasennaYtunnus("abc")).toBeNull();
  });

  it("tyhjä solu tarkoittaa 'ei muutosta'", () => {
    expect(jasennaArvo("", sarake("teksti"))).toEqual({ arvo: undefined });
    expect(jasennaArvo("  ", sarake("luku"))).toEqual({ arvo: undefined });
    expect(jasennaArvo(null, sarake("pvm"))).toEqual({ arvo: undefined });
  });

  it("eurot muunnetaan senteiksi", () => {
    expect(jasennaArvo("1 234,56", sarake("euro"))).toEqual({ arvo: 123456 });
    expect(jasennaArvo(0.1 + 0.2, sarake("euro"))).toEqual({ arvo: 30 });
  });

  it("rajat ja kokonaisluvut", () => {
    expect(jasennaArvo("0", sarake("kokonaisluku", { min: 1 }))).toEqual({ virhe: "pienin sallittu arvo on 1" });
    expect(jasennaArvo("101", sarake("kokonaisluku", { max: 100 }))).toEqual({ virhe: "suurin sallittu arvo on 100" });
    expect(jasennaArvo("2,5", sarake("kokonaisluku"))).toHaveProperty("virhe");
  });

  it("valinta hyväksyy koodin tai nimen ilman ääkkösiä ja kirjainkokoa", () => {
    const s = sarake("valinta", { valinnat: [{ arvo: "HYVAKSYTTY", nimi: "Hyväksytty" }] });
    expect(jasennaArvo("hyväksytty", s)).toEqual({ arvo: "HYVAKSYTTY" });
    expect(jasennaArvo("HYVAKSYTTY", s)).toEqual({ arvo: "HYVAKSYTTY" });
    expect(jasennaArvo("hylätty", s)).toHaveProperty("virhe");
  });

  it("totuusarvot", () => {
    expect(jasennaArvo("kyllä", sarake("totuus"))).toEqual({ arvo: true });
    expect(jasennaArvo("X", sarake("totuus"))).toEqual({ arvo: true });
    expect(jasennaArvo("ei", sarake("totuus"))).toEqual({ arvo: false });
    expect(jasennaArvo(0, sarake("totuus"))).toEqual({ arvo: false });
    expect(jasennaArvo("ehkä", sarake("totuus"))).toHaveProperty("virhe");
  });

  it("sähköposti ja url tarkistetaan", () => {
    expect(jasennaArvo("a@b.fi", sarake("sahkoposti"))).toEqual({ arvo: "a@b.fi" });
    expect(jasennaArvo("a@b", sarake("sahkoposti"))).toHaveProperty("virhe");
    expect(jasennaArvo("https://x.sharepoint.com/a", sarake("url"))).toEqual({ arvo: "https://x.sharepoint.com/a" });
    expect(jasennaArvo("javascript:alert(1)", sarake("url"))).toHaveProperty("virhe");
  });

  it("vain vientiin tarkoitetut aikaleimat ohitetaan tuonnissa", () => {
    expect(jasennaArvo("30.9.2026 klo 13.09", sarake("aikaleima"))).toEqual({ arvo: undefined });
  });
});

describe("arvojen muotoilu", () => {
  it("CSV suomalaisittain", () => {
    expect(muotoileCsv(123456, sarake("euro"))).toBe("1234,56");
    expect(muotoileCsv(12.5, sarake("luku"))).toBe("12,5");
    expect(muotoileCsv(utc(2026, 6, 29), sarake("pvm"))).toBe("29.6.2026");
    expect(muotoileCsv(true, sarake("totuus"))).toBe("kyllä");
    expect(muotoileCsv(null, sarake("teksti"))).toBe("");
  });

  it("CSV suojaa kaavoilta ja tuonti poistaa suojauksen", () => {
    const s = sarake("teksti");
    expect(muotoileCsv("=SUMMA(A1)", s)).toBe("'=SUMMA(A1)");
    expect(jasennaArvo("'=SUMMA(A1)", s)).toEqual({ arvo: "=SUMMA(A1)" });
  });

  it("JSON kansainvälisesti ja eurot euroina", () => {
    expect(muotoileJson(123456, sarake("euro"))).toBe(1234.56);
    expect(muotoileJson(utc(2026, 6, 29), sarake("pvm"))).toBe("2026-06-29");
  });

  it("muotoilu ja tulkinta kulkevat edestakaisin", () => {
    const tapaukset: [Sarake, unknown][] = [
      [sarake("euro"), 99999],
      [sarake("luku"), 0.75],
      [sarake("pvm"), utc(2027, 1, 5)],
      [sarake("totuus"), false],
      [sarake("valinta", { valinnat: [{ arvo: "KAYNNISSA", nimi: "Käynnissä" }] }), "KAYNNISSA"],
    ];
    for (const [s, arvo] of tapaukset) {
      expect(jasennaArvo(muotoileCsv(arvo as never, s), s)).toEqual({ arvo });
      expect(jasennaArvo(muotoileJson(arvo as never, s), s)).toEqual({ arvo });
    }
  });
});

describe("kohteet", () => {
  it("avaimet, sarakeavaimet ja normalisoidut otsikot ovat yksilöllisiä", () => {
    expect(new Set(KOHTEET.map((k) => k.avain)).size).toBe(KOHTEET.length);
    for (const k of KOHTEET) {
      expect(new Set(k.sarakkeet.map((s) => s.avain)).size, k.avain).toBe(k.sarakkeet.length);
      expect(new Set(k.sarakkeet.map((s) => normalisoi(s.otsikko))).size, k.avain).toBe(k.sarakkeet.length);
    }
  });

  it("Excel-välilehtien nimet ovat sallittuja ja yksilöllisiä", () => {
    const nimet = KOHTEET.map(valilehdenNimi);
    expect(new Set(nimet).size).toBe(nimet.length);
    for (const n of nimet) expect(n.length).toBeLessThanOrEqual(31);
  });

  it("pakolliset sarakkeet eivät ole vain vientiä varten", () => {
    for (const k of KOHTEET) for (const s of k.sarakkeet) expect(s.pakollinen && s.vainVienti, `${k.avain}.${s.avain}`).toBeFalsy();
  });
});

describe("otsikoiden tunnistus ja rivien valmistelu", () => {
  const taulukko = (...rivit: unknown[][]): Taulukko => ({ rivit: rivit.map((solut, i) => ({ nro: i + 1, solut })) });
  const nimikkeet = haeKohde("nimikkeet")!;

  it("tunnistaa otsikon, avaimen ja aliaksen kirjainkoosta ja ääkkösistä riippumatta", () => {
    const v = valmistele(nimikkeet, taulukko(["KOODI", "name", "yksikko", "Luotu", "Värikoodi"], ["A-1", "Aa", "kpl", "x", "sininen"]));
    expect(v.raportti.tunnistetut.map((t) => t.sarake)).toEqual(["Koodi", "Nimi", "Yksikkö"]);
    expect(v.raportti.vainVienti).toEqual(["Luotu"]);
    expect(v.raportti.tuntemattomat).toEqual(["Värikoodi"]);
    expect(v.rivit[0].arvot).toEqual({ koodi: "A-1", nimi: "Aa", yksikko: "kpl" });
  });

  it("ilmoittaa puuttuvat pakolliset sarakkeet ja tyhjät pakolliset solut", () => {
    expect(valmistele(nimikkeet, taulukko(["Koodi"], ["A-1"])).raportti.puuttuvatPakolliset).toEqual(["Nimi"]);
    const v = valmistele(nimikkeet, taulukko(["Koodi", "Nimi"], ["A-1", ""]));
    expect(v.rivit[0].virheet).toEqual(["Nimi on pakollinen"]);
  });

  it("löytää otsikkorivin otsikkorivien alta ja ohittaa muut kuin tekstiotsikot", () => {
    // Kuten projektinhallinnan Excel: otsikot rivillä 3, yläpuolella projektin tiedot, oikealla Gantt-päivämääriä.
    const v = valmistele(
      nimikkeet,
      taulukko(["PROJEKTI", "Firstcamp"], [], ["Koodi", "Nimi", new Date(2026, 0, 1)], ["A-1", "Aa", "x"], [null, null, "y"])
    );
    expect(v.raportti.tunnistetut.map((t) => t.sarake)).toEqual(["Koodi", "Nimi"]);
    expect(v.raportti.tuntemattomat).toEqual([]);
    // Viimeisellä rivillä on arvo vain tunnistamattomassa sarakkeessa, joten se ohitetaan.
    expect(v.rivit).toHaveLength(1);
  });

  it("oletusarvot täyttävät puuttuvan pakollisen sarakkeen ja tyhjät solut", () => {
    const projektit = haeKohde("aikataulutehtavat")!;
    const v = valmistele(projektit, taulukko(["Tehtävätunnus", "Tehtävä", "Kesto"], ["T1", "Suunnittelu", 5]), { projekti: "Iglut" });
    expect(v.raportti.puuttuvatPakolliset).toEqual([]);
    expect(v.rivit[0].arvot).toMatchObject({ projekti: "Iglut", tunnus: "T1", kesto: 5 });
  });

  it("kohdistaa välilehdet kohteisiin riippuvuusjärjestyksessä ja ohittaa tunnistamattomat", () => {
    const t = (nimi: string): Taulukko => ({ nimi, rivit: [{ nro: 1, solut: ["x"] }, { nro: 2, solut: ["y"] }] });
    const { parit, ohitetut } = kohdistaTaulukot([t("Tarjoukset"), t("Muistiinpanot"), t("asiakkaat"), t("Ohjeet")], "automaattinen");
    expect(parit.map((p) => p.kohde.avain)).toEqual(["asiakkaat", "tarjoukset"]);
    expect(ohitetut).toEqual(["Muistiinpanot"]);
  });
});
