"use server";

import { revalidatePath } from "next/cache";
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

  await prisma.offer.create({
    data: {
      customerId: parsed.customerId,
      title: parsed.title,
      amountCents: parsed.amountEuros ? Math.round(parsed.amountEuros * 100) : null,
      validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
    },
  });

  revalidatePath("/asiakkuuksien-hallinta/tarjoukset");
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

  revalidatePath("/asiakkuuksien-hallinta/projektit");
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

  revalidatePath(`/asiakkuuksien-hallinta/projektit/${parsed.projectId}`);
}

const procurementItemInput = z.object({
  projectId: z.string().cuid(),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().min(0).default(1),
  unit: z.string().trim().default("kpl"),
  supplier: z.string().trim().optional(),
  neededBy: z.string().optional(),
});

export async function addProcurementItem(formData: FormData) {
  const parsed = procurementItemInput.parse({
    projectId: formData.get("projectId"),
    description: formData.get("description"),
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
    supplier: formData.get("supplier") || undefined,
    neededBy: formData.get("neededBy") || undefined,
  });

  const plan = await prisma.procurementPlan.upsert({
    where: { projectId: parsed.projectId },
    create: { projectId: parsed.projectId },
    update: {},
  });

  await prisma.procurementItem.create({
    data: {
      procurementPlanId: plan.id,
      description: parsed.description,
      quantity: parsed.quantity,
      unit: parsed.unit,
      supplier: parsed.supplier || null,
      neededBy: parsed.neededBy ? new Date(parsed.neededBy) : null,
    },
  });

  revalidatePath(`/asiakkuuksien-hallinta/projektit/${parsed.projectId}/hankintasuunnitelma`);
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

  revalidatePath(`/asiakkuuksien-hallinta/projektit/${parsed.projectId}/aikataulu`);
}

export async function toggleMilestone(id: string, projectId: string, done: boolean) {
  await prisma.projectMilestone.update({ where: { id }, data: { done } });
  revalidatePath(`/asiakkuuksien-hallinta/projektit/${projectId}/aikataulu`);
}
