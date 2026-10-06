import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { tallennaOstonimike, tallennaRakenne } from "@/lib/actions/rakenteet";
import { RAKENNEKATEGORIAT, RAKENNEOSAN_LAJIT, RAKENNEOSA_INCLUDE, haeHinnoittelu } from "@/lib/rakennukset";
import { yksikkokustannus } from "@/lib/rakenteet";
import { euro, maara } from "@/lib/muotoilu";
import { Kentta, Virhe } from "@/components/projektinhallinta";

export const dynamic = "force-dynamic";

const KIRJASTO = "/tuotehallinta/rakenneosat";

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

export default async function RakenneosatPage({
  searchParams,
}: {
  searchParams: { virhe?: string; kaikki?: string; laji?: string };
}) {
  const laji = searchParams.laji === "RAKENNE" || searchParams.laji === "OSTONIMIKE" ? searchParams.laji : undefined;
  const [osat, nimikkeet, hinnoittelu] = await Promise.all([
    prisma.structureType.findMany({
      where: { ...(searchParams.kaikki ? {} : { active: true }), ...(laji ? { kind: laji } : {}) },
      include: { ...RAKENNEOSA_INCLUDE, _count: { select: { parts: true } } },
      orderBy: [{ kind: "asc" }, { category: "asc" }, { code: "asc" }],
    }),
    prisma.product.findMany({ orderBy: { code: "asc" } }),
    haeHinnoittelu(),
  ]);
  const suodatin = (l?: string) => `${KIRJASTO}${l ? `?laji=${l}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Tuotehallinta &raquo; Rakenneosat</p>
        <h1 className="text-2xl font-semibold">Rakenneosat</h1>
        <p className="text-ink-2 text-sm mt-1 max-w-3xl">
          Kirjasto, josta jokainen rakennus kootaan. <b>Rakenne</b> on tehtaan oma vakiorakenne (esim. ulkoseinä), jolla on
          materiaaliluettelo ja työtuntinormi. <b>Ostonimike</b> on valmiina ostettava osa (esim. ilmalämpöpumppu tai
          keittiökaluste), joka viittaa yhteen nimikkeeseen; työtunnit ovat sen asennus- tai käsittelyaika. Kun rakenneosa
          lisätään rakennuksen määräluetteloon, siitä lasketaan omakustannus, tuntimenekki ja materiaalitarve. Ostonimikkeet
          päätyvät materiaalitarpeen kautta projektin hankintasuunnitelmaan.
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
          </a>
        </p>
      </div>

      <Virhe viesti={searchParams.virhe} />

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Uusi rakenne</h2>
          <form action={tallennaRakenne} className="grid grid-cols-2 gap-3 items-end">
            <input type="hidden" name="paluu" value={KIRJASTO} />
            <Kentta otsikko="Koodi *">
              <input name="code" placeholder="esim. US-1" required className="field font-mono" />
            </Kentta>
            <Kentta otsikko="Kategoria">
              <Kategoriat oletus="ULKOSEINA" />
            </Kentta>
            <Kentta otsikko="Nimi *" leveys={2}>
              <input name="name" placeholder="esim. Ulkoseinä 200 mm, puurunko" required className="field" />
            </Kentta>
            <Kentta otsikko="Yksikkö">
              <select name="unit" defaultValue="m2" className="field">
                <option value="m2">m2</option>
                <option value="jm">jm</option>
                <option value="kpl">kpl</option>
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
          <p className="text-xs text-ink-muted mt-2">Materiaaliluettelo lisätään rakenteen omalla sivulla.</p>
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

      <nav className="flex gap-2 text-sm">
        <Link href={suodatin()} className={`badge ${laji ? "muted" : "info"}`}>
          Kaikki
        </Link>
        {Object.entries(RAKENNEOSAN_LAJIT).map(([arvo, nimi]) => (
          <Link key={arvo} href={suodatin(arvo)} className={`badge ${laji === arvo ? "info" : "muted"}`}>
            {nimi === "Rakenne" ? "Rakenteet" : "Ostonimikkeet"}
          </Link>
        ))}
      </nav>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Koodi</th>
              <th className="p-3">Nimi</th>
              <th className="p-3">Laji</th>
              <th className="p-3">Kategoria</th>
              <th className="p-3 text-right">Materiaaleja</th>
              <th className="p-3 text-right">Työ h / yks.</th>
              <th className="p-3 text-right">Omakustannus / yks.</th>
              <th className="p-3 text-right">Käytössä</th>
            </tr>
          </thead>
          <tbody>
            {osat.map((t) => {
              const k = yksikkokustannus(t, hinnoittelu.hinnat, hinnoittelu.tuntihintaSentit);
              const vajaa = k.puuttuvatHinnat.length > 0 || k.tuntihintaPuuttuu;
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
                    {t.bimTypeName && <div className="text-xs text-ink-muted font-mono">BIM: {t.bimTypeName}</div>}
                  </td>
                  <td className="p-3">
                    <span className={`badge ${t.kind === "OSTONIMIKE" ? "info" : "muted"}`}>{RAKENNEOSAN_LAJIT[t.kind]}</span>
                  </td>
                  <td className="p-3 text-ink-2">{RAKENNEKATEGORIAT[t.category]}</td>
                  <td className="p-3 text-right font-mono">{t.kind === "OSTONIMIKE" ? t.materials[0]?.product.code ?? "–" : t.materials.length}</td>
                  <td className="p-3 text-right font-mono">{maara(t.laborHoursPerUnit)}</td>
                  <td className="p-3 text-right font-mono whitespace-nowrap" title={vajaa ? "Hintoja puuttuu" : undefined}>
                    {euro(k.yhteensaSentit)} / {t.unit}
                    {vajaa && <span className="text-critical"> *</span>}
                  </td>
                  <td className="p-3 text-right font-mono">{t._count.parts}</td>
                </tr>
              );
            })}
            {osat.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-ink-muted">
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
          <Link href={suodatin(laji)} className="underline">
            Näytä vain käytössä olevat
          </Link>
        ) : (
          <Link href={`${suodatin(laji)}${laji ? "&" : "?"}kaikki=1`} className="underline">
            Näytä myös käytöstä poistetut
          </Link>
        )}
      </p>
    </div>
  );
}
