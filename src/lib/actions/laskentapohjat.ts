"use server";

/**
 * Tarjouslaskentapohjat: rakennuksen laskenta (määräluettelon rivit
 * litteroineen, kate ja laskurin syöte) tallennetaan nimettynä pohjana,
 * jonka voi ottaa toisen rakennuksen laskennan pohjaksi.
 */
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jasenna, kentat, palaa, valinnainenTeksti } from "@/lib/lomake";
import { rakennuksenKate } from "@/lib/rakennukset";

const POHJAT = "/asiakkuuksien-hallinta/tarjouslaskenta/pohjat";

function paivita(buildingId?: string, projectId?: string | null, offerId?: string | null) {
  revalidatePath(POHJAT);
  revalidatePath("/asiakkuuksien-hallinta/tarjouslaskenta", "layout");
  if (projectId) revalidatePath(`/projektit/${projectId}`, "layout");
  if (offerId) revalidatePath(`/asiakkuuksien-hallinta/tarjoukset/${offerId}`);
  if (buildingId) revalidatePath("/asiakkuuksien-hallinta/tarjoukset");
}

const tallennusInput = z.object({
  buildingId: z.string().min(1),
  name: z.string().trim().min(1, "Anna pohjalle nimi").max(120),
  description: valinnainenTeksti,
  paivita: z.string().optional().transform((v) => v === "on"),
});

/** Tallentaa rakennuksen laskennan pohjaksi (tai päivittää samannimisen pohjan, jos valittu). */
export async function tallennaPohjaksi(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(tallennusInput, k, k.paluu);
  const rakennus = await prisma.building.findUniqueOrThrow({
    where: { id: d.buildingId },
    include: { parts: { orderBy: [{ seq: "asc" }, { createdAt: "asc" }] } },
  });
  if (rakennus.parts.length === 0) palaa(k.paluu, "Rakennuksen määräluettelo on tyhjä, joten pohjaksi ei ole tallennettavaa");
  const olemassa = await prisma.laskentapohja.findUnique({ where: { name: d.name } });
  if (olemassa && !d.paivita) palaa(k.paluu, `Pohja "${d.name}" on jo olemassa. Valitse "Päivitä olemassa oleva", jos haluat korvata sen.`);

  const rivit = rakennus.parts.map((o, i) => ({
    structureTypeId: o.structureTypeId,
    productId: o.productId,
    description: o.description,
    unit: o.unit,
    unitPriceCents: o.unitPriceCents,
    litteraId: o.litteraId,
    costType: o.costType,
    quantity: o.quantity,
    location: o.location,
    notes: o.notes,
    seq: i + 1,
  }));
  const tiedot = {
    description: d.description ?? olemassa?.description ?? null,
    katePct: rakennuksenKate(rakennus),
    laskentaSyote: rakennus.laskentaSyote ?? Prisma.DbNull,
  };
  await prisma.$transaction(async (tx) => {
    if (olemassa) {
      await tx.laskentapohjaRivi.deleteMany({ where: { pohjaId: olemassa.id } });
      await tx.laskentapohja.update({ where: { id: olemassa.id }, data: { ...tiedot, rivit: { create: rivit } } });
    } else {
      await tx.laskentapohja.create({ data: { name: d.name, ...tiedot, rivit: { create: rivit } } });
    }
  });
  paivita();
  const [polku, haku = ""] = (k.paluu ?? POHJAT).split("#")[0].split("?");
  const p = new URLSearchParams(haku);
  p.delete("virhe");
  p.set("ilmoitus", `${olemassa ? "Pohja päivitetty" : "Pohja tallennettu"}: ${d.name} (${rivit.length} riviä)`);
  palaa(`${polku}?${p.toString()}`);
}

const kayttoInput = z.object({
  buildingId: z.string().min(1),
  pohjaId: z.string().min(1, "Valitse pohja"),
  tapa: z.enum(["lisaa", "korvaa"]).default("lisaa"),
});

/**
 * Ottaa pohjan rakennuksen laskennan pohjaksi. "korvaa" poistaa ensin
 * rakennuksen käsin syötetyt ja laskurin rivit (BIM-rivit säilyvät).
 * Pohjan laskurin rivit, joiden hintaa ei ole muutettu, palautuvat laskurin
 * riveiksi, jotta laskennan voi tallentaa uudelleen ilman tuplarivejä.
 */
export async function kaytaPohjaa(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(kayttoInput, k, k.paluu);
  const pohja = await prisma.laskentapohja.findUniqueOrThrow({
    where: { id: d.pohjaId },
    include: { rivit: { include: { structureType: { select: { laskuriAvain: true } } }, orderBy: { seq: "asc" } } },
  });
  const rakennus = await prisma.$transaction(async (tx) => {
    if (d.tapa === "korvaa") await tx.buildingPart.deleteMany({ where: { buildingId: d.buildingId, source: { in: ["KASIN", "LASKURI"] } } });
    const max = await tx.buildingPart.aggregate({ where: { buildingId: d.buildingId, source: "KASIN" }, _max: { seq: true } });
    const alku = max._max.seq ?? 0;
    await tx.buildingPart.createMany({
      data: pohja.rivit.map((r, i) => {
        const laskurista = !!r.structureType?.laskuriAvain && r.unitPriceCents === null && !r.litteraId && !r.costType && !r.description;
        return {
          buildingId: d.buildingId,
          structureTypeId: r.structureTypeId,
          productId: r.productId,
          description: r.description,
          unit: r.unit,
          unitPriceCents: r.unitPriceCents,
          litteraId: r.litteraId,
          costType: r.costType,
          quantity: r.quantity,
          location: r.location,
          notes: r.notes,
          source: laskurista ? ("LASKURI" as const) : ("KASIN" as const),
          seq: laskurista ? 1000 + i : alku + i + 1,
        };
      }),
    });
    return tx.building.update({
      where: { id: d.buildingId },
      data: {
        katePct: pohja.katePct ?? undefined,
        ...(pohja.laskentaSyote !== null ? { laskentaSyote: pohja.laskentaSyote } : {}),
      },
    });
  });
  paivita(rakennus.id, rakennus.projectId, rakennus.offerId);
  const [polku, haku = ""] = (k.paluu ?? POHJAT).split("#")[0].split("?");
  const p = new URLSearchParams(haku);
  p.delete("virhe");
  p.set("ilmoitus", `Pohja "${pohja.name}" otettu käyttöön (${pohja.rivit.length} riviä${d.tapa === "korvaa" ? ", aiemmat rivit korvattiin" : ""})`);
  palaa(`${polku}?${p.toString()}`);
}

export async function nimeaPohja(formData: FormData) {
  const k = kentat(formData);
  const d = jasenna(z.object({ id: z.string().min(1), name: z.string().trim().min(1, "Anna nimi"), description: valinnainenTeksti }), k, k.paluu);
  const sama = await prisma.laskentapohja.findUnique({ where: { name: d.name } });
  if (sama && sama.id !== d.id) palaa(k.paluu, `Nimi "${d.name}" on jo käytössä`);
  await prisma.laskentapohja.update({ where: { id: d.id }, data: { name: d.name, description: d.description } });
  paivita();
  palaa(k.paluu);
}

export async function poistaPohja(formData: FormData) {
  const k = kentat(formData);
  await prisma.laskentapohja.delete({ where: { id: k.id! } });
  paivita();
  palaa(k.paluu);
}
