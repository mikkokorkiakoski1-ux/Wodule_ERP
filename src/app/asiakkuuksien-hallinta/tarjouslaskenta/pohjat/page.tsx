import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { kaytaPohjaa, nimeaPohja, poistaPohja } from "@/lib/actions/laskentapohjat";
import { MAARARIVI_INCLUDE, haeHinnoittelu, litterajarjestys, litteranNimi, rakennuksenNimi } from "@/lib/rakennukset";
import { laskeKustannus, myyntihinta, rivinKoodi, rivinLittera, rivinNimi, rivinYksikko } from "@/lib/rakenteet";
import { euro, maara } from "@/lib/muotoilu";
import { Ilmoitus, Kentta, Virhe } from "@/components/projektinhallinta";
import { TarjouslaskennanValilehdet } from "@/components/TarjouslaskennanValilehdet";

export const dynamic = "force-dynamic";

export default async function LaskentapohjatPage({
  searchParams,
}: {
  searchParams: { rakennus?: string; virhe?: string; ilmoitus?: string };
}) {
  const [pohjat, hinnoittelu, rakennus] = await Promise.all([
    prisma.laskentapohja.findMany({
      orderBy: { name: "asc" },
      include: { rivit: { include: MAARARIVI_INCLUDE, orderBy: { seq: "asc" } } },
    }),
    haeHinnoittelu(),
    searchParams.rakennus
      ? prisma.building.findUnique({ where: { id: searchParams.rakennus }, include: { offer: { include: { project: true } }, project: true, _count: { select: { parts: true } } } })
      : null,
  ]);
  const polku = `/asiakkuuksien-hallinta/tarjouslaskenta/pohjat${rakennus ? `?rakennus=${rakennus.id}` : ""}`;
  const kayttokelpoinen = rakennus && (rakennus.projectId || !rakennus.offer?.project);
  const rakennuksenSivu = rakennus ? `/asiakkuuksien-hallinta/tarjouslaskenta/manuaalinen?rakennus=${rakennus.id}` : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Asiakkuuksien hallinta &raquo; Tarjouslaskenta &raquo; Pohjat</p>
        <h1 className="text-2xl">Tarjouslaskenta</h1>
        <p className="text-ink-2 text-sm mt-1 max-w-3xl">
          Laskentapohjat ovat tallennettuja laskentoja: määräluettelon rivit litteroineen, kate ja tarvittaessa laskurin syötteet.
          Tallenna rakennuksen laskenta pohjaksi Laskuri- tai Manuaalinen-välilehdellä ja ota pohja toisen rakennuksen
          laskennan pohjaksi. Hinnat lasketaan aina nykyisillä kirjaston ja hinnaston hinnoilla.
        </p>
      </div>
      <TarjouslaskennanValilehdet aktiivinen="pohjat" rakennusId={rakennus?.id} />

      <Virhe viesti={searchParams.virhe} />
      <Ilmoitus viesti={searchParams.ilmoitus} />
      {rakennus && (
        <p className="text-sm text-ink-2">
          Valittu rakennus:{" "}
          <Link href={rakennuksenSivu!} className="underline">
            {rakennus.project?.name ?? rakennus.offer?.title} · {rakennuksenNimi(rakennus)}
          </Link>{" "}
          ({rakennus._count.parts} riviä)
        </p>
      )}

      {pohjat.length === 0 && (
        <div className="card p-6 text-center text-ink-muted text-sm">
          Ei vielä pohjia. Tallenna rakennuksen laskenta pohjaksi Laskuri- tai Manuaalinen-välilehdellä.
        </div>
      )}

      {pohjat.map((p) => {
        const k = laskeKustannus(p.rivit, hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit);
        const kate = p.katePct ?? 25;
        const ryhmat = new Map<string, { littera: ReturnType<typeof rivinLittera>; rivit: typeof p.rivit }>();
        for (const r of p.rivit) {
          const l = rivinLittera(r);
          const g = ryhmat.get(l?.code ?? "") ?? { littera: l, rivit: [] };
          g.rivit.push(r);
          ryhmat.set(l?.code ?? "", g);
        }
        const litteroittain = [...ryhmat.values()].sort((a, b) => litterajarjestys(a.littera, b.littera));
        return (
          <div key={p.id} className="card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-lg">{p.name}</h2>
                {p.description && <p className="text-sm text-ink-2">{p.description}</p>}
                <p className="text-xs text-ink-muted mt-1">
                  {p.rivit.length} riviä · {litteroittain.length} litteraa · kate {maara(kate, 1)} %{p.laskentaSyote ? " · sis. laskurin syötteet" : ""} ·
                  päivitetty {p.updatedAt.toLocaleDateString("fi-FI")}
                </p>
              </div>
              <div className="text-right text-sm">
                <div className="font-mono font-semibold">{euro(k.yhteensaSentit)}</div>
                <div className="text-xs text-ink-2">omakustannus · myynti {euro(Math.round(myyntihinta(k.yhteensaSentit, kate)))}</div>
              </div>
            </div>

            {kayttokelpoinen && (
              <form action={kaytaPohjaa} className="flex items-end gap-2">
                <input type="hidden" name="buildingId" value={rakennus!.id} />
                <input type="hidden" name="pohjaId" value={p.id} />
                <input type="hidden" name="paluu" value={rakennuksenSivu} />
                <Kentta otsikko={`Käytä rakennukselle ${rakennus!.code}`}>
                  <select name="tapa" defaultValue={rakennus!._count.parts ? "lisaa" : "korvaa"} className="field">
                    <option value="lisaa">Lisää nykyisiin riveihin</option>
                    <option value="korvaa">Korvaa nykyiset (BIM säilyy)</option>
                  </select>
                </Kentta>
                <button className="btn btn-primary btn-sm">Käytä pohjaa</button>
              </form>
            )}

            <details>
              <summary className="cursor-pointer text-sm underline">Näytä rivit</summary>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
                    <th className="py-2 pr-3">Rivi</th>
                    <th className="py-2 pr-3 text-right">Määrä</th>
                    <th className="py-2 pr-3 text-right">Yhteensä</th>
                  </tr>
                </thead>
                <tbody>
                  {litteroittain.map(({ littera, rivit }) => (
                    <Fragment key={littera?.code ?? "-"}>
                      <tr className="bg-surface-raised border-b border-line">
                        <td colSpan={3} className="py-1.5 px-1 font-mono text-xs font-semibold uppercase">
                          {litteranNimi(littera)}
                        </td>
                      </tr>
                      {rivit.map((r) => (
                        <tr key={r.id} className="border-b border-line">
                          <td className="py-1 pr-3">
                            {rivinKoodi(r) && <span className="font-mono text-xs text-ink-muted mr-2">{rivinKoodi(r)}</span>}
                            {rivinNimi(r)}
                          </td>
                          <td className="py-1 pr-3 text-right font-mono">
                            {maara(r.quantity)} {rivinYksikko(r)}
                          </td>
                          <td className="py-1 pr-3 text-right font-mono">
                            {euro(laskeKustannus([r], hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit).yhteensaSentit)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </details>

            <details className="text-sm">
              <summary className="cursor-pointer underline">Nimeä tai poista</summary>
              <div className="flex items-end gap-3 mt-3">
                <form action={nimeaPohja} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="paluu" value={polku} />
                  <Kentta otsikko="Nimi">
                    <input name="name" defaultValue={p.name} required className="field" />
                  </Kentta>
                  <Kentta otsikko="Kuvaus">
                    <input name="description" defaultValue={p.description ?? ""} className="field" />
                  </Kentta>
                  <button className="btn btn-ghost btn-sm">Tallenna</button>
                </form>
                <form action={poistaPohja} className="ml-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="paluu" value={polku} />
                  <button className="text-xs text-ink-muted hover:text-critical">Poista pohja</button>
                </form>
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
