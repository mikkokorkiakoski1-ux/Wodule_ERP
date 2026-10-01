import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addMilestone, toggleMilestone } from "@/lib/actions/asiakkuudet";
import { poistaAikataulutehtava, tallennaAikataulutehtava } from "@/lib/actions/projektinhallinta";
import { haeAikataulu, type AikataulutehtavaLaskettu } from "@/lib/projektinhallinta";
import { isoViikko } from "@/lib/projektiaikataulu";
import { lyhytPvm, pvm, syotePvm } from "@/lib/muotoilu";
import { Kentta, Virhe, ProjektinExceltuonti } from "@/components/projektinhallinta";

export const dynamic = "force-dynamic";

const PAIVA = 86400000;

/** Gantt-aikajana: viikko-otsikot, palkki aloituksesta ennusteeseen ja tämän päivän viiva. */
function Gantt({ tehtavat, tanaan }: { tehtavat: AikataulutehtavaLaskettu[]; tanaan: Date }) {
  const lasketut = tehtavat.filter((t) => t.aloitus && t.ennuste);
  if (lasketut.length === 0) return null;

  // Aikajana alkaa ensimmäisen tehtävän viikon maanantaista.
  const min = new Date(Math.min(...lasketut.map((t) => t.aloitus!.getTime())));
  const max = new Date(Math.max(...lasketut.map((t) => t.ennuste!.getTime())));
  const alku = new Date(min.getFullYear(), min.getMonth(), min.getDate() - ((min.getDay() + 6) % 7));
  const viikkoja = Math.ceil((max.getTime() - alku.getTime()) / PAIVA / 7) + 1;
  const paivia = viikkoja * 7;
  const kohta = (d: Date) => ((d.getTime() - alku.getTime()) / PAIVA / paivia) * 100;
  const tanaanKohta = kohta(tanaan);

  return (
    <div className="card p-4 overflow-x-auto">
      <div style={{ minWidth: Math.max(720, viikkoja * 34 + 220) }}>
        <div className="flex text-[10px] font-mono text-ink-muted border-b border-line">
          <div className="w-[220px] shrink-0" />
          <div className="relative flex-1 flex">
            {Array.from({ length: viikkoja }, (_, i) => {
              // Kalenteripäivinä, ei millisekunteina: kesäajan vaihde ei siirrä viikkoa.
              const maanantai = new Date(alku.getFullYear(), alku.getMonth(), alku.getDate() + i * 7);
              return (
                <div key={i} className="flex-1 border-l border-line px-1 py-1 text-center" title={`Viikko alkaa ${pvm(maanantai)}`}>
                  {isoViikko(maanantai)}
                </div>
              );
            })}
          </div>
        </div>
        {tehtavat.map((t) => (
          <div key={t.id} className="flex items-center h-8 border-b border-line last:border-0 text-xs">
            <div className="w-[220px] shrink-0 truncate pr-2" title={t.title}>
              <span className="font-mono text-ink-muted mr-2">{t.code}</span>
              {t.title}
            </div>
            <div className="relative flex-1 h-full">
              {t.aloitus && t.ennuste && (
                <div
                  className={`absolute top-1.5 bottom-1.5 rounded-[3px] ${
                    t.valmis ? "gantt-valmis" : t.myohassa ? "gantt-myohassa" : t.kaynnissa ? "gantt-kaynnissa" : "gantt-tulossa"
                  }`}
                  style={{
                    left: `${kohta(t.aloitus)}%`,
                    width: `${Math.max(((t.ennuste.getTime() - t.aloitus.getTime()) / PAIVA + 1) / paivia * 100, 0.6)}%`,
                  }}
                  title={`${t.code} ${t.title}: ${pvm(t.aloitus)} – ${pvm(t.ennuste)}, ${t.durationDays} työpv, valmius ${t.progress} %`}
                />
              )}
              {tanaanKohta >= 0 && tanaanKohta <= 100 && (
                <div className="absolute top-0 bottom-0 w-px bg-accent" style={{ left: `${tanaanKohta}%` }} aria-hidden />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm gantt-tulossa" />Tulossa</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm gantt-kaynnissa" />Käynnissä</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm gantt-myohassa" />Myöhässä</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm gantt-valmis" />Valmis</span>
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-accent" />Tänään</span>
      </div>
    </div>
  );
}

export default async function ProjektiaikatauluPage({
  params,
  searchParams,
}: {
  params: { projektiId: string };
  searchParams: { virhe?: string; muokkaa?: string; uusi?: string };
}) {
  const projectId = params.projektiId;
  const polku = `/asiakkuuksien-hallinta/projektit/${projectId}/aikataulu`;
  const tanaan = new Date();
  const [tehtavat, virstanpylvaat, hankintamaarat] = await Promise.all([
    haeAikataulu(projectId, tanaan),
    prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { seq: "asc" } }),
    prisma.procurementItem.groupBy({
      by: ["scheduleTaskCode"],
      where: { procurementPlan: { projectId } },
      _count: true,
    }),
  ]);
  const hankintoja = new Map(hankintamaarat.map((h) => [h.scheduleTaskCode, h._count]));
  const muokattava = tehtavat.find((t) => t.id === searchParams.muokkaa);
  const seuraavaTunnus = `T${Math.max(0, ...tehtavat.map((t) => Number(t.code.replace(/\D/g, "")) || 0)) + 1}`;
  const ongelmat = tehtavat.filter((t) => t.virhe).length;
  const lomakeAuki = !!muokattava || !!searchParams.virhe || !!searchParams.uusi || tehtavat.length === 0;

  return (
    <>
      <Virhe viesti={searchParams.virhe} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Projektiaikataulu</h2>
          <p className="text-ink-2 text-sm mt-1 max-w-3xl">
            Tehtävä alkaa edeltävän tehtävän ennusteesta + siirto (kalenteripäivää), tai kiinteänä päivänä. Ennuste on aloitus +
            kesto työpäivinä (ma–pe). Hankintasuunnitelman toimituspäivät ja takarajat lasketaan näiden tehtävien aloituksista.
          </p>
        </div>
        <Link href={`${polku}?uusi=1#lomake`} className="btn btn-primary shrink-0">
          + Uusi tehtävä
        </Link>
      </div>

      {ongelmat > 0 && (
        <div className="card px-4 py-3 text-sm text-critical">
          {ongelmat} tehtävän aloitusta ei voitu laskea. Tarkista edeltäjät ja kiinteät aloitukset alta.
        </div>
      )}

      <Gantt tehtavat={tehtavat} tanaan={tanaan} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Tunnus</th>
              <th className="p-3">Tehtävä</th>
              <th className="p-3">Urakoitsija</th>
              <th className="p-3">Edeltäjä</th>
              <th className="p-3 text-right">Siirto</th>
              <th className="p-3 text-right">Kesto</th>
              <th className="p-3">Aloitus</th>
              <th className="p-3">Ennuste</th>
              <th className="p-3 text-right">Valmius</th>
              <th className="p-3 text-right">Hankintoja</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {tehtavat.map((t) => (
              <tr key={t.id} className={`border-b border-line last:border-0 ${t.id === muokattava?.id ? "rivi-korostettu" : ""}`}>
                <td className="p-3 font-mono font-semibold">{t.code}</td>
                <td className="p-3">
                  <div className="font-medium">{t.title}</div>
                  {t.virhe && <div className="text-xs text-critical">{t.virhe}</div>}
                  {t.category && <div className="text-xs text-ink-muted">{t.category}</div>}
                </td>
                <td className="p-3 text-ink-2">{t.contractor ?? "–"}</td>
                <td className="p-3 font-mono text-ink-2">{t.fixedStart ? "kiinteä" : t.predecessorCode ?? "–"}</td>
                <td className="p-3 text-right font-mono">{t.fixedStart ? "–" : t.offsetDays}</td>
                <td className="p-3 text-right font-mono">{t.durationDays} pv</td>
                <td className="p-3 whitespace-nowrap">{pvm(t.aloitus)}</td>
                <td className="p-3 whitespace-nowrap">
                  <span className={t.myohassa ? "text-critical font-semibold" : ""}>{pvm(t.ennuste)}</span>
                </td>
                <td className="p-3 text-right">
                  <span className={`badge ${t.valmis ? "ok" : t.kaynnissa ? "info" : t.myohassa ? "crit" : "muted"}`}>{t.progress} %</span>
                </td>
                <td className="p-3 text-right font-mono">
                  {hankintoja.get(t.code) ? (
                    <Link href={`/asiakkuuksien-hallinta/projektit/${projectId}/hankintasuunnitelma?tehtava=${t.code}`} className="underline">
                      {hankintoja.get(t.code)}
                    </Link>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Link href={`${polku}?muokkaa=${t.id}#lomake`} className="underline text-xs">
                    Muokkaa
                  </Link>
                </td>
              </tr>
            ))}
            {tehtavat.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-ink-muted">
                  Ei vielä aikataulutehtäviä. Lisää ensimmäinen tehtävä kiinteällä aloituksella tai tuo aikataulu Excelistä{" "}
                  <Link href={`/tiedonsiirto?kohde=aikataulutehtavat#tuonti`} className="underline">
                    tiedonsiirrolla
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProjektinExceltuonti projectId={projectId} kohde="aikataulutehtavat" />

      <details id="lomake" open={lomakeAuki} className="card p-5">
        <summary className="cursor-pointer font-heading font-semibold">
          {muokattava ? `Muokkaa tehtävää ${muokattava.code}` : "Uusi aikataulutehtävä"}
        </summary>
        <form action={tallennaAikataulutehtava} className="grid grid-cols-4 gap-3 mt-4" key={muokattava?.id ?? "uusi"}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="paluu" value={polku} />
          {muokattava && <input type="hidden" name="id" value={muokattava.id} />}
          <Kentta otsikko="Tunnus *">
            <input name="code" required defaultValue={muokattava?.code ?? seuraavaTunnus} className="field font-mono" />
          </Kentta>
          <Kentta otsikko="Tehtävä *" leveys={3}>
            <input name="title" required defaultValue={muokattava?.title} className="field" />
          </Kentta>
          <Kentta otsikko="Edeltävä tehtävä">
            <select name="predecessorCode" defaultValue={muokattava?.predecessorCode ?? ""} className="field">
              <option value="">Ei edeltäjää</option>
              {tehtavat
                .filter((t) => t.id !== muokattava?.id)
                .map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.code} {t.title}
                  </option>
                ))}
            </select>
          </Kentta>
          <Kentta otsikko="Siirto (kalenteripv)">
            <input name="offsetDays" type="number" defaultValue={muokattava?.offsetDays ?? 0} className="field" />
          </Kentta>
          <Kentta otsikko="Kiinteä aloitus">
            <input name="fixedStart" type="date" defaultValue={syotePvm(muokattava?.fixedStart)} className="field" />
          </Kentta>
          <Kentta otsikko="Kesto (työpv) *">
            <input name="durationDays" type="number" min={1} required defaultValue={muokattava?.durationDays ?? 5} className="field" />
          </Kentta>
          <Kentta otsikko="Urakoitsija">
            <input name="contractor" defaultValue={muokattava?.contractor ?? ""} className="field" />
          </Kentta>
          <Kentta otsikko="Luokka">
            <input name="category" defaultValue={muokattava?.category ?? "Työsuorite"} className="field" />
          </Kentta>
          <Kentta otsikko="Miesvahvuus">
            <input name="crew" type="number" min={0} defaultValue={muokattava?.crew ?? ""} className="field" />
          </Kentta>
          <Kentta otsikko="Valmiusaste (%)">
            <input name="progress" type="number" min={0} max={100} defaultValue={muokattava?.progress ?? 0} className="field" />
          </Kentta>
          <Kentta otsikko="Pääryhmä">
            <input name="mainGroup" type="number" defaultValue={muokattava?.mainGroup ?? ""} className="field" />
          </Kentta>
          <div className="col-span-4 flex items-center gap-3">
            <button className="btn btn-primary">{muokattava ? "Tallenna muutokset" : "Lisää tehtävä"}</button>
            {muokattava && (
              <Link href={polku} className="btn btn-ghost">
                Peruuta
              </Link>
            )}
            <span className="text-xs text-ink-muted">
              Kiinteä aloitus ohittaa edeltäjän. Tunnuksen vaihto päivittää myös siihen viittaavat tehtävät ja hankinnat.
            </span>
          </div>
        </form>
        {muokattava && (
          <form action={poistaAikataulutehtava} className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="id" value={muokattava.id} />
            <input type="hidden" name="paluu" value={polku} />
            <button className="text-xs text-critical underline">Poista tehtävä {muokattava.code}</button>
            <span className="text-xs text-ink-muted ml-2">
              Siihen viittaavat hankinnat ja tehtävät jäävät ilman toimituspäivää, kunnes ne liitetään toiseen tehtävään.
            </span>
          </form>
        )}
      </details>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl">Virstanpylväät</h2>
        <p className="text-ink-2 text-sm -mt-2">Asiakkaalle näkyvät päivämäärät. Ei vaikuta laskentaan.</p>
        <div className="card divide-y divide-line">
          {virstanpylvaat.map((m) => (
            <form
              key={m.id}
              action={async () => {
                "use server";
                await toggleMilestone(m.id, projectId, !m.done);
              }}
              className="p-4 flex items-center justify-between gap-3"
            >
              <div>
                <div className={m.done ? "line-through text-ink-muted" : "font-medium"}>{m.title}</div>
                {m.dueDate && <div className="text-xs text-ink-2 mt-0.5">{pvm(m.dueDate)}</div>}
              </div>
              <button type="submit" className={`badge ${m.done ? "ok" : "muted"}`}>
                {m.done ? "Valmis" : "Merkitse valmiiksi"}
              </button>
            </form>
          ))}
          <form action={addMilestone} className="p-4 grid grid-cols-[1fr_auto_auto] gap-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input name="title" placeholder="Uusi virstanpylväs" required className="field" />
            <input name="dueDate" type="date" className="field" />
            <button className="btn btn-ghost">Lisää</button>
          </form>
        </div>
      </div>
      <p className="text-xs text-ink-muted">Aikataulu laskettu {lyhytPvm(tanaan)} tilanteen mukaan.</p>
    </>
  );
}
