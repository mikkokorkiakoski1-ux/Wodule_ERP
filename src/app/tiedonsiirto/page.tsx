import { prisma } from "@/lib/prisma";
import { KOHTEET } from "@/lib/tiedonsiirto/kohteet";
import { aikaleimaSuomeksi, tyypinKuvaus } from "@/lib/tiedonsiirto/arvot";
import { TiedonsiirtoTuontiClient } from "@/components/TiedonsiirtoTuontiClient";

export const dynamic = "force-dynamic";

// Tiedonsiirto: kaikkien osioiden tietojen tuonti ja vienti (CSV, Excel,
// JSON). Poikkileikkaava työkalu, ei rakennekaavion solmu - ks.
// docs/ARKKITEHTUURI.md.

const vienti = (kohde: string, muoto: string) => `/api/tiedonsiirto/vienti?kohde=${kohde}&muoto=${muoto}`;
const pohja = (kohde: string, muoto: string) => `/api/tiedonsiirto/pohja?kohde=${kohde}&muoto=${muoto}`;

const SUUNTA = { TUONTI: "Tuonti", VIENTI: "Vienti" } as const;

export default async function TiedonsiirtoPage({ searchParams }: { searchParams: { kohde?: string } }) {
  const [maarat, loki] = await Promise.all([
    Promise.all(KOHTEET.map((k) => k.maara(prisma))),
    prisma.dataTransferLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const oletusKohde = KOHTEET.some((k) => k.avain === searchParams.kohde) ? searchParams.kohde : undefined;
  const nimiAvaimelle = new Map(KOHTEET.map((k) => [k.avain, k.nimi]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Järjestelmä &raquo; Tiedonsiirto</p>
        <h1 className="text-2xl font-semibold">Tiedonsiirto</h1>
        <p className="text-ink-2 text-sm mt-1">
          Tuo ja vie kaikkien osioiden tietoja Excelinä, CSV:nä tai JSONina. Vienti kelpaa sellaisenaan tuontitiedostoksi: vie,
          muokkaa Excelissä ja tuo takaisin.
        </p>
      </div>

      <div className="card p-5 flex flex-col gap-3">
        <h2 className="font-semibold">Vie kaikki tiedot</h2>
        <p className="text-sm text-ink-2">
          Excel-työkirjassa on jokaiselle kohteelle oma välilehti ja lopussa ohjevälilehti. JSON-varmuuskopion voi palauttaa
          tuonnilla. Molemmat voi tuoda takaisin kohteella &quot;Tunnista välilehdistä&quot;.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={vienti("kaikki", "xlsx")} className="btn btn-primary">
            Excel-työkirja
          </a>
          <a href={vienti("kaikki", "json")} className="btn btn-secondary">
            JSON-varmuuskopio
          </a>
          <a href={pohja("kaikki", "xlsx")} className="btn btn-ghost">
            Tyhjä tuontipohja (Excel)
          </a>
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-3" id="tuonti">
        <h2 className="font-semibold">Tuo tiedostosta</h2>
        <ul className="text-sm text-ink-2 list-disc pl-5 flex flex-col gap-1">
          <li>
            Ensimmäinen rivi on otsikkorivi. Sarakkeet tunnistetaan otsikosta, eikä niiden järjestyksellä ole väliä. Ylimääräiset
            sarakkeet ohitetaan.
          </li>
          <li>Tyhjä solu tai puuttuva sarake jättää kentän ennalleen. Tuonti ei koskaan poista tietoja.</li>
          <li>
            Viittaukset kirjoitetaan luettavina: asiakas nimellä tai Y-tunnuksella, nimike koodilla, projekti nimellä. Samassa
            tiedostossa aiemmin luodut tiedot kelpaavat viittauksiksi.
          </li>
          <li>Luvuissa käy sekä 1 234,50 että 1234.50, päivämäärissä sekä 31.12.2026 että 2026-12-31.</li>
        </ul>
        <TiedonsiirtoTuontiClient
          kohteet={KOHTEET.map((k) => ({ avain: k.avain, nimi: k.nimi, osio: k.osio }))}
          oletusKohde={oletusKohde}
        />
      </div>

      <div className="card">
        <div className="p-5 pb-2">
          <h2 className="font-semibold">Kohteet</h2>
          <p className="text-sm text-ink-2">Vie yksittäinen kohde tai lataa sen tuontipohja, jossa on esimerkkirivi.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Osio</th>
              <th className="p-3">Kohde</th>
              <th className="p-3 text-right">Rivejä</th>
              <th className="p-3">Vie</th>
              <th className="p-3">Pohja</th>
            </tr>
          </thead>
          <tbody>
            {KOHTEET.map((k, i) => (
              <tr key={k.avain} className="border-b border-line last:border-0">
                <td className="p-3 text-ink-2 text-xs">{k.osio}</td>
                <td className="p-3">
                  <a href={`#sarakkeet-${k.avain}`} className="font-medium hover:underline">
                    {k.nimi}
                  </a>
                </td>
                <td className="p-3 text-right font-mono">{maarat[i]}</td>
                <td className="p-3 whitespace-nowrap text-xs">
                  <a className="underline" href={vienti(k.avain, "xlsx")}>Excel</a> ·{" "}
                  <a className="underline" href={vienti(k.avain, "csv")}>CSV</a> ·{" "}
                  <a className="underline" href={vienti(k.avain, "json")}>JSON</a>
                </td>
                <td className="p-3 whitespace-nowrap text-xs">
                  <a className="underline" href={pohja(k.avain, "xlsx")}>Excel</a> ·{" "}
                  <a className="underline" href={pohja(k.avain, "csv")}>CSV</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5 flex flex-col gap-3">
        <h2 className="font-semibold">Tapahtumaloki</h2>
        {loki.length === 0 ? (
          <p className="text-sm text-ink-muted">Ei vielä tuonteja tai vientejä.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
                <th className="py-2 pr-3">Aika</th>
                <th className="py-2 pr-3">Suunta</th>
                <th className="py-2 pr-3">Kohde</th>
                <th className="py-2 pr-3">Tiedosto</th>
                <th className="py-2 text-right">Uusia / päivitettyjä / ohitettuja / virheitä</th>
              </tr>
            </thead>
            <tbody>
              {loki.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{aikaleimaSuomeksi(l.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <span className={`badge ${l.direction === "TUONTI" ? "info" : "muted"}`}>{SUUNTA[l.direction]}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {l.target === "kaikki"
                      ? "Kaikki"
                      : l.target
                          .split(", ")
                          .map((a) => nimiAvaimelle.get(a) ?? a)
                          .join(", ")}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs break-all">{l.fileName}</td>
                  <td className="py-2 text-right font-mono whitespace-nowrap">
                    {l.direction === "VIENTI" ? `${l.created} riviä` : `${l.created} / ${l.updated} / ${l.skipped} / ${l.failed}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Sarakkeet ja tunnistus</h2>
        {KOHTEET.map((k) => (
          <details key={k.avain} id={`sarakkeet-${k.avain}`} className="card p-4">
            <summary className="cursor-pointer font-medium">
              {k.nimi} <span className="text-ink-muted text-sm font-normal">· {k.osio}</span>
            </summary>
            <p className="text-sm text-ink-2 mt-2">{k.kuvaus}</p>
            <p className="text-sm text-ink-2 mt-1">
              <span className="font-semibold">Tunnistus:</span> {k.tunnistus}
            </p>
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
                  <th className="py-2 pr-3">Sarake</th>
                  <th className="py-2 pr-3">Muoto</th>
                  <th className="py-2 pr-3">Selite</th>
                </tr>
              </thead>
              <tbody>
                {k.sarakkeet.map((s) => (
                  <tr key={s.avain} className="border-b border-line last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {s.otsikko}
                      {s.pakollinen && <span className="text-critical"> *</span>}
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{tyypinKuvaus(s)}</td>
                    <td className="py-2 pr-3 text-ink-2">
                      {s.vainVienti && <span className="badge muted mr-1">vain vienti</span>}
                      {s.kuvaus}
                      {s.aliakset && s.aliakset.length > 0 && (
                        <span className="text-ink-muted text-xs"> Myös otsikot: {s.aliakset.join(", ")}.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ink-muted mt-2">* pakollinen</p>
          </details>
        ))}
      </div>
    </div>
  );
}
