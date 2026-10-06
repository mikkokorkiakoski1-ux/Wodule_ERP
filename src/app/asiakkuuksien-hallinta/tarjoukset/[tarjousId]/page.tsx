import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { convertOfferToProject, updateOffer } from "@/lib/actions/asiakkuudet";
import { kopioiRakennus, poistaRakennus } from "@/lib/actions/rakennukset";
import { laskeRakennukset, rakennuksenNimi } from "@/lib/rakennukset";
import { euro, maara, syoteEuro, syotePvm } from "@/lib/muotoilu";
import { Kentta, Virhe } from "@/components/projektinhallinta";
import { KustannusErittely, Maaraluettelo, RakennusLomake, Tunnusluku } from "@/components/rakennukset";

export const dynamic = "force-dynamic";

const TILAT: Record<string, string> = {
  LUONNOS: "Luonnos",
  LAHETETTY: "Lähetetty",
  HYVAKSYTTY: "Hyväksytty",
  HYLATTY: "Hylätty",
};

export default async function TarjousPage({
  params,
  searchParams,
}: {
  params: { tarjousId: string };
  searchParams: { virhe?: string; muokkaa?: string };
}) {
  const offer = await prisma.offer.findUnique({
    where: { id: params.tarjousId },
    include: { customer: true, project: true },
  });
  if (!offer) notFound();

  const polku = `/asiakkuuksien-hallinta/tarjoukset/${offer.id}`;
  // Projektiksi muutetun tarjouksen rakennukset kuuluvat projektille; ne näytetään vain luettavina.
  const lukittu = !!offer.project;
  const [laskenta, rakenneosat] = await Promise.all([
    laskeRakennukset({ offerId: offer.id }),
    prisma.structureType.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { code: "asc" }] }),
  ]);
  const { kustannus, hinnoittelu } = laskenta;
  const kate =
    offer.amountCents && kustannus.yhteensaSentit
      ? { sentit: offer.amountCents - kustannus.yhteensaSentit, pros: ((offer.amountCents - kustannus.yhteensaSentit) / offer.amountCents) * 100 }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-ink-muted font-mono uppercase">
            <Link href="/asiakkuuksien-hallinta/tarjoukset" className="hover:text-ink">
              Asiakkuuksien hallinta &raquo; Tarjoukset
            </Link>{" "}
            &raquo; {offer.customer.name}
          </p>
          <h1 className="text-2xl">{offer.title}</h1>
        </div>
        {offer.project ? (
          <Link href={`/projektit/${offer.project.id}/rakennukset`} className="btn btn-secondary shrink-0">
            Avaa projekti {offer.project.name}
          </Link>
        ) : (
          <form action={convertOfferToProject} className="shrink-0">
            <input type="hidden" name="offerId" value={offer.id} />
            <button className="btn btn-primary">Muuta projektiksi</button>
          </form>
        )}
      </div>

      <Virhe viesti={searchParams.virhe} />

      <div className="grid grid-cols-4 gap-3">
        <Tunnusluku otsikko="Tila" arvo={TILAT[offer.status]} ala={offer.validUntil ? `Voimassa ${offer.validUntil.toLocaleDateString("fi-FI")} asti` : undefined} />
        <Tunnusluku otsikko="Tarjoushinta (alv 0 %)" arvo={euro(offer.amountCents)} />
        <Tunnusluku
          otsikko="Omakustannus (rakenteista)"
          arvo={euro(kustannus.yhteensaSentit)}
          ala={`${laskenta.rakennukset.length} rakennusta · ${maara(kustannus.tunnit, 0)} h`}
        />
        <Tunnusluku
          otsikko="Kate"
          arvo={kate ? `${maara(kate.pros, 1)} %` : "–"}
          ala={kate ? euro(kate.sentit) : "Anna tarjoushinta ja määräluettelo"}
          korostus={!!kate && kate.sentit < 0}
        />
      </div>

      {!lukittu && (
        <details className="card p-5">
          <summary className="cursor-pointer font-heading font-semibold">Muokkaa tarjousta</summary>
          <form action={updateOffer} className="grid grid-cols-4 gap-3 items-end mt-4">
            <input type="hidden" name="id" value={offer.id} />
            <Kentta otsikko="Otsikko *" leveys={2}>
              <input name="title" defaultValue={offer.title} required className="field" />
            </Kentta>
            <Kentta otsikko="Tila">
              <select name="status" defaultValue={offer.status} className="field">
                {Object.entries(TILAT).map(([arvo, nimi]) => (
                  <option key={arvo} value={arvo}>
                    {nimi}
                  </option>
                ))}
              </select>
            </Kentta>
            <Kentta otsikko="Voimassa asti">
              <input name="validUntil" type="date" defaultValue={syotePvm(offer.validUntil)} className="field" />
            </Kentta>
            <Kentta otsikko="Tarjoushinta (€, alv 0 %)">
              <input name="amountEuros" defaultValue={syoteEuro(offer.amountCents)} inputMode="decimal" className="field" />
            </Kentta>
            <button className="btn btn-primary justify-self-start">Tallenna</button>
          </form>
        </details>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl">Rakennukset</h2>
          <p className="text-ink-2 text-sm mt-1 max-w-3xl">
            Tarjouksen sisältö: rakennukset ja niiden määräluettelot (rakenteet ja ostonimikkeet rakenneosakirjastosta). Kun
            tarjous muutetaan projektiksi, samat rakennukset määräluetteloineen siirtyvät projektille.
            {lukittu && " Tämä tarjous on jo muutettu projektiksi, joten rakennuksia muokataan projektissa."}
          </p>
        </div>

        {laskenta.rakennukset.map(({ rakennus, kustannus: k }) => (
          <div key={rakennus.id} className="card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{rakennuksenNimi(rakennus)}</h3>
                <div className="text-xs text-ink-2">
                  {[rakennus.buildingType, rakennus.grossAreaM2 ? `${maara(rakennus.grossAreaM2, 1)} m²` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="font-mono font-semibold">{euro(k.yhteensaSentit)}</div>
                <div className="text-xs text-ink-2">{maara(k.tunnit, 0)} h</div>
              </div>
            </div>
            <Maaraluettelo rakennus={rakennus} rakenneosat={rakenneosat} paluu={polku} muokkaa={searchParams.muokkaa} lukittu={lukittu} />
            {!lukittu && (
              <div className="flex gap-3 items-center border-t border-line pt-3">
                <form action={kopioiRakennus} className="flex gap-2 items-center">
                  <input type="hidden" name="id" value={rakennus.id} />
                  <input type="hidden" name="paluu" value={polku} />
                  <input name="code" placeholder="Kopion tunnus" aria-label="Kopion tunnus" className="field !py-1 !text-xs w-32" />
                  <button className="btn btn-ghost btn-sm">Kopioi rakennus</button>
                </form>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs underline">Muokkaa tietoja</summary>
                  <div className="mt-3">
                    <RakennusLomake rakennus={rakennus} paluu={polku} />
                  </div>
                </details>
                <form action={poistaRakennus} className="ml-auto">
                  <input type="hidden" name="id" value={rakennus.id} />
                  <input type="hidden" name="paluu" value={polku} />
                  <button className="text-xs text-ink-muted hover:text-critical">Poista rakennus</button>
                </form>
              </div>
            )}
          </div>
        ))}

        {!lukittu && (
          <div className="card p-5">
            <h3 className="font-semibold mb-3">Uusi rakennus</h3>
            <RakennusLomake offerId={offer.id} paluu={polku} />
          </div>
        )}
      </div>

      {laskenta.rakennukset.length > 0 && (
        <div className="card p-5 max-w-xl">
          <h3 className="font-semibold mb-3">Omakustannus yhteensä</h3>
          <KustannusErittely kustannus={kustannus} hinnoittelu={hinnoittelu} />
        </div>
      )}
    </div>
  );
}
