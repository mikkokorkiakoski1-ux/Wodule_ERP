/**
 * Server Actionien yhteiset lomakeapurit.
 *
 * Lomakkeet lähettävät kentän "paluu" (sivun polku). Onnistuneen
 * tallennuksen jälkeen palataan sinne, virheessä samaan osoitteeseen
 * ?virhe=-parametrin kanssa, jonka sivu näyttää <Virhe>-komponentilla.
 */
import { redirect } from "next/navigation";
import { z } from "zod";

/** Lomakkeen kentät olioksi; tyhjät merkkijonot -> undefined. */
export function kentat(formData: FormData): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string") o[k] = v.trim() === "" ? undefined : v.trim();
  });
  return o;
}

export const valinnainenTeksti = z.string().optional().transform((v) => v ?? null);
export const valinnainenPvm = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Päivämäärä muodossa VVVV-KK-PP")
  .optional()
  .transform((v) => (v ? new Date(v) : null));
export const valinnainenKokonaisluku = z.coerce.number().int().optional().transform((v) => v ?? null);
export const paivia = (oletus: number) =>
  z.coerce.number().int().min(0, "Päivien määrä ei voi olla negatiivinen").default(oletus);

/** Desimaaliluku, joka hyväksyy pilkun: "12,5" -> 12.5. */
export const luku = (viesti: string) =>
  z
    .string({ required_error: viesti })
    .transform((v, ctx) => {
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: `"${v}" ei ole luku` });
        return z.NEVER;
      }
      return n;
    });

export const valinnainenLuku = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: `"${v}" ei ole luku` });
      return z.NEVER;
    }
    return n;
  });

export const euroja = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/\s|€/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: `"${v}" ei ole euromäärä` });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

/**
 * Palaa sivulle. Suodattimet (?henkilo= jne.) säilyvät, mutta lomakkeen
 * tila (?muokkaa=, ?uusi=) ja edellinen virhe poistetaan. Virheen kanssa
 * palataan ?virhe=-parametrilla.
 */
export function palaa(paluu: string | undefined, virhe?: string): never {
  // Ankkuri (#elementit) säilyy, mutta virheen kanssa sivun alkuun, jossa virhe näkyy.
  const [ilmanAnkkuria, ankkuri] = (paluu ?? "/").split("#");
  const [polku, haku = ""] = ilmanAnkkuria.split("?");
  const p = new URLSearchParams(haku);
  for (const k of ["virhe", "muokkaa", "uusi", "elementti"]) p.delete(k);
  if (virhe) p.set("virhe", virhe);
  const s = p.toString();
  const loppu = ankkuri && !virhe ? `#${ankkuri}` : "";
  redirect((s ? `${polku}?${s}` : polku) + loppu);
}

export function jasenna<T extends z.ZodTypeAny>(skeema: T, data: unknown, paluu: string | undefined): z.infer<T> {
  const tulos = skeema.safeParse(data);
  if (!tulos.success) {
    const i = tulos.error.issues[0];
    palaa(paluu, i.message);
  }
  return tulos.data;
}
