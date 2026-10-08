import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  asetaElementinTila,
  luoTarkastuslistaPohjasta,
  poistaElementti,
  poistaRakennus,
  tallennaElementti,
} from "@/lib/actions/rakennukset";
import { createComplaint, updateComplaintStatus } from "@/lib/actions/reklamaatiot";
import { ELEMENTIN_TILAT, RAKENNUKSEN_TILAT, RAKENNUS_INCLUDE, haeHinnoittelu, rakennuksenNimi } from "@/lib/rakennukset";
import { laskeKustannus, laskeMateriaalitarve } from "@/lib/rakenteet";
import { euro, maara, pvm, syoteLuku, syotePvm } from "@/lib/muotoilu";
import { Ilmoitus, Kentta, Virhe } from "@/components/projektinhallinta";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { KustannusErittely, Maaraluettelo, MateriaalitarveTaulukko, RakennusLomake, Tunnusluku } from "@/components/rakennukset";

export const dynamic = "force-dynamic";

const REKLAMAATION_TILAT: Record<string, string> = {
  AVOIN: "Avoin",
  SELVITYKSESSA: "Selvityksessä",
  RATKAISTU: "Ratkaistu",
  HYLATTY: "Hylätty",
};

export default async function RakennusPage({
  params,
  searchParams,
}: {
  params: { projektiId: string; rakennusId: string };
  searchParams: { virhe?: string; muokkaa?: string; elementti?: string; ilmoitus?: string };
}) {
  const rakennus = await prisma.building.findFirst({
    where: { id: params.rakennusId, projectId: params.projektiId },
    include: {
      ...RAKENNUS_INCLUDE,
      offer: { select: { id: true, title: true } },
      elements: { include: { structureType: true }, orderBy: [{ seq: "asc" }, { code: "asc" }] },
      checklists: { include: { items: true, element: true }, orderBy: { createdAt: "desc" } },
      complaints: { include: { element: true }, orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      productionScheduleItems: { orderBy: { seq: "asc" } },
      _count: { select: { workOrders: true, drawings: true } },
    },
  });
  if (!rakennus) notFound();

  const [rakenneosat, pohjat, hinnoittelu] = await Promise.all([
    prisma.structureType.findMany({ where: { active: true }, include: { littera: true }, orderBy: [{ kind: "asc" }, { code: "asc" }] }),
    prisma.qaChecklist.findMany({ where: { isTemplate: true }, orderBy: { title: "asc" } }),
    haeHinnoittelu(),
  ]);

  const polku = `/projektit/${params.projektiId}/rakennukset/${rakennus.id}`;
  const tarve = laskeMateriaalitarve(rakennus.parts);
  const kustannus = laskeKustannus(rakennus.parts, hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit);
  const muokattavaElementti = rakennus.elements.find((e) => e.id === searchParams.elementti);
  const valmiitElementit = rakennus.elements.filter((e) => ["VALMIS", "TOIMITETTU", "ASENNETTU"].includes(e.status)).length;
  const avoimetReklamaatiot = rakennus.complaints.filter((c) => c.status === "AVOIN" || c.status === "SELVITYKSESSA").length;

  return (
    <>
      <Virhe viesti={searchParams.virhe} />
      <Ilmoitus viesti={searchParams.ilmoitus} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-ink-muted font-mono uppercase">
            <Link href={`/projektit/${params.projektiId}/rakennukset`} className="hover:text-ink">
              Rakennukset
            </Link>{" "}
            &raquo; {rakennus.code}
          </p>
          <h2 className="text-xl">{rakennuksenNimi(rakennus)}</h2>
          <p className="text-ink-2 text-sm mt-1">
            {[rakennus.buildingType, rakennus.grossAreaM2 ? `${maara(rakennus.grossAreaM2, 1)} m²` : null, rakennus.address]
              .filter(Boolean)
              .join(" · ") || "Ei perustietoja"}
            {rakennus.offer && (
              <>
                {" "}
                · tarjouksesta{" "}
                <Link href={`/asiakkuuksien-hallinta/tarjoukset/${rakennus.offer.id}`} className="underline">
                  {rakennus.offer.title}
                </Link>
              </>
            )}
            {rakennus.bimModelUrl && (
              <>
                {" "}
                ·{" "}
                <a href={rakennus.bimModelUrl} target="_blank" rel="noreferrer" className="underline">
                  Avaa BIM-malli
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Tunnusluku
          otsikko="Tila"
          arvo={RAKENNUKSEN_TILAT[rakennus.status]}
          ala={rakennus.deliveredAt ? `Toimitettu ${pvm(rakennus.deliveredAt)}` : `Suunniteltu toimitus ${pvm(rakennus.plannedDelivery)}`}
        />
        <Tunnusluku otsikko="Elementit" arvo={`${valmiitElementit} / ${rakennus.elements.length}`} ala="valmiina tai toimitettu" />
        <Tunnusluku otsikko="Tuntimenekki (rakenteista)" arvo={`${maara(kustannus.tunnit, 0)} h`} ala={`Omakustannus ${euro(kustannus.yhteensaSentit)}`} />
        <Tunnusluku otsikko="Avoimet reklamaatiot" arvo={avoimetReklamaatiot} korostus={avoimetReklamaatiot > 0} ala={`${rakennus.complaints.length} yhteensä`} />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">Määräluettelo</h3>
            <Link href={`/asiakkuuksien-hallinta/tarjouslaskenta?rakennus=${rakennus.id}`} className="btn btn-secondary btn-sm">
              {rakennus.laskentaSyote ? "Avaa tarjouslaskenta" : "Laske tarjouslaskurilla"}
            </Link>
          </div>
          <Maaraluettelo rakennus={rakennus} rakenneosat={rakenneosat} hinnoittelu={hinnoittelu} paluu={polku} muokkaa={searchParams.muokkaa} />
        </div>
        <div className="card p-5 flex flex-col gap-3">
          <h3 className="font-semibold">Omakustannus</h3>
          <KustannusErittely kustannus={kustannus} hinnoittelu={hinnoittelu} />
        </div>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-heading font-semibold p-5">Materiaalitarve ({tarve.length} nimikettä)</summary>
        <MateriaalitarveTaulukko tarve={tarve} hinnoittelu={hinnoittelu} />
      </details>

      <div id="elementit" className="card p-5 flex flex-col gap-3">
        <div>
          <h3 className="font-semibold">Elementit</h3>
          <p className="text-xs text-ink-2 mt-0.5">
            Tehtaan valmistamat ja toimittamat yksiköt (seinäelementit, tilaelementit). Tarkastukset, reklamaatiot, työmääräimet ja
            piirustukset voi kohdistaa elementtiin.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="py-2 pr-3">Tunnus</th>
              <th className="py-2 pr-3">Rakenneosa</th>
              <th className="py-2 pr-3 text-right">Koko</th>
              <th className="py-2 pr-3">Tila</th>
              <th className="py-2 pr-3">Suunniteltu</th>
              <th className="py-2 pr-3">Valmis</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rakennus.elements.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 font-mono">
                  {e.code}
                  {e.description && <div className="text-xs text-ink-2 font-sans">{e.description}</div>}
                </td>
                <td className="py-2 pr-3 text-ink-2">{e.structureType ? `${e.structureType.code} ${e.structureType.name}` : "–"}</td>
                <td className="py-2 pr-3 text-right font-mono">
                  {e.quantity !== null ? `${maara(e.quantity)} ${e.structureType?.unit ?? ""}` : "–"}
                </td>
                <td className="py-2 pr-3">
                  <form action={asetaElementinTila}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="paluu" value={`${polku}#elementit`} />
                    <AutoSubmitSelect name="status" defaultValue={e.status} className="field !text-xs !py-1 !px-2" aria-label={`Elementin ${e.code} tila`}>
                      {Object.entries(ELEMENTIN_TILAT).map(([arvo, nimi]) => (
                        <option key={arvo} value={arvo}>
                          {nimi}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </form>
                </td>
                <td className="py-2 pr-3 text-ink-2">{pvm(e.plannedDate)}</td>
                <td className="py-2 pr-3 text-ink-2">{pvm(e.completedAt)}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Link href={`${polku}?elementti=${e.id}#elementtilomake`} className="text-xs underline mr-3">
                    Muokkaa
                  </Link>
                  <form action={poistaElementti} className="inline">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="paluu" value={`${polku}#elementit`} />
                    <button className="text-xs text-ink-muted hover:text-critical">Poista</button>
                  </form>
                </td>
              </tr>
            ))}
            {rakennus.elements.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-ink-muted">
                  Ei vielä elementtejä.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <form
          id="elementtilomake"
          key={muokattavaElementti?.id ?? "uusi"}
          action={tallennaElementti}
          className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] gap-2 items-end"
        >
          {muokattavaElementti && <input type="hidden" name="id" value={muokattavaElementti.id} />}
          <input type="hidden" name="buildingId" value={rakennus.id} />
          <input type="hidden" name="paluu" value={`${polku}#elementit`} />
          {muokattavaElementti && <input type="hidden" name="status" value={muokattavaElementti.status} />}
          <Kentta otsikko={muokattavaElementti ? "Muokkaa: tunnus" : "Uusi elementti: tunnus"}>
            <input name="code" defaultValue={muokattavaElementti?.code} placeholder={`${rakennus.code}-US-01`} required className="field font-mono" />
          </Kentta>
          <Kentta otsikko="Rakenneosa">
            <select name="structureTypeId" defaultValue={muokattavaElementti?.structureTypeId ?? ""} className="field">
              <option value="">–</option>
              {rakenneosat.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} {t.name}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Koko">
            <input name="quantity" defaultValue={syoteLuku(muokattavaElementti?.quantity)} inputMode="decimal" className="field" />
          </Kentta>
          <Kentta otsikko="Suunniteltu valmistus">
            <input name="plannedDate" type="date" defaultValue={syotePvm(muokattavaElementti?.plannedDate)} className="field" />
          </Kentta>
          <Kentta otsikko="BIM GUID">
            <input name="bimGuid" defaultValue={muokattavaElementti?.bimGuid ?? ""} className="field font-mono" />
          </Kentta>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm">{muokattavaElementti ? "Tallenna" : "Lisää"}</button>
            {muokattavaElementti && (
              <Link href={`${polku}#elementit`} className="btn btn-ghost btn-sm">
                Peru
              </Link>
            )}
          </div>
          <Kentta otsikko="Kuvaus" leveys={4}>
            <input name="description" defaultValue={muokattavaElementti?.description ?? ""} className="field" />
          </Kentta>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div id="tarkastukset" className="card p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Tarkastukset</h3>
            <Link href="/laadunvarmistus/tarkastuslistat" className="text-xs underline">
              Laadunvarmistus
            </Link>
          </div>
          {rakennus.checklists.length === 0 ? (
            <p className="text-sm text-ink-muted">Ei vielä tarkastuslistoja.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {rakennus.checklists.map((cl) => {
                const tehty = cl.items.filter((i) => i.passed !== null).length;
                const hylatty = cl.items.filter((i) => i.passed === false).length;
                return (
                  <li key={cl.id} className="py-2 flex items-center justify-between gap-3">
                    <Link href={`/laadunvarmistus/tarkastuslistat#lista-${cl.id}`} className="hover:underline">
                      {cl.title}
                    </Link>
                    <span className={`badge ${hylatty ? "crit" : tehty === cl.items.length && tehty > 0 ? "ok" : "muted"}`}>
                      {tehty} / {cl.items.length}
                      {hylatty ? ` · ${hylatty} ei OK` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {pohjat.length === 0 ? (
            <p className="text-xs text-ink-muted">
              Merkitse tarkastuslista pohjaksi{" "}
              <Link href="/laadunvarmistus/tarkastuslistat" className="underline">
                Laadunvarmistuksessa
              </Link>
              , niin voit kopioida sen rakennukselle tai elementille.
            </p>
          ) : (
            <form action={luoTarkastuslistaPohjasta} className="grid grid-cols-[2fr_1fr_auto] gap-2 items-end">
              <input type="hidden" name="buildingId" value={rakennus.id} />
              <input type="hidden" name="paluu" value={`${polku}#tarkastukset`} />
              <Kentta otsikko="Uusi tarkastus pohjasta">
                <select name="templateId" required defaultValue="" className="field">
                  <option value="" disabled>
                    Valitse pohja
                  </option>
                  {pohjat.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Kentta>
              <Kentta otsikko="Kohde">
                <select name="elementId" defaultValue="" className="field">
                  <option value="">Koko rakennus</option>
                  {rakennus.elements.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code}
                    </option>
                  ))}
                </select>
              </Kentta>
              <button className="btn btn-secondary btn-sm">Luo</button>
            </form>
          )}
        </div>

        <div id="reklamaatiot" className="card p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Reklamaatiot</h3>
            <Link href="/reklamaatiot" className="text-xs underline">
              Kaikki reklamaatiot
            </Link>
          </div>
          {rakennus.complaints.length === 0 ? (
            <p className="text-sm text-ink-muted">Ei reklamaatioita.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {rakennus.complaints.map((c) => (
                <li key={c.id} className="py-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {c.title}
                      {c.element && <span className="font-mono text-xs text-ink-2"> · {c.element.code}</span>}
                    </div>
                    <div className="text-xs text-ink-2">{c.description}</div>
                  </div>
                  <form action={updateComplaintStatus} className="shrink-0">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="paluu" value={`${polku}#reklamaatiot`} />
                    <AutoSubmitSelect name="status" defaultValue={c.status} className="field !text-xs !py-1 !px-2" aria-label="Reklamaation tila">
                      {Object.entries(REKLAMAATION_TILAT).map(([arvo, nimi]) => (
                        <option key={arvo} value={arvo}>
                          {nimi}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={createComplaint} className="grid grid-cols-[2fr_1fr] gap-2">
            <input type="hidden" name="paluu" value={`${polku}#reklamaatiot`} />
            <input name="title" placeholder="Uusi reklamaatio: otsikko" required className="field" />
            <select name="kohde" defaultValue={`rakennus:${rakennus.id}`} className="field" aria-label="Kohde">
              <option value={`rakennus:${rakennus.id}`}>Koko rakennus</option>
              {rakennus.elements.map((e) => (
                <option key={e.id} value={`elementti:${e.id}`}>
                  {e.code}
                </option>
              ))}
            </select>
            <textarea name="description" placeholder="Kuvaus" required className="field col-span-2" rows={2} />
            <button className="btn btn-secondary btn-sm justify-self-start">Lisää reklamaatio</button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Link href={`/tuotannon-ohjaus/${params.projektiId}`} className="card p-4 hover:border-accent">
          <div className="font-semibold">Tuotannon ohjaus</div>
          <div className="text-sm text-ink-2 mt-1">
            {rakennus._count.workOrders} työmääräintä · {rakennus._count.drawings} piirustusta tälle rakennukselle
          </div>
        </Link>
        <Link href="/projektit/tuotantoaikataulu" className="card p-4 hover:border-accent">
          <div className="font-semibold">Tuotantoaikataulu</div>
          <div className="text-sm text-ink-2 mt-1">
            {rakennus.productionScheduleItems.length
              ? rakennus.productionScheduleItems.map((r) => `${r.projekti} (${r.tuntimenekki} h)`).join(", ")
              : "Ei liitettyä tuotantoaikataulun riviä"}
          </div>
        </Link>
        <Link href="/laadunvarmistus/dopit" className="card p-4 hover:border-accent">
          <div className="font-semibold">Dokumentit</div>
          <div className="text-sm text-ink-2 mt-1">
            {rakennus.documents.length ? rakennus.documents.map((d) => d.title).join(", ") : "Ei rakennuskohtaisia dokumentteja"}
          </div>
        </Link>
      </div>

      <details className="card p-5" open={!!searchParams.virhe && !searchParams.muokkaa && !searchParams.elementti}>
        <summary className="cursor-pointer font-heading font-semibold">Muokkaa rakennuksen tietoja</summary>
        <div className="mt-4 flex flex-col gap-4">
          <RakennusLomake rakennus={rakennus} paluu={polku} laajat />
          <form action={poistaRakennus} className="border-t border-line pt-4">
            <input type="hidden" name="id" value={rakennus.id} />
            <input type="hidden" name="paluu" value={`/projektit/${params.projektiId}/rakennukset`} />
            <button className="btn btn-ghost btn-sm text-critical">Poista rakennus (myös määräluettelo, elementit ja tarkastukset)</button>
          </form>
        </div>
      </details>
    </>
  );
}
