import { z } from "zod";

// Vastaa Artifact-työkalun lomakekenttiä (fieldsFromForm()) - katso
// src/lib/production-schedule.ts kaavojen dokumentaatiosta.
export const productionScheduleItemInput = z.object({
  tilaaja: z.string().trim().min(1, "Tilaaja on pakollinen"),
  projekti: z.string().trim().min(1, "Projekti on pakollinen"),
  rakennuksia: z.coerce.number().int().min(0).default(1),
  luvattu: z.coerce.date().nullable().optional(),
  tuntimenekki: z.coerce.number().min(0),
  tyontekijoita: z.coerce.number().int().min(1),
  tyopisteita: z.coerce.number().int().min(1),
  kesto: z.coerce.number().int().min(1, "Kesto pitää olla vähintään 1 työpäivä"),
  valmiusaste: z.coerce.number().int().min(0).max(100).nullable().optional(),
  siirto: z.coerce.number().int().default(0),
  aloitus: z.coerce.date().nullable().optional(),
  projectId: z.string().cuid().nullable().optional(),
  customerId: z.string().cuid().nullable().optional(),
});

export type ProductionScheduleItemInput = z.infer<typeof productionScheduleItemInput>;

export const reorderInput = z.object({
  idA: z.string().cuid(),
  idB: z.string().cuid(),
});

// Tiedonsiirto (src/app/api/tiedonsiirto/**). Kohteen avain tarkistetaan
// reitissä KOHTEET-listaa vasten.
export const vientiInput = z.object({
  kohde: z.string().min(1),
  muoto: z.enum(["csv", "xlsx", "json"]),
});

export const pohjaInput = z.object({
  kohde: z.string().min(1),
  muoto: z.enum(["csv", "xlsx"]),
});

export const tuontiInput = z.object({
  kohde: z.string().min(1),
  tapa: z.enum(["lisaa-ja-paivita", "vain-uudet", "vain-paivita"]).default("lisaa-ja-paivita"),
  virheet: z.enum(["peru", "ohita"]).default("peru"),
  esikatselu: z.enum(["true", "false"]).transform((v) => v === "true"),
  // JSON-olio: sarakkeen avain -> oletusarvo (esim. {"projekti": "Firstcamp iglut"})
  oletukset: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      try {
        const o = JSON.parse(v);
        if (typeof o === "object" && o && !Array.isArray(o)) return o as Record<string, string>;
      } catch {
        // käsitellään alla
      }
      ctx.addIssue({ code: "custom", message: "oletukset ei ole kelvollinen JSON-olio" });
      return z.NEVER;
    }),
  taulukko: z.string().optional(),
});
