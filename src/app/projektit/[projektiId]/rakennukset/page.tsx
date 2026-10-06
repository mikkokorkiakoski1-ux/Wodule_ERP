import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { kopioiRakennus } from "@/lib/actions/rakennukset";
import { RAKENNUKSEN_TILAT, laskeRakennukset, rakennuksenNimi } from "@/lib/rakennukset";
import { euro, maara, pvm } from "@/lib/muotoilu";
import { Virhe } from "@/components/projektinhallinta";
import { KustannusErittely, RakennusLomake, Tunnusluku } from "@/components/rakennukset";

export const dynamic = "force-dynamic";

const TILAN_TYYLI: Record<string, string> = { SUUNNITTELU: "muted", VALMISTUKSESSA: "info", TOIMITETTU: "ok", VALMIS: "ok" };

export default async function RakennuksetPage({
  params,
  searchParams,
}: {
  params: { projektiId: string };
  searchParams: { virhe?: string; uusi?: string };
}) {
  const projectId = params.projektiId;
  const polku = `/projektit/${projectId}/rakennukset`;
  const [laskenta, elementit] = await Promise.all([
    laskeRakennukset({ projectId }),
    prisma.productionElement.groupBy({ by: ["buildingId", "status"], where: { building: { projectId } }, _count: true }),
  ]);
  const { rakennukset, kustannus, hinnoittelu } = laskenta;
  const elementtejaRakennuksella = (id: string) => elementit.filter((e) => e.buildingId === id);
  const ala = rakennukset.reduce((s, r) => s + (r.rakennus.grossAreaM2 ?? 0), 0);

  return (
    <>
      <Virhe viesti={searchParams.virhe} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Rakennukset</h2>
          <p className="text-ink-2 text-sm mt-1 max-w-3xl">
            Jokainen rakennus kootaan rakenneosakirjastosta: määräluettelon rivi on rakenneosa (rakenne tai ostonimike) × määrä. Määrät syötetään käsin tai tuodaan
            BIM-mallin määräluettelosta. Niistä lasketaan omakustannus, materiaalitarve ja tehtaan tuntimenekki.
          </p>
          <p className="text-sm mt-1">
            <Link href="/tiedonsiirto?kohde=maaraluettelo#tuonti" className="underline">
              Tuo määräluettelo (BIM)
            </Link>{" "}
            ·{" "}
            <a href="/api/tiedonsiirto/vienti?kohde=maaraluettelo&muoto=xlsx" className="underline">
              Vie määräluettelot Exceliin
            </a>
          </p>
        </div>
        <Link href={`${polku}?uusi=1#uusi`} className="btn btn-primary shrink-0">
          + Uusi rakennus
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Tunnusluku otsikko="Rakennuksia" arvo={rakennukset.length} ala={ala ? `${maara(ala, 0)} m² bruttoalaa` : undefined} />
        <Tunnusluku otsikko="Tuntimenekki (rakenteista)" arvo={`${maara(kustannus.tunnit, 0)} h`} ala="Vertailuluku tuotantoaikataululle" />
        <Tunnusluku otsikko="Materiaalit" arvo={euro(kustannus.materiaalitSentit)} ala={`${laskenta.tarve.length} nimikettä`} />
        <Tunnusluku
          otsikko="Omakustannus (alv 0 %)"
          arvo={euro(kustannus.yhteensaSentit)}
          ala={kustannus.puuttuvatHinnat.length || kustannus.tuntihintaPuuttuu ? "Hintoja puuttuu" : hinnoittelu.hinnasto?.name}
        />
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Rakennus</th>
              <th className="p-3">Tila</th>
              <th className="p-3 text-right">Ala m²</th>
              <th className="p-3 text-right">Määrärivejä</th>
              <th className="p-3">Elementit</th>
              <th className="p-3 text-right">Tunnit</th>
              <th className="p-3 text-right">Omakustannus</th>
              <th className="p-3">Toimitus</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rakennukset.map(({ rakennus: r, kustannus: k }) => {
              const el = elementtejaRakennuksella(r.id);
              const yhteensa = el.reduce((s, e) => s + e._count, 0);
              const valmiit = el.filter((e) => e.status !== "SUUNNITTEILLA" && e.status !== "VALMISTUKSESSA").reduce((s, e) => s + e._count, 0);
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <Link href={`${polku}/${r.id}`} className="font-medium hover:underline">
                      {rakennuksenNimi(r)}
                    </Link>
                    {r.buildingType && <div className="text-xs text-ink-2">{r.buildingType}</div>}
                  </td>
                  <td className="p-3">
                    <span className={`badge ${TILAN_TYYLI[r.status]}`}>{RAKENNUKSEN_TILAT[r.status]}</span>
                  </td>
                  <td className="p-3 text-right font-mono">{maara(r.grossAreaM2, 1)}</td>
                  <td className="p-3 text-right font-mono">{r.parts.length}</td>
                  <td className="p-3 font-mono text-xs">{yhteensa ? `${valmiit} / ${yhteensa} valmiina` : "–"}</td>
                  <td className="p-3 text-right font-mono">{maara(k.tunnit, 0)}</td>
                  <td className="p-3 text-right font-mono">{euro(k.yhteensaSentit)}</td>
                  <td className="p-3 text-ink-2">{r.deliveredAt ? `Toimitettu ${pvm(r.deliveredAt)}` : pvm(r.plannedDelivery)}</td>
                  <td className="p-3 text-right">
                    <form action={kopioiRakennus} className="flex gap-1 justify-end">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="paluu" value={polku} />
                      <input name="code" placeholder="Uusi tunnus" aria-label={`Kopion tunnus (${r.code})`} className="field !py-1 !text-xs w-24" />
                      <button className="btn btn-ghost btn-sm" title="Kopioi rakennus määräluetteloineen (sama talotyyppi)">
                        Kopioi
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rakennukset.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-ink-muted">
                  Projektilla ei ole vielä rakennuksia. Lisää rakennus alla tai tuo ne tarjoukselta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div id="uusi" className="card p-5">
          <h3 className="font-semibold mb-3">Uusi rakennus</h3>
          <RakennusLomake projectId={projectId} paluu={polku} laajat />
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Projektin omakustannus</h3>
          <KustannusErittely kustannus={kustannus} hinnoittelu={hinnoittelu} />
        </div>
      </div>
    </>
  );
}
