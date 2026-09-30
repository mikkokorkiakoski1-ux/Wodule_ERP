"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Sharepoint-tuotantokansio luodaan/haetaan projektille lazily (upsert),
// koska kaaviossa jokaisella projektilla on täsmälleen yksi kansio.
async function getOrCreateFolder(projectId: string) {
  return prisma.productionFolder.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });
}

const folderInput = z.object({
  projectId: z.string().cuid(),
  sharepointUrl: z.string().trim().url("Anna kelvollinen URL"),
});

export async function setSharepointUrl(formData: FormData) {
  const parsed = folderInput.parse({
    projectId: formData.get("projectId"),
    sharepointUrl: formData.get("sharepointUrl"),
  });

  const folder = await getOrCreateFolder(parsed.projectId);
  await prisma.productionFolder.update({
    where: { id: folder.id },
    data: { sharepointUrl: parsed.sharepointUrl, syncedAt: new Date() },
  });

  revalidatePath(`/tuotannon-ohjaus/${parsed.projectId}`);
}

const workOrderInput = z.object({
  projectId: z.string().cuid(),
  number: z.string().trim().min(1),
  description: z.string().trim().optional(),
  hoursEstimated: z.coerce.number().optional(),
});

export async function addWorkOrder(formData: FormData) {
  const parsed = workOrderInput.parse({
    projectId: formData.get("projectId"),
    number: formData.get("number"),
    description: formData.get("description") || undefined,
    hoursEstimated: formData.get("hoursEstimated") || undefined,
  });

  const folder = await getOrCreateFolder(parsed.projectId);
  await prisma.workOrder.create({
    data: {
      productionFolderId: folder.id,
      number: parsed.number,
      description: parsed.description || null,
      hoursEstimated: parsed.hoursEstimated ?? null,
    },
  });

  revalidatePath(`/tuotannon-ohjaus/${parsed.projectId}/tyomaaraimet`);
}

const drawingInput = z.object({
  projectId: z.string().cuid(),
  title: z.string().trim().min(1),
  revision: z.string().trim().default("A"),
  fileUrl: z.string().trim().optional(),
});

export async function addDrawing(formData: FormData) {
  const parsed = drawingInput.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    revision: formData.get("revision") || undefined,
    fileUrl: formData.get("fileUrl") || undefined,
  });

  const folder = await getOrCreateFolder(parsed.projectId);
  await prisma.drawing.create({
    data: {
      productionFolderId: folder.id,
      title: parsed.title,
      revision: parsed.revision,
      fileUrl: parsed.fileUrl || null,
    },
  });

  revalidatePath(`/tuotannon-ohjaus/${parsed.projectId}/piirustukset`);
}
