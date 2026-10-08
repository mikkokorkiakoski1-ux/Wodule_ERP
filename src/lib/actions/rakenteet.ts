"use server";

/**
 * Rakenneosakirjaston Server Actions (Tuotehallinta > Rakenneosat).
 *
 * Rakenneosa (StructureType) on joko oma vakiorakenne (RAKENNE,
 * materiaaliluettelo) tai valmiina ostettava nimike (OSTONIMIKE, täsmälleen
 * yksi materiaalirivi: nimike × 1). Ostonimike laskee siis samalla tavalla
 * kuin rakenne ja päätyy materiaalitarpeen kautta hankintoihin.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jasenna, kentat, luku, palaa, valinnainenLuku, valinnainenTeksti } from "@/lib/lomake";

const KATEGORIAT = [
  "ULKOSEINA",
  "VALISEINA",
  "ALAPOHJA",
  "VALIPOHJA",
  "YLAPOHJA",
  "KATTO",
  "TILAELEMENTTI",
  "IKKUNA",
  "OVI",
  "TEKNIIKKA",
  "KALUSTE",
  "MUU",
] as const;

const KIRJASTO = "/tuotehallinta/rakenneosat";

function paivita(id?: string) {
  revalidatePath(KIRJASTO);
  if (id) revalidatePath(`${KIRJASTO}/${id}`);
  // Rakenneosan muutos muuttaa kaikkien rakennusten laskentaa.
  revalidatePath("/projektit", "layout");
  revalidatePath("/asiakkuuksien-hallinta/tarjoukset", "layout");
}

const yhteiset = {
  id: z.string().optional(),
  code: z.string().trim().min(1, "Koodi on pakollinen").max(30).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Nimi on pakollinen"),
  category: z.enum(KATEGORIAT).default("MUU"),
  description: valinnainenTeksti,
  laborHoursPerUnit: luku("Työtunnit").pipe(z.number().min(0, "Työtunnit eivät voi olla negatiivisia")),
  bimTypeName: valinnainenTeksti,
  active: z.string().optional().transform((v) => v !== "ei"),
  litteraId: valinnainenTeksti,
};

/** Koodi ja BIM-tyyppinimi ovat yksilöllisiä koko kirjastossa. */
async function tarkistaYksilollisyys(d: { id?: string; code: string; bimTypeName: string | null }, paluu?: string) {
  const samaKoodi = await prisma.structureType.findUnique({ where: { code: d.code } });
  if (samaKoodi && samaKoodi.id !== d.id) palaa(paluu, `Koodi ${d.code} on jo käytössä (${samaKoodi.name})`);
  if (d.bimTypeName) {
    const samaBim = await prisma.structureType.findUnique({ where: { bimTypeName: d.bimTypeName } });
    if (samaBim && samaBim.id !== d.id) palaa(paluu, `BIM-tyyppinimi on jo rakenneosalla ${samaBim.code}`);
  }
}

const rakenneInput = z.object({
  ...yhteiset,
  unit: z.string().trim().default("m2"),
  // Kiinteä yksikköhinta euroina (esim. tarjouslaskurin rivit). Tyhjä = hinta materiaaliluettelosta.
  unitPriceEuros: valinnainenLuku.pipe(z.number().min(0, "Yksikköhinta ei voi olla negatiivinen").nullable()),
  costType: z.enum(["MATERIAALI", "TEHDASTYO", "ALIURAKKA"]).default("MATERIAALI"),
});

/** Oma vakiorakenne (materiaaliluettelo lisätään rakenneosan sivulla). */
export async function tallennaRakenne(formData: FormData) {
  const k = kentat(formData);
  const { id, unitPriceEuros, ...d } = jasenna(rakenneInput, { laborHoursPerUnit: "0", ...k }, k.paluu);
  const data = { ...d, unitPriceCents: unitPriceEuros === null ? null : Math.round(unitPriceEuros * 100 * 1e6) / 1e6 };
  await tarkistaYksilollisyys({ id, ...data }, k.paluu);
  const tallennettu = id
    ? await prisma.structureType.update({ where: { id }, data })
    : await prisma.structureType.create({ data: { ...data, kind: "RAKENNE" } });
  paivita(tallennettu.id);
  palaa(id ? k.paluu : `${KIRJASTO}/${tallennettu.id}`);
}

const ostonimikeInput = z.object({
  ...yhteiset,
  code: yhteiset.code.optional(),
  name: z.string().trim().optional(),
  productId: z.string().min(1, "Valitse nimike"),
});

/**
 * Valmiina ostettava nimike rakenneosaksi. Koodi, nimi ja yksikkö tulevat
 * nimikkeeltä, ellei niitä anneta. Työtunnit ovat asennus- tai käsittelyaika.
 */
export async function tallennaOstonimike(formData: FormData) {
  const k = kentat(formData);
  const { id, productId, ...d } = jasenna(ostonimikeInput, { laborHoursPerUnit: "0", ...k }, k.paluu);
  const nimike = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  // Ostonimikkeen hinta tulee nimikkeen hinnastosta, joten kiinteää hintaa ei käytetä.
  const data = { ...d, code: d.code ?? nimike.code.toUpperCase(), name: d.name || nimike.name, unit: nimike.unit, kind: "OSTONIMIKE" as const, unitPriceCents: null, costType: "MATERIAALI" as const };
  await tarkistaYksilollisyys({ id, ...data }, k.paluu);

  const tallennettu = await prisma.$transaction(async (tx) => {
    const t = id ? await tx.structureType.update({ where: { id }, data }) : await tx.structureType.create({ data });
    // Ostonimikkeen materiaaliluettelo on aina täsmälleen tämä nimike × 1.
    await tx.structureMaterial.deleteMany({ where: { structureTypeId: t.id, productId: { not: productId } } });
    await tx.structureMaterial.upsert({
      where: { structureTypeId_productId: { structureTypeId: t.id, productId } },
      create: { structureTypeId: t.id, productId, quantityPerUnit: 1, wastePct: 0, seq: 1 },
      update: { quantityPerUnit: 1, wastePct: 0 },
    });
    return t;
  });
  paivita(tallennettu.id);
  palaa(id ? k.paluu : KIRJASTO);
}

const materiaaliInput = z.object({
  structureTypeId: z.string().min(1),
  productId: z.string().min(1, "Valitse nimike"),
  quantityPerUnit: luku("Menekki on pakollinen").pipe(z.number().positive("Menekin pitää olla suurempi kuin 0")),
  wastePct: luku("Hukka-%").pipe(z.number().min(0, "Hukka-% ei voi olla negatiivinen").max(100)),
  notes: valinnainenTeksti,
});

/** Lisää nimikkeen rakenteen materiaaliluetteloon tai päivittää sen menekin. */
export async function tallennaRakenneosanMateriaali(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(materiaaliInput, { wastePct: "0", ...k }, k.paluu);
  const osa = await prisma.structureType.findUniqueOrThrow({ where: { id: d.structureTypeId } });
  if (osa.kind === "OSTONIMIKE") palaa(k.paluu, "Ostonimikkeen nimike vaihdetaan perustiedoista");
  const max = await prisma.structureMaterial.aggregate({ where: { structureTypeId: d.structureTypeId }, _max: { seq: true } });
  await prisma.structureMaterial.upsert({
    where: { structureTypeId_productId: { structureTypeId: d.structureTypeId, productId: d.productId } },
    create: { ...d, seq: (max._max.seq ?? 0) + 1 },
    update: { quantityPerUnit: d.quantityPerUnit, wastePct: d.wastePct, notes: d.notes },
  });
  paivita(d.structureTypeId);
  palaa(k.paluu);
}

export async function poistaRakenneosanMateriaali(formData: FormData) {
  const k = kentat(formData);
  const m = await prisma.structureMaterial.delete({ where: { id: k.id! } });
  paivita(m.structureTypeId);
  palaa(k.paluu);
}

const litteraInput = z.object({
  code: z.string().trim().min(1, "Litteran koodi on pakollinen").max(20),
  name: z.string().trim().min(1, "Litteran nimi on pakollinen"),
});

/** Lisää litteran tai päivittää saman koodin litteran nimen. */
export async function tallennaLittera(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(litteraInput, k, k.paluu);
  await prisma.littera.upsert({ where: { code: d.code }, create: d, update: { name: d.name } });
  paivita();
  palaa(k.paluu);
}
