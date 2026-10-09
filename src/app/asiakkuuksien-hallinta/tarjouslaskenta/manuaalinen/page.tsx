import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { asetaKate, muutaLaskurinRivitManuaalisiksi } from "@/lib/actions/rakennukset";
import { tallennaLittera } from "@/lib/actions/rakenteet";
import { haeHinnoittelu, litterajarjestys, RAKENNUS_INCLUDE, rakennuksenKate, rakennuksenNimi } from "@/lib/rakennukset";
import { laskeKustannus, myyntihinta } from "@/lib/rakenteet";
import { ALV } from "@/lib/tarjouslaskenta";
import { euro, maara, syoteLuku } from "@/lib/muotoilu";
import { Ilmoitus, Kentta, Virhe } from "@/components/projektinhallinta";
import { KustannusErittely, Maaraluettelo } from "@/components/rakennukset";
import { PohjaLomakkeet, RakennuksenValinta } from "@/components/laskentapohjat";
import { TarjouslaskennanValilehdet } from "@/components/TarjouslaskennanValilehdet";

export const dynamic = "force-dynamic";

export default async function ManuaalinenLaskentaPage({
  searchParams,
}: {
  searchParams: { rakennus?: string; virhe?: string; ilmoitus?: string; muokkaa?: string; littera?: string };
}) {
  const rakennus = searchParams.rakennus
    ? await prisma.building.findUnique({
        where: { id: searchParams.rakennus },
        include: { ...RAKENNUS_INCLUDE, offer: { include: { project: true } }, project: true },
      })
    : null;

  const otsikko = (
    <div>
      <p className="text-xs text-ink-muted font-mono uppercase">
        Asiakkuuksien hallinta &raquo; Tarjouslaskenta &raquo; Manuaalinen
      </p>
      <h1 className="text-2xl">Tarjouslaskenta</h1>
      <p className="text-ink-2 text-sm mt-1 max-w-3xl">
        Manuaalinen laskenta: kokoa rakennuksen laskenta itse litteroittain. Jokainen rivi on kirjaston rakenneosa, nimikkeistön
        nimike tai vapaa rivi omalla kuvauksella ja hinnalla. Riville voi antaa oman yksikköhinnan, litteran ja kustannuslajin.
        Rivit muodostavat rakennuksen määräluettelon, josta tulevat tarjouksen omakustannus, kate, materiaalitarve ja hankinnat.
      </p>
    </div>
  );

  if (!rakennus) {
    return (
      <div className="flex flex-col gap-6">
        {otsikko}
        <TarjouslaskennanValilehdet aktiivinen="manuaalinen" />
        {searchParams.rakennus && <Virhe viesti="Rakennusta ei löytynyt." />}
        <RakennuksenValinta kohde="manuaalinen" />
      </div>
    );
  }

  const [rakenneosat, nimikkeet, litterat, hinnoittelu] = await Promise.all([
    prisma.structureType.findMany({ where: { active: true }, include: { littera: true }, orderBy: [{ kind: "asc" }, { code: "asc" }] }),
    prisma.product.findMany({ orderBy: { code: "asc" } }),
    prisma.littera.findMany(),
    haeHinnoittelu(),
  ]);
  litterat.sort((a, b) => litterajarjestys(a, b));

  const polku = `/asiakkuuksien-hallinta/tarjouslaskenta/manuaalinen?rakennus=${rakennus.id}`;
  // Projektiksi muutetun tarjouksen rakennusta muokataan projektissa.
  const lukittu = !rakennus.projectId && !!rakennus.offer?.project;
  const omistaja = rakennus.projectId
    ? { nimi: rakennus.project!.name, href: `/projektit/${rakennus.projectId}/rakennukset/${rakennus.id}` }
    : { nimi: rakennus.offer?.title ?? "–", href: `/asiakkuuksien-hallinta/tarjoukset/${rakennus.offerId}` };
  const kustannus = laskeKustannus(rakennus.parts, hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit);
  const kate = rakennuksenKate(rakennus);
  const myynti = myyntihinta(kustannus.yhteensaSentit, kate);
  const laskurinRiveja = rakennus.parts.filter((o) => o.source === "LASKURI").length;

  return (
    <div className="flex flex-col gap-6">
      {otsikko}
      <TarjouslaskennanValilehdet aktiivinen="manuaalinen" rakennusId={rakennus.id} />

      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl">
          <Link href={omistaja.href} className="hover:underline">
            {omistaja.nimi}
          </Link>{" "}
          · {rakennuksenNimi(rakennus)}
        </h2>
        {rakennus.grossAreaM2 && <span className="text-sm text-ink-2">{maara(rakennus.grossAreaM2, 1)} B-m²</span>}
      </div>

      <Virhe viesti={searchParams.virhe} />
      <Ilmoitus viesti={searchParams.ilmoitus} />
      {lukittu && (
        <Virhe viesti={`Tarjous on muutettu projektiksi. Muokkaa rakennusta projektissa ${rakennus.offer?.project?.name}.`} />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">Laskentarivit litteroittain</h3>
            {laskurinRiveja > 0 && !lukittu && (
              <form action={muutaLaskurinRivitManuaalisiksi} className="flex items-center gap-2">
                <input type="hidden" name="buildingId" value={rakennus.id} />
                <input type="hidden" name="paluu" value={polku} />
                <span className="text-xs text-ink-2">{laskurinRiveja} laskurin riviä</span>
                <button className="btn btn-ghost btn-sm" title="Laskurin tallennus ei enää korvaa rivejä">
                  Muuta manuaalisiksi
                </button>
              </form>
            )}
          </div>
          <Maaraluettelo
            rakennus={rakennus}
            rakenneosat={rakenneosat}
            nimikkeet={nimikkeet}
            litterat={litterat}
            hinnoittelu={hinnoittelu}
            paluu={polku}
            muokkaa={searchParams.muokkaa}
            oletusLittera={searchParams.littera}
            lukittu={lukittu}
            naytaTyhjatLitterat
          />
          {!lukittu && (
            <form action={tallennaLittera} className="flex items-end gap-2 border-t border-line pt-3">
              <input type="hidden" name="paluu" value={polku} />
              <Kentta otsikko="Uusi littera: koodi">
                <input name="code" placeholder="esim. 3400" required className="field font-mono w-28" />
              </Kentta>
              <Kentta otsikko="Nimi">
                <input name="name" placeholder="esim. Kantavat rakenteet" required className="field" />
              </Kentta>
              <button className="btn btn-ghost btn-sm">Lisää littera</button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-4 sticky top-4">
          <div className="card p-5 flex flex-col gap-3">
            <KustannusErittely kustannus={kustannus} hinnoittelu={hinnoittelu} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm border-t border-line pt-2">
              <dt className="text-ink-2">Kate {maara(kate, 1)} %</dt>
              <dd className="text-right font-mono">{euro(Math.round(myynti - kustannus.yhteensaSentit))}</dd>
              <dt className="font-semibold">Myyntihinta alv 0 %</dt>
              <dd className="text-right font-mono font-semibold">{euro(Math.round(myynti))}</dd>
              <dt className="text-ink-2">Myyntihinta alv 25,5 %</dt>
              <dd className="text-right font-mono">{euro(Math.round(myynti * (1 + ALV)))}</dd>
              {rakennus.grossAreaM2 ? (
                <>
                  <dt className="text-ink-2">Omakustannus / B-m²</dt>
                  <dd className="text-right font-mono">{euro(Math.round(kustannus.yhteensaSentit / rakennus.grossAreaM2))}</dd>
                </>
              ) : null}
            </dl>
            {!lukittu && (
              <form action={asetaKate} className="flex items-end gap-2">
                <input type="hidden" name="buildingId" value={rakennus.id} />
                <input type="hidden" name="paluu" value={polku} />
                <Kentta otsikko="Kate %">
                  <input name="katePct" defaultValue={syoteLuku(kate)} inputMode="decimal" className="field w-24" />
                </Kentta>
                <button className="btn btn-ghost btn-sm">Aseta</button>
              </form>
            )}
          </div>
          {!lukittu && <PohjaLomakkeet rakennusId={rakennus.id} rakennusKoodi={rakennus.code} paluu={polku} riveja={rakennus.parts.length} />}
        </div>
      </div>
    </div>
  );
}
