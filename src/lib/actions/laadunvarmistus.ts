"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

/** "rakennus:<id>" tai "elementti:<id>" -> rakennus ja elementti (elementistä päätellään rakennus). */
async function kohdistus(arvo: FormDataEntryValue | null) {
  const [taso, id] = typeof arvo === "string" && arvo ? arvo.split(":") : [];
  if (taso === "elementti") {
    const e = await prisma.productionElement.findUniqueOrThrow({ where: { id } });
    return { buildingId: e.buildingId, elementId: e.id };
  }
  return { buildingId: taso === "rakennus" ? id : null, elementId: null };
}

async function paivitaRakennus(buildingId: string | null) {
  if (!buildingId) return;
  const b = await prisma.building.findUnique({ where: { id: buildingId }, select: { projectId: true } });
  if (b?.projectId) revalidatePath(`/projektit/${b.projectId}`, "layout");
}

const checklistInput = z.object({
  title: z.string().trim().min(1, "Otsikko on pakollinen"),
});

export async function createChecklist(formData: FormData) {
  const parsed = checklistInput.parse({ title: formData.get("title") });
  const isTemplate = formData.get("isTemplate") === "on";
  const k = isTemplate ? { buildingId: null, elementId: null } : await kohdistus(formData.get("kohde"));
  await prisma.qaChecklist.create({ data: { title: parsed.title, isTemplate, ...k } });
  revalidatePath("/laadunvarmistus/tarkastuslistat");
  await paivitaRakennus(k.buildingId);
}

const checklistItemInput = z.object({
  checklistId: z.string().cuid(),
  label: z.string().trim().min(1),
});

export async function addChecklistItem(formData: FormData) {
  const parsed = checklistItemInput.parse({
    checklistId: formData.get("checklistId"),
    label: formData.get("label"),
  });

  const count = await prisma.qaChecklistItem.count({
    where: { checklistId: parsed.checklistId },
  });

  await prisma.qaChecklistItem.create({
    data: { checklistId: parsed.checklistId, label: parsed.label, seq: count + 1 },
  });

  revalidatePath("/laadunvarmistus/tarkastuslistat");
}

export async function setChecklistItemResult(id: string, passed: boolean | null) {
  const item = await prisma.qaChecklistItem.update({
    where: { id },
    data: { passed },
    include: { checklist: true },
  });
  revalidatePath("/laadunvarmistus/tarkastuslistat");
  await paivitaRakennus(item.checklist.buildingId);
  return item;
}

const documentInput = z.object({
  title: z.string().trim().min(1, "Otsikko on pakollinen"),
  category: z.string().trim().optional(),
  fileUrl: z.string().trim().optional(),
});

export async function createQaDocument(formData: FormData) {
  const parsed = documentInput.parse({
    title: formData.get("title"),
    category: formData.get("category") || undefined,
    fileUrl: formData.get("fileUrl") || undefined,
  });
  const { buildingId } = await kohdistus(formData.get("kohde"));

  await prisma.qaDocument.create({
    data: {
      title: parsed.title,
      category: parsed.category || null,
      fileUrl: parsed.fileUrl || null,
      buildingId,
    },
  });

  revalidatePath("/laadunvarmistus/dopit");
  await paivitaRakennus(buildingId);
}
