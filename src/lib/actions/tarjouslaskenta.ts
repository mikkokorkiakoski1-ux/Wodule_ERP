"use server";

/**
 * Tarjouslaskurin Server Actions.
 *
 * Laskenta tallennetaan rakennukseen: laskurin rivit, joiden määrä ei ole
 * nolla, kirjoitetaan rakennuksen määräluetteloon (source = LASKURI)
 * kirjaston rakenneosina. Aiemmat laskurin rivit korvataan; käsin syötetyt
 * ja BIM-rivit säilyvät. Syöte tallennetaan rakennukselle, jotta laskentaa
 * voi jatkaa myöhemmin.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { kentat, palaa } from "@/lib/lomake";
import { laske, taydennaSyote } from "@/lib/tarjouslaskenta";
import { haeLaskurinHinnat, varmistaLaskurinKirjasto } from "@/lib/tarjouslaskuri-kirjasto";
import { laskeRakennukset, rakennuksenKate } from "@/lib/rakennukset";
import { myyntihinta } from "@/lib/rakenteet";

function paivitaKaikki() {
  revalidatePath("/tuotehallinta", "layout");
  revalidatePath("/asiakkuuksien-hallinta", "layout");
  revalidatePath("/projektit", "layout");
}

/** Tuo laskurin litterat ja laskentarivit rakenneosakirjastoon (vain puuttuvat). */
export async function tuoLaskurinRakenneosat(formData: FormData) {
  const k = kentat(formData);
  const t = await prisma.$transaction((tx) => varmistaLaskurinKirjasto(tx), { timeout: 30000 });
  paivitaKaikki();
  const viesti = `Tuotu ${t.rakenneosatLuotu} laskentariviä ja ${t.litteratLuotu} litteraa (${t.rakenneosatYhteensa - t.rakenneosatLuotu} oli jo kirjastossa)`;
  const [polku] = (k.paluu ?? "/tuotehallinta/rakenneosat").split("?");
  redirect(`${polku}?ilmoitus=${encodeURIComponent(viesti)}`);
}

/** Tallentaa laskennan rakennukselle ja korvaa sen laskurin määrärivit. */
export async function tallennaLaskenta(formData: FormData) {
  const k = kentat(formData);
  const buildingId = k.buildingId;
  if (!buildingId) palaa(k.paluu, "Valitse rakennus, johon laskenta tallennetaan");
  let syote;
  try {
    syote = taydennaSyote(JSON.parse(k.syote ?? "{}"));
  } catch {
    palaa(k.paluu, "Laskennan syöte on virheellinen");
  }

  const rakennus = await prisma.$transaction(async (tx) => {
    await varmistaLaskurinKirjasto(tx);
    const laskelma = laske(syote, await haeLaskurinHinnat(tx));
    const osat = new Map(
      (await tx.structureType.findMany({ where: { laskuriAvain: { not: null } }, select: { id: true, laskuriAvain: true } })).map((t) => [
        t.laskuriAvain!,
        t.id,
      ])
    );
    await tx.buildingPart.deleteMany({ where: { buildingId, source: "LASKURI" } });
    const rivit = laskelma.rivit.filter((r) => r.maara !== 0);
    await tx.buildingPart.createMany({
      data: rivit.map((r, i) => ({
        buildingId: buildingId!,
        structureTypeId: osat.get(r.avain)!,
        quantity: r.maara,
        source: "LASKURI" as const,
        seq: 1000 + i, // laskurin rivit omien rivien perään, laskurin järjestyksessä
      })),
    });
    return tx.building.update({
      where: { id: buildingId },
      data: { laskentaSyote: syote as object, katePct: syote.kate, grossAreaM2: laskelma.geometria.bruttoala },
    });
  }, { timeout: 30000 });

  paivitaKaikki();
  const paluu = k.paluu ?? (rakennus.projectId ? `/projektit/${rakennus.projectId}/rakennukset/${rakennus.id}` : `/asiakkuuksien-hallinta/tarjoukset/${rakennus.offerId}`);
  const [polku, haku = ""] = paluu.split("?");
  const p = new URLSearchParams(haku);
  p.delete("virhe");
  p.set("ilmoitus", `Laskenta tallennettu rakennukselle ${rakennus.code}`);
  redirect(`${polku}?${p.toString()}`);
}

/**
 * Asettaa tarjoushinnaksi rakennusten laskennallisen myyntihinnan:
 * omakustannus / (1 - kate), jossa kate on rakennuksen kate (oletus 25 %).
 */
export async function asetaTarjoushintaLaskelmasta(formData: FormData) {
  const k = kentat(formData);
  const offerId = k.offerId!;
  const { rakennukset } = await laskeRakennukset({ offerId });
  if (rakennukset.length === 0) palaa(k.paluu, "Tarjouksella ei ole rakennuksia");
  const sentit = rakennukset.reduce((s, r) => s + myyntihinta(r.kustannus.yhteensaSentit, rakennuksenKate(r.rakennus)), 0);
  await prisma.offer.update({ where: { id: offerId }, data: { amountCents: Math.round(sentit) } });
  revalidatePath("/asiakkuuksien-hallinta/tarjoukset", "layout");
  palaa(k.paluu);
}
