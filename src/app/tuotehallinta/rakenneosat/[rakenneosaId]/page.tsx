import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  poistaRakenneosanMateriaali,
  tallennaOstonimike,
  tallennaRakenne,
  tallennaRakenneosanMateriaali,
} from "@/lib/actions/rakenteet";
import {
  KUSTANNUSLAJIT,
  RAKENNEKATEGORIAT,
  RAKENNEOSAN_LAJIT,
  RAKENNEOSA_INCLUDE,
  haeHinnoittelu,
  litterajarjestys,
  litteranNimi,
  rakennuksenNimi,
} from "@/lib/rakennukset";
import { LASKENTARIVIT } from "@/lib/tarjouslaskenta";
import { materiaalienYksikkokustannus, yksikkokustannus } from "@/lib/rakenteet";
import { euro, maara, syoteLuku } from "@/lib/muotoilu";
import { Kentta, Virhe } from "@/components/projektinhallinta";
import { KustannusErittely } from "@/components/rakennukset";

export const dynamic = "force-dynamic";

const KIRJASTO = "/tuotehallinta/rakenneosat";

export default async function RakenneosaPage({
  params,
  searchParams,
}: {
  params: { rakenneosaId: string };
  searchParams: { virhe?: string; muokkaa?: string };
}) {
  const [osa, nimikkeet, hinnoittelu, litterat] = await Promise.all([
    prisma.structureType.findUnique({
      where: { id: params.rakenneosaId },
      include: {
        ...RAKENNEOSA_INCLUDE,
        parts: {
          include: { building: { include: { project: true, offer: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    }),
    prisma.product.findMany({ orderBy: { code: "asc" } }),
    haeHinnoittelu(),
    prisma.littera.findMany({ orderBy: { code: "asc" } }),
  ]);
  litterat.sort((a, b) => litterajarjestys(a, b));
  if (!osa) notFound();

  const polku = `${KIRJASTO}/${osa.id}`;
  const ostonimike = osa.kind === "OSTONIMIKE";
  const kustannus = yksikkokustannus(osa, hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit);
  const muokattava = osa.materials.find((m) => m.id === searchParams.muokkaa);
  const nimike = ostonimike ? osa.materials[0]?.product : undefined;
  const kiintea = osa.unitPriceCents !== null;
  // Kiinteän hinnan vertailu materiaaliluettelon hinnaston hintaan.
  const materiaalitK = kiintea && osa.materials.length ? materiaalienYksikkokustannus(osa, hinnoittelu.hinnat) : null;
  const materiaalit = materiaalitK
    ? {
        sentit: materiaalitK.yhteensaSentit,
        puuttuu: materiaalitK.puuttuvatHinnat.length > 0,
        ero: materiaalitK.yhteensaSentit ? (osa.unitPriceCents! - materiaalitK.yhteensaSentit) / materiaalitK.yhteensaSentit : 0,
      }
    : null;
  const laskurinRivi = osa.laskuriAvain ? LASKENTARIVIT.find((l) => l.avain === osa.laskuriAvain) : undefined;

  const yhteisetKentat = (
    <>
      <Kentta otsikko="Littera">
        <select name="litteraId" defaultValue={osa.litteraId ?? ""} className="field">
          <option value="">Ei litteraa</option>
          {litterat.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} {l.name}
            </option>
          ))}
        </select>
      </Kentta>
      <Kentta otsikko="Kategoria">
        <select name="category" defaultValue={osa.category} className="field">
          {Object.entries(RAKENNEKATEGORIAT).map(([arvo, nimi]) => (
            <option key={arvo} value={arvo}>
              {nimi}
            </option>
          ))}
        </select>
      </Kentta>
      <Kentta otsikko={ostonimike ? "Asennustunnit / yksikkö" : "Työtunnit / yksikkö"}>
        <input name="laborHoursPerUnit" defaultValue={syoteLuku(osa.laborHoursPerUnit)} inputMode="decimal" className="field" />
      </Kentta>
      <Kentta otsikko="BIM-tyyppinimi">
        <input name="bimTypeName" defaultValue={osa.bimTypeName ?? ""} className="field" />
      </Kentta>
      <Kentta otsikko="Käytössä">
        <select name="active" defaultValue={osa.active ? "kylla" : "ei"} className="field">
          <option value="kylla">Kyllä</option>
          <option value="ei">Ei (piilotetaan valinnoista)</option>
        </select>
      </Kentta>
      <Kentta otsikko="Kuvaus" leveys={3}>
        <input name="description" defaultValue={osa.description ?? ""} className="field" />
      </Kentta>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          <Link href={KIRJASTO} className="hover:text-ink">
            Tuotehallinta &raquo; Rakenneosat
          </Link>{" "}
          &raquo; {osa.code}
        </p>
        <h1 className="text-2xl font-semibold">
          {osa.code} {osa.name}
        </h1>
        <p className="text-ink-2 text-sm mt-1">
          <span className={`badge ${ostonimike ? "info" : "muted"} mr-2`}>{RAKENNEOSAN_LAJIT[osa.kind]}</span>
          {laskurinRivi && <span className="badge ok mr-2">tarjouslaskurin rivi</span>}
          {litteranNimi(osa.littera)} ·{" "}
          {RAKENNEKATEGORIAT[osa.category]} · yksikkö {osa.unit} · {maara(osa.laborHoursPerUnit)}{" "}
          {ostonimike ? "asennustuntia" : "työtuntia"} / {osa.unit}
        </p>
      </div>

      <Virhe viesti={searchParams.virhe} />

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        {ostonimike ? (
          <div className="card p-5 flex flex-col gap-2">
            <h2 className="font-semibold">Nimike</h2>
            {nimike ? (
              <>
                <p className="text-sm">
                  <Link href={`/tuotehallinta/nimikkeisto/${nimike.id}`} className="font-mono hover:underline">
                    {nimike.code}
                  </Link>{" "}
                  {nimike.name} ({nimike.unit})
                </p>
                <p className="text-sm text-ink-2">
                  Hinta hinnastolla:{" "}
                  {hinnoittelu.hinnat.has(nimike.id) ? (
                    euro(hinnoittelu.hinnat.get(nimike.id))
                  ) : (
                    <span className="text-critical">puuttuu</span>
                  )}
                  . Ostonimike päätyy projektin materiaalitarpeeseen ja sieltä hankintasuunnitelmaan tällä nimikkeellä.
                </p>
              </>
            ) : (
              <p className="text-sm text-critical">Ostonimikkeeltä puuttuu nimike. Valitse se perustiedoista.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
          {kiintea && (
          <div className="card p-5 flex flex-col gap-2 text-sm">
            <h2 className="font-semibold">Kiinteä yksikköhinta</h2>
            <p>
              <span className="font-heading text-2xl font-bold">{euro(Math.round(osa.unitPriceCents!))}</span> / {osa.unit} ·{" "}
              {KUSTANNUSLAJIT[osa.costType]}
            </p>
            <p className="text-ink-2">
              Rivin hinta on määrä × kiinteä yksikköhinta. Materiaaliluettelo ei vaikuta hintaan, mutta siitä lasketaan
              materiaalitarve nimikkeittäin.{" "}
              {osa.materials.length > 0
                ? "Rakenneosa hankitaan nimikkeinä materiaalitarpeen kautta."
                : "Ilman materiaaliluetteloa rakenneosa hankitaan kokonaisuutena omana hankintarivinään litteroittain."}
            </p>
            {osa.materials.length > 0 && materiaalit && (
              <p className={Math.abs(materiaalit.ero) > 0.15 ? "text-critical" : "text-ink-2"}>
                Materiaalit hinnastolla {euro(materiaalit.sentit)} / {osa.unit}
                {materiaalit.puuttuu && " (osalta nimikkeistä puuttuu hinta)"} ·{" "}
                {materiaalit.ero >= 0 ? "kiinteä hinta ylittää" : "materiaalit ylittävät kiinteän hinnan"}{" "}
                {Math.abs(Math.round(materiaalit.ero * 100))} %
                {osa.costType !== "MATERIAALI" && " (kiinteä hinta on " + KUSTANNUSLAJIT[osa.costType].toLowerCase() + "a)"}
              </p>
            )}
            {laskurinRivi && (
              <p className="text-ink-2">
                Tarjouslaskurin rivi <span className="font-mono">{laskurinRivi.avain}</span>: laskuri laskee määrän rakennuksen
                syötteistä, ja käyttää tätä hintaa (laskurin oletus {laskurinRivi.hinta.toLocaleString("fi-FI")} €). Muuta hinta
                perustiedoista.
              </p>
            )}
          </div>
          )}
          <div className="card p-5 flex flex-col gap-3">
            <h2 className="font-semibold">Materiaaliluettelo per {osa.unit}</h2>
            {kiintea && <p className="text-xs text-ink-2 -mt-2">Vain materiaalitarvetta ja hankintoja varten; ei vaikuta hintaan.</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
                  <th className="py-2 pr-3">Nimike</th>
                  <th className="py-2 pr-3 text-right">Menekki</th>
                  <th className="py-2 pr-3 text-right">Hukka</th>
                  <th className="py-2 pr-3 text-right">Hinta / {osa.unit}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {osa.materials.map((m) => {
                  const hinta = hinnoittelu.hinnat.get(m.productId);
                  const menekki = m.quantityPerUnit * (1 + m.wastePct / 100);
                  return (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-mono">{m.product.code}</span> <span className="text-ink-2">{m.product.name}</span>
                        {m.notes && <div className="text-xs text-ink-muted">{m.notes}</div>}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                        {maara(m.quantityPerUnit, 3)} {m.product.unit}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{maara(m.wastePct, 1)} %</td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {hinta === undefined ? <span className="text-critical">puuttuu</span> : euro(Math.round(menekki * hinta))}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <Link href={`${polku}?muokkaa=${m.id}#materiaali`} className="text-xs underline mr-3">
                          Muokkaa
                        </Link>
                        <form action={poistaRakenneosanMateriaali} className="inline">
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="paluu" value={polku} />
                          <button className="text-xs text-ink-muted hover:text-critical">Poista</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {osa.materials.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-ink-muted">
                      Ei vielä materiaaleja.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <form
              id="materiaali"
              key={muokattava?.id ?? "uusi"}
              action={tallennaRakenneosanMateriaali}
              className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2 items-end"
            >
              <input type="hidden" name="structureTypeId" value={osa.id} />
              <input type="hidden" name="paluu" value={polku} />
              <Kentta otsikko={muokattava ? "Muokkaa materiaalia" : "Lisää materiaali"}>
                <select name="productId" defaultValue={muokattava?.productId ?? ""} required className="field">
                  <option value="" disabled>
                    Valitse nimike
                  </option>
                  {nimikkeet.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.code} {n.name} ({n.unit})
                    </option>
                  ))}
                </select>
              </Kentta>
              <Kentta otsikko={`Menekki / ${osa.unit}`}>
                <input name="quantityPerUnit" defaultValue={syoteLuku(muokattava?.quantityPerUnit)} inputMode="decimal" required className="field" />
              </Kentta>
              <Kentta otsikko="Hukka-%">
                <input name="wastePct" defaultValue={syoteLuku(muokattava?.wastePct ?? 0)} inputMode="decimal" className="field" />
              </Kentta>
              <Kentta otsikko="Huomiot">
                <input name="notes" defaultValue={muokattava?.notes ?? ""} className="field" />
              </Kentta>
              <button className="btn btn-secondary btn-sm">{muokattava ? "Tallenna" : "Lisää"}</button>
            </form>
            {nimikkeet.length === 0 && (
              <p className="text-xs text-ink-muted">
                Lisää ensin nimikkeitä{" "}
                <Link href="/tuotehallinta/nimikkeisto" className="underline">
                  nimikkeistöön
                </Link>
                .
              </p>
            )}
          </div>
          </div>
        )}

        <div className="card p-5 flex flex-col gap-3">
          <h2 className="font-semibold">Omakustannus / {osa.unit}</h2>
          <KustannusErittely kustannus={kustannus} hinnoittelu={hinnoittelu} />
        </div>
      </div>

      <details className="card p-5" open={!!searchParams.virhe && !muokattava}>
        <summary className="cursor-pointer font-heading font-semibold">Muokkaa perustietoja</summary>
        {ostonimike ? (
          <form action={tallennaOstonimike} className="grid grid-cols-4 gap-3 items-end mt-4">
            <input type="hidden" name="id" value={osa.id} />
            <input type="hidden" name="paluu" value={polku} />
            <Kentta otsikko="Nimike *" leveys={2}>
              <select name="productId" defaultValue={nimike?.id ?? ""} required className="field">
                <option value="" disabled>
                  Valitse nimikkeistöstä
                </option>
                {nimikkeet.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code} {n.name} ({n.unit})
                  </option>
                ))}
              </select>
            </Kentta>
            <Kentta otsikko="Koodi *">
              <input name="code" defaultValue={osa.code} required className="field font-mono" />
            </Kentta>
            <Kentta otsikko="Nimi">
              <input name="name" defaultValue={osa.name} className="field" />
            </Kentta>
            {yhteisetKentat}
            <button className="btn btn-primary justify-self-start">Tallenna</button>
          </form>
        ) : (
          <form action={tallennaRakenne} className="grid grid-cols-4 gap-3 items-end mt-4">
            <input type="hidden" name="id" value={osa.id} />
            <input type="hidden" name="paluu" value={polku} />
            <Kentta otsikko="Koodi *">
              <input name="code" defaultValue={osa.code} required className="field font-mono" />
            </Kentta>
            <Kentta otsikko="Nimi *" leveys={2}>
              <input name="name" defaultValue={osa.name} required className="field" />
            </Kentta>
            <Kentta otsikko="Yksikkö">
              <select name="unit" defaultValue={osa.unit} className="field">
                {[...new Set(["m2", "jm", "kpl", "erä", "h", "€", osa.unit])].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Kentta>
            <Kentta otsikko="Kiinteä yksikköhinta (€)">
              <input
                name="unitPriceEuros"
                defaultValue={osa.unitPriceCents === null ? "" : String(osa.unitPriceCents / 100).replace(".", ",")}
                inputMode="decimal"
                placeholder="tyhjä = materiaaliluettelosta"
                className="field"
              />
            </Kentta>
            <Kentta otsikko="Kustannuslaji">
              <select name="costType" defaultValue={osa.costType} className="field">
                {Object.entries(KUSTANNUSLAJIT).map(([arvo, nimi]) => (
                  <option key={arvo} value={arvo}>
                    {nimi}
                  </option>
                ))}
              </select>
            </Kentta>
            {yhteisetKentat}
            <button className="btn btn-primary justify-self-start">Tallenna</button>
          </form>
        )}
      </details>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Käytössä rakennuksissa</h2>
        {osa.parts.length === 0 ? (
          <p className="text-sm text-ink-muted">Rakenneosaa ei ole vielä käytetty.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {osa.parts.map((o) => {
              const r = o.building;
              const href = r.projectId ? `/projektit/${r.projectId}/rakennukset/${r.id}` : `/asiakkuuksien-hallinta/tarjoukset/${r.offerId}`;
              return (
                <li key={o.id} className="py-2 flex justify-between gap-3">
                  <Link href={href} className="hover:underline">
                    {r.project ? r.project.name : `Tarjous: ${r.offer?.title ?? "–"}`} · {rakennuksenNimi(r)}
                  </Link>
                  <span className="font-mono">
                    {maara(o.quantity)} {osa.unit}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
