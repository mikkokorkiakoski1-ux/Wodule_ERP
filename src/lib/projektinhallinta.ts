/**
 * Projektinhallinnan tiedonhaku: projektiaikataulu, hankintasuunnitelma ja
 * tehtäväluettelo laskettuine päivämäärineen.
 *
 * Laskenta on puhtaissa moduuleissa (projektiaikataulu.ts, hankinta.ts);
 * tämä tiedosto vain hakee rivit ja yhdistää ne.
 */
import type { ProcurementItem, ProjectTodo, ScheduleTask, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { laskeProjektiaikataulu, type Laskettu } from "@/lib/projektiaikataulu";
import {
  VAIHEET,
  kiireellisyys,
  laskeTakarajat,
  onPaattynyt,
  vaiheenTakaraja,
  type Kiireellisyys,
  type Takarajat,
  type Vaihe,
} from "@/lib/hankinta";

export const TEHTAVAN_TILAT = [
  { arvo: "AVOIN", nimi: "Avoin" },
  { arvo: "KESKEN", nimi: "Kesken" },
  { arvo: "VALMIS", nimi: "Valmis" },
] as const;

export const TEHTAVAN_ALUEET = [
  { arvo: "LUVITUS", nimi: "Luvitus" },
  { arvo: "SUUNNITTELU", nimi: "Suunnittelu" },
  { arvo: "HANKINTA", nimi: "Hankinta" },
  { arvo: "MUU", nimi: "Muu" },
] as const;

export const ORGANISAATION_ROOLIT = ["Hankekehitys/luvitus", "Suunnittelu/hankinta", "Tuotanto", "Työmaa", "Laatu"];

// ------------------------------------------------------------
// Projektiaikataulu
// ------------------------------------------------------------

export type AikataulutehtavaLaskettu = ScheduleTask & Laskettu;

export async function haeAikataulu(projectId: string, tanaan = new Date()): Promise<AikataulutehtavaLaskettu[]> {
  const tehtavat = await prisma.scheduleTask.findMany({ where: { projectId }, orderBy: [{ seq: "asc" }, { code: "asc" }] });
  const lasketut = laskeProjektiaikataulu(tehtavat, tanaan);
  return tehtavat.map((t) => ({ ...t, ...lasketut.get(t.code)! }));
}

// ------------------------------------------------------------
// Hankintasuunnitelma
// ------------------------------------------------------------

export interface HankintariviLaskettu extends ProcurementItem {
  assignee: User | null;
  tehtava: AikataulutehtavaLaskettu | null;
  /** Aikataulutehtävän aloitus tai käsin annettu päivä. */
  toimitus: Date | null;
  takarajat: Takarajat | null;
  takaraja: Date | null;
  kiire: Kiireellisyys;
  /** Esim. tehtävätunnusta ei löydy aikataulusta. */
  varoitus: string | null;
}

export function laskeHankintarivi(
  rivi: ProcurementItem & { assignee: User | null },
  tehtavat: Map<string, AikataulutehtavaLaskettu>,
  tanaan = new Date()
): HankintariviLaskettu {
  const tehtava = rivi.scheduleTaskCode ? tehtavat.get(rivi.scheduleTaskCode) ?? null : null;
  let varoitus: string | null = null;
  if (rivi.scheduleTaskCode && !tehtava) varoitus = `Aikataulussa ei ole tehtävää ${rivi.scheduleTaskCode}`;
  else if (tehtava && !tehtava.aloitus) varoitus = `Tehtävän ${tehtava.code} aloitus puuttuu`;

  const toimitus = tehtava?.aloitus ?? rivi.neededBy ?? null;
  const takarajat = toimitus ? laskeTakarajat(toimitus, rivi) : null;
  const vaihe = rivi.phase as Vaihe;
  const takaraja = onPaattynyt(vaihe) ? null : vaiheenTakaraja(vaihe, takarajat, rivi.agreedDelivery);
  if (!varoitus && !toimitus && !onPaattynyt(vaihe)) varoitus = "Ei toimituspäivää: liitä aikataulutehtävä tai anna päivä";

  return { ...rivi, tehtava, toimitus, takarajat, takaraja, kiire: kiireellisyys(takaraja, tanaan), varoitus };
}

export async function haeHankinnat(projectId: string, tanaan = new Date()) {
  const [aikataulu, rivit] = await Promise.all([
    haeAikataulu(projectId, tanaan),
    prisma.procurementItem.findMany({
      where: { procurementPlan: { projectId } },
      include: { assignee: true },
    }),
  ]);
  const tehtavat = new Map(aikataulu.map((t) => [t.code, t]));
  const lasketut = rivit.map((r) => laskeHankintarivi(r, tehtavat, tanaan));
  lasketut.sort(
    (a, b) =>
      (Number(a.littera) || Infinity) - (Number(b.littera) || Infinity) ||
      (a.littera ?? "").localeCompare(b.littera ?? "") ||
      a.description.localeCompare(b.description, "fi")
  );
  return { aikataulu, rivit: lasketut };
}

// ------------------------------------------------------------
// Tehtäväluettelo (hankintarivit + omat tehtävät)
// ------------------------------------------------------------

export interface TehtavalistanRivi {
  tyyppi: "hankinta" | "tehtava";
  id: string;
  projectId: string;
  projekti: string;
  otsikko: string;
  /** Mitä seuraavaksi tehdään, esim. "Lähetä tarjouspyyntö". */
  toimenpide: string;
  /** Vaihe tai tila käyttäjälle näkyvänä. */
  tila: string;
  paattynyt: boolean;
  takaraja: Date | null;
  kiire: Kiireellisyys;
  assignee: User | null;
  alue: string;
  /** Hankintariville vaihe, jotta sen voi siirtää eteenpäin. */
  vaihe?: Vaihe;
}

function todoRiviksi(
  t: ProjectTodo & { assignee: User | null },
  projekti: string,
  tehtavat: Map<string, AikataulutehtavaLaskettu>,
  tanaan: Date
): TehtavalistanRivi {
  const takaraja = t.dueDate ?? (t.scheduleTaskCode ? tehtavat.get(t.scheduleTaskCode)?.aloitus ?? null : null);
  const paattynyt = t.status === "VALMIS";
  return {
    tyyppi: "tehtava",
    id: t.id,
    projectId: t.projectId,
    projekti,
    otsikko: t.title,
    toimenpide: t.notes ?? "",
    tila: TEHTAVAN_TILAT.find((s) => s.arvo === t.status)!.nimi,
    paattynyt,
    takaraja,
    kiire: paattynyt ? "ei" : kiireellisyys(takaraja, tanaan),
    assignee: t.assignee,
    alue: TEHTAVAN_ALUEET.find((a) => a.arvo === t.area)!.nimi,
  };
}

function hankintaRiviksi(h: HankintariviLaskettu, projekti: string): TehtavalistanRivi {
  const vaihe = h.phase as Vaihe;
  const v = VAIHEET.find((x) => x.arvo === vaihe)!;
  return {
    tyyppi: "hankinta",
    id: h.id,
    projectId: "",
    projekti,
    otsikko: [h.littera, h.description].filter(Boolean).join(" "),
    toimenpide: v.tehtava,
    tila: v.nimi,
    paattynyt: onPaattynyt(vaihe),
    takaraja: h.takaraja,
    kiire: h.kiire,
    assignee: h.assignee,
    alue: h.kind === "TYOSUORITE" ? "Hankinta: työsuorite" : "Hankinta: materiaali",
    vaihe,
  };
}

/** Tehtäväluettelo yhdelle projektille tai yhdelle henkilölle kaikista projekteista. */
export async function haeTehtavalista(rajaus: { projectId?: string; userId?: string }, tanaan = new Date()) {
  const projektit = await prisma.project.findMany({
    where: rajaus.projectId
      ? { id: rajaus.projectId }
      : {
          OR: [
            { todos: { some: { assigneeId: rajaus.userId } } },
            { procurementPlan: { items: { some: { assigneeId: rajaus.userId } } } },
          ],
        },
    select: { id: true, name: true },
  });

  const rivit: TehtavalistanRivi[] = [];
  for (const p of projektit) {
    const { aikataulu, rivit: hankinnat } = await haeHankinnat(p.id, tanaan);
    const tehtavat = new Map(aikataulu.map((t) => [t.code, t]));
    const todot = await prisma.projectTodo.findMany({
      where: { projectId: p.id, ...(rajaus.userId ? { assigneeId: rajaus.userId } : {}) },
      include: { assignee: true },
    });
    for (const h of hankinnat) {
      if (rajaus.userId && h.assigneeId !== rajaus.userId) continue;
      rivit.push({ ...hankintaRiviksi(h, p.name), projectId: p.id });
    }
    for (const t of todot) rivit.push(todoRiviksi(t, p.name, tehtavat, tanaan));
  }

  // Avoimet ensin takarajan mukaan (myöhässä olevat ylimpänä), sitten päättyneet.
  rivit.sort(
    (a, b) =>
      Number(a.paattynyt) - Number(b.paattynyt) ||
      (a.takaraja?.getTime() ?? Infinity) - (b.takaraja?.getTime() ?? Infinity) ||
      a.otsikko.localeCompare(b.otsikko, "fi")
  );
  return rivit;
}

/** Yhteenveto tehtäväluettelosta henkilöittäin. */
export function henkiloittain(rivit: TehtavalistanRivi[]) {
  const ryhmat = new Map<string, { henkilo: User | null; rivit: TehtavalistanRivi[] }>();
  for (const r of rivit) {
    const avain = r.assignee?.id ?? "";
    if (!ryhmat.has(avain)) ryhmat.set(avain, { henkilo: r.assignee, rivit: [] });
    ryhmat.get(avain)!.rivit.push(r);
  }
  return Array.from(ryhmat.values()).sort((a, b) =>
    !a.henkilo ? 1 : !b.henkilo ? -1 : a.henkilo.name.localeCompare(b.henkilo.name, "fi")
  );
}
