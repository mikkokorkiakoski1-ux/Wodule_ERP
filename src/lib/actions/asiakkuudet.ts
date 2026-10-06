"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const customerInput = z.object({
  name: z.string().trim().min(1, "Nimi on pakollinen"),
  businessId: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().optional(),
});

export async function createCustomer(formData: FormData) {
  const parsed = customerInput.parse({
    name: formData.get("name"),
    businessId: formData.get("businessId") || undefined,
    contactName: formData.get("contactName") || undefined,
    contactEmail: formData.get("contactEmail") || undefined,
    contactPhone: formData.get("contactPhone") || undefined,
  });

  await prisma.customer.create({
    data: {
      name: parsed.name,
      businessId: parsed.businessId || null,
      contactName: parsed.contactName || null,
      contactEmail: parsed.contactEmail || null,
      contactPhone: parsed.contactPhone || null,
    },
  });

  revalidatePath("/asiakkuuksien-hallinta");
}

const offerInput = z.object({
  customerId: z.string().cuid(),
  title: z.string().trim().min(1, "Otsikko on pakollinen"),
  amountEuros: z.coerce.number().optional(),
  validUntil: z.string().optional(),
});

export async function createOffer(formData: FormData) {
  const parsed = offerInput.parse({
    customerId: formData.get("customerId"),
    title: formData.get("title"),
    amountEuros: formData.get("amountEuros") || undefined,
    validUntil: formData.get("validUntil") || undefined,
  });

  const offer = await prisma.offer.create({
    data: {
      customerId: parsed.customerId,
      title: parsed.title,
      amountCents: parsed.amountEuros ? Math.round(parsed.amountEuros * 100) : null,
      validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
    },
  });

  revalidatePath("/asiakkuuksien-hallinta/tarjoukset");
  // Tarjouksen sivulla annetaan sen sisältö: rakennukset ja määräluettelot.
  redirect(`/asiakkuuksien-hallinta/tarjoukset/${offer.id}`);
}

const offerUpdateInput = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1, "Otsikko on pakollinen"),
  status: z.enum(["LUONNOS", "LAHETETTY", "HYVAKSYTTY", "HYLATTY"]),
  amountEuros: z.string().optional(),
  validUntil: z.string().optional(),
});

export async function updateOffer(formData: FormData) {
  const parsed = offerUpdateInput.parse({
    id: formData.get("id"),
    title: formData.get("title"),
    status: formData.get("status"),
    amountEuros: formData.get("amountEuros") || undefined,
    validUntil: formData.get("validUntil") || undefined,
  });
  const euroja = parsed.amountEuros ? Number(parsed.amountEuros.replace(/\s|€/g, "").replace(",", ".")) : null;
  const polku = `/asiakkuuksien-hallinta/tarjoukset/${parsed.id}`;
  if (euroja !== null && (!Number.isFinite(euroja) || euroja < 0)) {
    redirect(`${polku}?virhe=${encodeURIComponent(`"${parsed.amountEuros}" ei ole euromäärä`)}`);
  }

  await prisma.offer.update({
    where: { id: parsed.id },
    data: {
      title: parsed.title,
      status: parsed.status,
      amountCents: euroja === null ? null : Math.round(euroja * 100),
      validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
    },
  });

  revalidatePath("/asiakkuuksien-hallinta/tarjoukset", "layout");
  redirect(polku);
}

// "Muuta projektiksi": luo tarjouksesta projektin (sama asiakas, nimi = otsikko),
// liittää tarjouksen rakennukset määräluetteloineen projektiin, merkitsee
// tarjouksen hyväksytyksi ja siirtää käyttäjän projektin Rakennukset-sivulle.
// Tarjous jää historiaan, ja Project.offerId:n @unique estää tuplamuunnoksen.
export async function convertOfferToProject(formData: FormData) {
  const offerId = z.string().cuid().parse(formData.get("offerId"));

  const projectId = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findUniqueOrThrow({
      where: { id: offerId },
      include: { project: true },
    });
    if (offer.project) return offer.project.id;

    const project = await tx.project.create({
      data: {
        customerId: offer.customerId,
        offerId: offer.id,
        name: offer.title,
      },
    });
    // Rakennukset siirtyvät projektille; offerId jää kertomaan alkuperän.
    await tx.building.updateMany({ where: { offerId: offer.id, projectId: null }, data: { projectId: project.id } });
    await tx.offer.update({ where: { id: offer.id }, data: { status: "HYVAKSYTTY" } });
    return project.id;
  });

  revalidatePath("/asiakkuuksien-hallinta/tarjoukset");
  revalidatePath("/projektit");
  redirect(`/projektit/${projectId}/rakennukset`);
}

const projectInput = z.object({
  customerId: z.string().cuid(),
  name: z.string().trim().min(1, "Nimi on pakollinen"),
  offerId: z.string().cuid().optional(),
  description: z.string().trim().optional(),
  promisedDeliveryDate: z.string().optional(),
});

export async function createProject(formData: FormData) {
  const parsed = projectInput.parse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    offerId: formData.get("offerId") || undefined,
    description: formData.get("description") || undefined,
    promisedDeliveryDate: formData.get("promisedDeliveryDate") || undefined,
  });

  await prisma.project.create({
    data: {
      customerId: parsed.customerId,
      name: parsed.name,
      offerId: parsed.offerId || null,
      description: parsed.description || null,
      promisedDeliveryDate: parsed.promisedDeliveryDate
        ? new Date(parsed.promisedDeliveryDate)
        : null,
    },
  });

  revalidatePath("/projektit");
}

const orderConfirmationInput = z.object({
  projectId: z.string().cuid(),
  number: z.string().trim().min(1),
  notes: z.string().trim().optional(),
});

export async function createOrderConfirmation(formData: FormData) {
  const parsed = orderConfirmationInput.parse({
    projectId: formData.get("projectId"),
    number: formData.get("number"),
    notes: formData.get("notes") || undefined,
  });

  await prisma.orderConfirmation.create({
    data: {
      projectId: parsed.projectId,
      number: parsed.number,
      notes: parsed.notes || null,
    },
  });

  revalidatePath(`/projektit/${parsed.projectId}`);
}

const milestoneInput = z.object({
  projectId: z.string().cuid(),
  title: z.string().trim().min(1),
  dueDate: z.string().optional(),
});

export async function addMilestone(formData: FormData) {
  const parsed = milestoneInput.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    dueDate: formData.get("dueDate") || undefined,
  });

  const count = await prisma.projectMilestone.count({ where: { projectId: parsed.projectId } });

  await prisma.projectMilestone.create({
    data: {
      projectId: parsed.projectId,
      title: parsed.title,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      seq: count + 1,
    },
  });

  revalidatePath(`/projektit/${parsed.projectId}/aikataulu`);
}

export async function toggleMilestone(id: string, projectId: string, done: boolean) {
  await prisma.projectMilestone.update({ where: { id }, data: { done } });
  revalidatePath(`/projektit/${projectId}/aikataulu`);
}
