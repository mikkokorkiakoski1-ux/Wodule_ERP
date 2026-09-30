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
  osio: "Asiakkuuksien hallinta",
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
  osio: "Asiakkuuksien hallinta",
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
  osio: "Asiakkuuksien hallinta",
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

const hankintarivit: Kohde = {
  avain: "hankintarivit",
  nimi: "Hankintasuunnitelmat",
  osio: "Asiakkuuksien hallinta",
  kuvaus: "Projektien hankintasuunnitelmien rivit. Hankintasuunnitelma luodaan projektille tarvittaessa.",
  tunnistus: "Tunniste, sitten projekti + kuvaus.",
  sarakkeet: [
    TUNNISTE,
    PROJEKTI,
    PROJEKTIN_ASIAKAS,
    ASIAKKAAN_YTUNNUS,
    { avain: "kuvaus", otsikko: "Kuvaus", tyyppi: "teksti", pakollinen: true, aliakset: ["description", "nimike", "tuote"], esimerkki: "Ikkunat" },
    { avain: "maara", otsikko: "Määrä", tyyppi: "luku", min: 0, aliakset: ["quantity", "kpl"], esimerkki: 24 },
    { avain: "yksikko", otsikko: "Yksikkö", tyyppi: "teksti", aliakset: ["unit"], esimerkki: "kpl" },
    { avain: "toimittaja", otsikko: "Toimittaja", tyyppi: "teksti", aliakset: ["supplier"] },
    { avain: "tarvitaan", otsikko: "Tarvitaan", tyyppi: "pvm", aliakset: ["needed by", "tarvepaiva"] },
    { avain: "tilattu", otsikko: "Tilattu", tyyppi: "totuus", aliakset: ["ordered"], esimerkki: false },
  ],
  maara: (db) => db.procurementItem.count(),
  async hae(db) {
    const rivit = await db.procurementItem.findMany({
      include: { procurementPlan: { include: { project: { include: { customer: true } } } } },
      orderBy: [{ procurementPlan: { project: { name: "asc" } } }, { description: "asc" }],
    });
    return rivit.map((r) => ({
      id: r.id,
      projekti: r.procurementPlan.project.name,
      asiakas: r.procurementPlan.project.customer.name,
      asiakasYtunnus: r.procurementPlan.project.customer.businessId,
      kuvaus: r.description,
      maara: r.quantity,
      yksikko: r.unit,
      toimittaja: r.supplier,
      tarvitaan: r.neededBy,
      tilattu: r.ordered,
    }));
  },
  async tuoRivi(a, tx, tapa) {
    const projekti = await etsiProjekti(tx, a);
    const kuvaus = teksti(a, "kuvaus")!;
    const suunnitelma = await tx.procurementPlan.upsert({ where: { projectId: projekti.id }, create: { projectId: projekti.id }, update: {} });
    let olemassa = await idlla(a, (id) => tx.procurementItem.findUnique({ where: { id } }));
    olemassa ??= await tx.procurementItem.findFirst({ where: { procurementPlanId: suunnitelma.id, description: eiKirjainkokoa(kuvaus) } });
    const data = {
      procurementPlanId: suunnitelma.id,
      description: kuvaus,
      quantity: a.maara as number | undefined,
      unit: teksti(a, "yksikko"),
      supplier: teksti(a, "toimittaja"),
      neededBy: a.tarvitaan as Date | undefined,
      ordered: a.tilattu as boolean | undefined,
    };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.procurementItem.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.procurementItem.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${kuvaus}` };
  },
};

const tuotantoaikataulu: Kohde = {
  avain: "tuotantoaikataulu",
  nimi: "Tuotantoaikataulu projektit",
  osio: "Asiakkuuksien hallinta",
  kuvaus:
    "Tuotannon Gantt-rivit. Aloitus, ennuste, laskennallinen kesto ja tila lasketaan, ja ne viedään vain tiedoksi. Tuonti ei muuta laskentaa.",
  tunnistus: "Tunniste, sitten tilaaja + projekti.",
  sarakkeet: [
    TUNNISTE,
    { avain: "jarjestys", otsikko: "Järjestys", tyyppi: "kokonaisluku", aliakset: ["seq", "jarjestysnumero", "nro"], kuvaus: "Paikka ketjussa. Tyhjä uudella rivillä = ketjun loppuun.", esimerkki: 12 },
    { avain: "tilaaja", otsikko: "Tilaaja", tyyppi: "teksti", pakollinen: true, esimerkki: "Esimerkki Oy" },
    { avain: "projekti", otsikko: "Projekti", tyyppi: "teksti", pakollinen: true, esimerkki: "Esimerkkiprojekti" },
    { ...ASIAKAS, pakollinen: false, avain: "asiakas", kuvaus: "Linkitettävä asiakas (nimi tai Y-tunnus). Vapaaehtoinen, Tilaaja riittää." },
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
    const rivit = await db.productionScheduleItem.findMany({ include: { customer: true }, orderBy: { seq: "asc" } });
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
    const data = {
      tilaaja,
      projekti: projektiNimi,
      customerId: asiakasNimi ? (await etsiAsiakas(tx, asiakasNimi)).id : undefined,
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
    LUOTU,
  ],
  maara: (db) => db.priceList.count(),
  async hae(db) {
    const rivit = await db.priceList.findMany({ orderBy: { validFrom: "desc" } });
    return rivit.map((h) => ({ id: h.id, nimi: h.name, alkaen: h.validFrom, asti: h.validTo, luotu: h.createdAt }));
  },
  async tuoRivi(a, tx, tapa) {
    const nimi = teksti(a, "nimi")!;
    let olemassa = await idlla(a, (id) => tx.priceList.findUnique({ where: { id } }));
    if (!olemassa) {
      const osumat = await tx.priceList.findMany({ where: { name: eiKirjainkokoa(nimi) } });
      if (osumat.length > 1) throw new RiviVirhe(`Nimellä "${nimi}" löytyy useita hinnastoja. Lisää Tunniste.`);
      olemassa = osumat[0] ?? null;
    }
    const data = { name: nimi, validFrom: a.alkaen as Date | undefined, validTo: a.asti as Date | undefined };
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
    LUOTU,
  ],
  maara: (db) => db.complaint.count(),
  async hae(db) {
    const rivit = await db.complaint.findMany({ include: { customer: true }, orderBy: { createdAt: "desc" } });
    return rivit.map((r) => ({
      id: r.id,
      asiakas: r.customer.name,
      asiakasYtunnus: r.customer.businessId,
      otsikko: r.title,
      kuvaus: r.description,
      tila: r.status,
      ratkaistu: r.resolvedAt,
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
    LUOTU,
  ],
  maara: (db) => db.qaChecklist.count(),
  async hae(db) {
    const rivit = await db.qaChecklist.findMany({ orderBy: { title: "asc" } });
    return rivit.map((l) => ({ id: l.id, otsikko: l.title, luotu: l.createdAt }));
  },
  async tuoRivi(a, tx, tapa) {
    const otsikko = teksti(a, "otsikko")!;
    let olemassa = await idlla(a, (id) => tx.qaChecklist.findUnique({ where: { id } }));
    olemassa ??= await tx.qaChecklist.findFirst({ where: { title: eiKirjainkokoa(otsikko) } });
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.qaChecklist.create({ data: { title: otsikko, id: teksti(a, "id") } }),
      (o) => tx.qaChecklist.update({ where: { id: o.id }, data: { title: otsikko } })
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
    LUOTU,
  ],
  maara: (db) => db.qaDocument.count(),
  async hae(db) {
    const rivit = await db.qaDocument.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] });
    return rivit.map((d) => ({ id: d.id, otsikko: d.title, kategoria: d.category, tiedosto: d.fileUrl, luotu: d.createdAt }));
  },
  async tuoRivi(a, tx, tapa) {
    const otsikko = teksti(a, "otsikko")!;
    let olemassa = await idlla(a, (id) => tx.qaDocument.findUnique({ where: { id } }));
    olemassa ??= await tx.qaDocument.findFirst({ where: { title: eiKirjainkokoa(otsikko) } });
    const data = { title: otsikko, category: teksti(a, "kategoria"), fileUrl: teksti(a, "tiedosto") };
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
    LUOTU,
  ],
  maara: (db) => db.workOrder.count(),
  async hae(db) {
    const rivit = await db.workOrder.findMany({
      include: { productionFolder: { include: { project: { include: { customer: true } } } } },
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
    { avain: "ladattu", otsikko: "Ladattu", tyyppi: "aikaleima", vainVienti: true },
  ],
  maara: (db) => db.drawing.count(),
  async hae(db) {
    const rivit = await db.drawing.findMany({
      include: { productionFolder: { include: { project: { include: { customer: true } } } } },
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
    const data = { productionFolderId: kansio.id, title: otsikko, revision: revisio, fileUrl: teksti(a, "tiedosto") };
    const tulos = await tallenna(
      tapa,
      olemassa,
      () => tx.drawing.create({ data: { ...data, id: teksti(a, "id") } }),
      (o) => tx.drawing.update({ where: { id: o.id }, data })
    );
    return { tulos, tunniste: `${projekti.name}: ${otsikko} rev ${revisio}` };
  },
};

/** Kaikki kohteet riippuvuusjärjestyksessä. */
export const KOHTEET: Kohde[] = [
  asiakkaat,
  nimikkeet,
  hinnastot,
  hinnastorivit,
  tarjoukset,
  projektit,
  tilausvahvistukset,
  virstanpylvaat,
  hankintarivit,
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
