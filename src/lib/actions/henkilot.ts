"use server";

/**
 * Henkilörekisterin Server Actions (/henkilot). Henkilöille jaetaan
 * projektien tehtäviä ja hankintoja.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const henkiloInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Nimi on pakollinen"),
  email: z
    .string()
    .trim()
    .email("Sähköpostiosoite ei kelpaa")
    .optional()
    .transform((v) => v?.toLowerCase() ?? null),
  phone: z.string().trim().optional().transform((v) => v ?? null),
  role: z.enum(["ADMIN", "MYYNTI", "SUUNNITTELU", "HANKINTA", "TUOTANTO", "LAATU"]),
});

function palaa(polku: string, virhe?: string): never {
  redirect(virhe ? `${polku}?virhe=${encodeURIComponent(virhe)}` : polku);
}

export async function tallennaHenkilo(formData: FormData) {
  const raaka: Record<string, string | undefined> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string") raaka[k] = v.trim() === "" ? undefined : v;
  });
  const paluu = raaka.paluu ?? "/henkilot";
  const tulos = henkiloInput.safeParse(raaka);
  if (!tulos.success) palaa(paluu, tulos.error.issues[0].message);
  const { id, ...data } = tulos.data;

  try {
    if (id) await prisma.user.update({ where: { id }, data });
    else await prisma.user.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      palaa(paluu, `Sähköpostiosoite ${data.email} on jo toisella henkilöllä`);
    }
    throw e;
  }
  revalidatePath("/", "layout");
  palaa(paluu.split("?")[0]);
}

export async function vaihdaAktiivisuus(formData: FormData) {
  const id = String(formData.get("id"));
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath("/", "layout");
  palaa(String(formData.get("paluu") ?? "/henkilot"));
}
