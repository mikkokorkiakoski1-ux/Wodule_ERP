"use server";

/**
 * Rakennusten Server Actions: rakennukset, määräluettelo (rakenneosa ×
 * määrä), elementit, tarkastuslistat pohjasta ja hankintarivit
 * materiaalitarpeesta.
 *
 * Rakennus kuuluu joko tarjoukselle (offerId) tai projektille (projectId).
 * Lomakkeet lähettävät "paluu"-kentän, ks. src/lib/lomake.ts.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jasenna, kentat, luku, palaa, valinnainenLuku, valinnainenPvm, valinnainenTeksti } from "@/lib/lomake";
import { laskeRakennukset } from "@/lib/rakennukset";

const RAKENNUKSEN_TILAT = ["SUUNNITTELU", "VALMISTUKSESSA", "TOIMITETTU", "VALMIS"] as const;
const ELEMENTIN_TILAT = ["SUUNNITTEILLA", "VALMISTUKSESSA", "VALMIS", "TOIMITETTU", "ASENNETTU"] as const;

/** Päivittää rakennuksen omistajan (projekti tai tarjous) sivut. */
async function paivitaRakennus(buildingId: string) {
  const r = await prisma.building.findUnique({ where: { id: buildingId }, select: { projectId: true, offerId: true } });
  paivitaOmistaja(r?.projectId, r?.offerId);
}

function paivitaOmistaja(projectId?: string | null, offerId?: string | null) {
  if (projectId) revalidatePath(`/projektit/${projectId}`, "layout");
  if (offerId) revalidatePath(`/asiakkuuksien-hallinta/tarjoukset/${offerId}`);
  revalidatePath("/asiakkuuksien-hallinta/tarjoukset");
}

// ------------------------------------------------------------
// Rakennukset
// ------------------------------------------------------------

const rakennusInput = z
  .object({
    id: z.string().optional(),
    projectId: z.string().optional(),
    offerId: z.string().optional(),
    code: z.string().trim().min(1, "Tunnus on pakollinen").max(30),
    name: valinnainenTeksti,
    buildingType: valinnainenTeksti,
    grossAreaM2: valinnainenLuku,
    address: valinnainenTeksti,
    status: z.enum(RAKENNUKSEN_TILAT).default("SUUNNITTELU"),
    plannedDelivery: valinnainenPvm,
    deliveredAt: valinnainenPvm,
    bimModelUrl: z.string().url("BIM-mallin linkin pitää olla URL").optional().transform((v) => v ?? null),
    bimGuid: valinnainenTeksti,
    notes: valinnainenTeksti,
  })
  .refine((d) => d.id || d.projectId || d.offerId, "Rakennus kuuluu projektille tai tarjoukselle");

export async function tallennaRakennus(formData: FormData) {
  const k = kentat(formData);
  const { id, projectId, offerId, ...data } = jasenna(rakennusInput, k, k.paluu);

  const omistaja = id
    ? await prisma.building.findUniqueOrThrow({ where: { id }, select: { projectId: true, offerId: true } })
    : { projectId: projectId ?? null, offerId: projectId ? null : offerId ?? null };
  const sama = await prisma.building.findFirst({
    where: omistaja.projectId ? { projectId: omistaja.projectId, code: data.code } : { offerId: omistaja.offerId, code: data.code },
  });
  if (sama && sama.id !== id) palaa(k.paluu, `Tunnus ${data.code} on jo käytössä`);

  if (id) {
    await prisma.building.update({ where: { id }, data });
  } else {
    const max = await prisma.building.aggregate({
      where: omistaja.projectId ? { projectId: omistaja.projectId } : { offerId: omistaja.offerId },
      _max: { seq: true },
    });
    await prisma.building.create({ data: { ...data, ...omistaja, seq: (max._max.seq ?? 0) + 1 } });
  }
  paivitaOmistaja(omistaja.projectId, omistaja.offerId);
  palaa(k.paluu);
}

export async function poistaRakennus(formData: FormData) {
  const k = kentat(formData);
  const r = await prisma.building.delete({ where: { id: k.id! } });
  paivitaOmistaja(r.projectId, r.offerId);
  palaa(k.paluu);
}

/** Kopioi rakennuksen määräluetteloineen samalle omistajalle uudella tunnuksella (toistuvat talotyypit). */
export async function kopioiRakennus(formData: FormData) {
  const k = kentat(formData);
  const uusiTunnus = k.code;
  if (!uusiTunnus) palaa(k.paluu, "Anna kopiolle tunnus");
  const r = await prisma.building.findUniqueOrThrow({ where: { id: k.id! }, include: { parts: true } });
  const omistaja = r.projectId ? { projectId: r.projectId } : { offerId: r.offerId };
  if (await prisma.building.findFirst({ where: { ...omistaja, code: uusiTunnus } })) palaa(k.paluu, `Tunnus ${uusiTunnus} on jo käytössä`);
  const max = await prisma.building.aggregate({ where: omistaja, _max: { seq: true } });
  await prisma.building.create({
    data: {
      projectId: r.projectId,
      offerId: r.offerId,
      code: uusiTunnus,
      name: r.name,
      buildingType: r.buildingType,
      grossAreaM2: r.grossAreaM2,
      plannedDelivery: r.plannedDelivery,
      seq: (max._max.seq ?? 0) + 1,
      // BIM-tunnisteet eivät kopioidu: ne yksilöivät mallin olion.
      parts: {
        create: r.parts.map((o) => ({
          structureTypeId: o.structureTypeId,
          quantity: o.quantity,
          location: o.location,
          notes: o.notes,
          seq: o.seq,
        })),
      },
    },
  });
  paivitaOmistaja(r.projectId, r.offerId);
  palaa(k.paluu);
}

// ------------------------------------------------------------
// Määräluettelo (rakenneosa × määrä)
// ------------------------------------------------------------

const rakenneosaInput = z.object({
  id: z.string().optional(),
  buildingId: z.string().min(1),
  structureTypeId: z.string().min(1, "Valitse rakenneosa"),
  quantity: luku("Määrä on pakollinen").pipe(z.number().positive("Määrän pitää olla suurempi kuin 0")),
  location: valinnainenTeksti,
  notes: valinnainenTeksti,
});

export async function tallennaMaararivi(formData: FormData) {
  const k = kentat(formData);
  const { id, ...data } = jasenna(rakenneosaInput, k, k.paluu);
  if (id) {
    await prisma.buildingPart.update({ where: { id }, data });
  } else {
    const max = await prisma.buildingPart.aggregate({ where: { buildingId: data.buildingId }, _max: { seq: true } });
    await prisma.buildingPart.create({ data: { ...data, seq: (max._max.seq ?? 0) + 1 } });
  }
  await paivitaRakennus(data.buildingId);
  palaa(k.paluu);
}

export async function poistaMaararivi(formData: FormData) {
  const k = kentat(formData);
  const o = await prisma.buildingPart.delete({ where: { id: k.id! } });
  await paivitaRakennus(o.buildingId);
  palaa(k.paluu);
}

// ------------------------------------------------------------
// Elementit
// ------------------------------------------------------------

const elementtiInput = z.object({
  id: z.string().optional(),
  buildingId: z.string().min(1),
  code: z.string().trim().min(1, "Elementtitunnus on pakollinen").max(40).transform((v) => v.toUpperCase()),
  structureTypeId: valinnainenTeksti,
  description: valinnainenTeksti,
  quantity: valinnainenLuku,
  status: z.enum(ELEMENTIN_TILAT).default("SUUNNITTEILLA"),
  plannedDate: valinnainenPvm,
  bimGuid: valinnainenTeksti,
});

export async function tallennaElementti(formData: FormData) {
  const k = kentat(formData);
  const { id, ...data } = jasenna(elementtiInput, k, k.paluu);
  const sama = await prisma.productionElement.findUnique({
    where: { buildingId_code: { buildingId: data.buildingId, code: data.code } },
  });
  if (sama && sama.id !== id) palaa(k.paluu, `Elementtitunnus ${data.code} on jo käytössä`);
  const valmis = ["VALMIS", "TOIMITETTU", "ASENNETTU"].includes(data.status);
  if (id) {
    const vanha = await prisma.productionElement.findUniqueOrThrow({ where: { id } });
    await prisma.productionElement.update({
      where: { id },
      data: { ...data, completedAt: valmis ? vanha.completedAt ?? new Date() : null },
    });
  } else {
    const max = await prisma.productionElement.aggregate({ where: { buildingId: data.buildingId }, _max: { seq: true } });
    await prisma.productionElement.create({
      data: { ...data, completedAt: valmis ? new Date() : null, seq: (max._max.seq ?? 0) + 1 },
    });
  }
  await paivitaRakennus(data.buildingId);
  palaa(k.paluu);
}

/** Pikavalinta elementtilistassa: vain tilan vaihto. */
export async function asetaElementinTila(formData: FormData) {
  const k = kentat(formData);
  const { id, status } = jasenna(z.object({ id: z.string().min(1), status: z.enum(ELEMENTIN_TILAT) }), k, k.paluu);
  const vanha = await prisma.productionElement.findUniqueOrThrow({ where: { id } });
  const valmis = ["VALMIS", "TOIMITETTU", "ASENNETTU"].includes(status);
  await prisma.productionElement.update({
    where: { id },
    data: { status, completedAt: valmis ? vanha.completedAt ?? new Date() : null },
  });
  await paivitaRakennus(vanha.buildingId);
  palaa(k.paluu);
}

export async function poistaElementti(formData: FormData) {
  const k = kentat(formData);
  const e = await prisma.productionElement.delete({ where: { id: k.id! } });
  await paivitaRakennus(e.buildingId);
  palaa(k.paluu);
}

// ------------------------------------------------------------
// Laadunvarmistus: tarkastuslista pohjasta
// ------------------------------------------------------------

/** Kopioi tarkastuslistapohjan kohdat rakennuksen (tai sen elementin) tarkastuslistaksi. */
export async function luoTarkastuslistaPohjasta(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(
    z.object({ buildingId: z.string().min(1), templateId: z.string().min(1, "Valitse pohja"), elementId: valinnainenTeksti }),
    k,
    k.paluu
  );
  const pohja = await prisma.qaChecklist.findUniqueOrThrow({
    where: { id: d.templateId },
    include: { items: { orderBy: { seq: "asc" } } },
  });
  const rakennus = await prisma.building.findUniqueOrThrow({ where: { id: d.buildingId } });
  const elementti = d.elementId ? await prisma.productionElement.findUniqueOrThrow({ where: { id: d.elementId } }) : null;
  await prisma.qaChecklist.create({
    data: {
      title: `${pohja.title} – ${elementti ? elementti.code : rakennus.code}`,
      buildingId: rakennus.id,
      elementId: elementti?.id ?? null,
      items: { create: pohja.items.map((i) => ({ label: i.label, seq: i.seq })) },
    },
  });
  await paivitaRakennus(rakennus.id);
  revalidatePath("/laadunvarmistus/tarkastuslistat");
  palaa(k.paluu);
}

// ------------------------------------------------------------
// Hankinnat materiaalitarpeesta
// ------------------------------------------------------------

/**
 * Luo projektin hankintasuunnitelmaan materiaalirivit rakenteiden
 * materiaalitarpeesta. Nimikkeen olemassa olevan rivin määrä päivitetään
 * (vaihe, toimittaja ja takarajat säilyvät); uusille nimikkeille luodaan rivi.
 * Nimikkeitä, joita ei enää tarvita, ei poisteta, vaan ne jäävät näkyviin.
 */
export async function luoHankinnatMateriaalitarpeesta(formData: FormData) {
  const k = kentat(formData);
  const projectId = k.projectId!;
  const { tarve } = await laskeRakennukset({ projectId });
  if (tarve.length === 0) palaa(k.paluu, "Rakennusten määräluettelot ovat tyhjiä, joten materiaalitarvetta ei ole");

  await prisma.$transaction(async (tx) => {
    const plan = await tx.procurementPlan.upsert({ where: { projectId }, create: { projectId }, update: {} });
    const olemassa = await tx.procurementItem.findMany({ where: { procurementPlanId: plan.id, productId: { not: null } } });
    const nimikkeittain = new Map(olemassa.map((r) => [r.productId!, r]));
    for (const t of tarve) {
      const rivi = nimikkeittain.get(t.nimike.id);
      if (rivi) {
        await tx.procurementItem.update({ where: { id: rivi.id }, data: { quantity: t.maara, unit: t.nimike.unit } });
      } else {
        await tx.procurementItem.create({
          data: {
            procurementPlanId: plan.id,
            productId: t.nimike.id,
            kind: "MATERIAALI",
            description: t.nimike.name,
            quantity: t.maara,
            unit: t.nimike.unit,
            notes: `Rakenteista: ${t.rakenteet.join(", ")}`,
          },
        });
      }
    }
  });
  revalidatePath(`/projektit/${projectId}`, "layout");
  revalidatePath("/henkilot", "layout");
  palaa(k.paluu);
}
