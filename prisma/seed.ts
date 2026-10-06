import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Sama tuotantoaikataulu-data kuin aiemmin Artifact-työkalussa (11 riviä,
// live-tietokannasta 2026-09-24). Pidetään yksi yhteen, jotta tuttu data on
// heti käytettävissä myös tässä järjestelmässä.
const PRODUCTION_ITEMS = [
  { seq: 1, tilaaja: "Puumesta", projekti: "Sröm", rakennuksia: 1, aloitus: "2026-06-29", siirto: 0, tuntimenekki: 420, tyontekijoita: 8, tyopisteita: 4, kesto: 26, valmiusaste: 100, luvattu: null as string | null },
  { seq: 2, tilaaja: "Tervas", projekti: "Heino MOD1", rakennuksia: 1, aloitus: null, siirto: -26, tuntimenekki: 420, tyontekijoita: 8, tyopisteita: 4, kesto: 26, valmiusaste: 100, luvattu: null },
  { seq: 3, tilaaja: "Tervas", projekti: "Heino MOD2", rakennuksia: 1, aloitus: null, siirto: -26, tuntimenekki: 300, tyontekijoita: 8, tyopisteita: 4, kesto: 19, valmiusaste: 100, luvattu: null },
  { seq: 4, tilaaja: "Tervas", projekti: "Maxitop", rakennuksia: 1, aloitus: null, siirto: -14, tuntimenekki: 420, tyontekijoita: 10, tyopisteita: 4, kesto: 21, valmiusaste: 100, luvattu: null },
  { seq: 5, tilaaja: "Lappsuites", projekti: "Pesola", rakennuksia: 1, aloitus: null, siirto: -20, tuntimenekki: 420, tyontekijoita: 10, tyopisteita: 4, kesto: 24, valmiusaste: 100, luvattu: null },
  { seq: 6, tilaaja: "Lappsuites", projekti: "Lähtevänoja", rakennuksia: 1, aloitus: null, siirto: -20, tuntimenekki: 420, tyontekijoita: 12, tyopisteita: 4, kesto: 20, valmiusaste: 85, luvattu: null },
  { seq: 7, tilaaja: "Lappsuites", projekti: "Kopei Group", rakennuksia: 1, aloitus: null, siirto: -15, tuntimenekki: 460, tyontekijoita: 10, tyopisteita: 4, kesto: 25, valmiusaste: 50, luvattu: "2026-10-08" },
  { seq: 8, tilaaja: "Tervas", projekti: "UPM", rakennuksia: 1, aloitus: null, siirto: -23, tuntimenekki: 420, tyontekijoita: 12, tyopisteita: 4, kesto: 20, valmiusaste: 45, luvattu: null },
  { seq: 9, tilaaja: "First Camp", projekti: "Camp Ripan MOD1", rakennuksia: 1, aloitus: null, siirto: -26, tuntimenekki: 630, tyontekijoita: 9, tyopisteita: 4, kesto: 30, valmiusaste: 3, luvattu: null },
  { seq: 10, tilaaja: "First Camp", projekti: "Camp Ripan MOD2", rakennuksia: 1, aloitus: null, siirto: -26, tuntimenekki: 630, tyontekijoita: 9, tyopisteita: 4, kesto: 38, valmiusaste: 3, luvattu: null },
  { seq: 11, tilaaja: "First Camp", projekti: "Camp Ripan MOD3", rakennuksia: 1, aloitus: null, siirto: -26, tuntimenekki: 630, tyontekijoita: 9, tyopisteita: 4, kesto: 38, valmiusaste: 3, luvattu: null },
];

async function main() {
  console.log("Siivotaan vanha data...");
  await prisma.productionScheduleItem.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.drawing.deleteMany();
  await prisma.productionFolder.deleteMany();
  await prisma.procurementItem.deleteMany();
  await prisma.procurementPlan.deleteMany();
  await prisma.projectMilestone.deleteMany();
  await prisma.orderConfirmation.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.qaChecklistItem.deleteMany();
  await prisma.qaChecklist.deleteMany();
  await prisma.qaDocument.deleteMany();
  await prisma.productionElement.deleteMany();
  await prisma.buildingPart.deleteMany();
  await prisma.building.deleteMany();
  await prisma.structureMaterial.deleteMany();
  await prisma.structureType.deleteMany();
  await prisma.project.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.priceListItem.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();

  console.log("Luodaan asiakkaat...");
  const customerNames = [...new Set(PRODUCTION_ITEMS.map((i) => i.tilaaja))];
  const customers = new Map<string, string>();
  for (const name of customerNames) {
    const c = await prisma.customer.create({ data: { name } });
    customers.set(name, c.id);
  }

  console.log("Luodaan tuotantoaikataulu (Tuotantoaikataulu projektit)...");
  for (const item of PRODUCTION_ITEMS) {
    await prisma.productionScheduleItem.create({
      data: {
        seq: item.seq,
        customerId: customers.get(item.tilaaja),
        tilaaja: item.tilaaja,
        projekti: item.projekti,
        rakennuksia: item.rakennuksia,
        aloitus: item.aloitus ? new Date(item.aloitus) : null,
        siirto: item.siirto,
        tuntimenekki: item.tuntimenekki,
        tyontekijoita: item.tyontekijoita,
        tyopisteita: item.tyopisteita,
        kesto: item.kesto,
        valmiusaste: item.valmiusaste,
        luvattu: item.luvattu ? new Date(item.luvattu) : null,
      },
    });
  }

  console.log("Luodaan esimerkkiprojekti demoksi muihin osioihin...");
  const firstCustomerId = customers.get("Puumesta")!;
  const project = await prisma.project.create({
    data: {
      customerId: firstCustomerId,
      name: "Sröm",
      description: "Esimerkkiprojekti - liitetty samannimiseen tuotantoaikataulun riviin.",
      status: "KAYNNISSA",
    },
  });
  await prisma.projectMilestone.createMany({
    data: [
      { projectId: project.id, title: "Tilaus vahvistettu", seq: 1, done: true },
      { projectId: project.id, title: "Tuotanto käynnissä", seq: 2, done: true },
      { projectId: project.id, title: "Toimitus", seq: 3, done: false },
    ],
  });
  await prisma.procurementPlan.create({
    data: {
      projectId: project.id,
      items: {
        create: [{ description: "Runkomateriaali", quantity: 1, unit: "erä", supplier: "Puutavara Oy" }],
      },
    },
  });
  await prisma.productionFolder.create({
    data: { projectId: project.id },
  });

  console.log("Luodaan esimerkkinimikkeistö ja hinnasto...");
  // Materiaalinimikkeet ja esimerkkihinnat (alv 0 %, senttiä per yksikkö).
  const NIMIKKEET = [
    { code: "RUNKO-48x198", name: "Runkopuu 48x198 C24", unit: "jm", hinta: 320 },
    { code: "RUNKO-48x148", name: "Runkopuu 48x148 C24", unit: "jm", hinta: 240 },
    { code: "VILLA-200", name: "Mineraalivilla 200 mm", unit: "m2", hinta: 950 },
    { code: "VILLA-100", name: "Mineraalivilla 100 mm", unit: "m2", hinta: 520 },
    { code: "KIPSI-13", name: "Kipsilevy 13 mm", unit: "m2", hinta: 580 },
    { code: "TUULISUOJA-25", name: "Tuulensuojalevy 25 mm", unit: "m2", hinta: 890 },
    { code: "HOYRYNSULKU", name: "Höyrynsulkumuovi", unit: "m2", hinta: 90 },
    { code: "VERHOUS-UYK", name: "Ulkoverhouslauta UYK 28x195", unit: "m2", hinta: 1450 },
    { code: "IKKUNA-1210", name: "Ikkuna MSE 12x10", unit: "kpl", hinta: 42000 },
    { code: "OVI-ULKO", name: "Ulko-ovi lämpöeristetty", unit: "kpl", hinta: 98000 },
    { code: "ILP-35", name: "Ilmalämpöpumppu 3,5 kW", unit: "kpl", hinta: 125000 },
  ];
  const nimike = new Map<string, string>();
  for (const n of NIMIKKEET) {
    const p = await prisma.product.create({ data: { code: n.code, name: n.name, unit: n.unit } });
    nimike.set(n.code, p.id);
  }
  const priceList = await prisma.priceList.create({
    data: { name: "Vakiohinnasto 2026", validFrom: new Date("2026-01-01"), laborHourCents: 5500 },
  });
  await prisma.priceListItem.createMany({
    data: NIMIKKEET.map((n) => ({ priceListId: priceList.id, productId: nimike.get(n.code)!, unitPriceCents: n.hinta })),
  });

  console.log("Luodaan rakenneosakirjasto (rakenteet ja ostonimikkeet)...");
  // [nimikekoodi, menekki per rakennetyypin yksikkö, hukka-%]
  type Materiaali = [string, number, number];
  // Ostonimike = valmiina ostettava osa: täsmälleen yksi nimike × 1, tunnit = asennus.
  const RAKENNEOSAT: {
    code: string;
    name: string;
    kind?: "OSTONIMIKE";
    category: "ULKOSEINA" | "VALISEINA" | "ALAPOHJA" | "VALIPOHJA" | "YLAPOHJA" | "IKKUNA" | "OVI" | "TEKNIIKKA";
    unit: string;
    tunnit: number;
    bim?: string;
    materiaalit: Materiaali[];
  }[] = [
    {
      code: "US-1",
      name: "Ulkoseinä 200 mm, puurunko, UYK-verhous",
      category: "ULKOSEINA",
      unit: "m2",
      tunnit: 0.9,
      bim: "Basic Wall:US-1 200 puurunko",
      materiaalit: [["RUNKO-48x198", 2.6, 10], ["VILLA-200", 1, 5], ["TUULISUOJA-25", 1, 5], ["HOYRYNSULKU", 1.1, 0], ["KIPSI-13", 1, 8], ["VERHOUS-UYK", 1, 10]],
    },
    {
      code: "VS-1",
      name: "Väliseinä 100 mm, kipsilevy molemmin puolin",
      category: "VALISEINA",
      unit: "m2",
      tunnit: 0.5,
      bim: "Basic Wall:VS-1 100",
      materiaalit: [["RUNKO-48x148", 1.8, 10], ["VILLA-100", 1, 5], ["KIPSI-13", 2, 8]],
    },
    {
      code: "AP-1",
      name: "Alapohja, puurunkoinen tuuletettu",
      category: "ALAPOHJA",
      unit: "m2",
      tunnit: 0.6,
      bim: "Floor:AP-1",
      materiaalit: [["RUNKO-48x198", 2, 10], ["VILLA-200", 1, 5], ["TUULISUOJA-25", 1, 5]],
    },
    {
      code: "YP-1",
      name: "Yläpohja, kattoristikko ja 300 mm eriste",
      category: "YLAPOHJA",
      unit: "m2",
      tunnit: 0.6,
      bim: "Roof:YP-1",
      materiaalit: [["RUNKO-48x198", 1.8, 10], ["VILLA-200", 1.5, 5], ["HOYRYNSULKU", 1.1, 0], ["KIPSI-13", 1, 8]],
    },
    { code: "IK-1", name: "Ikkuna 12x10 asennettuna", kind: "OSTONIMIKE", category: "IKKUNA", unit: "kpl", tunnit: 1.5, bim: "Window:12x10", materiaalit: [["IKKUNA-1210", 1, 0]] },
    { code: "UO-1", name: "Ulko-ovi asennettuna", kind: "OSTONIMIKE", category: "OVI", unit: "kpl", tunnit: 2, bim: "Door:UO-1", materiaalit: [["OVI-ULKO", 1, 0]] },
    { code: "ILP-35", name: "Ilmalämpöpumppu 3,5 kW asennettuna", kind: "OSTONIMIKE", category: "TEKNIIKKA", unit: "kpl", tunnit: 3, materiaalit: [["ILP-35", 1, 0]] },
  ];
  const rakenneosa = new Map<string, string>();
  for (const t of RAKENNEOSAT) {
    const st = await prisma.structureType.create({
      data: {
        code: t.code,
        name: t.name,
        category: t.category,
        unit: t.unit,
        kind: t.kind,
        laborHoursPerUnit: t.tunnit,
        bimTypeName: t.bim,
        materials: {
          create: t.materiaalit.map(([koodi, menekki, hukka], i) => ({
            productId: nimike.get(koodi)!,
            quantityPerUnit: menekki,
            wastePct: hukka,
            seq: i + 1,
          })),
        },
      },
    });
    rakenneosa.set(t.code, st.id);
  }

  // Paritalon määräluettelo: [rakenneosa, määrä, sijainti]
  const PARITALO: [string, number, string | null][] = [
    ["AP-1", 120, null],
    ["US-1", 140, null],
    ["VS-1", 60, null],
    ["YP-1", 120, null],
    ["IK-1", 10, null],
    ["UO-1", 2, null],
    ["ILP-35", 2, null],
  ];
  const osat = (rivit: [string, number, string | null][]) =>
    rivit.map(([koodi, quantity, location], i) => ({ structureTypeId: rakenneosa.get(koodi)!, quantity, location, seq: i + 1 }));

  console.log("Luodaan Srömin rakennukset ja elementit...");
  const rakennusA = await prisma.building.create({
    data: {
      projectId: project.id,
      code: "A",
      name: "Paritalo A",
      buildingType: "Paritalo",
      grossAreaM2: 120,
      status: "VALMISTUKSESSA",
      seq: 1,
      parts: { create: osat(PARITALO) },
      elements: {
        create: [
          { code: "A-US-01", structureTypeId: rakenneosa.get("US-1"), quantity: 35, status: "TOIMITETTU", seq: 1 },
          { code: "A-US-02", structureTypeId: rakenneosa.get("US-1"), quantity: 35, status: "VALMIS", seq: 2 },
          { code: "A-US-03", structureTypeId: rakenneosa.get("US-1"), quantity: 35, status: "VALMISTUKSESSA", seq: 3 },
          { code: "A-US-04", structureTypeId: rakenneosa.get("US-1"), quantity: 35, status: "SUUNNITTEILLA", seq: 4 },
        ],
      },
    },
    include: { elements: true },
  });
  await prisma.building.create({
    data: { projectId: project.id, code: "B", name: "Paritalo B", buildingType: "Paritalo", grossAreaM2: 120, seq: 2, parts: { create: osat(PARITALO) } },
  });
  await prisma.productionScheduleItem.updateMany({ where: { projekti: "Sröm" }, data: { projectId: project.id, buildingId: rakennusA.id } });

  console.log("Luodaan esimerkkitarkastuslistat...");
  const KOHDAT = ["Mitat tarkistettu", "Pintakäsittely OK", "Pakkaus kunnossa"];
  await prisma.qaChecklist.create({
    data: { title: "Lähtötarkastus", isTemplate: true, items: { create: KOHDAT.map((label, i) => ({ label, seq: i + 1 })) } },
  });
  await prisma.qaChecklist.create({
    data: {
      title: "Lähtötarkastus – A-US-01",
      buildingId: rakennusA.id,
      elementId: rakennusA.elements.find((e) => e.code === "A-US-01")!.id,
      items: { create: KOHDAT.map((label, i) => ({ label, seq: i + 1, passed: true })) },
    },
  });

  console.log("Luodaan esimerkkitarjous rakennuksineen...");
  await prisma.offer.create({
    data: {
      customerId: customers.get("First Camp")!,
      title: "Camp Ripan laajennus: 2 majoitusrakennusta",
      status: "LAHETETTY",
      amountCents: 4600000,
      validUntil: new Date("2026-12-31"),
      buildings: {
        create: [
          { code: "MOD4", name: "Majoitusrakennus", buildingType: "Majoitusmoduuli", grossAreaM2: 36, seq: 1, parts: { create: osat([["AP-1", 36, null], ["US-1", 85, null], ["VS-1", 30, null], ["YP-1", 36, null], ["IK-1", 4, null], ["UO-1", 1, null]]) } },
          { code: "MOD5", name: "Majoitusrakennus", buildingType: "Majoitusmoduuli", grossAreaM2: 36, seq: 2, parts: { create: osat([["AP-1", 36, null], ["US-1", 85, null], ["VS-1", 30, null], ["YP-1", 36, null], ["IK-1", 4, null], ["UO-1", 1, null]]) } },
        ],
      },
    },
  });

  console.log("Valmis.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
