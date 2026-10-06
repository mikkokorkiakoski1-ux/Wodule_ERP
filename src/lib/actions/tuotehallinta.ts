"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const productInput = z.object({
  code: z.string().trim().min(1, "Koodi on pakollinen"),
  name: z.string().trim().min(1, "Nimi on pakollinen"),
  description: z.string().trim().optional(),
  unit: z.string().trim().default("kpl"),
});

export async function createProduct(formData: FormData) {
  const parsed = productInput.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    unit: formData.get("unit") || undefined,
  });

  await prisma.product.create({
    data: {
      code: parsed.code,
      name: parsed.name,
      description: parsed.description || null,
      unit: parsed.unit,
    },
  });

  revalidatePath("/tuotehallinta/nimikkeisto");
}

const priceListInput = z.object({
  name: z.string().trim().min(1, "Nimi on pakollinen"),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  laborHourEuros: z.coerce.number().min(0).optional(),
});

export async function createPriceList(formData: FormData) {
  const parsed = priceListInput.parse({
    name: formData.get("name"),
    validFrom: formData.get("validFrom") || undefined,
    validTo: formData.get("validTo") || undefined,
    laborHourEuros: formData.get("laborHourEuros") || undefined,
  });

  await prisma.priceList.create({
    data: {
      name: parsed.name,
      validFrom: parsed.validFrom ? new Date(parsed.validFrom) : new Date(),
      validTo: parsed.validTo ? new Date(parsed.validTo) : null,
      laborHourCents: parsed.laborHourEuros !== undefined ? Math.round(parsed.laborHourEuros * 100) : null,
    },
  });

  revalidatePath("/tuotehallinta/hinnastot");
}

const laborRateInput = z.object({
  priceListId: z.string().cuid(),
  laborHourEuros: z.coerce.number().min(0).optional(),
});

/** Hinnaston tuntihinta rakenteiden kustannuslaskentaan. Tyhjä = ei tuntihintaa. */
export async function setLaborRate(formData: FormData) {
  const parsed = laborRateInput.parse({
    priceListId: formData.get("priceListId"),
    laborHourEuros: formData.get("laborHourEuros") || undefined,
  });

  await prisma.priceList.update({
    where: { id: parsed.priceListId },
    data: { laborHourCents: parsed.laborHourEuros !== undefined ? Math.round(parsed.laborHourEuros * 100) : null },
  });

  revalidatePath("/tuotehallinta", "layout");
}

const priceListItemInput = z.object({
  priceListId: z.string().cuid(),
  productId: z.string().cuid(),
  unitPriceEuros: z.coerce.number().min(0),
});

export async function addPriceListItem(formData: FormData) {
  const parsed = priceListItemInput.parse({
    priceListId: formData.get("priceListId"),
    productId: formData.get("productId"),
    unitPriceEuros: formData.get("unitPriceEuros"),
  });

  await prisma.priceListItem.upsert({
    where: {
      priceListId_productId: {
        priceListId: parsed.priceListId,
        productId: parsed.productId,
      },
    },
    create: {
      priceListId: parsed.priceListId,
      productId: parsed.productId,
      unitPriceCents: Math.round(parsed.unitPriceEuros * 100),
    },
    update: {
      unitPriceCents: Math.round(parsed.unitPriceEuros * 100),
    },
  });

  revalidatePath(`/tuotehallinta/hinnastot`);
}
