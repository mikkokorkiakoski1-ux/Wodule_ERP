"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const complaintInput = z.object({
  customerId: z.string().cuid(),
  title: z.string().trim().min(1, "Otsikko on pakollinen"),
  description: z.string().trim().min(1, "Kuvaus on pakollinen"),
});

export async function createComplaint(formData: FormData) {
  const parsed = complaintInput.parse({
    customerId: formData.get("customerId"),
    title: formData.get("title"),
    description: formData.get("description"),
  });

  await prisma.complaint.create({
    data: {
      customerId: parsed.customerId,
      title: parsed.title,
      description: parsed.description,
    },
  });

  revalidatePath("/reklamaatiot");
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

  await prisma.complaint.update({
    where: { id: parsed.id },
    data: {
      status: parsed.status,
      resolvedAt: parsed.status === "RATKAISTU" ? new Date() : null,
    },
  });

  revalidatePath("/reklamaatiot");
}
