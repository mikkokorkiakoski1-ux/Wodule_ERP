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
  await prisma.project.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.priceListItem.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.product.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.qaChecklistItem.deleteMany();
  await prisma.qaChecklist.deleteMany();
  await prisma.qaDocument.deleteMany();
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
  const product1 = await prisma.product.create({
    data: { code: "TUOTE-001", name: "Moduulielementti A", unit: "kpl" },
  });
  const product2 = await prisma.product.create({
    data: { code: "TUOTE-002", name: "Moduulielementti B", unit: "kpl" },
  });
  const priceList = await prisma.priceList.create({ data: { name: "Vakiohinnasto 2026" } });
  await prisma.priceListItem.createMany({
    data: [
      { priceListId: priceList.id, productId: product1.id, unitPriceCents: 450000 },
      { priceListId: priceList.id, productId: product2.id, unitPriceCents: 620000 },
    ],
  });

  console.log("Luodaan esimerkkitarkastuslista...");
  await prisma.qaChecklist.create({
    data: {
      title: "Lähtötarkastus",
      items: {
        create: [
          { label: "Mitat tarkistettu", seq: 1 },
          { label: "Pintakäsittely OK", seq: 2 },
          { label: "Pakkaus kunnossa", seq: 3 },
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
