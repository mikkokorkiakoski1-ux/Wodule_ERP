"use server";

/**
 * Projektinhallinnan Server Actions: projektiaikataulun tehtävät,
 * hankintasuunnitelman rivit, tehtäväluettelon omat tehtävät ja
 * projektiorganisaatio.
 *
 * Lomakkeet lähettävät kentän "paluu" (sivun polku). Onnistuneen
 * tallennuksen jälkeen palataan sinne, virheessä samaan osoitteeseen
 * ?virhe=-parametrin kanssa, jonka sivu näyttää.
 */
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { seuraavaVaihe, type Vaihe } from "@/lib/hankinta";
import { euroja, jasenna, kentat, paivia, palaa, valinnainenKokonaisluku, valinnainenPvm, valinnainenTeksti } from "@/lib/lomake";

const VAIHEARVOT = ["AINEISTO", "PYYNTO", "TARJOUS", "VERTAILU", "SOPIMUS", "TOIMITUS", "VALMIS", "EI_TARVITA"] as const;

// ------------------------------------------------------------
// Apufunktiot
// ------------------------------------------------------------

function projektinPolku(projectId: string) {
  return `/projektit/${projectId}`;
}

function paivita(projectId: string) {
  revalidatePath(projektinPolku(projectId), "layout");
  revalidatePath("/henkilot", "layout");
}

// ------------------------------------------------------------
// Projektiaikataulu
// ------------------------------------------------------------

const aikataulutehtavaInput = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  code: z.string().trim().min(1, "Tunnus on pakollinen").max(20).transform((v) => v.toUpperCase()),
  title: z.string().trim().min(1, "Tehtävä on pakollinen"),
  category: valinnainenTeksti,
  contractor: valinnainenTeksti,
  mainGroup: valinnainenKokonaisluku,
  predecessorCode: z.string().optional().transform((v) => (v ? v.toUpperCase() : null)),
  offsetDays: z.coerce.number().int().default(0),
  crew: valinnainenKokonaisluku,
  progress: z.coerce.number().int().min(0).max(100, "Valmiusaste on 0-100").default(0),
  fixedStart: valinnainenPvm,
  durationDays: z.coerce.number().int().min(1, "Kesto on vähintään 1 työpäivä"),
});

export async function tallennaAikataulutehtava(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(aikataulutehtavaInput, k, k.paluu);
  const { id, projectId, ...data } = d;
  if (data.predecessorCode === data.code) palaa(k.paluu, "Tehtävä ei voi edeltää itseään");

  const sama = await prisma.scheduleTask.findUnique({ where: { projectId_code: { projectId, code: data.code } } });
  if (sama && sama.id !== id) palaa(k.paluu, `Tunnus ${data.code} on jo käytössä (${sama.title})`);

  if (id) {
    const vanha = await prisma.scheduleTask.findUniqueOrThrow({ where: { id } });
    await prisma.$transaction(async (tx) => {
      await tx.scheduleTask.update({ where: { id }, data });
      // Tunnuksen vaihtuessa päivitetään myös siihen viittaavat rivit.
      if (vanha.code !== data.code) {
        const w = { projectId, scheduleTaskCode: vanha.code };
        await tx.scheduleTask.updateMany({ where: { projectId, predecessorCode: vanha.code }, data: { predecessorCode: data.code } });
        await tx.projectTodo.updateMany({ where: w, data: { scheduleTaskCode: data.code } });
        await tx.procurementItem.updateMany({
          where: { procurementPlan: { projectId }, scheduleTaskCode: vanha.code },
          data: { scheduleTaskCode: data.code },
        });
      }
    });
  } else {
    const max = await prisma.scheduleTask.aggregate({ where: { projectId }, _max: { seq: true } });
    await prisma.scheduleTask.create({ data: { ...data, projectId, seq: (max._max.seq ?? 0) + 1 } });
  }
  paivita(projectId);
  palaa(k.paluu);
}

export async function poistaAikataulutehtava(formData: FormData) {
  const k = kentat(formData);
  const t = await prisma.scheduleTask.delete({ where: { id: k.id! } });
  paivita(t.projectId);
  palaa(k.paluu);
}

// ------------------------------------------------------------
// Hankintasuunnitelma
// ------------------------------------------------------------

const hankintariviInput = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  kind: z.enum(["TYOSUORITE", "MATERIAALI"]).default("MATERIAALI"),
  littera: valinnainenTeksti,
  description: z.string().trim().min(1, "Hankinta on pakollinen"),
  quantity: z.coerce.number().min(0).default(1),
  unit: z.string().default("kpl"),
  scheduleTaskCode: z.string().optional().transform((v) => (v ? v.toUpperCase() : null)),
  neededBy: valinnainenPvm,
  materialDays: paivia(1),
  requestDays: paivia(5),
  comparisonDays: paivia(1),
  negotiationDays: paivia(2),
  deliveryDays: paivia(14),
  phase: z.enum(VAIHEARVOT).default("AINEISTO"),
  supplier: valinnainenTeksti,
  agreedDelivery: valinnainenPvm,
  cost: euroja,
  paymentInfo: valinnainenTeksti,
  notes: valinnainenTeksti,
  assigneeId: valinnainenTeksti,
});

export async function tallennaHankintarivi(formData: FormData) {
  const k = kentat(formData);
  const { id, projectId, cost, ...data } = jasenna(hankintariviInput, k, k.paluu);
  const tallennettava = { ...data, costCents: cost };
  if (id) {
    await prisma.procurementItem.update({ where: { id }, data: tallennettava });
  } else {
    const plan = await prisma.procurementPlan.upsert({ where: { projectId }, create: { projectId }, update: {} });
    await prisma.procurementItem.create({ data: { ...tallennettava, procurementPlanId: plan.id } });
  }
  paivita(projectId);
  palaa(k.paluu);
}

async function hankinnanProjekti(id: string) {
  const r = await prisma.procurementItem.findUniqueOrThrow({ where: { id }, include: { procurementPlan: true } });
  return { rivi: r, projectId: r.procurementPlan.projectId };
}

export async function poistaHankintarivi(formData: FormData) {
  const k = kentat(formData);
  const { projectId } = await hankinnanProjekti(k.id!);
  await prisma.procurementItem.delete({ where: { id: k.id! } });
  paivita(projectId);
  palaa(k.paluu);
}

/** Siirtää hankintarivin seuraavaan vaiheeseen (esim. Pyyntö -> Tarjous). */
export async function siirraSeuraavaanVaiheeseen(formData: FormData) {
  const k = kentat(formData);
  const { rivi, projectId } = await hankinnanProjekti(k.id!);
  const seuraava = seuraavaVaihe(rivi.phase as Vaihe);
  if (seuraava) await prisma.procurementItem.update({ where: { id: rivi.id }, data: { phase: seuraava } });
  paivita(projectId);
  palaa(k.paluu);
}

export async function asetaVaihe(formData: FormData) {
  const k = kentat(formData);
  const phase = jasenna(z.enum(VAIHEARVOT), k.phase, k.paluu);
  const { projectId } = await hankinnanProjekti(k.id!);
  await prisma.procurementItem.update({ where: { id: k.id! }, data: { phase } });
  paivita(projectId);
  palaa(k.paluu);
}

// ------------------------------------------------------------
// Tehtäväluettelo
// ------------------------------------------------------------

const tehtavaInput = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Tehtävä on pakollinen"),
  notes: valinnainenTeksti,
  area: z.enum(["LUVITUS", "SUUNNITTELU", "HANKINTA", "MUU"]).default("SUUNNITTELU"),
  status: z.enum(["AVOIN", "KESKEN", "VALMIS"]).default("AVOIN"),
  dueDate: valinnainenPvm,
  scheduleTaskCode: z.string().optional().transform((v) => (v ? v.toUpperCase() : null)),
  assigneeId: valinnainenTeksti,
});

export async function tallennaTehtava(formData: FormData) {
  const k = kentat(formData);
  const { id, projectId, ...data } = jasenna(tehtavaInput, k, k.paluu);
  if (id) await prisma.projectTodo.update({ where: { id }, data });
  else await prisma.projectTodo.create({ data: { ...data, projectId } });
  paivita(projectId);
  palaa(k.paluu);
}

export async function poistaTehtava(formData: FormData) {
  const k = kentat(formData);
  const t = await prisma.projectTodo.delete({ where: { id: k.id! } });
  paivita(t.projectId);
  palaa(k.paluu);
}

export async function asetaTehtavanTila(formData: FormData) {
  const k = kentat(formData);
  const status = jasenna(z.enum(["AVOIN", "KESKEN", "VALMIS"]), k.status, k.paluu);
  const t = await prisma.projectTodo.update({ where: { id: k.id! }, data: { status } });
  paivita(t.projectId);
  palaa(k.paluu);
}

/** Vaihtaa yhden hankintarivin tai tehtävän vastuuhenkilön. */
export async function asetaVastuuhenkilo(formData: FormData) {
  const k = kentat(formData);
  const assigneeId = k.assigneeId ?? null;
  if (k.tyyppi === "hankinta") {
    const { projectId } = await hankinnanProjekti(k.id!);
    await prisma.procurementItem.update({ where: { id: k.id! }, data: { assigneeId } });
    paivita(projectId);
  } else {
    const t = await prisma.projectTodo.update({ where: { id: k.id! }, data: { assigneeId } });
    paivita(t.projectId);
  }
  palaa(k.paluu);
}

/** Antaa projektin kaikki vastuuhenkilöttömät avoimet rivit yhdelle henkilölle. */
export async function jaaVastuuttomat(formData: FormData) {
  const k = kentat(formData);
  if (!k.projectId || !k.assigneeId) palaa(k.paluu, "Valitse henkilö");
  await prisma.$transaction([
    prisma.procurementItem.updateMany({
      where: { procurementPlan: { projectId: k.projectId }, assigneeId: null, phase: { notIn: ["VALMIS", "EI_TARVITA"] } },
      data: { assigneeId: k.assigneeId },
    }),
    prisma.projectTodo.updateMany({
      where: { projectId: k.projectId, assigneeId: null, status: { not: "VALMIS" } },
      data: { assigneeId: k.assigneeId },
    }),
  ]);
  paivita(k.projectId!);
  palaa(k.paluu);
}

// ------------------------------------------------------------
// Projektiorganisaatio
// ------------------------------------------------------------

export async function lisaaJasen(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(
    z.object({ projectId: z.string().min(1), userId: z.string().min(1, "Valitse henkilö"), role: z.string().trim().min(1, "Anna rooli") }),
    k,
    k.paluu
  );
  try {
    await prisma.projectMember.create({ data: d });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") palaa(k.paluu, "Henkilöllä on jo tämä rooli");
    throw e;
  }
  paivita(d.projectId);
  palaa(k.paluu);
}

export async function poistaJasen(formData: FormData) {
  const k = kentat(formData);
  const j = await prisma.projectMember.delete({ where: { id: k.id! } });
  paivita(j.projectId);
  palaa(k.paluu);
}
