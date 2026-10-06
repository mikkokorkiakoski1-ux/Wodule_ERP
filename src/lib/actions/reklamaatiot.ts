"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const complaintInput = z.object({
  customerId: z.string().cuid().optional(),
  // Kohdistus: tarkin annettu taso ratkaisee, ja ylemmät tasot päätellään siitä.
  projectId: z.string().cuid().optional(),
  buildingId: z.string().cuid().optional(),
  elementId: z.string().cuid().optional(),
  title: z.string().trim().min(1, "Otsikko on pakollinen"),
  description: z.string().trim().min(1, "Kuvaus on pakollinen"),
  paluu: z.string().optional(),
});

/** Päättelee elementistä rakennuksen, rakennuksesta projektin ja projektista asiakkaan. */
async function kohdistus(d: { customerId?: string; projectId?: string; buildingId?: string; elementId?: string }) {
  let { customerId, projectId, buildingId } = d;
  const elementId = d.elementId;
  if (elementId) {
    const e = await prisma.productionElement.findUniqueOrThrow({ where: { id: elementId } });
    buildingId = e.buildingId;
  }
  if (buildingId) {
    const b = await prisma.building.findUniqueOrThrow({ where: { id: buildingId } });
    projectId = b.projectId ?? projectId;
  }
  if (projectId) {
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    customerId = p.customerId;
  }
  if (!customerId) throw new Error("Reklamaatiolle pitää valita asiakas tai projekti");
  return { customerId, projectId: projectId ?? null, buildingId: buildingId ?? null, elementId: elementId ?? null };
}

/** Lomakkeen valinta "projekti:<id>", "rakennus:<id>" tai "elementti:<id>" (yhdistetty valintalista). */
function jasennaKohde(arvo: FormDataEntryValue | null) {
  const [taso, id] = typeof arvo === "string" ? arvo.split(":") : [];
  return {
    projectId: taso === "projekti" ? id : undefined,
    buildingId: taso === "rakennus" ? id : undefined,
    elementId: taso === "elementti" ? id : undefined,
  };
}

export async function createComplaint(formData: FormData) {
  const kohde = jasennaKohde(formData.get("kohde"));
  const parsed = complaintInput.parse({
    customerId: formData.get("customerId") || undefined,
    projectId: formData.get("projectId") || kohde.projectId,
    buildingId: formData.get("buildingId") || kohde.buildingId,
    elementId: formData.get("elementId") || kohde.elementId,
    title: formData.get("title"),
    description: formData.get("description"),
    paluu: formData.get("paluu") || undefined,
  });

  const k = await kohdistus(parsed);
  await prisma.complaint.create({
    data: { ...k, title: parsed.title, description: parsed.description },
  });

  revalidatePath("/reklamaatiot");
  if (k.projectId) revalidatePath(`/projektit/${k.projectId}`, "layout");
  if (parsed.paluu) redirect(parsed.paluu);
}

const statusInput = z.object({
  id: z.string().cuid(),
  status: z.enum(["AVOIN", "SELVITYKSESSA", "RATKAISTU", "HYLATTY"]),
});

export async function updateComplaintStatus(formData: FormData) {
  const parsed = statusInput.parse({
    id: formData.get("id"),
    status: formData.get("status"),
  });

  const c = await prisma.complaint.update({
    where: { id: parsed.id },
    data: {
      status: parsed.status,
      resolvedAt: parsed.status === "RATKAISTU" ? new Date() : null,
    },
  });

  revalidatePath("/reklamaatiot");
  if (c.projectId) revalidatePath(`/projektit/${c.projectId}`, "layout");
  const paluu = formData.get("paluu");
  if (typeof paluu === "string" && paluu) redirect(paluu);
}
