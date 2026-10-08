import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { luoHankinnatMateriaalitarpeesta } from "@/lib/actions/rakennukset";
import { laskeRakennukset, rakennuksenNimi } from "@/lib/rakennukset";
import { euro, maara } from "@/lib/muotoilu";
import { Virhe } from "@/components/projektinhallinta";
import { KiinteatRivitTaulukko, KustannusErittely, MateriaalitarveTaulukko } from "@/components/rakennukset";

export const dynamic = "force-dynamic";

export default async function MateriaalitarvePage({
  params,
  searchParams,
}: {
  params: { projektiId: string };
  searchParams: { virhe?: string; rakennus?: string };
}) {
  const projectId = params.projektiId;
  const polku = `/projektit/${projectId}/materiaalitarve`;
  const [laskenta, hankinnat] = await Promise.all([
    laskeRakennukset({ projectId }),
    prisma.procurementItem.findMany({
      where: { procurementPlan: { projectId }, productId: { not: null } },
      select: { productId: true, quantity: true },
    }),
  ]);
  const valittu = laskenta.rakennukset.find((r) => r.rakennus.id === searchParams.rakennus);
  const tarve = valittu ? valittu.tarve : laskenta.tarve;
  const kiinteat = valittu ? valittu.kiinteat : laskenta.kiinteat;
  const hankittavia = laskenta.tarve.length + laskenta.kiinteat.filter((r) => r.laji !== "TEHDASTYO").length;
  const kustannus = valittu ? valittu.kustannus : laskenta.kustannus;
  const hankitut = new Map(hankinnat.map((h) => [h.productId!, h.quantity]));
  const eriavat = laskenta.tarve.filter((t) => hankitut.get(t.nimike.id) !== t.maara).length;

  return (
    <>
      <Virhe viesti={searchParams.virhe} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Materiaalitarve</h2>
          <p className="text-ink-2 text-sm mt-1 max-w-3xl">
            Rakennusten määräluetteloista lasketaan rakenneosien materiaaliluetteloilla (menekki × määrä, hukka mukaan lukien)
            nimikkeittäin. Hankintasuunnitelmaan voi luoda tarpeesta materiaalirivit. Jo luoduilla nimikkeillä päivittyy vain
            määrä, ja vaihe, toimittaja ja takarajat säilyvät.
          </p>
        </div>
        <form action={luoHankinnatMateriaalitarpeesta} className="shrink-0">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="paluu" value={`/projektit/${projectId}/hankintasuunnitelma?tyyppi=MATERIAALI`} />
          <button className="btn btn-primary" disabled={hankittavia === 0}>
            {hankinnat.length ? `Päivitä hankintasuunnitelma (${eriavat} muuttunut)` : "Luo hankintarivit"}
          </button>
        </form>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href={polku} className={`badge ${valittu ? "muted" : "info"}`}>
          Kaikki rakennukset
        </Link>
        {laskenta.rakennukset.map(({ rakennus }) => (
          <Link key={rakennus.id} href={`${polku}?rakennus=${rakennus.id}`} className={`badge ${valittu?.rakennus.id === rakennus.id ? "info" : "muted"}`}>
            {rakennuksenNimi(rakennus)}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-[2fr_1fr] gap-4 items-start">
        <div className="card">
          <div className="px-3 pt-3 font-heading font-semibold">Materiaalit nimikkeittäin</div>
          <MateriaalitarveTaulukko tarve={tarve} hinnoittelu={laskenta.hinnoittelu} />
          <div className="px-3 pt-5 font-heading font-semibold">Kiinteähintaiset rivit litteroittain</div>
          <p className="px-3 text-xs text-ink-2">
            Esimerkiksi tarjouslaskurin rivit. Hankintasuunnitelmaan tulevat ostot ja aliurakat litteroineen; tehdastyötä ei hankita.
          </p>
          <KiinteatRivitTaulukko rivit={kiinteat} />
        </div>
        <div className="card p-5 flex flex-col gap-3">
          <h3 className="font-semibold">{valittu ? rakennuksenNimi(valittu.rakennus) : "Koko projekti"}</h3>
          <KustannusErittely kustannus={kustannus} hinnoittelu={laskenta.hinnoittelu} />
          {laskenta.rakennukset.length > 1 && !valittu && (
            <table className="w-full text-xs mt-2">
              <tbody>
                {laskenta.rakennukset.map(({ rakennus, kustannus: k }) => (
                  <tr key={rakennus.id} className="border-t border-line">
                    <td className="py-1">{rakennuksenNimi(rakennus)}</td>
                    <td className="py-1 text-right font-mono">{maara(k.tunnit, 0)} h</td>
                    <td className="py-1 text-right font-mono">{euro(k.yhteensaSentit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
