// Rakennusten yhteiset palvelinkomponentit: rakennuksen perustiedot,
// määräluettelo (rakenneosa × määrä), kustannusyhteenveto ja
// materiaalitarve. Käytössä tarjouksen sivulla ja projektin
// Rakennukset- ja Materiaalitarve-sivuilla.
import { Fragment } from "react";
import Link from "next/link";
import { poistaMaararivi, tallennaRakennus, tallennaMaararivi } from "@/lib/actions/rakennukset";
import {
  KUSTANNUSLAJIT,
  RAKENNUKSEN_TILAT,
  MAARAN_LAHTEET,
  litterajarjestys,
  litteranNimi,
  type Hinnoittelu,
  type RakennusOsineen,
} from "@/lib/rakennukset";
import {
  laskeKustannus,
  rivinKoodi,
  rivinLaji,
  rivinLittera,
  rivinNimi,
  rivinYksikko,
  type KiinteaRivi,
  type Kustannus,
  type Materiaalitarve,
} from "@/lib/rakenteet";
import { euro, maara, syoteLuku, syotePvm } from "@/lib/muotoilu";
import { Kentta } from "@/components/projektinhallinta";

export interface RakenneosaValinta {
  id: string;
  code: string;
  name: string;
  unit: string;
  kind: string;
  littera?: { code: string; name: string } | null;
}

export function Tunnusluku({ otsikko, arvo, ala, korostus }: { otsikko: string; arvo: React.ReactNode; ala?: React.ReactNode; korostus?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-muted">{otsikko}</div>
      <div className={`font-heading text-lg font-bold mt-1 ${korostus ? "text-critical" : ""}`}>{arvo}</div>
      {ala && <div className="text-xs text-ink-2 mt-1">{ala}</div>}
    </div>
  );
}

/** Rakennuksen perustiedot: uusi rakennus (projectId tai offerId) tai olemassa olevan muokkaus. */
export function RakennusLomake({
  rakennus,
  projectId,
  offerId,
  paluu,
  laajat = false,
}: {
  rakennus?: RakennusOsineen | null;
  projectId?: string;
  offerId?: string;
  paluu: string;
  /** Näytä myös tuotannon kentät (tila, toimitus, BIM). Tarjouksella riittävät perustiedot. */
  laajat?: boolean;
}) {
  return (
    <form action={tallennaRakennus} className="grid grid-cols-4 gap-3 items-end">
      {rakennus && <input type="hidden" name="id" value={rakennus.id} />}
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      {offerId && <input type="hidden" name="offerId" value={offerId} />}
      <input type="hidden" name="paluu" value={paluu} />
      <Kentta otsikko="Tunnus *">
        <input name="code" defaultValue={rakennus?.code} placeholder="esim. A tai MOD1" required className="field" />
      </Kentta>
      <Kentta otsikko="Nimi">
        <input name="name" defaultValue={rakennus?.name ?? ""} placeholder="esim. Paritalo A" className="field" />
      </Kentta>
      <Kentta otsikko="Talotyyppi">
        <input name="buildingType" defaultValue={rakennus?.buildingType ?? ""} placeholder="esim. Majoitusmoduuli" className="field" />
      </Kentta>
      <Kentta otsikko="Bruttoala (m²)">
        <input name="grossAreaM2" defaultValue={syoteLuku(rakennus?.grossAreaM2)} inputMode="decimal" className="field" />
      </Kentta>
      {laajat && (
        <>
          <Kentta otsikko="Tila">
            <select name="status" defaultValue={rakennus?.status ?? "SUUNNITTELU"} className="field">
              {Object.entries(RAKENNUKSEN_TILAT).map(([arvo, nimi]) => (
                <option key={arvo} value={arvo}>
                  {nimi}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Suunniteltu toimitus">
            <input name="plannedDelivery" type="date" defaultValue={syotePvm(rakennus?.plannedDelivery)} className="field" />
          </Kentta>
          <Kentta otsikko="Toimitettu">
            <input name="deliveredAt" type="date" defaultValue={syotePvm(rakennus?.deliveredAt)} className="field" />
          </Kentta>
          <Kentta otsikko="Osoite">
            <input name="address" defaultValue={rakennus?.address ?? ""} className="field" />
          </Kentta>
          <Kentta otsikko="BIM-malli (linkki)" leveys={2}>
            <input name="bimModelUrl" type="url" defaultValue={rakennus?.bimModelUrl ?? ""} placeholder="https://… (IFC, Trimble Connect, Dalux)" className="field" />
          </Kentta>
          <Kentta otsikko="BIM GUID (IfcBuilding)" leveys={2}>
            <input name="bimGuid" defaultValue={rakennus?.bimGuid ?? ""} className="field font-mono" />
          </Kentta>
        </>
      )}
      <Kentta otsikko="Huomiot" leveys={3}>
        <input name="notes" defaultValue={rakennus?.notes ?? ""} className="field" />
      </Kentta>
      <button className="btn btn-primary justify-self-start">{rakennus ? "Tallenna" : "Lisää rakennus"}</button>
    </form>
  );
}

/**
 * Rakennuksen määräluettelo (rakenneosa × määrä) taulukkona ja lisäys- tai muokkauslomake.
 * Muokattava osa valitaan ?muokkaa=<osan id> -parametrilla.
 */
/** Valintalistan ryhmät: litteroittain; litterattomat lajin mukaan (Rakenteet, Ostonimikkeet). */
function valintaryhmat(osat: RakenneosaValinta[]): [string, RakenneosaValinta[]][] {
  const ryhmat = new Map<string, { littera?: { code: string } | null; osat: RakenneosaValinta[] }>();
  for (const t of osat) {
    const otsikko = t.littera ? litteranNimi(t.littera) : t.kind === "OSTONIMIKE" ? "Ostonimikkeet" : "Rakenteet";
    const r = ryhmat.get(otsikko) ?? { littera: t.littera, osat: [] };
    r.osat.push(t);
    ryhmat.set(otsikko, r);
  }
  return [...ryhmat.entries()].sort(([, a], [, b]) => litterajarjestys(a.littera, b.littera)).map(([o, r]) => [o, r.osat]);
}

type Rivi = RakennusOsineen["parts"][number];

/** Rivin valinta-arvo lomakkeelle: "osa:<id>", "nimike:<id>" tai "" (vapaa rivi). */
function kohdeArvo(o?: Rivi): string {
  if (!o) return "";
  if (o.structureTypeId) return `osa:${o.structureTypeId}`;
  if (o.productId) return `nimike:${o.productId}`;
  return "";
}

/**
 * Rakennuksen määräluettelo litteroittain (tarjouslaskennan rivit) ja
 * lisäys- tai muokkauslomake. Rivi on rakenneosa, nimike tai vapaa rivi;
 * rivin oma hinta, littera ja kustannuslaji korvaavat oletukset.
 * Muokattava rivi valitaan ?muokkaa=<rivin id> -parametrilla, ja uuden
 * rivin litteran voi esivalita ?littera=<koodi> -parametrilla.
 */
export function Maaraluettelo({
  rakennus,
  rakenneosat,
  nimikkeet = [],
  litterat = [],
  hinnoittelu,
  paluu,
  muokkaa,
  oletusLittera,
  lukittu = false,
  naytaTyhjatLitterat = false,
}: {
  rakennus: RakennusOsineen;
  rakenneosat: RakenneosaValinta[];
  nimikkeet?: { id: string; code: string; name: string; unit: string }[];
  litterat?: { id: string; code: string; name: string }[];
  hinnoittelu: Hinnoittelu;
  paluu: string;
  muokkaa?: string;
  oletusLittera?: string;
  lukittu?: boolean;
  /** Näytä kaikki litterat, myös tyhjät (manuaalinen laskenta: rivin voi lisätä mihin tahansa litteraan). */
  naytaTyhjatLitterat?: boolean;
}) {
  const muokattava = rakennus.parts.find((o) => o.id === muokkaa);
  const ankkuri = `osat-${rakennus.id}`;
  const lomake = `lisaa-${rakennus.id}`;
  const erotin = paluu.includes("?") ? "&" : "?";
  const rivinHinta = (o: Rivi) => laskeKustannus([o], hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit).yhteensaSentit;

  // Litteroittain (Talo 80), litterattomat viimeisenä; litteran sisällä rivien järjestys.
  const ryhmat = new Map<string, { littera: { code: string; name: string } | null; rivit: Rivi[] }>();
  if (naytaTyhjatLitterat) for (const l of litterat) ryhmat.set(l.code, { littera: l, rivit: [] });
  for (const o of rakennus.parts) {
    const l = rivinLittera(o);
    const avain = l?.code ?? "";
    const r = ryhmat.get(avain) ?? { littera: l, rivit: [] };
    r.rivit.push(o);
    ryhmat.set(avain, r);
  }
  const litteroittain = [...ryhmat.values()].sort((a, b) => litterajarjestys(a.littera, b.littera));
  const sarakkeita = lukittu ? 6 : 7;
  const litteraIdKoodilla = (koodi?: string) => litterat.find((l) => l.code === koodi)?.id ?? "";
  const lomakkeenLittera = muokattava ? muokattava.litteraId ?? "" : litteraIdKoodilla(oletusLittera);

  return (
    <div id={ankkuri} className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
            <th className="py-2 pr-3">Rivi</th>
            <th className="py-2 pr-3 text-right">Määrä</th>
            <th className="py-2 pr-3">Sijainti</th>
            <th className="py-2 pr-3">Lähde</th>
            <th className="py-2 pr-3 text-right">Yks. hinta</th>
            <th className="py-2 pr-3 text-right">Yhteensä</th>
            {!lukittu && <th className="py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {litteroittain.map(({ littera, rivit }) => (
            <Fragment key={littera?.code ?? "-"}>
              <tr className="bg-surface-raised border-b border-line">
                <td colSpan={5} className="py-1.5 pr-3 pl-1 font-mono text-xs font-semibold uppercase">
                  {litteranNimi(littera)}
                  {!lukittu && littera && litterat.length > 0 && (
                    <Link href={`${paluu}${erotin}littera=${littera.code}#${lomake}`} className="ml-3 normal-case font-sans font-normal underline text-ink-2">
                      + rivi
                    </Link>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs font-semibold">
                  {rivit.length ? euro(rivit.reduce((s, o) => s + rivinHinta(o), 0)) : "–"}
                </td>
                {!lukittu && <td />}
              </tr>
              {rivit.map((o) => {
                const yhteensa = rivinHinta(o);
                const laji = rivinLaji(o);
                const koodi = rivinKoodi(o);
                return (
                  <tr key={o.id} className={`border-b border-line last:border-0 ${o.id === muokkaa ? "bg-surface-raised" : ""}`}>
                    <td className="py-2 pr-3">
                      {koodi &&
                        (o.structureType ? (
                          <Link href={`/tuotehallinta/rakenneosat/${o.structureType.id}`} className="font-mono hover:underline mr-1">
                            {koodi}
                          </Link>
                        ) : (
                          <Link href={`/tuotehallinta/nimikkeisto/${o.productId}`} className="font-mono hover:underline mr-1">
                            {koodi}
                          </Link>
                        ))}
                      <span className={koodi ? "text-ink-2" : ""}>{rivinNimi(o)}</span>
                      {!o.structureType && o.product && <span className="badge muted ml-2">nimike</span>}
                      {!o.structureType && !o.product && <span className="badge muted ml-2">vapaa rivi</span>}
                      {laji === "TEHDASTYO" && <span className="badge info ml-2">tehdastyö</span>}
                      {laji === "ALIURAKKA" && <span className="badge muted ml-2">aliurakka</span>}
                      {o.unitPriceCents !== null && (o.structureType || o.product) && <span className="badge info ml-2">oma hinta</span>}
                      {(o.structureType || o.product) && o.description && <div className="text-xs text-ink-2">{o.description}</div>}
                      {o.notes && <div className="text-xs text-ink-muted">{o.notes}</div>}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                      {maara(o.quantity)} {rivinYksikko(o)}
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{o.location ?? "–"}</td>
                    <td className="py-2 pr-3">
                      <span className={`badge ${o.source === "BIM" ? "info" : o.source === "LASKURI" ? "ok" : "muted"}`} title={o.bimGuid ?? undefined}>
                        {MAARAN_LAHTEET[o.source]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{o.quantity ? euro(Math.round(yhteensa / o.quantity)) : "–"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{euro(yhteensa)}</td>
                    {!lukittu && (
                      <td className="py-2 text-right whitespace-nowrap">
                        <Link
                          href={`${paluu}${erotin}muokkaa=${o.id}#${lomake}`}
                          className="text-xs underline mr-3"
                          title={o.source === "LASKURI" ? "Muokattu laskurin rivi muuttuu käsin syötetyksi" : undefined}
                        >
                          Muokkaa
                        </Link>
                        <form action={poistaMaararivi} className="inline">
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="paluu" value={paluu} />
                          <button className="text-xs text-ink-muted hover:text-critical">Poista</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </Fragment>
          ))}
          {rakennus.parts.length === 0 && !naytaTyhjatLitterat && (
            <tr>
              <td colSpan={sarakkeita} className="py-4 text-center text-ink-muted">
                Määräluettelo on tyhjä. Laske se tarjouslaskurilla, ota pohjaksi tallennettu laskenta, lisää rivejä käsin tai tuo
                BIM-mallin määräluettelo.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {!lukittu && (
        <form
          id={lomake}
          key={(muokattava?.id ?? "uusi") + (oletusLittera ?? "")}
          action={tallennaMaararivi}
          className="grid grid-cols-6 gap-2 items-end border-t border-line pt-3"
        >
          {muokattava && <input type="hidden" name="id" value={muokattava.id} />}
          {muokattava && <input type="hidden" name="source" value={muokattava.source} />}
          <input type="hidden" name="buildingId" value={rakennus.id} />
          <input type="hidden" name="paluu" value={paluu} />
          <Kentta otsikko={muokattava ? "Muokkaa riviä" : "Lisää rivi"} leveys={2}>
            <select name="kohde" defaultValue={kohdeArvo(muokattava)} className="field">
              <option value="">Vapaa rivi (oma kuvaus ja hinta)</option>
              {valintaryhmat(rakenneosat).map(([otsikko, osat]) => (
                <optgroup key={otsikko} label={`Rakenneosat · ${otsikko}`}>
                  {osat.map((t) => (
                    <option key={t.id} value={`osa:${t.id}`}>
                      {t.code} {t.name} ({t.unit})
                    </option>
                  ))}
                </optgroup>
              ))}
              {nimikkeet.length > 0 && (
                <optgroup label="Nimikkeet (hinta hinnastosta)">
                  {nimikkeet.map((n) => (
                    <option key={n.id} value={`nimike:${n.id}`}>
                      {n.code} {n.name} ({n.unit})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Kentta>
          <Kentta otsikko="Määrä *">
            <input name="quantity" defaultValue={syoteLuku(muokattava?.quantity)} inputMode="decimal" required className="field" />
          </Kentta>
          <Kentta otsikko="Yksikkö (vapaa rivi)">
            <input name="unit" defaultValue={muokattava?.unit ?? ""} placeholder="kpl, m2, erä" className="field" />
          </Kentta>
          <Kentta otsikko="Oma yksikköhinta (€)">
            <input
              name="unitPriceEuros"
              defaultValue={muokattava?.unitPriceCents === null || !muokattava ? "" : syoteLuku(muokattava.unitPriceCents / 100)}
              inputMode="decimal"
              placeholder="tyhjä = kirjastosta"
              className="field"
            />
          </Kentta>
          <Kentta otsikko="Kustannuslaji">
            <select name="costType" defaultValue={muokattava?.costType ?? ""} className="field">
              <option value="">Oletus</option>
              {Object.entries(KUSTANNUSLAJIT).map(([arvo, nimi]) => (
                <option key={arvo} value={arvo}>
                  {nimi}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Kuvaus (vapaa rivi: nimi)" leveys={2}>
            <input name="description" defaultValue={muokattava?.description ?? ""} className="field" />
          </Kentta>
          {litterat.length > 0 && (
            <Kentta otsikko="Littera">
              <select name="litteraId" defaultValue={lomakkeenLittera} className="field">
                <option value="">Rakenneosan littera</option>
                {litterat.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} {l.name}
                  </option>
                ))}
              </select>
            </Kentta>
          )}
          <Kentta otsikko="Sijainti">
            <input name="location" defaultValue={muokattava?.location ?? ""} placeholder="esim. 1. krs" className="field" />
          </Kentta>
          <Kentta otsikko="Huomiot">
            <input name="notes" defaultValue={muokattava?.notes ?? ""} className="field" />
          </Kentta>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm">{muokattava ? "Tallenna" : "Lisää"}</button>
            {(muokattava || oletusLittera) && (
              <Link href={`${paluu}#${ankkuri}`} className="btn btn-ghost btn-sm">
                Peru
              </Link>
            )}
          </div>
        </form>
      )}
      {!lukittu && rakenneosat.length === 0 && nimikkeet.length === 0 && (
        <p className="text-xs text-ink-muted">
          Kirjastossa ei ole rakenneosia, joten vain vapaat rivit ovat käytössä:{" "}
          <Link href="/tuotehallinta/rakenneosat" className="underline">
            Tuotehallinta &raquo; Rakenneosat
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** Omakustannus eriteltynä ja varoitukset puuttuvista hinnoista. */
export function KustannusErittely({ kustannus, hinnoittelu }: { kustannus: Kustannus; hinnoittelu: Hinnoittelu }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="text-ink-2">Materiaalit ja ostot</dt>
        <dd className="text-right font-mono">{euro(kustannus.materiaalitSentit)}</dd>
        <dt className="text-ink-2">
          Tehdastyö
          {kustannus.tunnit > 0 && (
            <>
              {" "}
              (sis. {maara(kustannus.tunnit, 1)} h
              {hinnoittelu.tuntihintaSentit !== null && <> × {euro(hinnoittelu.tuntihintaSentit)}</>})
            </>
          )}
        </dt>
        <dd className="text-right font-mono">{euro(kustannus.tyoSentit)}</dd>
        {kustannus.aliurakkaSentit > 0 && (
          <>
            <dt className="text-ink-2">Aliurakat</dt>
            <dd className="text-right font-mono">{euro(kustannus.aliurakkaSentit)}</dd>
          </>
        )}
        <dt className="font-semibold border-t border-line pt-1">Omakustannus (alv 0 %)</dt>
        <dd className="text-right font-mono font-semibold border-t border-line pt-1">{euro(kustannus.yhteensaSentit)}</dd>
      </dl>
      <p className="text-xs text-ink-muted">
        Hinnasto:{" "}
        {hinnoittelu.hinnasto ? (
          <Link href="/tuotehallinta/hinnastot" className="underline">
            {hinnoittelu.hinnasto.name}
          </Link>
        ) : (
          "ei voimassa olevaa hinnastoa"
        )}
      </p>
      {kustannus.tuntihintaPuuttuu && (
        <p className="text-xs text-critical">Hinnastolta puuttuu tuntihinta, joten työ ei ole summassa.</p>
      )}
      {kustannus.puuttuvatHinnat.length > 0 && (
        <p className="text-xs text-critical">
          Hinta puuttuu {kustannus.puuttuvatHinnat.length} nimikkeeltä, eivätkä ne ole summassa:{" "}
          {kustannus.puuttuvatHinnat.map((n) => n.code).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Materiaalitarve nimikkeittäin hinnaston hinnoilla. */
export function MateriaalitarveTaulukko({ tarve, hinnoittelu }: { tarve: Materiaalitarve[]; hinnoittelu: Hinnoittelu }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
          <th className="p-3">Nimike</th>
          <th className="p-3 text-right">Määrä</th>
          <th className="p-3">Rakenteista</th>
          <th className="p-3 text-right">Yksikköhinta</th>
          <th className="p-3 text-right">Yhteensä</th>
        </tr>
      </thead>
      <tbody>
        {tarve.map((t) => {
          const hinta = hinnoittelu.hinnat.get(t.nimike.id);
          return (
            <tr key={t.nimike.id} className="border-b border-line last:border-0">
              <td className="p-3">
                <Link href={`/tuotehallinta/nimikkeisto/${t.nimike.id}`} className="font-mono hover:underline">
                  {t.nimike.code}
                </Link>{" "}
                <span className="text-ink-2">{t.nimike.name}</span>
              </td>
              <td className="p-3 text-right font-mono whitespace-nowrap">
                {maara(t.maara)} {t.nimike.unit}
              </td>
              <td className="p-3 text-ink-2 font-mono text-xs">{t.rakenteet.join(", ")}</td>
              <td className="p-3 text-right font-mono">{hinta === undefined ? <span className="text-critical">puuttuu</span> : euro(hinta)}</td>
              <td className="p-3 text-right font-mono">{hinta === undefined ? "–" : euro(Math.round(t.maara * hinta))}</td>
            </tr>
          );
        })}
        {tarve.length === 0 && (
          <tr>
            <td colSpan={5} className="p-6 text-center text-ink-muted">
              Ei materiaalitarvetta. Lisää rakennusten määräluetteloihin rakenneosia, joilla on materiaaliluettelo tai nimike.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Kiinteähintaiset rivit (esim. tarjouslaskurin ja vapaat rivit) litteroittain välisummineen. */
export function KiinteatRivitTaulukko({ rivit }: { rivit: KiinteaRivi[] }) {
  const ryhmat = new Map<string, KiinteaRivi[]>();
  for (const r of rivit) ryhmat.set(litteranNimi(r.littera), [...(ryhmat.get(litteranNimi(r.littera)) ?? []), r]);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
          <th className="p-3">Rivi</th>
          <th className="p-3">Kustannuslaji</th>
          <th className="p-3 text-right">Määrä</th>
          <th className="p-3 text-right">Yks. hinta</th>
          <th className="p-3 text-right">Yhteensä</th>
        </tr>
      </thead>
      <tbody>
        {[...ryhmat.entries()].map(([otsikko, rr]) => (
          <Fragment key={otsikko}>
            <tr className="bg-surface-raised border-b border-line">
              <td colSpan={4} className="px-3 py-1.5 font-mono text-xs font-semibold uppercase">
                {otsikko}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold">{euro(Math.round(rr.reduce((s, r) => s + r.summaSentit, 0)))}</td>
            </tr>
            {rr.map((r) => (
              <tr key={r.avain} className="border-b border-line">
                <td className="p-3">
                  {r.rakenneosaId ? (
                    <Link href={`/tuotehallinta/rakenneosat/${r.rakenneosaId}`} className="font-mono hover:underline mr-1">
                      {r.koodi}
                    </Link>
                  ) : (
                    <span className="badge muted mr-2">vapaa rivi</span>
                  )}
                  <span className={r.rakenneosaId ? "text-ink-2" : ""}>{r.nimi}</span>
                </td>
                <td className="p-3 text-ink-2">{KUSTANNUSLAJIT[r.laji]}</td>
                <td className="p-3 text-right font-mono whitespace-nowrap">
                  {maara(r.maara)} {r.yksikko}
                </td>
                <td className="p-3 text-right font-mono">{r.maara ? euro(Math.round(r.summaSentit / r.maara)) : "–"}</td>
                <td className="p-3 text-right font-mono">{euro(Math.round(r.summaSentit))}</td>
              </tr>
            ))}
          </Fragment>
        ))}
        {rivit.length === 0 && (
          <tr>
            <td colSpan={5} className="p-6 text-center text-ink-muted">
              Ei kiinteähintaisia rivejä.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
