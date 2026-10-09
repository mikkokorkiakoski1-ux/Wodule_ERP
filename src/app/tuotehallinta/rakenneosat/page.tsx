import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { tallennaLittera, tallennaOstonimike, tallennaRakenne } from "@/lib/actions/rakenteet";
import { tuoLaskurinRakenneosat } from "@/lib/actions/tarjouslaskenta";
import {
  KUSTANNUSLAJIT,
  RAKENNEKATEGORIAT,
  RAKENNEOSAN_LAJIT,
  RAKENNEOSA_INCLUDE,
  haeHinnoittelu,
  litterajarjestys,
  litteranNimi,
} from "@/lib/rakennukset";
import { yksikkokustannus } from "@/lib/rakenteet";
import { LASKENTARIVIT, LITTERAT } from "@/lib/tarjouslaskenta";
import { euro, maara } from "@/lib/muotoilu";
import { Ilmoitus, Kentta, Virhe } from "@/components/projektinhallinta";

export const dynamic = "force-dynamic";

const KIRJASTO = "/tuotehallinta/rakenneosat";

type Haku = { virhe?: string; ilmoitus?: string; kaikki?: string; laji?: string; littera?: string; lahde?: string };

function Kategoriat({ oletus }: { oletus: string }) {
  return (
    <select name="category" defaultValue={oletus} className="field">
      {Object.entries(RAKENNEKATEGORIAT).map(([arvo, nimi]) => (
        <option key={arvo} value={arvo}>
          {nimi}
        </option>
      ))}
    </select>
  );
}

function LitteraValinta({ litterat }: { litterat: { id: string; code: string; name: string }[] }) {
  return (
    <select name="litteraId" defaultValue="" className="field">
      <option value="">Ei litteraa</option>
      {litterat.map((l) => (
        <option key={l.id} value={l.id}>
          {l.code} {l.name}
        </option>
      ))}
    </select>
  );
}

export default async function RakenneosatPage({ searchParams }: { searchParams: Haku }) {
  const laji = searchParams.laji === "RAKENNE" || searchParams.laji === "OSTONIMIKE" ? searchParams.laji : undefined;
  const laskuri = searchParams.lahde === "laskuri";
  const [osat, nimikkeet, litterat, hinnoittelu, laskurinRiveja] = await Promise.all([
    prisma.structureType.findMany({
      where: {
        ...(searchParams.kaikki ? {} : { active: true }),
        ...(laji ? { kind: laji } : {}),
        ...(laskuri ? { laskuriAvain: { not: null } } : {}),
        ...(searchParams.littera ? (searchParams.littera === "ei" ? { litteraId: null } : { littera: { code: searchParams.littera } }) : {}),
      },
      include: { ...RAKENNEOSA_INCLUDE, _count: { select: { parts: true } } },
      orderBy: [{ kind: "asc" }, { code: "asc" }],
    }),
    prisma.product.findMany({ orderBy: { code: "asc" } }),
    prisma.littera.findMany({ orderBy: { code: "asc" } }),
    haeHinnoittelu(),
    prisma.structureType.count({ where: { laskuriAvain: { not: null } } }),
  ]);
  litterat.sort((a, b) => litterajarjestys(a, b));

  // Litteroittain (Talo 80), litteran sisällä koodin mukaan.
  const ryhmat = new Map<string, { littera: (typeof osat)[number]["littera"]; osat: typeof osat }>();
  for (const t of osat) {
    const avain = t.littera?.code ?? "";
    const r = ryhmat.get(avain) ?? { littera: t.littera, osat: [] };
    r.osat.push(t);
    ryhmat.set(avain, r);
  }
  const litteroittain = [...ryhmat.values()].sort((a, b) => litterajarjestys(a.littera, b.littera));
  for (const r of litteroittain) r.osat.sort((a, b) => a.code.localeCompare(b.code, "fi", { numeric: true }));

  const suodatin = (muutos: Partial<Haku>) => {
    const p = new URLSearchParams(
      Object.entries({ laji, littera: searchParams.littera, lahde: searchParams.lahde, kaikki: searchParams.kaikki, ...muutos }).filter(
        ([, v]) => v
      ) as [string, string][]
    );
    const q = p.toString();
    return q ? `${KIRJASTO}?${q}` : KIRJASTO;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Tuotehallinta &raquo; Rakenneosat</p>
        <h1 className="text-2xl font-semibold">Rakenneosat</h1>
        <p className="text-ink-2 text-sm mt-1 max-w-3xl">
          Kirjasto, josta jokainen rakennus kootaan. Rakenneosat on lajiteltu <b>litteroittain</b> (Talo 80), ja samaa jakoa
          käyttävät rakennusten määräluettelot ja hankinnat. <b>Rakenne</b> on tehtaan oma vakiorakenne, jolla on joko
          materiaaliluettelo ja työtuntinormi tai kiinteä yksikköhinta. <b>Ostonimike</b> on valmiina ostettava osa, joka viittaa
          yhteen nimikkeeseen. Tarjouslaskurin {LASKENTARIVIT.length} laskentariviä ovat kiinteähintaisia rakenteita: laskuri laskee
          määrät, ja hinnat ovat muokattavissa täällä.
        </p>
        <p className="text-sm mt-1">
          <Link href="/tiedonsiirto?kohde=rakenneosat#tuonti" className="underline">
            Tuo rakenneosia
          </Link>{" "}
          ·{" "}
          <Link href="/tiedonsiirto?kohde=rakenneosamateriaalit#tuonti" className="underline">
            Tuo materiaaliluetteloita
          </Link>{" "}
          ·{" "}
          <a href="/api/tiedonsiirto/vienti?kohde=rakenneosat&muoto=xlsx" className="underline">
            Vie Exceliin
          </a>{" "}
          ·{" "}
          <Link href="/asiakkuuksien-hallinta/tarjouslaskenta" className="underline">
            Tarjouslaskenta
          </Link>
        </p>
      </div>

      <Virhe viesti={searchParams.virhe} />
      <Ilmoitus viesti={searchParams.ilmoitus} />

      {laskurinRiveja < LASKENTARIVIT.length && (
        <form action={tuoLaskurinRakenneosat} className="card p-4 flex items-center justify-between gap-4">
          <input type="hidden" name="paluu" value={KIRJASTO} />
          <p className="text-sm text-ink-2">
            Tarjouslaskurin laskentarivejä on kirjastossa {laskurinRiveja} / {LASKENTARIVIT.length}. Tuo puuttuvat rivit ja{" "}
            {LITTERAT.length} litteraa kirjastoon. Olemassa oleviin rakenneosiin ja hintoihin ei kosketa.
          </p>
          <button className="btn btn-primary shrink-0">Tuo tarjouslaskurin laskentarivit</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Uusi rakenne</h2>
          <form action={tallennaRakenne} className="grid grid-cols-2 gap-3 items-end">
            <input type="hidden" name="paluu" value={KIRJASTO} />
            <Kentta otsikko="Koodi *">
              <input name="code" placeholder="esim. US-1" required className="field font-mono" />
            </Kentta>
            <Kentta otsikko="Littera">
              <LitteraValinta litterat={litterat} />
            </Kentta>
            <Kentta otsikko="Nimi *" leveys={2}>
              <input name="name" placeholder="esim. Ulkoseinä 200 mm, puurunko" required className="field" />
            </Kentta>
            <Kentta otsikko="Kategoria">
              <Kategoriat oletus="ULKOSEINA" />
            </Kentta>
            <Kentta otsikko="Yksikkö">
              <select name="unit" defaultValue="m2" className="field">
                {["m2", "jm", "kpl", "erä", "h", "€"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Kentta>
            <Kentta otsikko="Kiinteä yksikköhinta (€, valinnainen)">
              <input name="unitPriceEuros" inputMode="decimal" placeholder="tyhjä = materiaaliluettelosta" className="field" />
            </Kentta>
            <Kentta otsikko="Kustannuslaji">
              <select name="costType" defaultValue="MATERIAALI" className="field">
                {Object.entries(KUSTANNUSLAJIT).map(([arvo, nimi]) => (
                  <option key={arvo} value={arvo}>
                    {nimi}
                  </option>
                ))}
              </select>
            </Kentta>
            <Kentta otsikko="Työtunnit / yksikkö">
              <input name="laborHoursPerUnit" inputMode="decimal" placeholder="0,8" className="field" />
            </Kentta>
            <Kentta otsikko="BIM-tyyppinimi">
              <input name="bimTypeName" placeholder="mallin tyypin nimi" className="field" />
            </Kentta>
            <button className="btn btn-primary justify-self-start">Lisää rakenne</button>
          </form>
          <p className="text-xs text-ink-muted mt-2">
            Ilman kiinteää hintaa hinta lasketaan materiaaliluettelosta, jonka lisäät rakenteen omalla sivulla.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Uusi ostonimike</h2>
          {nimikkeet.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Lisää ensin nimike{" "}
              <Link href="/tuotehallinta/nimikkeisto" className="underline">
                nimikkeistöön
              </Link>
              .
            </p>
          ) : (
            <form action={tallennaOstonimike} className="grid grid-cols-2 gap-3 items-end">
              <input type="hidden" name="paluu" value={KIRJASTO} />
              <Kentta otsikko="Nimike *" leveys={2}>
                <select name="productId" required defaultValue="" className="field">
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
              <Kentta otsikko="Littera">
                <LitteraValinta litterat={litterat} />
              </Kentta>
              <Kentta otsikko="Kategoria">
                <Kategoriat oletus="TEKNIIKKA" />
              </Kentta>
              <Kentta otsikko="Asennustunnit / yksikkö">
                <input name="laborHoursPerUnit" inputMode="decimal" placeholder="0" className="field" />
              </Kentta>
              <Kentta otsikko="Koodi (oletus: nimikekoodi)">
                <input name="code" className="field font-mono" />
              </Kentta>
              <Kentta otsikko="BIM-tyyppinimi">
                <input name="bimTypeName" className="field" />
              </Kentta>
              <button className="btn btn-primary justify-self-start">Lisää ostonimike</button>
            </form>
          )}
          <p className="text-xs text-ink-muted mt-2">Nimi ja yksikkö tulevat nimikkeeltä, hinta hinnastosta.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <nav className="flex flex-wrap gap-2">
          <Link href={suodatin({ laji: undefined, lahde: undefined })} className={`badge ${laji || laskuri ? "muted" : "info"}`}>
            Kaikki
          </Link>
          {Object.entries(RAKENNEOSAN_LAJIT).map(([arvo, nimi]) => (
            <Link key={arvo} href={suodatin({ laji: arvo, lahde: undefined })} className={`badge ${laji === arvo ? "info" : "muted"}`}>
              {nimi === "Rakenne" ? "Rakenteet" : "Ostonimikkeet"}
            </Link>
          ))}
          <Link href={suodatin({ lahde: "laskuri", laji: undefined })} className={`badge ${laskuri ? "info" : "muted"}`}>
            Tarjouslaskurin rivit
          </Link>
        </nav>
        <nav className="flex flex-wrap gap-1 text-xs">
          <span className="text-ink-muted mr-1">Littera:</span>
          <Link href={suodatin({ littera: undefined })} className={`badge ${searchParams.littera ? "muted" : "info"}`}>
            Kaikki
          </Link>
          {litterat.map((l) => (
            <Link key={l.id} href={suodatin({ littera: l.code })} className={`badge ${searchParams.littera === l.code ? "info" : "muted"}`} title={l.name}>
              {l.code}
            </Link>
          ))}
          <Link href={suodatin({ littera: "ei" })} className={`badge ${searchParams.littera === "ei" ? "info" : "muted"}`}>
            Ei litteraa
          </Link>
        </nav>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Koodi</th>
              <th className="p-3">Nimi</th>
              <th className="p-3">Laji</th>
              <th className="p-3">Hinnoittelu</th>
              <th className="p-3 text-right">Omakustannus / yks.</th>
              <th className="p-3 text-right">Käytössä</th>
            </tr>
          </thead>
          <tbody>
            {litteroittain.map(({ littera, osat: ryhma }) => (
              <Fragment key={littera?.code ?? "-"}>
                <tr className="bg-surface-raised border-b border-line">
                  <td colSpan={6} className="px-3 py-1.5 font-mono text-xs font-semibold uppercase">
                    {litteranNimi(littera)} <span className="text-ink-muted normal-case font-normal">· {ryhma.length}</span>
                  </td>
                </tr>
                {ryhma.map((t) => {
                  const k = yksikkokustannus(t, hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit);
                  const vajaa = k.puuttuvatHinnat.length > 0 || k.tuntihintaPuuttuu;
                  const kiintea = t.unitPriceCents !== null;
                  return (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <td className="p-3 font-mono">
                        <Link href={`${KIRJASTO}/${t.id}`} className="hover:underline">
                          {t.code}
                        </Link>
                      </td>
                      <td className="p-3 font-medium">
                        {t.name}
                        {!t.active && <span className="badge muted ml-2">Ei käytössä</span>}
                        {t.laskuriAvain && <span className="badge ok ml-2">laskuri</span>}
                        {t.bimTypeName && <div className="text-xs text-ink-muted font-mono">BIM: {t.bimTypeName}</div>}
                      </td>
                      <td className="p-3">
                        <span className={`badge ${t.kind === "OSTONIMIKE" ? "info" : "muted"}`}>{RAKENNEOSAN_LAJIT[t.kind]}</span>
                      </td>
                      <td className="p-3 text-ink-2 text-xs">
                        {kiintea
                          ? `Kiinteä hinta · ${KUSTANNUSLAJIT[t.costType]}${t.materials.length ? ` · ${t.materials.length} materiaalia (tarve)` : ""}`
                          : t.kind === "OSTONIMIKE"
                            ? `Nimike ${t.materials[0]?.product.code ?? "–"}`
                            : `${t.materials.length} materiaalia · ${maara(t.laborHoursPerUnit)} h / ${t.unit}`}
                      </td>
                      <td className="p-3 text-right font-mono whitespace-nowrap" title={vajaa ? "Hintoja puuttuu" : undefined}>
                        {euro(k.yhteensaSentit)} / {t.unit}
                        {vajaa && <span className="text-critical"> *</span>}
                      </td>
                      <td className="p-3 text-right font-mono">{t._count.parts}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {osat.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  Ei rakenneosia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        * Hinnastolta puuttuu materiaalin hinta tai tuntihinta. Käytössä = määräluettelorivejä rakennuksissa.{" "}
        {searchParams.kaikki ? (
          <Link href={suodatin({ kaikki: undefined })} className="underline">
            Näytä vain käytössä olevat
          </Link>
        ) : (
          <Link href={suodatin({ kaikki: "1" })} className="underline">
            Näytä myös käytöstä poistetut
          </Link>
        )}
      </p>

      <details className="card p-5">
        <summary className="cursor-pointer font-heading font-semibold">Litterat ({litterat.length})</summary>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-6 items-start">
          <ul className="columns-2 text-sm">
            {litterat.map((l) => (
              <li key={l.id}>
                <Link href={suodatin({ littera: l.code })} className="hover:underline">
                  <span className="font-mono">{l.code}</span> {l.name}
                </Link>
              </li>
            ))}
          </ul>
          <form action={tallennaLittera} className="flex flex-col gap-2 w-64">
            <input type="hidden" name="paluu" value={KIRJASTO} />
            <input name="code" placeholder="Koodi, esim. 3400" required className="field font-mono" />
            <input name="name" placeholder="Nimi" required className="field" />
            <button className="btn btn-secondary btn-sm self-start">Lisää littera</button>
          </form>
        </div>
      </details>
    </div>
  );
}
