import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  asetaVaihe,
  poistaHankintarivi,
  siirraSeuraavaanVaiheeseen,
  tallennaHankintarivi,
} from "@/lib/actions/projektinhallinta";
import { haeHankinnat, type HankintariviLaskettu } from "@/lib/projektinhallinta";
import { VAIHEET, onPaattynyt, seuraavaVaihe, vaiheenNimi, type Vaihe } from "@/lib/hankinta";
import { isoViikko } from "@/lib/projektiaikataulu";
import { euro, lyhytPvm, pvm, syoteEuro, syotePvm, viikko } from "@/lib/muotoilu";
import { HenkiloValinta, Kentta, Takaraja, Virhe, ProjektinExceltuonti } from "@/components/projektinhallinta";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";

export const dynamic = "force-dynamic";

type Haku = {
  virhe?: string;
  muokkaa?: string;
  uusi?: string;
  vaihe?: string;
  henkilo?: string;
  tyyppi?: string;
  tehtava?: string;
  haku?: string;
  kaikki?: string;
};

function suodata(rivit: HankintariviLaskettu[], h: Haku) {
  const sana = h.haku?.toLowerCase();
  return rivit.filter(
    (r) =>
      (h.kaikki || !onPaattynyt(r.phase as Vaihe) || h.vaihe) &&
      (!h.vaihe || r.phase === h.vaihe) &&
      (!h.henkilo || (h.henkilo === "ei" ? !r.assigneeId : r.assigneeId === h.henkilo)) &&
      (!h.tyyppi || r.kind === h.tyyppi) &&
      (!h.tehtava || r.scheduleTaskCode === h.tehtava) &&
      (!sana || [r.description, r.littera, r.supplier, r.notes].some((x) => x?.toLowerCase().includes(sana)))
  );
}

/** Kaikki vaiheiden takarajat yhdellä rivillä; nykyinen vaihe korostettuna. */
function Takarajarivi({ r }: { r: HankintariviLaskettu }) {
  if (!r.takarajat) return null;
  const t = r.takarajat;
  const osat: [Vaihe, string, Date][] = [
    ["AINEISTO", "A", t.aineisto],
    ["PYYNTO", "P", t.pyynto],
    ["TARJOUS", "T", t.tarjous],
    ["VERTAILU", "V", t.vertailu],
    ["SOPIMUS", "S", t.sopimus],
  ];
  return (
    <div className="text-[11px] font-mono text-ink-muted mt-0.5">
      {osat.map(([v, kirjain, d], i) => (
        <span key={v} className={`whitespace-nowrap ${r.phase === v ? "text-ink font-semibold" : ""}`} title={`${vaiheenNimi(v)}: ${pvm(d)}`}>
          {i > 0 && " · "}
          {kirjain} {lyhytPvm(d)}
        </span>
      ))}
    </div>
  );
}

export default async function HankintasuunnitelmaPage({
  params,
  searchParams,
}: {
  params: { projektiId: string };
  searchParams: Haku;
}) {
  const projectId = params.projektiId;
  const polku = `/projektit/${projectId}/hankintasuunnitelma`;
  const tanaan = new Date();
  const [{ aikataulu, rivit }, henkilot] = await Promise.all([
    haeHankinnat(projectId, tanaan),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  const nakyvat = suodata(rivit, searchParams);
  const muokattava = rivit.find((r) => r.id === searchParams.muokkaa);
  const avoimet = rivit.filter((r) => !onPaattynyt(r.phase as Vaihe));
  const myohassa = avoimet.filter((r) => r.kiire === "myohassa").length;
  const sovittuja = rivit.filter((r) => ["TOIMITUS", "VALMIS"].includes(r.phase)).length;
  const kustannus = rivit.reduce((s, r) => s + (r.costCents ?? 0), 0);
  const lomakeAuki = !!muokattava || !!searchParams.uusi || !!searchParams.virhe || rivit.length === 0;
  const suodattimet = new URLSearchParams(
    Object.entries(searchParams).filter(([k, v]) => v && !["virhe", "muokkaa", "uusi"].includes(k)) as [string, string][]
  ).toString();
  const paluu = suodattimet ? `${polku}?${suodattimet}` : polku;
  const suodatettu = ["vaihe", "henkilo", "tyyppi", "tehtava", "haku", "kaikki"].some((k) => searchParams[k as keyof Haku]);

  // Tulevat toimitukset: sovitut toimituspäivät tällä ja kolmella seuraavalla viikolla (Excelin yhteenveto).
  const tamaViikko = isoViikko(tanaan);
  const viikot = Array.from({ length: 4 }, (_, i) => {
    const maanantai = new Date(tanaan.getFullYear(), tanaan.getMonth(), tanaan.getDate() - ((tanaan.getDay() + 6) % 7) + i * 7);
    const sunnuntai = new Date(maanantai.getFullYear(), maanantai.getMonth(), maanantai.getDate() + 6, 23, 59);
    return {
      viikko: isoViikko(maanantai),
      rivit: rivit.filter((r) => r.agreedDelivery && r.agreedDelivery >= maanantai && r.agreedDelivery <= sunnuntai),
    };
  });

  return (
    <>
      <Virhe viesti={searchParams.virhe} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Hankintasuunnitelma</h2>
          <p className="text-ink-2 text-sm mt-1 max-w-3xl">
            Toimituspäivä on liitetyn aikataulutehtävän aloitus. Siitä lasketaan taaksepäin takarajat: sopimus (toimitusaika),
            vertailu (neuvottelut), tarjous (vertailuaika), pyyntö (pyyntöaika) ja aineisto (keräys). Kun aikataulu muuttuu,
            takarajat muuttuvat mukana.
          </p>
        </div>
        <Link href={`${polku}?uusi=1#lomake`} className="btn btn-primary shrink-0">
          + Uusi hankinta
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Avoimia hankintoja</div>
          <div className="font-heading text-2xl font-bold">
            {avoimet.length} <span className="text-sm font-normal text-ink-muted">/ {rivit.length}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Takaraja ohitettu</div>
          <div className={`font-heading text-2xl font-bold ${myohassa ? "text-critical" : ""}`}>{myohassa}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Sopimus tehty</div>
          <div className="font-heading text-2xl font-bold">{sovittuja}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Kustannukset (alv 0 %)</div>
          <div className="font-heading text-2xl font-bold">{euro(kustannus)}</div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-sm mb-2">Tulevat toimitukset</h3>
        <div className="grid grid-cols-4 gap-3">
          {viikot.map((v) => (
            <div key={v.viikko} className="text-sm">
              <div className={`font-mono text-xs mb-1 ${v.viikko === tamaViikko ? "text-accent-text font-semibold" : "text-ink-muted"}`}>
                VKO {v.viikko}
                {v.viikko === tamaViikko && " (tämä)"}
              </div>
              {v.rivit.length === 0 ? (
                <div className="text-ink-muted text-xs">Ei toimituksia</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {v.rivit.map((r) => (
                    <li key={r.id} className="text-xs">
                      <span className="font-medium">{r.supplier ?? "–"}</span>{" "}
                      <span className="text-ink-muted">
                        {lyhytPvm(r.agreedDelivery)} {r.description}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <form className="card p-3 flex flex-wrap items-end gap-2 text-sm" method="get">
        <Kentta otsikko="Haku">
          <input name="haku" defaultValue={searchParams.haku} placeholder="Hankinta, littera, toimittaja…" className="field" />
        </Kentta>
        <Kentta otsikko="Vaihe">
          <select name="vaihe" defaultValue={searchParams.vaihe ?? ""} className="field">
            <option value="">Kaikki avoimet</option>
            {VAIHEET.map((v) => (
              <option key={v.arvo} value={v.arvo}>
                {v.nimi}
              </option>
            ))}
          </select>
        </Kentta>
        <Kentta otsikko="Vastuuhenkilö">
          <select name="henkilo" defaultValue={searchParams.henkilo ?? ""} className="field">
            <option value="">Kaikki</option>
            <option value="ei">Ei vastuuhenkilöä</option>
            {henkilot.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Kentta>
        <Kentta otsikko="Tyyppi">
          <select name="tyyppi" defaultValue={searchParams.tyyppi ?? ""} className="field">
            <option value="">Kaikki</option>
            <option value="MATERIAALI">Materiaalit</option>
            <option value="TYOSUORITE">Työsuoritteet</option>
          </select>
        </Kentta>
        <Kentta otsikko="Aikataulutehtävä">
          <select name="tehtava" defaultValue={searchParams.tehtava ?? ""} className="field">
            <option value="">Kaikki</option>
            {aikataulu.map((t) => (
              <option key={t.id} value={t.code}>
                {t.code} {t.title}
              </option>
            ))}
          </select>
        </Kentta>
        <label className="flex items-center gap-2 text-xs text-ink-2 pb-2.5">
          <input type="checkbox" name="kaikki" value="1" defaultChecked={!!searchParams.kaikki} />
          Näytä myös valmiit
        </label>
        <button className="btn btn-secondary btn-sm mb-1">Suodata</button>
        {suodatettu && (
          <Link href={polku} className="text-xs underline mb-2.5">
            Tyhjennä
          </Link>
        )}
        <span className="ml-auto text-xs text-ink-muted pb-2.5">
          {nakyvat.length} / {rivit.length} riviä
        </span>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Littera</th>
              <th className="p-3">Hankinta ja takarajat</th>
              <th className="p-3">Teht.</th>
              <th className="p-3">Vastuu</th>
              <th className="p-3">Vaihe</th>
              <th className="p-3">Seuraava takaraja</th>
              <th className="p-3">Toimitus</th>
              <th className="p-3">Toimittaja</th>
              <th className="p-3 text-right">Kustannus</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {nakyvat.map((r) => {
              const seuraava = seuraavaVaihe(r.phase as Vaihe);
              return (
                <tr key={r.id} className={`border-b border-line last:border-0 align-top ${r.id === muokattava?.id ? "rivi-korostettu" : ""}`}>
                  <td className="p-3 font-mono text-ink-2">{r.littera ?? "–"}</td>
                  <td className="p-3">
                    <div className="font-medium">
                      {r.description}{" "}
                      <span className="badge muted ml-1">{r.kind === "TYOSUORITE" ? "työ" : "mat."}</span>
                    </div>
                    <Takarajarivi r={r} />
                    {r.varoitus && <div className="text-xs text-critical mt-0.5">{r.varoitus}</div>}
                    {r.notes && <div className="text-xs text-ink-2 mt-0.5">{r.notes}</div>}
                  </td>
                  <td className="p-3 font-mono text-ink-2">{r.scheduleTaskCode ?? "–"}</td>
                  <td className="p-3 text-ink-2 whitespace-nowrap">{r.assignee?.name ?? <span className="text-ink-muted">–</span>}</td>
                  <td className="p-3">
                    <form action={asetaVaihe}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="paluu" value={paluu} />
                      <AutoSubmitSelect name="phase" defaultValue={r.phase} className="field !text-xs !py-1 !px-2" aria-label="Vaihe">
                        {VAIHEET.map((v) => (
                          <option key={v.arvo} value={v.arvo}>
                            {v.nimi}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                  </td>
                  <td className="p-3">
                    <Takaraja paiva={r.takaraja} kiire={r.kiire} />
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    {r.agreedDelivery ? (
                      <>
                        <div className="font-semibold">{pvm(r.agreedDelivery)}</div>
                        <div className="text-ink-muted">sovittu · {viikko(r.agreedDelivery)}</div>
                      </>
                    ) : (
                      <>
                        <div>{pvm(r.toimitus)}</div>
                        <div className="text-ink-muted">{r.toimitus ? `tarve · ${viikko(r.toimitus)}` : ""}</div>
                      </>
                    )}
                  </td>
                  <td className="p-3 text-ink-2">{r.supplier ?? "–"}</td>
                  <td className="p-3 text-right font-mono whitespace-nowrap">{r.costCents !== null ? euro(r.costCents) : "–"}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end gap-1">
                      {seuraava && (
                        <form action={siirraSeuraavaanVaiheeseen}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="paluu" value={paluu} />
                          <button className="btn btn-ghost btn-sm" title={`Merkitse vaihe ${vaiheenNimi(r.phase as Vaihe)} tehdyksi`}>
                            {vaiheenNimi(seuraava)} →
                          </button>
                        </form>
                      )}
                      <Link href={`${polku}?muokkaa=${r.id}#lomake`} className="underline text-xs">
                        Muokkaa
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {nakyvat.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-ink-muted">
                  {rivit.length === 0 ? (
                    <>
                      Ei vielä hankintoja. Lisää rivi alta tai tuo hankintasuunnitelma Excelistä{" "}
                      <Link href="/tiedonsiirto?kohde=hankintarivit#tuonti" className="underline">
                        tiedonsiirrolla
                      </Link>
                      .
                    </>
                  ) : (
                    "Ei suodatusta vastaavia rivejä."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProjektinExceltuonti projectId={projectId} kohde="hankintarivit" />

      <details id="lomake" open={lomakeAuki} className="card p-5">
        <summary className="cursor-pointer font-heading font-semibold">
          {muokattava ? `Muokkaa: ${muokattava.description}` : "Uusi hankinta"}
        </summary>
        <form action={tallennaHankintarivi} className="grid grid-cols-4 gap-3 mt-4" key={muokattava?.id ?? "uusi"}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="paluu" value={polku} />
          {muokattava && <input type="hidden" name="id" value={muokattava.id} />}

          <Kentta otsikko="Hankinta *" leveys={2}>
            <input name="description" required defaultValue={muokattava?.description} className="field" />
          </Kentta>
          <Kentta otsikko="Littera">
            <input name="littera" defaultValue={muokattava?.littera ?? ""} className="field font-mono" />
          </Kentta>
          <Kentta otsikko="Tyyppi">
            <select name="kind" defaultValue={muokattava?.kind ?? "MATERIAALI"} className="field">
              <option value="MATERIAALI">Materiaali</option>
              <option value="TYOSUORITE">Työsuorite</option>
            </select>
          </Kentta>

          <Kentta otsikko="Aikataulutehtävä (toimituspäivä)" leveys={2}>
            <select name="scheduleTaskCode" defaultValue={muokattava?.scheduleTaskCode ?? ""} className="field">
              <option value="">Ei liitetty, toimituspäivä annetaan käsin</option>
              {aikataulu.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.code} {t.title} {t.aloitus ? `(alkaa ${pvm(t.aloitus)})` : ""}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Toimituspäivä käsin">
            <input name="neededBy" type="date" defaultValue={syotePvm(muokattava?.neededBy)} className="field" />
          </Kentta>
          <Kentta otsikko="Vastuuhenkilö">
            <HenkiloValinta henkilot={henkilot} valittu={muokattava?.assigneeId} />
          </Kentta>

          <div className="col-span-4 grid grid-cols-5 gap-3 rounded-md border border-line p-3">
            <div className="col-span-5 text-xs text-ink-muted">
              Vaiheiden kestot kalenteripäivinä. Takarajat lasketaan toimituspäivästä taaksepäin.
            </div>
            <Kentta otsikko="Aineiston keräys">
              <input name="materialDays" type="number" min={0} defaultValue={muokattava?.materialDays ?? 1} className="field" />
            </Kentta>
            <Kentta otsikko="Pyyntöaika">
              <input name="requestDays" type="number" min={0} defaultValue={muokattava?.requestDays ?? 5} className="field" />
            </Kentta>
            <Kentta otsikko="Vertailuaika">
              <input name="comparisonDays" type="number" min={0} defaultValue={muokattava?.comparisonDays ?? 1} className="field" />
            </Kentta>
            <Kentta otsikko="Urakkaneuvottelut">
              <input name="negotiationDays" type="number" min={0} defaultValue={muokattava?.negotiationDays ?? 2} className="field" />
            </Kentta>
            <Kentta otsikko="Toimitusaika vrk">
              <input name="deliveryDays" type="number" min={0} defaultValue={muokattava?.deliveryDays ?? 14} className="field" />
            </Kentta>
          </div>

          <Kentta otsikko="Vaihe">
            <select name="phase" defaultValue={muokattava?.phase ?? "AINEISTO"} className="field">
              {VAIHEET.map((v) => (
                <option key={v.arvo} value={v.arvo}>
                  {v.nimi}
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Urakoitsija / toimittaja">
            <input name="supplier" defaultValue={muokattava?.supplier ?? ""} className="field" />
          </Kentta>
          <Kentta otsikko="Sovittu toimituspäivä">
            <input name="agreedDelivery" type="date" defaultValue={syotePvm(muokattava?.agreedDelivery)} className="field" />
          </Kentta>
          <Kentta otsikko="Kustannus € (alv 0 %)">
            <input name="cost" inputMode="decimal" defaultValue={syoteEuro(muokattava?.costCents)} className="field" />
          </Kentta>

          <Kentta otsikko="Määrä">
            <input name="quantity" type="number" step="0.01" min={0} defaultValue={muokattava?.quantity ?? 1} className="field" />
          </Kentta>
          <Kentta otsikko="Yksikkö">
            <input name="unit" defaultValue={muokattava?.unit ?? "kpl"} className="field" />
          </Kentta>
          <Kentta otsikko="Lisätieto maksuihin" leveys={2}>
            <input name="paymentInfo" defaultValue={muokattava?.paymentInfo ?? ""} className="field" />
          </Kentta>
          <Kentta otsikko="Huomiot" leveys={4}>
            <input name="notes" defaultValue={muokattava?.notes ?? ""} className="field" />
          </Kentta>

          <div className="col-span-4 flex items-center gap-3">
            <button className="btn btn-primary">{muokattava ? "Tallenna muutokset" : "Lisää hankinta"}</button>
            {muokattava && (
              <Link href={polku} className="btn btn-ghost">
                Peruuta
              </Link>
            )}
          </div>
        </form>
        {muokattava && (
          <form action={poistaHankintarivi} className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="id" value={muokattava.id} />
            <input type="hidden" name="paluu" value={polku} />
            <button className="text-xs text-critical underline">Poista hankinta</button>
          </form>
        )}
      </details>
    </>
  );
}
