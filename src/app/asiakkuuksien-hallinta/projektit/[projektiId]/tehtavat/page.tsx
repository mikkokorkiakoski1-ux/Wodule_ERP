import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { jaaVastuuttomat, poistaTehtava, tallennaTehtava } from "@/lib/actions/projektinhallinta";
import { TEHTAVAN_ALUEET, TEHTAVAN_TILAT, haeAikataulu, haeTehtavalista, henkiloittain } from "@/lib/projektinhallinta";
import { syotePvm } from "@/lib/muotoilu";
import { HenkiloValinta, Kentta, Virhe, ProjektinExceltuonti } from "@/components/projektinhallinta";
import { Tehtavalista } from "@/components/Tehtavalista";

export const dynamic = "force-dynamic";

// Suunnittelu- ja hankintavaiheen tehtäväluettelo: hankintarivit nykyisine
// vaiheineen ja takarajoineen sekä projektin omat tehtävät, henkilöittäin.
export default async function TehtavaluetteloPage({
  params,
  searchParams,
}: {
  params: { projektiId: string };
  searchParams: { virhe?: string; muokkaa?: string; uusi?: string; henkilo?: string; valmiit?: string; nakyma?: string };
}) {
  const projectId = params.projektiId;
  const polku = `/asiakkuuksien-hallinta/projektit/${projectId}/tehtavat`;
  const [kaikki, henkilot, aikataulu, muokattava] = await Promise.all([
    haeTehtavalista({ projectId }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    haeAikataulu(projectId),
    searchParams.muokkaa ? prisma.projectTodo.findUnique({ where: { id: searchParams.muokkaa } }) : null,
  ]);

  const rivit = kaikki.filter(
    (r) =>
      (searchParams.valmiit || !r.paattynyt) &&
      (!searchParams.henkilo || (searchParams.henkilo === "ei" ? !r.assignee : r.assignee?.id === searchParams.henkilo))
  );
  const ryhmat = henkiloittain(rivit);
  const listana = searchParams.nakyma === "lista";
  const vastuuttomia = kaikki.filter((r) => !r.paattynyt && !r.assignee).length;
  const lomakeAuki = !!muokattava || !!searchParams.uusi || !!searchParams.virhe;
  const linkki = (muutos: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ henkilo: searchParams.henkilo, valmiit: searchParams.valmiit, nakyma: searchParams.nakyma, ...muutos })) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `${polku}?${s}` : polku;
  };

  const paluu = linkki({});

  return (
    <>
      <Virhe viesti={searchParams.virhe} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Tehtäväluettelo</h2>
          <p className="text-ink-2 text-sm mt-1 max-w-3xl">
            Suunnittelu- ja hankintavaiheen tehtävät. Hankintojen takaraja on nykyisen vaiheen takaraja hankintasuunnitelmasta.
            Siirrä hankinta seuraavaan vaiheeseen, kun vaihe on tehty. Omien tehtävien takaraja on annettu päivä tai liitetyn
            aikataulutehtävän aloitus.
          </p>
        </div>
        <Link href={`${polku}?uusi=1#lomake`} className="btn btn-primary shrink-0">
          + Uusi tehtävä
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-muted mr-1">Henkilö:</span>
        <Link href={linkki({ henkilo: undefined })} className={`rounded-full border px-3 py-1 ${!searchParams.henkilo ? "border-ink font-semibold" : "border-line text-ink-2"}`}>
          Kaikki
        </Link>
        {henkilot
          .filter((h) => h.active || kaikki.some((r) => r.assignee?.id === h.id))
          .map((h) => {
            const n = kaikki.filter((r) => !r.paattynyt && r.assignee?.id === h.id).length;
            return (
              <Link
                key={h.id}
                href={linkki({ henkilo: h.id })}
                className={`rounded-full border px-3 py-1 ${searchParams.henkilo === h.id ? "border-ink font-semibold" : "border-line text-ink-2"}`}
              >
                {h.name} <span className="text-ink-muted">{n}</span>
              </Link>
            );
          })}
        <Link
          href={linkki({ henkilo: "ei" })}
          className={`rounded-full border px-3 py-1 ${searchParams.henkilo === "ei" ? "border-ink font-semibold" : "border-line text-ink-2"}`}
        >
          Ei vastuuhenkilöä <span className="text-ink-muted">{vastuuttomia}</span>
        </Link>
        <span className="ml-auto flex gap-3">
          <Link href={linkki({ nakyma: listana ? undefined : "lista" })} className="underline">
            {listana ? "Ryhmittele henkilöittäin" : "Näytä yhtenä listana"}
          </Link>
          <Link href={linkki({ valmiit: searchParams.valmiit ? undefined : "1" })} className="underline">
            {searchParams.valmiit ? "Piilota valmiit" : "Näytä valmiit"}
          </Link>
        </span>
      </div>

      {vastuuttomia > 0 && henkilot.some((h) => h.active) && (
        <form action={jaaVastuuttomat} className="card p-3 flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="paluu" value={paluu} />
          <span>
            <strong>{vastuuttomia}</strong> avoimella tehtävällä ei ole vastuuhenkilöä.
          </span>
          <HenkiloValinta henkilot={henkilot} tyhja="Valitse henkilö" className="field !py-1" />
          <button className="btn btn-secondary btn-sm">Anna kaikki hänelle</button>
        </form>
      )}

      {listana ? (
        <div className="card">
          <Tehtavalista rivit={rivit} henkilot={henkilot} paluu={paluu} />
        </div>
      ) : (
        ryhmat.map((g) => {
          const myohassa = g.rivit.filter((r) => r.kiire === "myohassa" && !r.paattynyt).length;
          return (
            <section key={g.henkilo?.id ?? "ei"} className="card">
              <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
                <h3 className="text-base">
                  {g.henkilo ? (
                    <Link href={`/henkilot/${g.henkilo.id}`} className="hover:underline">
                      {g.henkilo.name}
                    </Link>
                  ) : (
                    "Ei vastuuhenkilöä"
                  )}
                </h3>
                <span className="text-xs text-ink-2">
                  {g.rivit.filter((r) => !r.paattynyt).length} avointa
                  {myohassa > 0 && <span className="text-critical font-semibold"> · {myohassa} myöhässä</span>}
                </span>
              </header>
              <Tehtavalista rivit={g.rivit} henkilot={henkilot} paluu={paluu} naytaVastuu={!g.henkilo} />
            </section>
          );
        })
      )}
      {rivit.length === 0 && (
        <div className="card p-6 text-center text-sm text-ink-muted">
          Ei tehtäviä. Tehtävät syntyvät hankintasuunnitelman riveistä, ja omia tehtäviä voi lisätä alta.
        </div>
      )}

      <ProjektinExceltuonti projectId={projectId} kohde="projektitehtavat" />

      <details id="lomake" open={lomakeAuki} className="card p-5">
        <summary className="cursor-pointer font-heading font-semibold">
          {muokattava ? `Muokkaa tehtävää: ${muokattava.title}` : "Uusi oma tehtävä"}
        </summary>
        <form action={tallennaTehtava} className="grid grid-cols-4 gap-3 mt-4" key={muokattava?.id ?? "uusi"}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="paluu" value={polku} />
          {muokattava && <input type="hidden" name="id" value={muokattava.id} />}
          <Kentta otsikko="Tehtävä *" leveys={2}>
            <input name="title" required defaultValue={muokattava?.title} placeholder="esim. Rakennuslupahakemus" className="field" />
          </Kentta>
          <Kentta otsikko="Alue">
            <select name="area" defaultValue={muokattava?.area ?? "SUUNNITTELU"} className="field">
              {TEHTAVAN_ALUEET.map((a) => (
                <option key={a.arvo} value={a.arvo}>
                  {a.nimi}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Tila">
            <select name="status" defaultValue={muokattava?.status ?? "AVOIN"} className="field">
              {TEHTAVAN_TILAT.map((s) => (
                <option key={s.arvo} value={s.arvo}>
                  {s.nimi}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Vastuuhenkilö">
            <HenkiloValinta henkilot={henkilot} valittu={muokattava?.assigneeId} />
          </Kentta>
          <Kentta otsikko="Takaraja">
            <input name="dueDate" type="date" defaultValue={syotePvm(muokattava?.dueDate)} className="field" />
          </Kentta>
          <Kentta otsikko="tai aikataulutehtävän aloitus" leveys={2}>
            <select name="scheduleTaskCode" defaultValue={muokattava?.scheduleTaskCode ?? ""} className="field">
              <option value="">Ei liitetty</option>
              {aikataulu.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.code} {t.title}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Lisätiedot" leveys={4}>
            <input name="notes" defaultValue={muokattava?.notes ?? ""} className="field" />
          </Kentta>
          <div className="col-span-4 flex items-center gap-3">
            <button className="btn btn-primary">{muokattava ? "Tallenna muutokset" : "Lisää tehtävä"}</button>
            {muokattava && (
              <Link href={polku} className="btn btn-ghost">
                Peruuta
              </Link>
            )}
          </div>
        </form>
        {muokattava && (
          <form action={poistaTehtava} className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="id" value={muokattava.id} />
            <input type="hidden" name="paluu" value={polku} />
            <button className="text-xs text-critical underline">Poista tehtävä</button>
          </form>
        )}
      </details>
    </>
  );
}
