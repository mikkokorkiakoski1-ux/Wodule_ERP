/**
 * Tiedonsiirron kohteet: jokainen tuotava ja vietävä tietotyyppi.
 *
 * Kukin kohde määrittää sarakkeensa, viennin (hae) ja yhden rivin tuonnin
 * (tuoRivi). Viittaukset toisiin tietoihin kulkevat luettavilla avaimilla
 * (asiakkaan nimi tai Y-tunnus, nimikekoodi, projektin nimi), ei
 * tietokantatunnisteilla, jotta tiedostoja voi muokata Excelissä ja tuoda
 * toisesta järjestelmästä.
 *
 * Rivin tunnistus (luodaanko uusi vai päivitetäänkö olemassa oleva):
 *  1. "Tunniste"-sarake (id), jos se on annettu ja löytyy.
 *  2. Kohteen luonnollinen avain (esim. nimikkeen koodi).
 *  3. Muuten luodaan uusi rivi. Annettu tunniste säilyy, joten
 *     varmuuskopion palautus tyhjään kantaan säilyttää tunnisteet.
 *
 * Tyhjä solu tai puuttuva sarake = kenttään ei kosketa päivityksessä.
 * Prisma ohittaa undefined-kentät, joten sama olio kelpaa sekä luontiin
 * että päivitykseen.
 *
 * Kohteet ovat riippuvuusjärjestyksessä: "kaikki"-tuonti käsittelee ne
 * tässä järjestyksessä, jotta esim. asiakkaat ovat olemassa ennen tarjouksia.
 */
import type { Prisma } from "@prisma/client";
import { recompute, statusLabel } from "@/lib/production-schedule";
import { isoViikko, laskeProjektiaikataulu } from "@/lib/projektiaikataulu";
import { VAIHEET, laskeTakarajat } from "@/lib/hankinta";
import { jasennaYtunnus, type Arvo, type Sarake, type Valinta } from "./arvot";

export type Tx = Prisma.TransactionClient;
export type Tuontitapa = "lisaa-ja-paivita" | "vain-uudet" | "vain-paivita";
export type RiviTulos = "luotu" | "paivitetty" | "ohitettu";
export type Arvot = Record<string, Arvo | undefined>;

/** Rivikohtainen, käyttäjälle näytettävä virhe. */
export class RiviVirhe extends Error {}

export interface Kohde {
  avain: string;
  nimi: string;
  osio: string;
  kuvaus: string;
  /** Miten tuotava rivi yhdistetään olemassa olevaan. */
  tunnistus: string;
  sarakkeet: Sarake[];
  maara(db: Tx): Promise<number>;
  hae(db: Tx): Promise<Arvot[]>;
  tuoRivi(a: Arvot, tx: Tx, tapa: Tuontitapa): Promise<{ tulos: RiviTulos; tunniste: string }>;
}

// ------------------------------------------------------------
// Valinnat (enumien suomenkieliset nimet)
// ------------------------------------------------------------

const TARJOUKSEN_TILAT: Valinta[] = [
  { arvo: "LUONNOS", nimi: "Luonnos" },
  { arvo: "LAHETETTY", nimi: "Lähetetty" },
  { arvo: "HYVAKSYTTY", nimi: "Hyväksytty" },
  { arvo: "HYLATTY", nimi: "Hylätty" },
];

const PROJEKTIN_TILAT: Valinta[] = [
  { arvo: "SUUNNITTELU", nimi: "Suunnittelu" },
  { arvo: "KAYNNISSA", nimi: "Käynnissä" },
  { arvo: "VALMIS", nimi: "Valmis" },
  { arvo: "KESKEYTETTY", nimi: "Keskeytetty" },
];

const HANKINNAN_TYYPIT: Valinta[] = [
  { arvo: "MATERIAALI", nimi: "Materiaali" },
  { arvo: "TYOSUORITE", nimi: "Työsuorite" },
  // Excelin kirjoitusasut; vienti käyttää yllä olevia nimiä.
  { arvo: "MATERIAALI", nimi: "Materiaalit" },
  { arvo: "TYOSUORITE", nimi: "Työsuoritteet" },
];

const HANKINNAN_VAIHEET: Valinta[] = VAIHEET.map((v) => ({ arvo: v.arvo, nimi: v.nimi }));

const TEHTAVAN_ALUEET: Valinta[] = [
  { arvo: "LUVITUS", nimi: "Luvitus" },
  { arvo: "SUUNNITTELU", nimi: "Suunnittelu" },
  { arvo: "HANKINTA", nimi: "Hankinta" },
  { arvo: "MUU", nimi: "Muu" },
];

const TEHTAVAN_TILAT: Valinta[] = [
  { arvo: "AVOIN", nimi: "Avoin" },
  { arvo: "KESKEN", nimi: "Kesken" },
  { arvo: "VALMIS", nimi: "Valmis" },
];

const HENKILON_ROOLIT: Valinta[] = [
  { arvo: "ADMIN", nimi: "Ylläpitäjä" },
  { arvo: "MYYNTI", nimi: "Myynti" },
  { arvo: "SUUNNITTELU", nimi: "Suunnittelu" },
  { arvo: "HANKINTA", nimi: "Hankinta" },
  { arvo: "TUOTANTO", nimi: "Tuotanto" },
  { arvo: "LAATU", nimi: "Laatu" },
];

const RAKENNEKATEGORIAT: Valinta[] = [
  { arvo: "ULKOSEINA", nimi: "Ulkoseinä" },
  { arvo: "VALISEINA", nimi: "Väliseinä" },
  { arvo: "ALAPOHJA", nimi: "Alapohja" },
  { arvo: "VALIPOHJA", nimi: "Välipohja" },
  { arvo: "YLAPOHJA", nimi: "Yläpohja" },
  { arvo: "KATTO", nimi: "Katto" },
  { arvo: "TILAELEMENTTI", nimi: "Tilaelementti" },
  { arvo: "IKKUNA", nimi: "Ikkuna" },
  { arvo: "OVI", nimi: "Ovi" },
  { arvo: "TEKNIIKKA", nimi: "Tekniikka" },
  { arvo: "KALUSTE", nimi: "Kaluste" },
  { arvo: "MUU", nimi: "Muu" },
];

const RAKENNEOSAN_LAJIT: Valinta[] = [
  { arvo: "RAKENNE", nimi: "Rakenne" },
  { arvo: "OSTONIMIKE", nimi: "Ostonimike" },
];

const RAKENNUKSEN_TILAT: Valinta[] = [
  { arvo: "SUUNNITTELU", nimi: "Suunnittelu" },
  { arvo: "VALMISTUKSESSA", nimi: "Valmistuksessa" },
  { arvo: "TOIMITETTU", nimi: "Toimitettu" },
  { arvo: "VALMIS", nimi: "Valmis" },
];

const ELEMENTIN_TILAT: Valinta[] = [
  { arvo: "SUUNNITTEILLA", nimi: "Suunnitteilla" },
  { arvo: "VALMISTUKSESSA", nimi: "Valmistuksessa" },
  { arvo: "VALMIS", nimi: "Valmis" },
  { arvo: "TOIMITETTU", nimi: "Toimitettu" },
  { arvo: "ASENNETTU", nimi: "Asennettu" },
];

const MAARAN_LAHTEET: Valinta[] = [
  { arvo: "KASIN", nimi: "Käsin" },
  { arvo: "BIM", nimi: "BIM" },
  { arvo: "LASKURI", nimi: "Laskuri" },
];

const KUSTANNUSLAJIT: Valinta[] = [
  { arvo: "MATERIAALI", nimi: "Materiaali / osto" },
  { arvo: "MATERIAALI", nimi: "Materiaali" },
  { arvo: "TEHDASTYO", nimi: "Tehdastyö" },
  { arvo: "TEHDASTYO", nimi: "TEH-TYÖ" },
  { arvo: "ALIURAKKA", nimi: "Aliurakka" },
];

const REKLAMAATION_TILAT: Valinta[] = [
  { arvo: "AVOIN", nimi: "Avoin" },
  { arvo: "SELVITYKSESSA", nimi: "Selvityksessä" },
  { arvo: "RATKAISTU", nimi: "Ratkaistu" },
  { arvo: "HYLATTY", nimi: "Hylätty" },
];

// ------------------------------------------------------------
// Yhteiset sarakkeet
// ------------------------------------------------------------

const TUNNISTE: Sarake = {
  avain: "id",
  otsikko: "Tunniste",
  tyyppi: "teksti",
  aliakset: ["id"],
  kuvaus: "Järjestelmän sisäinen tunniste. Jätä tyhjäksi uusille riveille.",
};

const LUOTU: Sarake = { avain: "luotu", otsikko: "Luotu", tyyppi: "aikaleima", vainVienti: true };
const PAIVITETTY: Sarake = { avain: "paivitetty", otsikko: "Päivitetty", tyyppi: "aikaleima", vainVienti: true };

const ASIAKAS: Sarake = {
  avain: "asiakas",
  otsikko: "Asiakas",
  tyyppi: "teksti",
  pakollinen: true,
  aliakset: ["customer", "asiakkaan nimi"],
  kuvaus: "Asiakkaan nimi tai Y-tunnus.",
  esimerkki: "Esimerkki Oy",
};

const ASIAKKAAN_YTUNNUS: Sarake = {
  avain: "asiakasYtunnus",
  otsikko: "Asiakkaan Y-tunnus",
  tyyppi: "ytunnus",
  kuvaus: "Jos annettu, asiakas etsitään tällä nimen sijaan.",
};

const PROJEKTI: Sarake = {
  avain: "projekti",
  otsikko: "Projekti",
  tyyppi: "teksti",
  pakollinen: true,
  aliakset: ["project", "projektin nimi"],
  kuvaus: "Projektin nimi. Jos samannimisiä on useita, anna myös Asiakas.",
  esimerkki: "Esimerkkiprojekti",
};

const PROJEKTIN_ASIAKAS: Sarake = {
  ...ASIAKAS,
  pakollinen: false,
  kuvaus: "Projektin asiakas (nimi tai Y-tunnus). Tarvitaan vain, jos projektin nimi ei yksin riitä.",
};

const VALINNAINEN_PROJEKTI: Sarake = { ...PROJEKTI, pakollinen: false, kuvaus: "Projektin nimi, johon rivi kohdistuu. Vapaaehtoinen." };

const RAKENNUS: Sarake = {
  avain: "rakennus",
  otsikko: "Rakennus",
  tyyppi: "teksti",
  aliakset: ["building", "rakennuksen tunnus", "rakennustunnus"],
  kuvaus: "Rakennuksen tunnus projektissa (esim. A). Vaatii Projekti-sarakkeen.",
  esimerkki: "A",
};

const ELEMENTTI: Sarake = {
  avain: "elementti",
  otsikko: "Elementti",
  tyyppi: "teksti",
  aliakset: ["element", "elementtitunnus"],
  kuvaus: "Elementin tunnus rakennuksessa. Vaatii Rakennus-sarakkeen.",
  esimerkki: "A-US-01",
};

const BIM_GUID: Sarake = {
  avain: "bimGuid",
  otsikko: "BIM GUID",
  tyyppi: "teksti",
  aliakset: ["guid", "globalid", "global id", "ifcguid", "ifc guid", "ifcglobalid"],
  kuvaus: "BIM-mallin olion GlobalId. Uusintatuonti päivittää saman GUID:n rivin.",
};

// ------------------------------------------------------------
// Apufunktiot
// ------------------------------------------------------------

const eiKirjainkokoa = (arvo: string) => ({ equals: arvo, mode: "insensitive" as const });

function teksti(a: Arvot, avain: string): string | undefined {
  const v = a[avain];
  return v === undefined || v === null ? undefined : String(v);
}

async function tallenna<T>(
  tapa: Tuontitapa,
  olemassa: T | null,
  luo: () => Promise<unknown>,
  paivita: (o: T) => Promise<unknown>
): Promise<RiviTulos> {
  if (olemassa) {
    if (tapa === "vain-uudet") return "ohitettu";
    await paivita(olemassa);
    return "paivitetty";
  }
  if (tapa === "vain-paivita") return "ohitettu";
  await luo();
  return "luotu";
}

/** Palauttaa rivin, jos tunniste on annettu ja löytyy; muuten null. */
async function idlla<T>(a: Arvot, haku: (id: string) => Promise<T | null>): Promise<T | null> {
  const id = teksti(a, "id");
  return id ? haku(id) : null;
}

function yksi<T>(osumat: T[], kuvaus: string, vihje: string): T {
  if (osumat.length === 0) throw new RiviVirhe(`${kuvaus} ei löydy`);
  if (osumat.length > 1) throw new RiviVirhe(`${kuvaus} löytyy useita (${osumat.length}). ${vihje}`);
  return osumat[0];
}

/** Etsii asiakkaan Y-tunnuksella (erillinen sarake tai tunnuksen näköinen arvo) tai nimellä. */
async function etsiAsiakas(tx: Tx, nimiTaiTunnus: string, ytunnus?: string): Promise<{ id: string; name: string }> {
  const tunnus = ytunnus ?? jasennaYtunnus(nimiTaiTunnus);
  if (tunnus) {
    const osumat = await tx.customer.findMany({ where: { businessId: tunnus }, select: { id: true, name: true } });
    return yksi(osumat, `Asiakasta Y-tunnuksella ${tunnus}`, "Korjaa päällekkäiset Y-tunnukset asiakkaisiin.");
  }
  const osumat = await tx.customer.findMany({
    where: { name: eiKirjainkokoa(nimiTaiTunnus) },
    select: { id: true, name: true },
  });
  return yksi(osumat, `Asiakasta "${nimiTaiTunnus}"`, "Käytä nimen sijaan Y-tunnusta.");
}

async function etsiProjekti(tx: Tx, a: Arvot): Promise<{ id: string; name: string }> {
  const nimi = teksti(a, "projekti")!;
  const asiakasNimi = teksti(a, "asiakas");
  const asiakasId = asiakasNimi
    ? (await etsiAsiakas(tx, asiakasNimi, teksti(a, "asiakasYtunnus"))).id
    : undefined;
  const osumat = await tx.project.findMany({
    where: { name: eiKirjainkokoa(nimi), ...(asiakasId ? { customerId: asiakasId } : {}) },
    select: { id: true, name: true },
  });
  return yksi(osumat, `Projektia "${nimi}"`, "Anna myös Asiakas-sarake.");
}

/** Etsii henkilön sähköpostilla (jos arvossa on @) tai nimellä. */
async function etsiHenkilo(tx: Tx, nimiTaiEmail: string): Promise<{ id: string; name: string }> {
  const osumat = nimiTaiEmail.includes("@")
    ? await tx.user.findMany({ where: { email: nimiTaiEmail.toLowerCase() }, select: { id: true, name: true } })
    : await tx.user.findMany({ where: { name: eiKirjainkokoa(nimiTaiEmail) }, select: { id: true, name: true } });
  return yksi(osumat, `Henkilöä "${nimiTaiEmail}"`, "Käytä sähköpostiosoitetta.");
}

async function etsiNimike(tx: Tx, koodi: string) {
  const nimike = await tx.product.findUnique({ where: { code: koodi } });
  if (!nimike) throw new RiviVirhe(`Nimikettä koodilla "${koodi}" ei löydy`);
  return nimike;
}

async function etsiHinnasto(tx: Tx, nimi: string) {
  const osumat = await tx.priceList.findMany({ where: { name: eiKirjainkokoa(nimi) } });
  return yksi(osumat, `Hinnastoa "${nimi}"`, "Nimeä hinnastot yksilöllisesti.");
}

async function etsiTarkastuslista(tx: Tx, otsikko: string) {
  const osumat = await tx.qaChecklist.findMany({ where: { title: eiKirjainkokoa(otsikko) } });
  return yksi(osumat, `Tarkastuslistaa "${otsikko}"`, "Nimeä tarkastuslistat yksilöllisesti.");
}

/** Projektin tuotantokansio; luodaan tarvittaessa (työmääräimet ja piirustukset). */
async function tuotantokansio(tx: Tx, projectId: string) {
  return tx.productionFolder.upsert({ where: { projectId }, create: { projectId }, update: {} });
}

/** Rakenneosa koodilla tai BIM-tyyppinimellä (mallin määräluettelon tyyppisarake). */
async function etsiRakenneosa(tx: Tx, koodiTaiBim: string) {
  const tyyppi =
    (await tx.structureType.findUnique({ where: { code: koodiTaiBim.toUpperCase() } })) ??
    (await tx.structureType.findFirst({ where: { bimTypeName: eiKirjainkokoa(koodiTaiBim) } }));
  if (!tyyppi) throw new RiviVirhe(`Rakenneosaa "${koodiTaiBim}" ei löydy koodilla eikä BIM-tyyppinimellä`);
  return tyyppi;
}

async function etsiLittera(tx: Tx, koodi: string) {
  const l = await tx.littera.findUnique({ where: { code: koodi } });
  if (!l) throw new RiviVirhe(`Litteraa "${koodi}" ei löydy. Tuo se ensin Litterat-kohteena.`);
  return l;
}

async function etsiRakennus(tx: Tx, projectId: string, tunnus: string) {
  const osumat = await tx.building.findMany({ where: { projectId, code: eiKirjainkokoa(tunnus) } });
  return yksi(osumat, `Rakennusta "${tunnus}"`, "Rakennuksen tunnus on yksilöllinen projektissa.");
}

async function etsiElementti(tx: Tx, buildingId: string, tunnus: string) {
  const e = await tx.productionElement.findFirst({ where: { buildingId, code: eiKirjainkokoa(tunnus) } });
  if (!e) throw new RiviVirhe(`Elementtiä "${tunnus}" ei löydy rakennuksesta`);
  return e;
}

/**
 * Valinnainen kohdistus Projekti-, Rakennus- ja Elementti-sarakkeista
 * (reklamaatiot, tarkastukset, dokumentit, työmääräimet, piirustukset).
 * Tyhjät sarakkeet = kohdistukseen ei kosketa.
 */
async function kohdistusSarakkeista(tx: Tx, a: Arvot, projectId?: string) {
  const rakennusTunnus = teksti(a, "rakennus");
  const elementtiTunnus = teksti(a, "elementti");
  const pid = projectId ?? (teksti(a, "projekti") ? (await etsiProjekti(tx, a)).id : undefined);
  if ((rakennusTunnus || elementtiTunnus) && !pid) throw new RiviVirhe("Rakennus tai elementti vaatii Projekti-sarakkeen");
  if (elementtiTunnus && !rakennusTunnus) throw new RiviVirhe("Elementti vaatii Rakennus-sarakkeen");
  const rakennus = rakennusTunnus ? await etsiRakennus(tx, pid!, rakennusTunnus) : undefined;
  const elementti = elementtiTunnus ? await etsiElementti(tx, rakennus!.id, elementtiTunnus) : undefined;
  return { projectId: pid, buildingId: rakennus?.id, elementId: elementti?.id };
}

type Kohdistettu = {
  building?: { code: string; project?: { name: string } | null } | null;
  element?: { code: string } | null;
};

/** Kohdistuksen vientisarakkeet. */
function kohdistusVientiin(r: Kohdistettu) {
  return { rakennus: r.building?.code ?? null, elementti: r.element?.code ?? null };
}

// ============================================================
// 1. Asiakkuuksien hallinta
// ============================================================

const asiakkaat: Kohde = {
  avain: "asiakkaat",
  nimi: "Asiakkaat",
  osio: "Asiakkuuksien hallinta",
  kuvaus: "Asiakasrekisteri: nimi, Y-tunnus ja yhteystiedot.",
  tunnistus: "Tunniste, sitten Y-tunnus, sitten nimi (kirjainkoolla ei väliä).",
  sarakkeet: [
    TUNNISTE,
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", pakollinen: true, aliakset: ["name", "asiakas", "yritys"], esimerkki: "Esimerkki Oy" },
    { avain: "ytunnus", otsikko: "Y-tunnus", tyyppi: "ytunnus", aliakset: ["business id", "ytunnus", "y tunnus"] },
    { avain: "yhteyshenkilo", otsikko: "Yhteyshenkilö", tyyppi: "teksti", aliakset: ["contact", "contact name"], esimerkki: "Maija Meikäläinen" },
    { avain: "sahkoposti", otsikko: "Sähköposti", tyyppi: "sahkoposti", aliakset: ["email", "e-mail", "sposti"], esimerkki: "maija@esimerkki.fi" },
    { avain: "puhelin", otsikko: "Puhelin", tyyppi: "teksti", aliakset: ["phone", "puh", "puhelinnumero"], esimerkki: "040 123 4567" },
    LUOTU,
    PAIVITETTY,
  ],
  maara: (db) => db.customer.count(),
  async hae(db) {
    const rivit = await db.customer.findMany({ orderBy: { name: "asc" } });
    return rivit.map((c) => ({
      id: c.id,
      nimi: c.name,
      ytunnus: c.businessId,
      yhteyshenkilo: c.contactName,
      sahkoposti: c.contactEmail,
      puhelin: c.contactPhone,
      luotu: c.createdAt,
      paivitetty: c.updatedAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const nimi = teksti(a, "nimi")!;
    const ytunnus = teksti(a, "ytunnus");
    let olemassa = await idlla(a, (id) => tx.customer.findUnique({ where: { id } }));
    if (!olemassa && ytunnus) olemassa = await tx.customer.findFirst({ where: { businessId: ytunnus } });
    if (!olemassa) {
      const osumat = await tx.customer.findMany({ where: { name: eiKirjainkokoa(nimi) } });
      if (osumat.length > 1) throw new RiviVirhe(`Nimellä "${nimi}" löytyy useita asiakkaita. Lisää Y-tunnus tai Tunniste.`);
      // Samanniminen asiakas eri Y-tunnuksella on eri asiakas.
      olemassa = osumat.find((o) => !ytunnus || !o.businessId || o.businessId === ytunnus) ?? null;
    }
    const data = {
      name: nimi,
      businessId: ytunnus,
      contactName: teksti(a, "yhteyshenkilo"),
      contactEmail: teksti(a, "sahkoposti"),
      contactPhone: teksti(a, "puhelin"),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.customer.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.customer.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: nimi };
  },
};

const tarjoukset: Kohde = {
  avain: "tarjoukset",
  nimi: "Tarjoukset",
  osio: "Asiakkuuksien hallinta",
  kuvaus: "Asiakkaille tehdyt tarjoukset, tila ja summa.",
  tunnistus: "Tunniste, sitten asiakas + otsikko.",
  sarakkeet: [
    TUNNISTE,
    ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "otsikko", otsikko: "Otsikko", tyyppi: "teksti", pakollinen: true, aliakset: ["title", "tarjous"], esimerkki: "Tarjous: 3 rakennusta" },
    { avain: "tila", otsikko: "Tila", tyyppi: "valinta", valinnat: TARJOUKSEN_TILAT, aliakset: ["status"], esimerkki: "LAHETETTY" },
    { avain: "summa", otsikko: "Summa (€)", tyyppi: "euro", min: 0, aliakset: ["summa", "amount", "hinta"], esimerkki: 125000 },
    { avain: "voimassa", otsikko: "Voimassa asti", tyyppi: "pvm", aliakset: ["valid until", "voimassa"], esimerkki: new Date(Date.UTC(2026, 11, 31)) },
    LUOTU,
    PAIVITETTY,
  ],
  maara: (db) => db.offer.count(),
  async hae(db) {
    const rivit = await db.offer.findMany({ include: { customer: true }, orderBy: [{ customer: { name: "asc" } }, { title: "asc" }] });
    return rivit.map((o) => ({
      id: o.id,
      asiakas: o.customer.name,
      asiakasYtunnus: o.customer.businessId,
      otsikko: o.title,
      tila: o.status,
      summa: o.amountCents,
      voimassa: o.validUntil,
      luotu: o.createdAt,
      paivitetty: o.updatedAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const asiakas = await etsiAsiakas(tx, teksti(a, "asiakas")!, teksti(a, "asiakasYtunnus"));
    const otsikko = teksti(a, "otsikko")!;
    let olemassa = await idlla(a, (id) => tx.offer.findUnique({ where: { id } }));
    olemassa ??= await tx.offer.findFirst({ where: { customerId: asiakas.id, title: eiKirjainkokoa(otsikko) } });
    const data = {
      customerId: asiakas.id,
      title: otsikko,
      status: a.tila as Prisma.OfferCreateInput["status"],
      amountCents: a.summa as number | undefined,
      validUntil: a.voimassa as Date | undefined,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.offer.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.offer.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${asiakas.name}: ${otsikko}` };
  },
};

const projektit: Kohde = {
  avain: "projektit",
  nimi: "Projektit",
  osio: "Projektit",
  kuvaus: "Projektit asiakkaineen, tiloineen ja luvattuine toimituspäivineen.",
  tunnistus: "Tunniste, sitten asiakas + projektin nimi.",
  sarakkeet: [
    TUNNISTE,
    ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", pakollinen: true, aliakset: ["name", "projekti", "projektin nimi"], esimerkki: "Esimerkkiprojekti" },
    { avain: "tila", otsikko: "Tila", tyyppi: "valinta", valinnat: PROJEKTIN_TILAT, aliakset: ["status"], esimerkki: "SUUNNITTELU" },
    { avain: "kuvaus", otsikko: "Kuvaus", tyyppi: "teksti", aliakset: ["description"] },
    { avain: "luvattu", otsikko: "Luvattu toimitus", tyyppi: "pvm", aliakset: ["toimitus", "luvattu toimituspaiva", "delivery"], esimerkki: new Date(Date.UTC(2026, 10, 30)) },
    { avain: "tarjous", otsikko: "Tarjous", tyyppi: "teksti", kuvaus: "Saman asiakkaan tarjouksen otsikko, johon projekti perustuu." },
    LUOTU,
    PAIVITETTY,
  ],
  maara: (db) => db.project.count(),
  async hae(db) {
    const rivit = await db.project.findMany({
      include: { customer: true, offer: true },
      orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
    });
    return rivit.map((p) => ({
      id: p.id,
      asiakas: p.customer.name,
      asiakasYtunnus: p.customer.businessId,
      nimi: p.name,
      tila: p.status,
      kuvaus: p.description,
      luvattu: p.promisedDeliveryDate,
      tarjous: p.offer?.title ?? null,
      luotu: p.createdAt,
      paivitetty: p.updatedAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const asiakas = await etsiAsiakas(tx, teksti(a, "asiakas")!, teksti(a, "asiakasYtunnus"));
    const nimi = teksti(a, "nimi")!;
    let olemassa = await idlla(a, (id) => tx.project.findUnique({ where: { id } }));
    olemassa ??= await tx.project.findFirst({ where: { customerId: asiakas.id, name: eiKirjainkokoa(nimi) } });

    let offerId: string | undefined;
    const tarjous = teksti(a, "tarjous");
    if (tarjous) {
      const osumat = await tx.offer.findMany({ where: { customerId: asiakas.id, title: eiKirjainkokoa(tarjous) }, include: { project: true } });
      const o = yksi(osumat, `Asiakkaan ${asiakas.name} tarjousta "${tarjous}"`, "Nimeä tarjoukset yksilöllisesti.");
      if (o.project && o.project.id !== olemassa?.id) {
        throw new RiviVirhe(`Tarjous "${tarjous}" on jo liitetty projektiin "${o.project.name}"`);
      }
      offerId = o.id;
    }

    const data = {
      customerId: asiakas.id,
      name: nimi,
      status: a.tila as Prisma.ProjectCreateInput["status"],
      description: teksti(a, "kuvaus"),
      promisedDeliveryDate: a.luvattu as Date | undefined,
      offerId,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.project.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.project.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${asiakas.name}: ${nimi}` };
  },
};

const tilausvahvistukset: Kohde = {
  avain: "tilausvahvistukset",
  nimi: "Tilausvahvistukset",
  osio: "Projektit",
  kuvaus: "Projektien tilausvahvistukset (yksi per projekti).",
  tunnistus: "Tunniste, sitten numero, sitten projektin nykyinen tilausvahvistus.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "numero", otsikko: "Numero", tyyppi: "teksti", pakollinen: true, aliakset: ["number", "tilausvahvistus", "tv numero"], esimerkki: "TV-2026-001" },
    { avain: "vahvistettu", otsikko: "Vahvistettu", tyyppi: "pvm", aliakset: ["confirmed", "pvm"], esimerkki: new Date(Date.UTC(2026, 8, 1)) },
    { avain: "tiedosto", otsikko: "Tiedosto", tyyppi: "url", aliakset: ["file", "fileurl", "liite"] },
    { avain: "huomiot", otsikko: "Huomiot", tyyppi: "teksti", aliakset: ["notes"] },
  ],
  maara: (db) => db.orderConfirmation.count(),
  async hae(db) {
    const rivit = await db.orderConfirmation.findMany({ include: { project: { include: { customer: true } } }, orderBy: { number: "asc" } });
    return rivit.map((o) => ({
      id: o.id,
      projekti: o.project.name,
      asiakas: o.project.customer.name,
      asiakasYtunnus: o.project.customer.businessId,
      numero: o.number,
      vahvistettu: o.confirmedAt,
      tiedosto: o.fileUrl,
      huomiot: o.notes,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const numero = teksti(a, "numero")!;
    let olemassa = await idlla(a, (id) => tx.orderConfirmation.findUnique({ where: { id } }));
    olemassa ??= await tx.orderConfirmation.findUnique({ where: { number: numero } });
    if (olemassa && olemassa.projectId !== projekti.id) {
      throw new RiviVirhe(`Tilausvahvistus ${numero} kuuluu jo toiseen projektiin`);
    }
    olemassa ??= await tx.orderConfirmation.findUnique({ where: { projectId: projekti.id } });
    const data = {
      projectId: projekti.id,
      number: numero,
      confirmedAt: a.vahvistettu as Date | undefined,
      fileUrl: teksti(a, "tiedosto"),
      notes: teksti(a, "huomiot"),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.orderConfirmation.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.orderConfirmation.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${numero}` };
  },
};

const virstanpylvaat: Kohde = {
  avain: "virstanpylvaat",
  nimi: "Virstanpylväät",
  osio: "Projektit",
  kuvaus: "Projektiaikataulujen asiakkaalle näkyvät virstanpylväät. Ei liity tuotantoaikatauluun.",
  tunnistus: "Tunniste, sitten projekti + otsikko.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "otsikko", otsikko: "Otsikko", tyyppi: "teksti", pakollinen: true, aliakset: ["title", "virstanpylvas"], esimerkki: "Perustukset valmiit" },
    { avain: "erapaiva", otsikko: "Eräpäivä", tyyppi: "pvm", aliakset: ["due", "due date", "pvm"], esimerkki: new Date(Date.UTC(2026, 9, 15)) },
    { avain: "valmis", otsikko: "Valmis", tyyppi: "totuus", aliakset: ["done"], esimerkki: false },
    { avain: "jarjestys", otsikko: "Järjestys", tyyppi: "kokonaisluku", aliakset: ["seq", "jarjestysnumero"], esimerkki: 1 },
  ],
  maara: (db) => db.projectMilestone.count(),
  async hae(db) {
    const rivit = await db.projectMilestone.findMany({
      include: { project: { include: { customer: true } } },
      orderBy: [{ project: { name: "asc" } }, { seq: "asc" }],
    });
    return rivit.map((m) => ({
      id: m.id,
      projekti: m.project.name,
      asiakas: m.project.customer.name,
      asiakasYtunnus: m.project.customer.businessId,
      otsikko: m.title,
      erapaiva: m.dueDate,
      valmis: m.done,
      jarjestys: m.seq,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const otsikko = teksti(a, "otsikko")!;
    let olemassa = await idlla(a, (id) => tx.projectMilestone.findUnique({ where: { id } }));
    olemassa ??= await tx.projectMilestone.findFirst({ where: { projectId: projekti.id, title: eiKirjainkokoa(otsikko) } });
    const data = {
      projectId: projekti.id,
      title: otsikko,
      dueDate: a.erapaiva as Date | undefined,
      done: a.valmis as boolean | undefined,
      seq: a.jarjestys as number | undefined,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.projectMilestone.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.projectMilestone.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${otsikko}` };
  },
};

/**
 * Hankintasuunnitelman rivit. Sarakkeiden aliakset vastaavat
 * projektinhallinnan Excelin Hankintasuunnitelma-välilehteä, joten
 * välilehden voi tuoda sellaisenaan (projekti annetaan tuonnissa).
 */
const hankintarivit: Kohde = {
  avain: "hankintarivit",
  nimi: "Hankintasuunnitelmat",
  osio: "Projektit",
  kuvaus:
    "Projektien hankintasuunnitelmien rivit. Toimituspäivä tulee aikataulutehtävästä, ja vaiheiden takarajat lasketaan siitä taaksepäin (viedään tiedoksi).",
  tunnistus: "Tunniste, sitten projekti + hankinta (+ littera, jos annettu).",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "tyyppi", otsikko: "Pääryhmä", tyyppi: "valinta", valinnat: HANKINNAN_TYYPIT, aliakset: ["tyyppi", "kind"], esimerkki: "MATERIAALI" },
    { avain: "littera", otsikko: "Littera", tyyppi: "teksti", esimerkki: "3300" },
    { avain: "kuvaus", otsikko: "Tehtävä", tyyppi: "teksti", pakollinen: true, aliakset: ["kuvaus", "hankinta", "description", "nimike"], esimerkki: "Liimapuupalkit" },
    { avain: "aikataulutehtava", otsikko: "Tehtävätunnus", tyyppi: "teksti", aliakset: ["aikataulutehtava", "tehtava tunnus"], kuvaus: "Projektiaikataulun tehtävä, jonka aloitus on toimituspäivä.", esimerkki: "T2" },
    { avain: "tarvitaan", otsikko: "Toimituspäivä käsin", tyyppi: "pvm", aliakset: ["tarvitaan", "needed by"], kuvaus: "Vain jos tehtävätunnusta ei ole." },
    { avain: "aineistoPv", otsikko: "Aineiston keräys", tyyppi: "kokonaisluku", min: 0, esimerkki: 1 },
    { avain: "pyyntoPv", otsikko: "Pyyntöaika", tyyppi: "kokonaisluku", min: 0, esimerkki: 5 },
    { avain: "vertailuPv", otsikko: "Vertailuaika", tyyppi: "kokonaisluku", min: 0, esimerkki: 1 },
    { avain: "neuvottelutPv", otsikko: "Urakkaneuvottelut", tyyppi: "kokonaisluku", min: 0, esimerkki: 2 },
    { avain: "toimitusPv", otsikko: "Toimitusaika vrk", tyyppi: "kokonaisluku", min: 0, esimerkki: 15 },
    { avain: "vaihe", otsikko: "Vaihe", tyyppi: "valinta", valinnat: HANKINNAN_VAIHEET, esimerkki: "AINEISTO" },
    { avain: "tarjousKysytty", otsikko: "Tarjous kysytty", tyyppi: "teksti", vainTuonti: true, kuvaus: "x = vaihe Tarjous, ellei Vaihe-saraketta ole." },
    { avain: "sopimusValmis", otsikko: "Sopimus valmis", tyyppi: "teksti", vainTuonti: true, kuvaus: "x = vaihe Toimitus, - = Ei tarvita, ellei Vaihe-saraketta ole." },
    { avain: "vastuuhenkilo", otsikko: "Vastuuhenkilö", tyyppi: "teksti", aliakset: ["vastuu", "assignee"], kuvaus: "Henkilön nimi tai sähköposti henkilörekisterissä." },
    { avain: "toimittaja", otsikko: "Urakoitsija / toimittaja", tyyppi: "teksti", aliakset: ["toimittaja", "supplier", "urakoitsija", "urakoitisja toimittaja"] },
    { avain: "sovittu", otsikko: "Sovittu toimituspäivä", tyyppi: "pvm", aliakset: ["sovittu"] },
    { avain: "kustannus", otsikko: "Kustannus alv 0%", tyyppi: "euro", min: 0, aliakset: ["kustannus", "cost"] },
    { avain: "maksutiedot", otsikko: "Lisätieto maksuihin", tyyppi: "teksti", aliakset: ["lisatito maksuihin", "maksutiedot"] },
    { avain: "huomiot", otsikko: "Huomiot", tyyppi: "teksti", aliakset: ["notes", "lisatiedot", "sarake1"] },
    { avain: "maara", otsikko: "Määrä", tyyppi: "luku", min: 0, aliakset: ["quantity"] },
    { avain: "yksikko", otsikko: "Yksikkö", tyyppi: "teksti", aliakset: ["unit"] },
    { avain: "nimike", otsikko: "Nimikekoodi", tyyppi: "teksti", aliakset: ["nimikekoodi", "tuotekoodi", "product code"], kuvaus: "Nimikkeistön koodi, jos rivi on materiaalinimike (esim. luotu rakenteiden materiaalitarpeesta)." },
    { avain: "rakenneosa", otsikko: "Rakenneosa", tyyppi: "teksti", aliakset: ["rakenneosan koodi"], kuvaus: "Rakenneosan koodi, jos rivi on luotu kiinteähintaisesta määräluettelon rivistä." },
    { avain: "lAineisto", otsikko: "Aineisto", tyyppi: "pvm", vainVienti: true },
    { avain: "lPyynto", otsikko: "Pyyntö", tyyppi: "pvm", vainVienti: true },
    { avain: "lTarjous", otsikko: "Tarjous", tyyppi: "pvm", vainVienti: true },
    { avain: "lVertailu", otsikko: "Vertailu", tyyppi: "pvm", vainVienti: true },
    { avain: "lSopimus", otsikko: "Sopimus", tyyppi: "pvm", vainVienti: true },
    { avain: "lToimitus", otsikko: "Toimituspäivä", tyyppi: "pvm", vainVienti: true },
    { avain: "lViikko", otsikko: "Toimitusviikko", tyyppi: "kokonaisluku", vainVienti: true },
  ],
  maara: (db) => db.procurementItem.count(),
  async hae(db) {
    const rivit = await db.procurementItem.findMany({
      include: { assignee: true, product: true, structureType: true, procurementPlan: { include: { project: { include: { customer: true, scheduleTasks: true } } } } },
      orderBy: [{ procurementPlan: { project: { name: "asc" } } }, { littera: "asc" }, { description: "asc" }],
    });
    const aikataulut = new Map<string, ReturnType<typeof laskeProjektiaikataulu>>();
    return rivit.map((r) => {
      const p = r.procurementPlan.project;
      if (!aikataulut.has(p.id)) aikataulut.set(p.id, laskeProjektiaikataulu(p.scheduleTasks));
      const toimitus = (r.scheduleTaskCode ? aikataulut.get(p.id)!.get(r.scheduleTaskCode)?.aloitus : null) ?? r.neededBy;
      const t = toimitus ? laskeTakarajat(toimitus, r) : null;
      return {
        id: r.id,
        projekti: p.name,
        asiakas: p.customer.name,
        asiakasYtunnus: p.customer.businessId,
        tyyppi: r.kind,
        littera: r.littera,
        kuvaus: r.description,
        aikataulutehtava: r.scheduleTaskCode,
        tarvitaan: r.neededBy,
        aineistoPv: r.materialDays,
        pyyntoPv: r.requestDays,
        vertailuPv: r.comparisonDays,
        neuvottelutPv: r.negotiationDays,
        toimitusPv: r.deliveryDays,
        vaihe: r.phase,
        vastuuhenkilo: r.assignee?.name ?? null,
        toimittaja: r.supplier,
        sovittu: r.agreedDelivery,
        kustannus: r.costCents,
        maksutiedot: r.paymentInfo,
        huomiot: r.notes,
        maara: r.quantity,
        yksikko: r.unit,
        nimike: r.product?.code ?? null,
        rakenneosa: r.structureType?.code ?? null,
        lAineisto: t?.aineisto ?? null,
        lPyynto: t?.pyynto ?? null,
        lTarjous: t?.tarjous ?? null,
        lVertailu: t?.vertailu ?? null,
        lSopimus: t?.sopimus ?? null,
        lToimitus: toimitus,
        lViikko: toimitus ? isoViikko(toimitus) : null,
      };
    });
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const kuvaus = teksti(a, "kuvaus")!;
    const littera = teksti(a, "littera");
    const suunnitelma = await tx.procurementPlan.upsert({ where: { projectId: projekti.id }, create: { projectId: projekti.id }, update: {} });
    let olemassa = await idlla(a, (id) => tx.procurementItem.findUnique({ where: { id } }));
    olemassa ??= await tx.procurementItem.findFirst({
      where: { procurementPlanId: suunnitelma.id, description: eiKirjainkokoa(kuvaus), ...(littera ? { littera } : {}) },
    });
    const vastuu = teksti(a, "vastuuhenkilo");
    const data = {
      procurementPlanId: suunnitelma.id,
      kind: a.tyyppi as "TYOSUORITE" | "MATERIAALI" | undefined,
      littera,
      description: kuvaus,
      scheduleTaskCode: teksti(a, "aikataulutehtava")?.toUpperCase(),
      neededBy: a.tarvitaan as Date | undefined,
      materialDays: a.aineistoPv as number | undefined,
      requestDays: a.pyyntoPv as number | undefined,
      comparisonDays: a.vertailuPv as number | undefined,
      negotiationDays: a.neuvottelutPv as number | undefined,
      deliveryDays: a.toimitusPv as number | undefined,
      phase: (a.vaihe as Prisma.ProcurementItemCreateInput["phase"]) ?? vaiheMerkinnoista(teksti(a, "tarjousKysytty"), teksti(a, "sopimusValmis")),
      assigneeId: vastuu ? (await etsiHenkilo(tx, vastuu)).id : undefined,
      supplier: teksti(a, "toimittaja"),
      agreedDelivery: a.sovittu as Date | undefined,
      costCents: a.kustannus as number | undefined,
      paymentInfo: teksti(a, "maksutiedot"),
      notes: teksti(a, "huomiot"),
      quantity: a.maara as number | undefined,
      unit: teksti(a, "yksikko"),
      productId: teksti(a, "nimike") ? (await etsiNimike(tx, teksti(a, "nimike")!)).id : undefined,
      structureTypeId: teksti(a, "rakenneosa") ? (await etsiRakenneosa(tx, teksti(a, "rakenneosa")!)).id : undefined,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.procurementItem.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.procurementItem.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${[littera, kuvaus].filter(Boolean).join(" ")}` };
  },
};

/**
 * Projektinhallinnan Excelin x-merkinnät vaiheeksi:
 * sopimus valmis "x" -> Toimitus, "-" -> Ei tarvita; tarjous kysytty "x" -> Tarjous.
 */
function vaiheMerkinnoista(tarjousKysytty?: string, sopimusValmis?: string) {
  const s = sopimusValmis?.trim().toLowerCase();
  const t = tarjousKysytty?.trim().toLowerCase();
  if (s === "x") return "TOIMITUS" as const;
  if (s === "-") return "EI_TARVITA" as const;
  if (t === "x") return "TARJOUS" as const;
  if (t === "-") return "EI_TARVITA" as const;
  return undefined;
}

const aikataulutehtavat: Kohde = {
  avain: "aikataulutehtavat",
  nimi: "Projektiaikataulut",
  osio: "Projektit",
  kuvaus:
    "Projektiaikataulujen tehtävät (T1, T2, ...). Sarakkeet vastaavat projektinhallinnan Excelin aikataulu-välilehteä. Laskettu aloitus ja ennuste viedään tiedoksi.",
  tunnistus: "Projekti + tehtävätunnus.",
  sarakkeet: [
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "tunnus", otsikko: "Tehtävätunnus", tyyppi: "teksti", pakollinen: true, aliakset: ["tunnus", "tehtava tunnus", "code"], esimerkki: "T1" },
    { avain: "tehtava", otsikko: "Tehtävä", tyyppi: "teksti", pakollinen: true, aliakset: ["title"], esimerkki: "Suunnitteluvaihe" },
    { avain: "luokka", otsikko: "Luokka", tyyppi: "teksti", esimerkki: "Työsuorite" },
    { avain: "urakoitsija", otsikko: "Urakoitsija", tyyppi: "teksti", esimerkki: "Woodcomp" },
    { avain: "paaryhma", otsikko: "Pääryhmä", tyyppi: "kokonaisluku" },
    { avain: "edeltaja", otsikko: "Edellyttää tehtävät", tyyppi: "teksti", aliakset: ["edeltaja", "edeltava tehtava"], kuvaus: "Edeltävän tehtävän tunnus." },
    { avain: "siirto", otsikko: "Siirto", tyyppi: "kokonaisluku", kuvaus: "Kalenteripäivää edeltäjän ennusteesta.", esimerkki: 0 },
    { avain: "miesvahvuus", otsikko: "Miesvahvuus", tyyppi: "kokonaisluku", min: 0 },
    { avain: "valmiusaste", otsikko: "Valmiusaste", tyyppi: "luku", min: 0, max: 100, kuvaus: "0-100 %, tai Excelin tapaan 0-1 (1 = valmis).", esimerkki: 0 },
    { avain: "kiintea", otsikko: "Kiinteä aloitus", tyyppi: "pvm", aliakset: ["fixed start"], kuvaus: "Ketjun alku. Ohittaa edeltäjän." },
    { avain: "aloitus", otsikko: "Aloitus", tyyppi: "pvm", vainTuonti: true, kuvaus: "Excelin ALOITUS: käytetään kiinteänä aloituksena vain, jos edeltäjää ei ole." },
    { avain: "kesto", otsikko: "Kesto", tyyppi: "kokonaisluku", pakollinen: true, min: 1, kuvaus: "Työpäivää (ma-pe).", esimerkki: 10 },
    { avain: "lAloitus", otsikko: "Laskettu aloitus", tyyppi: "pvm", vainVienti: true },
    { avain: "lEnnuste", otsikko: "Ennuste", tyyppi: "pvm", vainVienti: true },
  ],
  maara: (db) => db.scheduleTask.count(),
  async hae(db) {
    const rivit = await db.scheduleTask.findMany({
      include: { project: { include: { customer: true } } },
      orderBy: [{ project: { name: "asc" } }, { seq: "asc" }, { code: "asc" }],
    });
    const projekteittain = new Map<string, typeof rivit>();
    for (const r of rivit) projekteittain.set(r.projectId, [...(projekteittain.get(r.projectId) ?? []), r]);
    const lasketut = new Map(Array.from(projekteittain.entries()).map(([id, t]) => [id, laskeProjektiaikataulu(t)]));
    return rivit.map((r) => {
      const l = lasketut.get(r.projectId)!.get(r.code);
      return {
        projekti: r.project.name,
        asiakas: r.project.customer.name,
        asiakasYtunnus: r.project.customer.businessId,
        tunnus: r.code,
        tehtava: r.title,
        luokka: r.category,
        urakoitsija: r.contractor,
        paaryhma: r.mainGroup,
        edeltaja: r.predecessorCode,
        siirto: r.offsetDays,
        miesvahvuus: r.crew,
        valmiusaste: r.progress,
        kiintea: r.fixedStart,
        kesto: r.durationDays,
        lAloitus: l?.aloitus ?? null,
        lEnnuste: l?.ennuste ?? null,
      };
    });
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const tunnus = teksti(a, "tunnus")!.toUpperCase();
    const edeltaja = teksti(a, "edeltaja")?.toUpperCase();
    const olemassa = await tx.scheduleTask.findUnique({ where: { projectId_code: { projectId: projekti.id, code: tunnus } } });
    // Excelin valmiusaste on osuus 0-1; järjestelmässä prosentti.
    const v = a.valmiusaste as number | undefined;
    const valmiusaste = v === undefined ? undefined : Math.round(v <= 1 ? v * 100 : v);
    const data = {
      title: teksti(a, "tehtava")!,
      category: teksti(a, "luokka"),
      contractor: teksti(a, "urakoitsija"),
      mainGroup: a.paaryhma as number | undefined,
      predecessorCode: edeltaja,
      offsetDays: a.siirto as number | undefined,
      crew: a.miesvahvuus as number | undefined,
      progress: valmiusaste,
      fixedStart: (a.kiintea as Date | undefined) ?? (!edeltaja ? (a.aloitus as Date | undefined) : undefined),
      durationDays: a.kesto as number,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      async () => {
        const max = await tx.scheduleTask.aggregate({ where: { projectId: projekti.id }, _max: { seq: true } });
        return tx.scheduleTask.create({ data: { ...data, projectId: projekti.id, code: tunnus, seq: (max._max.seq ?? 0) + 1 } });
      },
      (o) => tx.scheduleTask.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${tunnus} ${data.title}` };
  },
};

const projektitehtavat: Kohde = {
  avain: "projektitehtavat",
  nimi: "Projektien tehtävät",
  osio: "Projektit",
  kuvaus: "Tehtäväluettelon omat tehtävät (hankintarivien lisäksi), esim. luvat ja katselmukset.",
  tunnistus: "Tunniste, sitten projekti + tehtävä.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "tehtava", otsikko: "Tehtävä", tyyppi: "teksti", pakollinen: true, aliakset: ["title"], esimerkki: "Rakennuslupahakemus" },
    { avain: "alue", otsikko: "Alue", tyyppi: "valinta", valinnat: TEHTAVAN_ALUEET, esimerkki: "LUVITUS" },
    { avain: "tila", otsikko: "Tila", tyyppi: "valinta", valinnat: TEHTAVAN_TILAT, esimerkki: "AVOIN" },
    { avain: "vastuuhenkilo", otsikko: "Vastuuhenkilö", tyyppi: "teksti", aliakset: ["vastuu"], kuvaus: "Nimi tai sähköposti." },
    { avain: "takaraja", otsikko: "Takaraja", tyyppi: "pvm", aliakset: ["due"] },
    { avain: "aikataulutehtava", otsikko: "Aikataulutehtävä", tyyppi: "teksti", aliakset: ["tehtavatunnus"], kuvaus: "Takaraja on tämän tehtävän aloitus, jos Takaraja on tyhjä." },
    { avain: "lisatiedot", otsikko: "Lisätiedot", tyyppi: "teksti", aliakset: ["notes", "huomiot"] },
  ],
  maara: (db) => db.projectTodo.count(),
  async hae(db) {
    const rivit = await db.projectTodo.findMany({
      include: { assignee: true, project: { include: { customer: true } } },
      orderBy: [{ project: { name: "asc" } }, { dueDate: "asc" }],
    });
    return rivit.map((t) => ({
      id: t.id,
      projekti: t.project.name,
      asiakas: t.project.customer.name,
      asiakasYtunnus: t.project.customer.businessId,
      tehtava: t.title,
      alue: t.area,
      tila: t.status,
      vastuuhenkilo: t.assignee?.name ?? null,
      takaraja: t.dueDate,
      aikataulutehtava: t.scheduleTaskCode,
      lisatiedot: t.notes,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const otsikko = teksti(a, "tehtava")!;
    let olemassa = await idlla(a, (id) => tx.projectTodo.findUnique({ where: { id } }));
    olemassa ??= await tx.projectTodo.findFirst({ where: { projectId: projekti.id, title: eiKirjainkokoa(otsikko) } });
    const vastuu = teksti(a, "vastuuhenkilo");
    const data = {
      projectId: projekti.id,
      title: otsikko,
      area: a.alue as Prisma.ProjectTodoCreateInput["area"],
      status: a.tila as Prisma.ProjectTodoCreateInput["status"],
      assigneeId: vastuu ? (await etsiHenkilo(tx, vastuu)).id : undefined,
      dueDate: a.takaraja as Date | undefined,
      scheduleTaskCode: teksti(a, "aikataulutehtava")?.toUpperCase(),
      notes: teksti(a, "lisatiedot"),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.projectTodo.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.projectTodo.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${otsikko}` };
  },
};

const projektiorganisaatio: Kohde = {
  avain: "projektiorganisaatio",
  nimi: "Projektiorganisaatio",
  osio: "Projektit",
  kuvaus: "Projektien vastuuhenkilöt rooleittain (esim. Suunnittelu/hankinta: Mikko).",
  tunnistus: "Projekti + henkilö + rooli.",
  sarakkeet: [
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "rooli", otsikko: "Rooli", tyyppi: "teksti", pakollinen: true, esimerkki: "Suunnittelu/hankinta" },
    { avain: "henkilo", otsikko: "Henkilö", tyyppi: "teksti", pakollinen: true, kuvaus: "Nimi tai sähköposti henkilörekisterissä.", esimerkki: "Maija Meikäläinen" },
  ],
  maara: (db) => db.projectMember.count(),
  async hae(db) {
    const rivit = await db.projectMember.findMany({
      include: { user: true, project: { include: { customer: true } } },
      orderBy: [{ project: { name: "asc" } }, { role: "asc" }],
    });
    return rivit.map((m) => ({
      projekti: m.project.name,
      asiakas: m.project.customer.name,
      asiakasYtunnus: m.project.customer.businessId,
      rooli: m.role,
      henkilo: m.user.name,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const henkilo = await etsiHenkilo(tx, teksti(a, "henkilo")!);
    const rooli = teksti(a, "rooli")!;
    const avain = { projectId: projekti.id, userId: henkilo.id, role: rooli };
    const olemassa = await tx.projectMember.findUnique({ where: { projectId_userId_role: avain } });
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.projectMember.create({ data: avain }),
      async () => undefined
    );
    return { tulos: tulos === "paivitetty" ? "ohitettu" : tulos, tunniste: `${projekti.name}: ${rooli} ${henkilo.name}` };
  },
};

const henkilot: Kohde = {
  avain: "henkilot",
  nimi: "Henkilöt",
  osio: "Järjestelmä",
  kuvaus: "Henkilörekisteri. Henkilöille jaetaan tehtäviä ja hankintoja.",
  tunnistus: "Tunniste, sitten sähköposti, sitten nimi.",
  sarakkeet: [
    TUNNISTE,
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", pakollinen: true, aliakset: ["name"], esimerkki: "Maija Meikäläinen" },
    { avain: "sahkoposti", otsikko: "Sähköposti", tyyppi: "sahkoposti", aliakset: ["email"], esimerkki: "maija@wodule.fi" },
    { avain: "puhelin", otsikko: "Puhelin", tyyppi: "teksti", aliakset: ["phone"] },
    { avain: "rooli", otsikko: "Rooli", tyyppi: "valinta", valinnat: HENKILON_ROOLIT, esimerkki: "HANKINTA" },
    { avain: "aktiivinen", otsikko: "Aktiivinen", tyyppi: "totuus", aliakset: ["active"], esimerkki: true },
  ],
  maara: (db) => db.user.count(),
  async hae(db) {
    const rivit = await db.user.findMany({ orderBy: { name: "asc" } });
    return rivit.map((u) => ({ id: u.id, nimi: u.name, sahkoposti: u.email, puhelin: u.phone, rooli: u.role, aktiivinen: u.active }));
  },
  async tuoRivi(a, tx, tapa) {
    const nimi = teksti(a, "nimi")!;
    const email = teksti(a, "sahkoposti")?.toLowerCase();
    let olemassa = await idlla(a, (id) => tx.user.findUnique({ where: { id } }));
    if (!olemassa && email) olemassa = await tx.user.findUnique({ where: { email } });
    if (!olemassa) {
      const osumat = await tx.user.findMany({ where: { name: eiKirjainkokoa(nimi) } });
      if (osumat.length > 1) throw new RiviVirhe(`Nimellä "${nimi}" löytyy useita henkilöitä. Lisää sähköposti.`);
      olemassa = osumat[0] ?? null;
    }
    const data = {
      name: nimi,
      email,
      phone: teksti(a, "puhelin"),
      role: a.rooli as Prisma.UserCreateInput["role"],
      active: a.aktiivinen as boolean | undefined,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.user.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.user.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: nimi };
  },
};

const tuotantoaikataulu: Kohde = {
  avain: "tuotantoaikataulu",
  nimi: "Tuotantoaikataulu projektit",
  osio: "Projektit",
  kuvaus:
    "Tuotannon Gantt-rivit. Aloitus, ennuste, laskennallinen kesto ja tila lasketaan, ja ne viedään vain tiedoksi. Tuonti ei muuta laskentaa.",
  tunnistus: "Tunniste, sitten tilaaja + projekti.",
  sarakkeet: [
    TUNNISTE,
    { avain: "jarjestys", otsikko: "Järjestys", tyyppi: "kokonaisluku", aliakset: ["seq", "jarjestysnumero", "nro"], kuvaus: "Paikka ketjussa. Tyhjä uudella rivillä = ketjun loppuun.", esimerkki: 12 },
    { avain: "tilaaja", otsikko: "Tilaaja", tyyppi: "teksti", pakollinen: true, esimerkki: "Esimerkki Oy" },
    { avain: "projekti", otsikko: "Projekti", tyyppi: "teksti", pakollinen: true, esimerkki: "Esimerkkiprojekti" },
    { ...ASIAKAS, pakollinen: false, avain: "asiakas", kuvaus: "Linkitettävä asiakas (nimi tai Y-tunnus). Vapaaehtoinen, Tilaaja riittää." },
    { avain: "liitettyProjekti", otsikko: "Liitetty projekti", tyyppi: "teksti", aliakset: ["projektilinkki"], kuvaus: "ERP:n projekti (nimi), johon rivi liitetään. Vapaaehtoinen; Projekti-sarake on vapaata tekstiä." },
    { avain: "liitettyRakennus", otsikko: "Liitetty rakennus", tyyppi: "teksti", aliakset: ["rakennuslinkki"], kuvaus: "Liitetyn projektin rakennuksen tunnus." },
    { avain: "rakennuksia", otsikko: "Rakennuksia", tyyppi: "kokonaisluku", min: 0, esimerkki: 1 },
    { avain: "luvattu", otsikko: "Luvattu", tyyppi: "pvm", esimerkki: new Date(Date.UTC(2026, 11, 18)) },
    { avain: "aloitus", otsikko: "Kiinteä aloitus", tyyppi: "pvm", aliakset: ["aloitus"], kuvaus: "Vain jos rivi ei ketjuunnu edellisestä." },
    { avain: "siirto", otsikko: "Siirto (kalenteripv)", tyyppi: "kokonaisluku", aliakset: ["siirto"], kuvaus: "Kalenteripäivää edellisen rivin ennusteesta.", esimerkki: 0 },
    { avain: "tuntimenekki", otsikko: "Tuntimenekki", tyyppi: "luku", pakollinen: true, min: 0, esimerkki: 420 },
    { avain: "tyontekijoita", otsikko: "Työntekijöitä", tyyppi: "kokonaisluku", pakollinen: true, min: 1, esimerkki: 8 },
    { avain: "tyopisteita", otsikko: "Työpisteitä", tyyppi: "kokonaisluku", min: 1, esimerkki: 4 },
    { avain: "kesto", otsikko: "Kesto (työpv)", tyyppi: "kokonaisluku", pakollinen: true, min: 1, aliakset: ["kesto"], kuvaus: "Ainoa aikataulua ohjaava kesto.", esimerkki: 15 },
    { avain: "valmiusaste", otsikko: "Valmiusaste (%)", tyyppi: "kokonaisluku", min: 0, max: 100, aliakset: ["valmiusaste"] },
    { avain: "laskettuAloitus", otsikko: "Laskettu aloitus", tyyppi: "pvm", vainVienti: true },
    { avain: "ennuste", otsikko: "Ennuste", tyyppi: "pvm", vainVienti: true },
    { avain: "laskennallinenKesto", otsikko: "Laskennallinen kesto", tyyppi: "luku", vainVienti: true },
    { avain: "tilanne", otsikko: "Tila", tyyppi: "teksti", vainVienti: true },
  ],
  maara: (db) => db.productionScheduleItem.count(),
  async hae(db) {
    const rivit = await db.productionScheduleItem.findMany({ include: { customer: true, project: true, building: true }, orderBy: { seq: "asc" } });
    const lasketut = new Map(recompute(rivit).map((r) => [r.id, r]));
    return rivit.map((r) => {
      const l = lasketut.get(r.id)!;
      const pyoristetty = l.laskennallinenKesto === null ? null : Math.round(l.laskennallinenKesto * 10) / 10;
      return {
        id: r.id,
        jarjestys: r.seq,
        tilaaja: r.tilaaja,
        projekti: r.projekti,
        asiakas: r.customer?.name ?? null,
        liitettyProjekti: r.project?.name ?? null,
        liitettyRakennus: r.building?.code ?? null,
        rakennuksia: r.rakennuksia,
        luvattu: r.luvattu,
        aloitus: r.aloitus,
        siirto: r.siirto,
        tuntimenekki: r.tuntimenekki,
        tyontekijoita: r.tyontekijoita,
        tyopisteita: r.tyopisteita,
        kesto: r.kesto,
        valmiusaste: r.valmiusaste,
        laskettuAloitus: l.aloitusDate,
        ennuste: l.ennusteDate,
        laskennallinenKesto: pyoristetty,
        tilanne: statusLabel(l),
      };
    });
  },
  async tuoRivi(a, tx, tapa) {
    const tilaaja = teksti(a, "tilaaja")!;
    const projektiNimi = teksti(a, "projekti")!;
    let olemassa = await idlla(a, (id) => tx.productionScheduleItem.findUnique({ where: { id } }));
    if (!olemassa) {
      const osumat = await tx.productionScheduleItem.findMany({
        where: { tilaaja: eiKirjainkokoa(tilaaja), projekti: eiKirjainkokoa(projektiNimi) },
      });
      if (osumat.length > 1) throw new RiviVirhe(`Tilaajalla ja projektilla löytyy useita rivejä. Lisää Tunniste.`);
      olemassa = osumat[0] ?? null;
    }
    const asiakasNimi = teksti(a, "asiakas");
    const asiakasId = asiakasNimi ? (await etsiAsiakas(tx, asiakasNimi)).id : undefined;
    const liitetty = teksti(a, "liitettyProjekti");
    const liitettyRakennus = teksti(a, "liitettyRakennus");
    if (liitettyRakennus && !liitetty) throw new RiviVirhe("Liitetty rakennus vaatii Liitetty projekti -sarakkeen");
    const liitettyId = liitetty
      ? yksi(
          await tx.project.findMany({ where: { name: eiKirjainkokoa(liitetty), ...(asiakasId ? { customerId: asiakasId } : {}) } }),
          `Projektia "${liitetty}"`,
          "Anna myös Asiakas."
        ).id
      : undefined;
    const data = {
      tilaaja,
      projekti: projektiNimi,
      customerId: asiakasId,
      projectId: liitettyId,
      buildingId: liitettyRakennus ? (await etsiRakennus(tx, liitettyId!, liitettyRakennus)).id : undefined,
      rakennuksia: a.rakennuksia as number | undefined,
      luvattu: a.luvattu as Date | undefined,
      aloitus: a.aloitus as Date | undefined,
      siirto: a.siirto as number | undefined,
      tuntimenekki: a.tuntimenekki as number,
      tyontekijoita: a.tyontekijoita as number,
      tyopisteita: a.tyopisteita as number | undefined,
      kesto: a.kesto as number,
      valmiusaste: a.valmiusaste as number | undefined,
      seq: a.jarjestys as number | undefined,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      async () => {
        const seq = data.seq ?? ((await tx.productionScheduleItem.aggregate({ _max: { seq: true } }))._max.seq ?? 0) + 1;
        return tx.productionScheduleItem.create({ data: { ...data, seq, id: teksti(a, "id") } });
      },
      (o) => tx.productionScheduleItem.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${tilaaja}: ${projektiNimi}` };
  },
};

// ============================================================
// 2. Tuotehallinta
// ============================================================

const nimikkeet: Kohde = {
  avain: "nimikkeet",
  nimi: "Nimikkeet",
  osio: "Tuotehallinta",
  kuvaus: "Nimikkeistö: koodi, nimi, kuvaus ja yksikkö.",
  tunnistus: "Tunniste, sitten koodi. Koodi on yksilöllinen.",
  sarakkeet: [
    TUNNISTE,
    { avain: "koodi", otsikko: "Koodi", tyyppi: "teksti", pakollinen: true, aliakset: ["code", "nimikekoodi", "tuotekoodi", "sku"], esimerkki: "SEINA-200" },
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", pakollinen: true, aliakset: ["name", "nimike", "tuote"], esimerkki: "Seinäelementti 200 mm" },
    { avain: "kuvaus", otsikko: "Kuvaus", tyyppi: "teksti", aliakset: ["description"] },
    { avain: "yksikko", otsikko: "Yksikkö", tyyppi: "teksti", aliakset: ["unit"], esimerkki: "m2" },
    LUOTU,
    PAIVITETTY,
  ],
  maara: (db) => db.product.count(),
  async hae(db) {
    const rivit = await db.product.findMany({ orderBy: { code: "asc" } });
    return rivit.map((p) => ({
      id: p.id,
      koodi: p.code,
      nimi: p.name,
      kuvaus: p.description,
      yksikko: p.unit,
      luotu: p.createdAt,
      paivitetty: p.updatedAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const koodi = teksti(a, "koodi")!;
    let olemassa = await idlla(a, (id) => tx.product.findUnique({ where: { id } }));
    const koodilla = await tx.product.findUnique({ where: { code: koodi } });
    if (olemassa && koodilla && koodilla.id !== olemassa.id) {
      throw new RiviVirhe(`Koodi ${koodi} on jo toisella nimikkeellä (${koodilla.name})`);
    }
    olemassa ??= koodilla;
    const data = { code: koodi, name: teksti(a, "nimi")!, description: teksti(a, "kuvaus"), unit: teksti(a, "yksikko") };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.product.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.product.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${koodi} ${data.name}` };
  },
};

const hinnastot: Kohde = {
  avain: "hinnastot",
  nimi: "Hinnastot",
  osio: "Tuotehallinta",
  kuvaus: "Hinnastojen nimet ja voimassaolot. Hinnat tuodaan erikseen Hinnastorivit-kohteena.",
  tunnistus: "Tunniste, sitten nimi.",
  sarakkeet: [
    TUNNISTE,
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", pakollinen: true, aliakset: ["name", "hinnasto"], esimerkki: "Hinnasto 2027" },
    { avain: "alkaen", otsikko: "Voimassa alkaen", tyyppi: "pvm", aliakset: ["valid from", "alkaen"], esimerkki: new Date(Date.UTC(2027, 0, 1)) },
    { avain: "asti", otsikko: "Voimassa asti", tyyppi: "pvm", aliakset: ["valid to", "asti"] },
    { avain: "tuntihinta", otsikko: "Tuntihinta (€/h)", tyyppi: "euro", min: 0, aliakset: ["tuntihinta", "labor rate"], kuvaus: "Tehtaan työtunnin hinta rakenteiden kustannuslaskentaan.", esimerkki: 5500 },
    LUOTU,
  ],
  maara: (db) => db.priceList.count(),
  async hae(db) {
    const rivit = await db.priceList.findMany({ orderBy: { validFrom: "desc" } });
    return rivit.map((h) => ({ id: h.id, nimi: h.name, alkaen: h.validFrom, asti: h.validTo, tuntihinta: h.laborHourCents, luotu: h.createdAt }));
  },
  async tuoRivi(a, tx, tapa) {
    const nimi = teksti(a, "nimi")!;
    let olemassa = await idlla(a, (id) => tx.priceList.findUnique({ where: { id } }));
    if (!olemassa) {
      const osumat = await tx.priceList.findMany({ where: { name: eiKirjainkokoa(nimi) } });
      if (osumat.length > 1) throw new RiviVirhe(`Nimellä "${nimi}" löytyy useita hinnastoja. Lisää Tunniste.`);
      olemassa = osumat[0] ?? null;
    }
    const data = { name: nimi, validFrom: a.alkaen as Date | undefined, validTo: a.asti as Date | undefined, laborHourCents: a.tuntihinta as number | undefined };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.priceList.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.priceList.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: nimi };
  },
};

const hinnastorivit: Kohde = {
  avain: "hinnastorivit",
  nimi: "Hinnastorivit",
  osio: "Tuotehallinta",
  kuvaus: "Nimikkeiden hinnat hinnastoittain. Hinnaston ja nimikkeen pitää olla olemassa (tai samassa tiedostossa aiemmin).",
  tunnistus: "Hinnasto + nimikekoodi (yksi hinta per nimike per hinnasto).",
  sarakkeet: [
    { avain: "hinnasto", otsikko: "Hinnasto", tyyppi: "teksti", pakollinen: true, aliakset: ["price list"], esimerkki: "Hinnasto 2027" },
    { avain: "koodi", otsikko: "Nimikekoodi", tyyppi: "teksti", pakollinen: true, aliakset: ["koodi", "code", "tuotekoodi", "sku"], esimerkki: "SEINA-200" },
    { avain: "nimikkeenNimi", otsikko: "Nimikkeen nimi", tyyppi: "teksti", vainVienti: true },
    { avain: "hinta", otsikko: "Yksikköhinta (€)", tyyppi: "euro", pakollinen: true, min: 0, aliakset: ["hinta", "price", "yksikkohinta"], esimerkki: 8950 },
    { avain: "valuutta", otsikko: "Valuutta", tyyppi: "teksti", aliakset: ["currency"], esimerkki: "EUR" },
  ],
  maara: (db) => db.priceListItem.count(),
  async hae(db) {
    const rivit = await db.priceListItem.findMany({
      include: { priceList: true, product: true },
      orderBy: [{ priceList: { name: "asc" } }, { product: { code: "asc" } }],
    });
    return rivit.map((r) => ({
      hinnasto: r.priceList.name,
      koodi: r.product.code,
      nimikkeenNimi: r.product.name,
      hinta: r.unitPriceCents,
      valuutta: r.currency,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const hinnasto = await etsiHinnasto(tx, teksti(a, "hinnasto")!);
    const nimike = await etsiNimike(tx, teksti(a, "koodi")!);
    const avain = { priceListId_productId: { priceListId: hinnasto.id, productId: nimike.id } };
    const olemassa = await tx.priceListItem.findUnique({ where: avain });
    const valuutta = teksti(a, "valuutta")?.toUpperCase();
    const tulos = await tallenna(
      tapa,
      olemassa,
      () =>
        tx.priceListItem.create({
          data: { priceListId: hinnasto.id, productId: nimike.id, unitPriceCents: a.hinta as number, currency: valuutta },
        }),
      (o) => tx.priceListItem.update({ where: { id: o.id }, data: { unitPriceCents: a.hinta as number, currency: valuutta } })
    );
    return { tulos, tunniste: `${hinnasto.name}: ${nimike.code}` };
  },
};

// ============================================================
// 3. Reklamaatiot
// ============================================================

const reklamaatiot: Kohde = {
  avain: "reklamaatiot",
  nimi: "Reklamaatiot",
  osio: "Reklamaatiot",
  kuvaus: "Asiakasreklamaatiot tiloineen.",
  tunnistus: "Tunniste, sitten asiakas + otsikko.",
  sarakkeet: [
    TUNNISTE,
    ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "otsikko", otsikko: "Otsikko", tyyppi: "teksti", pakollinen: true, aliakset: ["title", "aihe"], esimerkki: "Naarmu ikkunassa" },
    { avain: "kuvaus", otsikko: "Kuvaus", tyyppi: "teksti", pakollinen: true, aliakset: ["description"], esimerkki: "Toimituksessa havaittu naarmu." },
    { avain: "tila", otsikko: "Tila", tyyppi: "valinta", valinnat: REKLAMAATION_TILAT, aliakset: ["status"], esimerkki: "AVOIN" },
    { avain: "ratkaistu", otsikko: "Ratkaistu", tyyppi: "pvm", aliakset: ["resolved"] },
    VALINNAINEN_PROJEKTI,
    RAKENNUS,
    ELEMENTTI,
    LUOTU,
  ],
  maara: (db) => db.complaint.count(),
  async hae(db) {
    const rivit = await db.complaint.findMany({ include: { customer: true, project: true, building: true, element: true }, orderBy: { createdAt: "desc" } });
    return rivit.map((r) => ({
      id: r.id,
      asiakas: r.customer.name,
      asiakasYtunnus: r.customer.businessId,
      otsikko: r.title,
      kuvaus: r.description,
      tila: r.status,
      ratkaistu: r.resolvedAt,
      projekti: r.project?.name ?? null,
      ...kohdistusVientiin(r),
      luotu: r.createdAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const asiakas = await etsiAsiakas(tx, teksti(a, "asiakas")!, teksti(a, "asiakasYtunnus"));
    const otsikko = teksti(a, "otsikko")!;
    let olemassa = await idlla(a, (id) => tx.complaint.findUnique({ where: { id } }));
    olemassa ??= await tx.complaint.findFirst({ where: { customerId: asiakas.id, title: eiKirjainkokoa(otsikko) } });
    const data = {
      customerId: asiakas.id,
      title: otsikko,
      description: teksti(a, "kuvaus")!,
      status: a.tila as Prisma.ComplaintCreateInput["status"],
      resolvedAt: a.ratkaistu as Date | undefined,
      ...(await kohdistusSarakkeista(tx, a)),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.complaint.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.complaint.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${asiakas.name}: ${otsikko}` };
  },
};

// ============================================================
// 4. Laadunvarmistus
// ============================================================

const tarkastuslistat: Kohde = {
  avain: "tarkastuslistat",
  nimi: "Tarkastuslistat",
  osio: "Laadunvarmistus",
  kuvaus: "Tarkastuslistojen otsikot. Kohdat tuodaan erikseen Tarkastuskohdat-kohteena.",
  tunnistus: "Tunniste, sitten otsikko.",
  sarakkeet: [
    TUNNISTE,
    { avain: "otsikko", otsikko: "Otsikko", tyyppi: "teksti", pakollinen: true, aliakset: ["title", "nimi", "tarkastuslista"], esimerkki: "Elementin lähtötarkastus" },
    { avain: "pohja", otsikko: "Pohja", tyyppi: "totuus", aliakset: ["template"], kuvaus: "Kyllä = vakiotarkastus, josta kopioidaan rakennuksille." },
    VALINNAINEN_PROJEKTI,
    RAKENNUS,
    ELEMENTTI,
    LUOTU,
  ],
  maara: (db) => db.qaChecklist.count(),
  async hae(db) {
    const rivit = await db.qaChecklist.findMany({ include: { building: { include: { project: true } }, element: true }, orderBy: { title: "asc" } });
    return rivit.map((l) => ({
      id: l.id,
      otsikko: l.title,
      pohja: l.isTemplate,
      projekti: l.building?.project?.name ?? null,
      ...kohdistusVientiin(l),
      luotu: l.createdAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const otsikko = teksti(a, "otsikko")!;
    let olemassa = await idlla(a, (id) => tx.qaChecklist.findUnique({ where: { id } }));
    olemassa ??= await tx.qaChecklist.findFirst({ where: { title: eiKirjainkokoa(otsikko) } });
    const { buildingId, elementId } = await kohdistusSarakkeista(tx, a);
    const data = { title: otsikko, isTemplate: a.pohja as boolean | undefined, buildingId, elementId };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.qaChecklist.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.qaChecklist.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: otsikko };
  },
};

const tarkastuskohdat: Kohde = {
  avain: "tarkastuskohdat",
  nimi: "Tarkastuskohdat",
  osio: "Laadunvarmistus",
  kuvaus: "Tarkastuslistojen kohdat ja niiden tulokset.",
  tunnistus: "Tunniste, sitten tarkastuslista + kohta.",
  sarakkeet: [
    TUNNISTE,
    { avain: "lista", otsikko: "Tarkastuslista", tyyppi: "teksti", pakollinen: true, aliakset: ["checklist", "lista"], esimerkki: "Elementin lähtötarkastus" },
    { avain: "kohta", otsikko: "Kohta", tyyppi: "teksti", pakollinen: true, aliakset: ["label", "tarkastuskohta"], esimerkki: "Mitat tarkistettu" },
    { avain: "jarjestys", otsikko: "Järjestys", tyyppi: "kokonaisluku", aliakset: ["seq"], esimerkki: 1 },
    { avain: "hyvaksytty", otsikko: "Hyväksytty", tyyppi: "totuus", aliakset: ["passed", "ok"], kuvaus: "Tyhjä = ei vielä tarkastettu." },
    { avain: "huomio", otsikko: "Huomio", tyyppi: "teksti", aliakset: ["note", "huomiot"] },
  ],
  maara: (db) => db.qaChecklistItem.count(),
  async hae(db) {
    const rivit = await db.qaChecklistItem.findMany({ include: { checklist: true }, orderBy: [{ checklist: { title: "asc" } }, { seq: "asc" }] });
    return rivit.map((k) => ({
      id: k.id,
      lista: k.checklist.title,
      kohta: k.label,
      jarjestys: k.seq,
      hyvaksytty: k.passed,
      huomio: k.note,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const lista = await etsiTarkastuslista(tx, teksti(a, "lista")!);
    const kohta = teksti(a, "kohta")!;
    let olemassa = await idlla(a, (id) => tx.qaChecklistItem.findUnique({ where: { id } }));
    olemassa ??= await tx.qaChecklistItem.findFirst({ where: { checklistId: lista.id, label: eiKirjainkokoa(kohta) } });
    const data = {
      checklistId: lista.id,
      label: kohta,
      seq: a.jarjestys as number | undefined,
      passed: a.hyvaksytty as boolean | undefined,
      note: teksti(a, "huomio"),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.qaChecklistItem.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.qaChecklistItem.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${lista.title}: ${kohta}` };
  },
};

const dokumentit: Kohde = {
  avain: "dokumentit",
  nimi: "Dopit (dokumentit)",
  osio: "Laadunvarmistus",
  kuvaus: "Laatudokumenttien luettelo. Tiedostot ovat linkkejä, itse tiedostoja ei siirretä.",
  tunnistus: "Tunniste, sitten otsikko.",
  sarakkeet: [
    TUNNISTE,
    { avain: "otsikko", otsikko: "Otsikko", tyyppi: "teksti", pakollinen: true, aliakset: ["title", "nimi", "dokumentti"], esimerkki: "Laatukäsikirja" },
    { avain: "kategoria", otsikko: "Kategoria", tyyppi: "teksti", aliakset: ["category", "luokka"], esimerkki: "Ohjeet" },
    { avain: "tiedosto", otsikko: "Tiedosto", tyyppi: "url", aliakset: ["file", "fileurl", "linkki"] },
    VALINNAINEN_PROJEKTI,
    RAKENNUS,
    LUOTU,
  ],
  maara: (db) => db.qaDocument.count(),
  async hae(db) {
    const rivit = await db.qaDocument.findMany({ include: { building: { include: { project: true } } }, orderBy: [{ category: "asc" }, { title: "asc" }] });
    return rivit.map((d) => ({
      id: d.id,
      otsikko: d.title,
      kategoria: d.category,
      tiedosto: d.fileUrl,
      projekti: d.building?.project?.name ?? null,
      rakennus: d.building?.code ?? null,
      luotu: d.createdAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const otsikko = teksti(a, "otsikko")!;
    let olemassa = await idlla(a, (id) => tx.qaDocument.findUnique({ where: { id } }));
    olemassa ??= await tx.qaDocument.findFirst({ where: { title: eiKirjainkokoa(otsikko) } });
    const data = { title: otsikko, category: teksti(a, "kategoria"), fileUrl: teksti(a, "tiedosto"), buildingId: (await kohdistusSarakkeista(tx, a)).buildingId };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.qaDocument.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.qaDocument.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: otsikko };
  },
};

// ============================================================
// 5. Tuotannon ohjaus
// ============================================================

const tuotantokansiot: Kohde = {
  avain: "tuotantokansiot",
  nimi: "Sharepoint-tuotantokansiot",
  osio: "Tuotannon ohjaus",
  kuvaus: "Projektien Sharepoint-kansioiden linkit (yksi per projekti).",
  tunnistus: "Projekti (yksi kansio per projekti).",
  sarakkeet: [
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "sharepoint", otsikko: "Sharepoint-osoite", tyyppi: "url", aliakset: ["sharepoint", "sharepointurl", "url", "linkki"] },
    { avain: "synkronoitu", otsikko: "Synkronoitu", tyyppi: "aikaleima", vainVienti: true },
  ],
  maara: (db) => db.productionFolder.count(),
  async hae(db) {
    const rivit = await db.productionFolder.findMany({ include: { project: { include: { customer: true } } }, orderBy: { project: { name: "asc" } } });
    return rivit.map((f) => ({
      projekti: f.project.name,
      asiakas: f.project.customer.name,
      asiakasYtunnus: f.project.customer.businessId,
      sharepoint: f.sharepointUrl,
      synkronoitu: f.syncedAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const olemassa = await tx.productionFolder.findUnique({ where: { projectId: projekti.id } });
    const data = { sharepointUrl: teksti(a, "sharepoint") };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.productionFolder.create({ data: { ...data, projectId: projekti.id } }),
      (o) => tx.productionFolder.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: projekti.name };
  },
};

const tyomaaraimet: Kohde = {
  avain: "tyomaaraimet",
  nimi: "Työmääräimet",
  osio: "Tuotannon ohjaus",
  kuvaus: "Projektien työmääräimet tuntiarvioineen. Tuotantokansio luodaan tarvittaessa.",
  tunnistus: "Tunniste, sitten projekti + numero.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "numero", otsikko: "Numero", tyyppi: "teksti", pakollinen: true, aliakset: ["number", "tyomaarain", "tm"], esimerkki: "TM-001" },
    { avain: "kuvaus", otsikko: "Kuvaus", tyyppi: "teksti", aliakset: ["description"], esimerkki: "Seinäelementtien valmistus" },
    { avain: "arvio", otsikko: "Tuntiarvio", tyyppi: "luku", min: 0, aliakset: ["hours estimated", "arvio"], esimerkki: 120 },
    { avain: "toteutunut", otsikko: "Toteutuneet tunnit", tyyppi: "luku", min: 0, aliakset: ["hours actual", "toteutunut"] },
    RAKENNUS,
    ELEMENTTI,
    LUOTU,
  ],
  maara: (db) => db.workOrder.count(),
  async hae(db) {
    const rivit = await db.workOrder.findMany({
      include: { building: true, element: true, productionFolder: { include: { project: { include: { customer: true } } } } },
      orderBy: [{ productionFolder: { project: { name: "asc" } } }, { number: "asc" }],
    });
    return rivit.map((w) => ({
      id: w.id,
      projekti: w.productionFolder.project.name,
      asiakas: w.productionFolder.project.customer.name,
      asiakasYtunnus: w.productionFolder.project.customer.businessId,
      numero: w.number,
      kuvaus: w.description,
      arvio: w.hoursEstimated,
      toteutunut: w.hoursActual,
      ...kohdistusVientiin(w),
      luotu: w.createdAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const kansio = await tuotantokansio(tx, projekti.id);
    const numero = teksti(a, "numero")!;
    let olemassa = await idlla(a, (id) => tx.workOrder.findUnique({ where: { id } }));
    olemassa ??= await tx.workOrder.findFirst({ where: { productionFolderId: kansio.id, number: eiKirjainkokoa(numero) } });
    const data = {
      productionFolderId: kansio.id,
      number: numero,
      description: teksti(a, "kuvaus"),
      hoursEstimated: a.arvio as number | undefined,
      hoursActual: a.toteutunut as number | undefined,
      ...(await kohdistusSarakkeista(tx, a, projekti.id).then(({ buildingId, elementId }) => ({ buildingId, elementId }))),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.workOrder.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.workOrder.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${numero}` };
  },
};

const piirustukset: Kohde = {
  avain: "piirustukset",
  nimi: "Piirustukset",
  osio: "Tuotannon ohjaus",
  kuvaus: "Projektien piirustusluettelo revisioineen. Tiedostot ovat linkkejä.",
  tunnistus: "Tunniste, sitten projekti + otsikko + revisio.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "otsikko", otsikko: "Otsikko", tyyppi: "teksti", pakollinen: true, aliakset: ["title", "piirustus", "nimi"], esimerkki: "Pohjapiirustus 1. krs" },
    { avain: "revisio", otsikko: "Revisio", tyyppi: "teksti", aliakset: ["revision", "rev"], esimerkki: "A" },
    { avain: "tiedosto", otsikko: "Tiedosto", tyyppi: "url", aliakset: ["file", "fileurl", "linkki"] },
    RAKENNUS,
    ELEMENTTI,
    { avain: "ladattu", otsikko: "Ladattu", tyyppi: "aikaleima", vainVienti: true },
  ],
  maara: (db) => db.drawing.count(),
  async hae(db) {
    const rivit = await db.drawing.findMany({
      include: { building: true, element: true, productionFolder: { include: { project: { include: { customer: true } } } } },
      orderBy: [{ productionFolder: { project: { name: "asc" } } }, { title: "asc" }, { revision: "asc" }],
    });
    return rivit.map((d) => ({
      id: d.id,
      projekti: d.productionFolder.project.name,
      asiakas: d.productionFolder.project.customer.name,
      asiakasYtunnus: d.productionFolder.project.customer.businessId,
      otsikko: d.title,
      revisio: d.revision,
      tiedosto: d.fileUrl,
      ...kohdistusVientiin(d),
      ladattu: d.uploadedAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const kansio = await tuotantokansio(tx, projekti.id);
    const otsikko = teksti(a, "otsikko")!;
    const revisio = teksti(a, "revisio") ?? "A";
    let olemassa = await idlla(a, (id) => tx.drawing.findUnique({ where: { id } }));
    olemassa ??= await tx.drawing.findFirst({
      where: { productionFolderId: kansio.id, title: eiKirjainkokoa(otsikko), revision: eiKirjainkokoa(revisio) },
    });
    const { buildingId, elementId } = await kohdistusSarakkeista(tx, a, projekti.id);
    const data = { productionFolderId: kansio.id, title: otsikko, revision: revisio, fileUrl: teksti(a, "tiedosto"), buildingId, elementId };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.drawing.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.drawing.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${otsikko} rev ${revisio}` };
  },
};

// ============================================================
// Vakiorakennekirjasto ja rakennukset
// ============================================================

const litterat: Kohde = {
  avain: "litterat",
  nimi: "Litterat",
  osio: "Tuotehallinta",
  kuvaus: "Litterat (Talo 80), joiden mukaan rakenneosat, määräluettelot ja hankinnat lajitellaan.",
  tunnistus: "Koodi.",
  sarakkeet: [
    { avain: "koodi", otsikko: "Koodi", tyyppi: "teksti", pakollinen: true, aliakset: ["code", "littera"], esimerkki: "3500" },
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", pakollinen: true, aliakset: ["name"], esimerkki: "Elementtituotanto" },
  ],
  maara: (db) => db.littera.count(),
  async hae(db) {
    const rivit = await db.littera.findMany();
    return rivit
      .sort((a, b) => a.code.localeCompare(b.code, "fi", { numeric: true }))
      .map((l) => ({ koodi: l.code, nimi: l.name }));
  },
  async tuoRivi(a, tx, tapa) {
    const koodi = teksti(a, "koodi")!;
    const olemassa = await tx.littera.findUnique({ where: { code: koodi } });
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.littera.create({ data: { code: koodi, name: teksti(a, "nimi")! } }),
      (o) => tx.littera.update({ where: { id: o.id }, data: { name: teksti(a, "nimi")! } })
    );
    return { tulos, tunniste: `${koodi} ${teksti(a, "nimi")}` };
  },
};

const rakenneosaKirjasto: Kohde = {
  avain: "rakenneosat",
  nimi: "Rakenneosat",
  osio: "Tuotehallinta",
  kuvaus:
    "Rakenneosakirjasto: omat rakenteet (materiaalit tuodaan Rakenneosien materiaalit -kohteena) ja valmiina ostettavat ostonimikkeet (Nimikekoodi-sarake; nimi ja yksikkö tulevat nimikkeeltä, jos ne puuttuvat).",
  tunnistus: "Tunniste, sitten koodi. Koodi ja BIM-tyyppinimi ovat yksilöllisiä.",
  sarakkeet: [
    TUNNISTE,
    { avain: "koodi", otsikko: "Koodi", tyyppi: "teksti", pakollinen: true, aliakset: ["code", "rakenneosa", "rakennetyyppi", "tyyppikoodi"], esimerkki: "US-1" },
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", aliakset: ["name"], kuvaus: "Pakollinen rakenteelle. Ostonimikkeellä oletus on nimikkeen nimi.", esimerkki: "Ulkoseinä 200 mm, puurunko" },
    { avain: "laji", otsikko: "Laji", tyyppi: "valinta", valinnat: RAKENNEOSAN_LAJIT, aliakset: ["kind", "tyyppi"], kuvaus: "Rakenne (oletus) tai Ostonimike.", esimerkki: "RAKENNE" },
    { avain: "nimike", otsikko: "Nimikekoodi", tyyppi: "teksti", aliakset: ["nimikekoodi", "tuotekoodi", "product code"], kuvaus: "Ostonimikkeen nimike nimikkeistöstä." },
    { avain: "littera", otsikko: "Littera", tyyppi: "teksti", aliakset: ["litterakoodi", "talo 80"], kuvaus: "Litteran koodi (ks. Litterat).", esimerkki: "3500" },
    { avain: "kategoria", otsikko: "Kategoria", tyyppi: "valinta", valinnat: RAKENNEKATEGORIAT, aliakset: ["category"], esimerkki: "ULKOSEINA" },
    { avain: "yksikko", otsikko: "Yksikkö", tyyppi: "teksti", aliakset: ["unit"], kuvaus: "Ostonimikkeellä aina nimikkeen yksikkö.", esimerkki: "m2" },
    { avain: "hinta", otsikko: "Kiinteä yksikköhinta (€)", tyyppi: "luku", min: 0, aliakset: ["yksikkohinta", "hinta", "unit price"], kuvaus: "Tyhjä = hinta materiaaliluettelosta. Ei ostonimikkeille." },
    { avain: "kustannuslaji", otsikko: "Kustannuslaji", tyyppi: "valinta", valinnat: KUSTANNUSLAJIT, aliakset: ["cost type"], esimerkki: "MATERIAALI" },
    { avain: "laskuriAvain", otsikko: "Laskurin rivi", tyyppi: "teksti", vainVienti: true },
    { avain: "kuvaus", otsikko: "Kuvaus", tyyppi: "teksti", aliakset: ["description"] },
    { avain: "tyotunnit", otsikko: "Työtunnit / yksikkö", tyyppi: "luku", min: 0, aliakset: ["tyotunnit", "tuntinormi", "labor hours", "asennustunnit"], kuvaus: "Ostonimikkeellä asennus- tai käsittelyaika.", esimerkki: 0.8 },
    { avain: "bimTyyppi", otsikko: "BIM-tyyppinimi", tyyppi: "teksti", aliakset: ["bim type", "ifc type", "type name", "tyyppinimi"] },
    { avain: "kaytossa", otsikko: "Käytössä", tyyppi: "totuus", aliakset: ["active", "aktiivinen"], esimerkki: true },
    LUOTU,
    PAIVITETTY,
  ],
  maara: (db) => db.structureType.count(),
  async hae(db) {
    const rivit = await db.structureType.findMany({ include: { littera: true, materials: { include: { product: true } } }, orderBy: [{ kind: "asc" }, { code: "asc" }] });
    return rivit.map((t) => ({
      id: t.id,
      koodi: t.code,
      nimi: t.name,
      laji: t.kind,
      nimike: t.kind === "OSTONIMIKE" ? t.materials[0]?.product.code ?? null : null,
      littera: t.littera?.code ?? null,
      kategoria: t.category,
      yksikko: t.unit,
      hinta: t.unitPriceCents === null ? null : t.unitPriceCents / 100,
      kustannuslaji: t.costType,
      laskuriAvain: t.laskuriAvain,
      kuvaus: t.description,
      tyotunnit: t.laborHoursPerUnit,
      bimTyyppi: t.bimTypeName,
      kaytossa: t.active,
      luotu: t.createdAt,
      paivitetty: t.updatedAt,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const koodi = teksti(a, "koodi")!.toUpperCase();
    let olemassa = await idlla(a, (id) => tx.structureType.findUnique({ where: { id } }));
    const koodilla = await tx.structureType.findUnique({ where: { code: koodi } });
    if (olemassa && koodilla && koodilla.id !== olemassa.id) throw new RiviVirhe(`Koodi ${koodi} on jo toisella rakenneosalla`);
    olemassa ??= koodilla;
    const bim = teksti(a, "bimTyyppi");
    if (bim) {
      const bimilla = await tx.structureType.findUnique({ where: { bimTypeName: bim } });
      if (bimilla && bimilla.id !== olemassa?.id) throw new RiviVirhe(`BIM-tyyppinimi "${bim}" on jo rakenneosalla ${bimilla.code}`);
    }
    const nimikeKoodi = teksti(a, "nimike");
    const laji = (a.laji as "RAKENNE" | "OSTONIMIKE" | undefined) ?? (nimikeKoodi ? "OSTONIMIKE" : olemassa?.kind ?? "RAKENNE");
    const nimike = nimikeKoodi ? await etsiNimike(tx, nimikeKoodi) : undefined;
    if (laji === "OSTONIMIKE" && !nimike && !olemassa) throw new RiviVirhe("Ostonimike vaatii Nimikekoodin");
    if (laji === "RAKENNE" && nimike) throw new RiviVirhe("Nimikekoodi annetaan vain ostonimikkeelle");
    const nimi = teksti(a, "nimi") ?? (olemassa ? undefined : nimike?.name);
    if (!nimi && !olemassa) throw new RiviVirhe("Nimi on pakollinen");
    const litteraKoodi = teksti(a, "littera");
    const hinta = a.hinta as number | undefined;
    if (laji === "OSTONIMIKE" && hinta !== undefined) throw new RiviVirhe("Ostonimikkeen hinta tulee nimikkeen hinnastosta; jätä Kiinteä yksikköhinta tyhjäksi");
    const data = {
      code: koodi,
      name: nimi,
      kind: laji,
      litteraId: litteraKoodi ? (await etsiLittera(tx, litteraKoodi)).id : undefined,
      unitPriceCents: hinta === undefined ? undefined : Math.round(hinta * 100 * 1e6) / 1e6,
      costType: a.kustannuslaji as Prisma.StructureTypeCreateInput["costType"],
      category: a.kategoria as Prisma.StructureTypeCreateInput["category"],
      unit: nimike ? nimike.unit : teksti(a, "yksikko"),
      description: teksti(a, "kuvaus"),
      laborHoursPerUnit: a.tyotunnit as number | undefined,
      bimTypeName: bim,
      active: a.kaytossa as boolean | undefined,
    };
    let tallennettuId: string | undefined;
    const tulos = await tallenna(
      tapa,
      olemassa,
      async () => (tallennettuId = (await tx.structureType.create({ data: { ...data, name: nimi!, id: teksti(a, "id") } })).id),
      async (o) => (tallennettuId = (await tx.structureType.update({ where: { id: o.id }, data })).id)
    );
    // Ostonimikkeen materiaaliluettelo on aina täsmälleen tämä nimike × 1.
    if (tallennettuId && laji === "OSTONIMIKE" && nimike) {
      await tx.structureMaterial.deleteMany({ where: { structureTypeId: tallennettuId, productId: { not: nimike.id } } });
      await tx.structureMaterial.upsert({
        where: { structureTypeId_productId: { structureTypeId: tallennettuId, productId: nimike.id } },
        create: { structureTypeId: tallennettuId, productId: nimike.id, quantityPerUnit: 1, wastePct: 0, seq: 1 },
        update: { quantityPerUnit: 1, wastePct: 0 },
      });
    }
    return { tulos, tunniste: `${koodi} ${nimi ?? olemassa?.name ?? ""}` };
  },
};

const rakenneosamateriaalit: Kohde = {
  avain: "rakenneosamateriaalit",
  nimi: "Rakenneosien materiaalit",
  osio: "Tuotehallinta",
  kuvaus: "Rakenteiden materiaaliluettelot: nimikkeen menekki rakenneosan yksikköä kohti ja hukka-%. Ostonimikkeen nimike annetaan Rakenneosat-kohteessa.",
  tunnistus: "Rakenneosa + nimikekoodi (yksi rivi per nimike per rakenneosa).",
  sarakkeet: [
    { avain: "rakenneosa", otsikko: "Rakenneosa", tyyppi: "teksti", pakollinen: true, aliakset: ["rakennetyyppi", "structure type", "rakenne"], kuvaus: "Rakenneosan koodi.", esimerkki: "US-1" },
    { avain: "koodi", otsikko: "Nimikekoodi", tyyppi: "teksti", pakollinen: true, aliakset: ["koodi", "code", "nimike", "tuotekoodi"], esimerkki: "RUNKO-48x198" },
    { avain: "nimikkeenNimi", otsikko: "Nimikkeen nimi", tyyppi: "teksti", vainVienti: true },
    { avain: "menekki", otsikko: "Menekki / yksikkö", tyyppi: "luku", pakollinen: true, min: 0, aliakset: ["menekki", "quantity per unit", "maara"], esimerkki: 2.5 },
    { avain: "yksikko", otsikko: "Nimikkeen yksikkö", tyyppi: "teksti", vainVienti: true },
    { avain: "hukka", otsikko: "Hukka-%", tyyppi: "luku", min: 0, max: 100, aliakset: ["hukka", "waste"], esimerkki: 10 },
    { avain: "jarjestys", otsikko: "Järjestys", tyyppi: "kokonaisluku", aliakset: ["seq"] },
    { avain: "huomiot", otsikko: "Huomiot", tyyppi: "teksti", aliakset: ["notes"] },
  ],
  maara: (db) => db.structureMaterial.count(),
  async hae(db) {
    const rivit = await db.structureMaterial.findMany({
      include: { structureType: true, product: true },
      orderBy: [{ structureType: { code: "asc" } }, { seq: "asc" }],
    });
    return rivit.map((m) => ({
      rakenneosa: m.structureType.code,
      koodi: m.product.code,
      nimikkeenNimi: m.product.name,
      menekki: m.quantityPerUnit,
      yksikko: m.product.unit,
      hukka: m.wastePct,
      jarjestys: m.seq,
      huomiot: m.notes,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const tyyppi = await etsiRakenneosa(tx, teksti(a, "rakenneosa")!);
    if (tyyppi.kind === "OSTONIMIKE") throw new RiviVirhe(`${tyyppi.code} on ostonimike: sen nimike annetaan Rakenneosat-kohteessa`);
    const nimike = await etsiNimike(tx, teksti(a, "koodi")!);
    const olemassa = await tx.structureMaterial.findUnique({
      where: { structureTypeId_productId: { structureTypeId: tyyppi.id, productId: nimike.id } },
    });
    const data = {
      quantityPerUnit: a.menekki as number,
      wastePct: a.hukka as number | undefined,
      seq: a.jarjestys as number | undefined,
      notes: teksti(a, "huomiot"),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.structureMaterial.create({ data: { ...data, structureTypeId: tyyppi.id, productId: nimike.id } }),
      (o) => tx.structureMaterial.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${tyyppi.code}: ${nimike.code}` };
  },
};

const rakennukset: Kohde = {
  avain: "rakennukset",
  nimi: "Rakennukset",
  osio: "Projektit",
  kuvaus: "Projektien (tai tarjousten) rakennukset tiloineen, toimituksineen ja BIM-linkkeineen.",
  tunnistus: "Tunniste, sitten projekti + tunnus (tai tarjous + tunnus).",
  sarakkeet: [
    TUNNISTE,
    { ...VALINNAINEN_PROJEKTI, kuvaus: "Projektin nimi. Jätä tyhjäksi, jos rakennus kuuluu tarjoukselle." },
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "tarjous", otsikko: "Tarjous", tyyppi: "teksti", aliakset: ["offer"], kuvaus: "Tarjouksen otsikko, jos rakennus ei vielä kuulu projektille. Vaatii Asiakkaan." },
    { avain: "tunnus", otsikko: "Tunnus", tyyppi: "teksti", pakollinen: true, aliakset: ["code", "rakennus", "rakennustunnus"], esimerkki: "A" },
    { avain: "nimi", otsikko: "Nimi", tyyppi: "teksti", aliakset: ["name"], esimerkki: "Paritalo A" },
    { avain: "talotyyppi", otsikko: "Talotyyppi", tyyppi: "teksti", aliakset: ["building type", "tyyppi"] },
    { avain: "ala", otsikko: "Bruttoala m2", tyyppi: "luku", min: 0, aliakset: ["bruttoala", "ala", "area", "brm2"], esimerkki: 120 },
    { avain: "osoite", otsikko: "Osoite", tyyppi: "teksti", aliakset: ["address"] },
    { avain: "tila", otsikko: "Tila", tyyppi: "valinta", valinnat: RAKENNUKSEN_TILAT, aliakset: ["status"], esimerkki: "SUUNNITTELU" },
    { avain: "suunniteltu", otsikko: "Suunniteltu toimitus", tyyppi: "pvm", aliakset: ["planned delivery", "toimitus"] },
    { avain: "toimitettu", otsikko: "Toimitettu", tyyppi: "pvm", aliakset: ["delivered"] },
    { avain: "bimMalli", otsikko: "BIM-malli", tyyppi: "url", aliakset: ["bim", "malli", "model url", "ifc"] },
    BIM_GUID,
    { avain: "jarjestys", otsikko: "Järjestys", tyyppi: "kokonaisluku", aliakset: ["seq"] },
    { avain: "huomiot", otsikko: "Huomiot", tyyppi: "teksti", aliakset: ["notes"] },
    LUOTU,
  ],
  maara: (db) => db.building.count(),
  async hae(db) {
    const rivit = await db.building.findMany({
      include: { project: { include: { customer: true } }, offer: { include: { customer: true } } },
      orderBy: [{ project: { name: "asc" } }, { seq: "asc" }, { code: "asc" }],
    });
    return rivit.map((r) => {
      const asiakas = r.project?.customer ?? r.offer?.customer;
      return {
        id: r.id,
        projekti: r.project?.name ?? null,
        asiakas: asiakas?.name ?? null,
        asiakasYtunnus: asiakas?.businessId ?? null,
        tarjous: r.project ? null : r.offer?.title ?? null,
        tunnus: r.code,
        nimi: r.name,
        talotyyppi: r.buildingType,
        ala: r.grossAreaM2,
        osoite: r.address,
        tila: r.status,
        suunniteltu: r.plannedDelivery,
        toimitettu: r.deliveredAt,
        bimMalli: r.bimModelUrl,
        bimGuid: r.bimGuid,
        jarjestys: r.seq,
        huomiot: r.notes,
        luotu: r.createdAt,
      };
    });
  },
  async tuoRivi(a, tx, tapa) {
    const tunnus = teksti(a, "tunnus")!;
    let omistaja: { projectId: string } | { offerId: string };
    let omistajanNimi: string;
    if (teksti(a, "projekti")) {
      const p = await etsiProjekti(tx, a);
      omistaja = { projectId: p.id };
      omistajanNimi = p.name;
    } else if (teksti(a, "tarjous")) {
      if (!teksti(a, "asiakas")) throw new RiviVirhe("Tarjous vaatii Asiakas-sarakkeen");
      const asiakas = await etsiAsiakas(tx, teksti(a, "asiakas")!, teksti(a, "asiakasYtunnus"));
      const osumat = await tx.offer.findMany({ where: { customerId: asiakas.id, title: eiKirjainkokoa(teksti(a, "tarjous")!) } });
      const o = yksi(osumat, `Tarjousta "${teksti(a, "tarjous")}"`, "Nimeä tarjoukset yksilöllisesti.");
      omistaja = { offerId: o.id };
      omistajanNimi = o.title;
    } else {
      throw new RiviVirhe("Anna Projekti tai Tarjous");
    }
    let olemassa = await idlla(a, (id) => tx.building.findUnique({ where: { id } }));
    olemassa ??= await tx.building.findFirst({ where: { ...omistaja, code: eiKirjainkokoa(tunnus) } });
    const data = {
      ...omistaja,
      code: tunnus,
      name: teksti(a, "nimi"),
      buildingType: teksti(a, "talotyyppi"),
      grossAreaM2: a.ala as number | undefined,
      address: teksti(a, "osoite"),
      status: a.tila as Prisma.BuildingCreateInput["status"],
      plannedDelivery: a.suunniteltu as Date | undefined,
      deliveredAt: a.toimitettu as Date | undefined,
      bimModelUrl: teksti(a, "bimMalli"),
      bimGuid: teksti(a, "bimGuid"),
      seq: a.jarjestys as number | undefined,
      notes: teksti(a, "huomiot"),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.building.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.building.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${omistajanNimi}: ${tunnus}` };
  },
};

const maaraluettelo: Kohde = {
  avain: "maaraluettelo",
  nimi: "Määräluettelo",
  osio: "Projektit",
  kuvaus:
    "Rakennusten määräluettelot: rakenneosa (rakenne tai ostonimike) × määrä. Sopii BIM-mallin määräluettelon tuontiin: rakenneosa tunnistetaan koodista tai BIM-tyyppinimestä, ja BIM GUID päivittää uusintatuonnissa saman rivin. Puuttuva rakennus luodaan projektiin.",
  tunnistus: "Tunniste, sitten rakennus + BIM GUID, sitten rakennus + rakenneosa + sijainti.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { ...RAKENNUS, pakollinen: true },
    {
      avain: "rakenneosa",
      otsikko: "Rakenneosa",
      tyyppi: "teksti",
      pakollinen: true,
      aliakset: ["rakennetyyppi", "structure type", "tyyppi", "type", "type name", "tyyppinimi", "ifc type", "bim tyyppi"],
      kuvaus: "Rakenneosan koodi tai BIM-tyyppinimi.",
      esimerkki: "US-1",
    },
    { avain: "tyypinNimi", otsikko: "Rakenneosan nimi", tyyppi: "teksti", vainVienti: true },
    {
      avain: "maara",
      otsikko: "Määrä",
      tyyppi: "luku",
      pakollinen: true,
      min: 0,
      aliakset: ["quantity", "maara", "pinta ala", "area", "net area", "netarea", "length", "pituus", "count", "kpl"],
      kuvaus: "Rakenneosan yksikössä (m2, jm tai kpl).",
      esimerkki: 84.5,
    },
    { avain: "yksikko", otsikko: "Yksikkö", tyyppi: "teksti", vainVienti: true },
    { avain: "sijainti", otsikko: "Sijainti", tyyppi: "teksti", aliakset: ["location", "kerros", "level", "storey", "ifcbuildingstorey"], esimerkki: "1. krs" },
    { avain: "lahde", otsikko: "Lähde", tyyppi: "valinta", valinnat: MAARAN_LAHTEET, aliakset: ["source"], kuvaus: "Oletus: BIM, jos BIM GUID on annettu, muuten Käsin." },
    BIM_GUID,
    { avain: "huomiot", otsikko: "Huomiot", tyyppi: "teksti", aliakset: ["notes"] },
  ],
  maara: (db) => db.buildingPart.count({ where: { building: { projectId: { not: null } } } }),
  async hae(db) {
    const rivit = await db.buildingPart.findMany({
      where: { building: { projectId: { not: null } } },
      include: { structureType: true, building: { include: { project: { include: { customer: true } } } } },
      orderBy: [{ building: { project: { name: "asc" } } }, { building: { code: "asc" } }, { seq: "asc" }],
    });
    return rivit.map((o) => ({
      id: o.id,
      projekti: o.building.project!.name,
      asiakas: o.building.project!.customer.name,
      asiakasYtunnus: o.building.project!.customer.businessId,
      rakennus: o.building.code,
      rakenneosa: o.structureType.code,
      tyypinNimi: o.structureType.name,
      maara: o.quantity,
      yksikko: o.structureType.unit,
      sijainti: o.location,
      lahde: o.source,
      bimGuid: o.bimGuid,
      huomiot: o.notes,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const tunnus = teksti(a, "rakennus")!;
    // Määräluettelo voi tuoda uuden rakennuksen: se luodaan, ellei tapa ole vain-paivita.
    let rakennus = await tx.building.findFirst({ where: { projectId: projekti.id, code: eiKirjainkokoa(tunnus) } });
    if (!rakennus) {
      if (tapa === "vain-paivita") throw new RiviVirhe(`Rakennusta "${tunnus}" ei löydy`);
      rakennus = await tx.building.create({ data: { projectId: projekti.id, code: tunnus } });
    }
    const tyyppi = await etsiRakenneosa(tx, teksti(a, "rakenneosa")!);
    const guid = teksti(a, "bimGuid");
    const sijainti = teksti(a, "sijainti");
    let olemassa = await idlla(a, (id) => tx.buildingPart.findUnique({ where: { id } }));
    if (!olemassa && guid) olemassa = await tx.buildingPart.findUnique({ where: { buildingId_bimGuid: { buildingId: rakennus.id, bimGuid: guid } } });
    if (!olemassa && !guid) {
      olemassa = await tx.buildingPart.findFirst({
        where: { buildingId: rakennus.id, structureTypeId: tyyppi.id, bimGuid: null, location: sijainti ? eiKirjainkokoa(sijainti) : null },
      });
    }
    const data = {
      buildingId: rakennus.id,
      structureTypeId: tyyppi.id,
      quantity: a.maara as number,
      location: sijainti,
      source: (a.lahde as "KASIN" | "BIM" | undefined) ?? (guid ? "BIM" : undefined),
      bimGuid: guid,
      notes: teksti(a, "huomiot"),
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.buildingPart.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.buildingPart.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name} ${tunnus}: ${tyyppi.code} ${a.maara} ${tyyppi.unit}` };
  },
};

const elementit: Kohde = {
  avain: "elementit",
  nimi: "Elementit",
  osio: "Projektit",
  kuvaus: "Rakennusten elementit ja tilaelementit tiloineen. Rakennuksen pitää olla olemassa.",
  tunnistus: "Tunniste, sitten rakennus + elementtitunnus.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { ...RAKENNUS, pakollinen: true },
    { avain: "tunnus", otsikko: "Tunnus", tyyppi: "teksti", pakollinen: true, aliakset: ["code", "elementti", "elementtitunnus", "mark", "assembly mark"], esimerkki: "A-US-01" },
    { avain: "rakenneosa", otsikko: "Rakenneosa", tyyppi: "teksti", aliakset: ["rakennetyyppi", "structure type", "tyyppi"], kuvaus: "Koodi tai BIM-tyyppinimi." },
    { avain: "kuvaus", otsikko: "Kuvaus", tyyppi: "teksti", aliakset: ["description"] },
    { avain: "koko", otsikko: "Koko", tyyppi: "luku", min: 0, aliakset: ["quantity", "area", "pinta ala"], kuvaus: "Rakenneosan yksikössä." },
    { avain: "tila", otsikko: "Tila", tyyppi: "valinta", valinnat: ELEMENTIN_TILAT, aliakset: ["status"], esimerkki: "SUUNNITTEILLA" },
    { avain: "suunniteltu", otsikko: "Suunniteltu valmistus", tyyppi: "pvm", aliakset: ["planned"] },
    { avain: "valmistunut", otsikko: "Valmistunut", tyyppi: "pvm", aliakset: ["completed", "valmis"] },
    BIM_GUID,
    { avain: "jarjestys", otsikko: "Järjestys", tyyppi: "kokonaisluku", aliakset: ["seq"] },
  ],
  maara: (db) => db.productionElement.count(),
  async hae(db) {
    const rivit = await db.productionElement.findMany({
      where: { building: { projectId: { not: null } } },
      include: { structureType: true, building: { include: { project: { include: { customer: true } } } } },
      orderBy: [{ building: { project: { name: "asc" } } }, { building: { code: "asc" } }, { seq: "asc" }, { code: "asc" }],
    });
    return rivit.map((e) => ({
      id: e.id,
      projekti: e.building.project!.name,
      asiakas: e.building.project!.customer.name,
      asiakasYtunnus: e.building.project!.customer.businessId,
      rakennus: e.building.code,
      tunnus: e.code,
      rakenneosa: e.structureType?.code ?? null,
      kuvaus: e.description,
      koko: e.quantity,
      tila: e.status,
      suunniteltu: e.plannedDate,
      valmistunut: e.completedAt,
      bimGuid: e.bimGuid,
      jarjestys: e.seq,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const rakennus = await etsiRakennus(tx, projekti.id, teksti(a, "rakennus")!);
    const tunnus = teksti(a, "tunnus")!.toUpperCase();
    let olemassa = await idlla(a, (id) => tx.productionElement.findUnique({ where: { id } }));
    olemassa ??= await tx.productionElement.findUnique({ where: { buildingId_code: { buildingId: rakennus.id, code: tunnus } } });
    const tyyppi = teksti(a, "rakenneosa");
    const data = {
      buildingId: rakennus.id,
      code: tunnus,
      structureTypeId: tyyppi ? (await etsiRakenneosa(tx, tyyppi)).id : undefined,
      description: teksti(a, "kuvaus"),
      quantity: a.koko as number | undefined,
      status: a.tila as Prisma.ProductionElementCreateInput["status"],
      plannedDate: a.suunniteltu as Date | undefined,
      completedAt: a.valmistunut as Date | undefined,
      bimGuid: teksti(a, "bimGuid"),
      seq: a.jarjestys as number | undefined,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.productionElement.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.productionElement.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name} ${rakennus.code}: ${tunnus}` };
  },
};

/** Kaikki kohteet riippuvuusjärjestyksessä. */
export const KOHTEET: Kohde[] = [
  henkilot,
  asiakkaat,
  nimikkeet,
  hinnastot,
  hinnastorivit,
  litterat,
  rakenneosaKirjasto,
  rakenneosamateriaalit,
  tarjoukset,
  projektit,
  rakennukset,
  maaraluettelo,
  elementit,
  projektiorganisaatio,
  tilausvahvistukset,
  aikataulutehtavat,
  virstanpylvaat,
  hankintarivit,
  projektitehtavat,
  tuotantoaikataulu,
  reklamaatiot,
  tarkastuslistat,
  tarkastuskohdat,
  dokumentit,
  tuotantokansiot,
  tyomaaraimet,
  piirustukset,
];

export function haeKohde(avain: string): Kohde | undefined {
  return KOHTEET.find((k) => k.avain === avain);
}
