"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const checklistInput = z.object({
  title: z.string().trim().min(1, "Otsikko on pakollinen"),
});

export async function createChecklist(formData: FormData) {
  const parsed = checklistInput.parse({ title: formData.get("title") });
  await prisma.qaChecklist.create({ data: { title: parsed.title } });
  revalidatePath("/laadunvarmistus/tarkastuslistat");
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
  });
  revalidatePath("/laadunvarmistus/tarkastuslistat");
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

  await prisma.qaDocument.create({
    data: {
      title: parsed.title,
      category: parsed.category || null,
      fileUrl: parsed.fileUrl || null,
    },
  });

  revalidatePath("/laadunvarmistus/dopit");
}
