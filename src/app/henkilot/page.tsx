import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { tallennaHenkilo, vaihdaAktiivisuus } from "@/lib/actions/henkilot";
import { Kentta, Virhe } from "@/components/projektinhallinta";

export const dynamic = "force-dynamic";

const ROOLIT = [
  { arvo: "ADMIN", nimi: "Ylläpitäjä" },
  { arvo: "MYYNTI", nimi: "Myynti" },
  { arvo: "SUUNNITTELU", nimi: "Suunnittelu" },
  { arvo: "HANKINTA", nimi: "Hankinta" },
  { arvo: "TUOTANTO", nimi: "Tuotanto" },
  { arvo: "LAATU", nimi: "Laatu" },
] as const;

// Henkilörekisteri: henkilöt, joille jaetaan projektien tehtäviä ja
// hankintoja. Kaavion ulkopuolinen Järjestelmä-sivu.
export default async function HenkilotPage({ searchParams }: { searchParams: { virhe?: string; muokkaa?: string } }) {
  const [henkilot, hankinnat, tehtavat] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { memberships: { include: { project: true } } } }),
    prisma.procurementItem.groupBy({
      by: ["assigneeId"],
      where: { assigneeId: { not: null }, phase: { notIn: ["VALMIS", "EI_TARVITA"] } },
      _count: true,
    }),
    prisma.projectTodo.groupBy({ by: ["assigneeId"], where: { assigneeId: { not: null }, status: { not: "VALMIS" } }, _count: true }),
  ]);
  const avoimia = new Map<string, number>();
  for (const r of [...hankinnat, ...tehtavat]) avoimia.set(r.assigneeId!, (avoimia.get(r.assigneeId!) ?? 0) + r._count);
  const muokattava = henkilot.find((h) => h.id === searchParams.muokkaa);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Järjestelmä &raquo; Henkilöt</p>
        <h1 className="text-2xl">Henkilöt</h1>
        <p className="text-ink-2 text-sm mt-1">
          Henkilöille jaetaan projektien hankintoja ja tehtäviä, ja heistä kootaan projektiorganisaatio. Sähköposti on
          vapaaehtoinen, kunnes kirjautuminen otetaan käyttöön.
        </p>
      </div>

      <Virhe viesti={searchParams.virhe} />

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Nimi</th>
              <th className="p-3">Rooli</th>
              <th className="p-3">Yhteystiedot</th>
              <th className="p-3">Projektit</th>
              <th className="p-3 text-right">Avoimia tehtäviä</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {henkilot.map((h) => (
              <tr key={h.id} className={`border-b border-line last:border-0 ${h.active ? "" : "text-ink-muted"}`}>
                <td className="p-3">
                  <Link href={`/henkilot/${h.id}`} className="font-medium hover:underline">
                    {h.name}
                  </Link>
                  {!h.active && <span className="badge muted ml-2">ei aktiivinen</span>}
                </td>
                <td className="p-3 text-ink-2">{ROOLIT.find((r) => r.arvo === h.role)?.nimi}</td>
                <td className="p-3 text-ink-2 text-xs">
                  {h.email && <div>{h.email}</div>}
                  {h.phone && <div>{h.phone}</div>}
                </td>
                <td className="p-3 text-xs text-ink-2">
                  {Array.from(new Map(h.memberships.map((m) => [m.project.id, m.project])).values())
                    .map((p) => p.name)
                    .join(", ") || "–"}
                </td>
                <td className="p-3 text-right font-mono">
                  <Link href={`/henkilot/${h.id}`} className="underline">
                    {avoimia.get(h.id) ?? 0}
                  </Link>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Link href={`/henkilot?muokkaa=${h.id}#lomake`} className="underline text-xs mr-3">
                    Muokkaa
                  </Link>
                  <form action={vaihdaAktiivisuus} className="inline">
                    <input type="hidden" name="id" value={h.id} />
                    <button className="underline text-xs">{h.active ? "Poista käytöstä" : "Ota käyttöön"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {henkilot.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  Ei vielä henkilöitä. Lisää ensimmäinen alta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div id="lomake" className="card p-5">
        <h2 className="font-semibold mb-3">{muokattava ? `Muokkaa: ${muokattava.name}` : "Uusi henkilö"}</h2>
        <form action={tallennaHenkilo} className="grid grid-cols-4 gap-3" key={muokattava?.id ?? "uusi"}>
          <input type="hidden" name="paluu" value="/henkilot" />
          {muokattava && <input type="hidden" name="id" value={muokattava.id} />}
          <Kentta otsikko="Nimi *">
            <input name="name" required defaultValue={muokattava?.name} className="field" />
          </Kentta>
          <Kentta otsikko="Sähköposti">
            <input name="email" type="email" defaultValue={muokattava?.email ?? ""} className="field" />
          </Kentta>
          <Kentta otsikko="Puhelin">
            <input name="phone" defaultValue={muokattava?.phone ?? ""} className="field" />
          </Kentta>
          <Kentta otsikko="Rooli">
            <select name="role" defaultValue={muokattava?.role ?? "HANKINTA"} className="field">
              {ROOLIT.map((r) => (
                <option key={r.arvo} value={r.arvo}>
                  {r.nimi}
                </option>
              ))}
            </select>
          </Kentta>
          <div className="col-span-4 flex gap-3">
            <button className="btn btn-primary">{muokattava ? "Tallenna" : "Lisää henkilö"}</button>
            {muokattava && (
              <Link href="/henkilot" className="btn btn-ghost">
                Peruuta
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
