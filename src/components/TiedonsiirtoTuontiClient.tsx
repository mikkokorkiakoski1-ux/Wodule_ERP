"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { KohdeRaportti, TuontiRaportti } from "@/lib/tiedonsiirto/tuonti";

// Tuonnin kaksivaiheinen käyttöliittymä: ensin esikatselu (ei muuta mitään),
// sitten tallennus samoilla asetuksilla. Asetusten tai tiedoston muutos
// nollaa esikatselun, jotta tallennettava vastaa aina nähtyä.

interface KohdeValinta {
  avain: string;
  nimi: string;
  osio: string;
}

type Suodatin = "kaikki" | "virheet" | "muutokset";

const TULOKSEN_NIMI = { luotu: "Uusi", paivitetty: "Päivitys", ohitettu: "Ohitettu", virhe: "Virhe" } as const;
const TULOKSEN_TYYLI = { luotu: "ok", paivitetty: "info", ohitettu: "muted", virhe: "crit" } as const;

const kentta = "field";

function Yhteenveto({ y }: { y: TuontiRaportti["yhteenveto"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(TULOKSEN_NIMI) as (keyof typeof TULOKSEN_NIMI)[]).map((k) => (
        <span key={k} className={`badge ${TULOKSEN_TYYLI[k]}`}>
          {TULOKSEN_NIMI[k]}: {y[k]}
        </span>
      ))}
    </div>
  );
}

function KohteenRaportti({ k, suodatin }: { k: KohdeRaportti; suodatin: Suodatin }) {
  const rivit = k.rivit.filter((r) =>
    suodatin === "virheet" ? r.tulos === "virhe" : suodatin === "muutokset" ? r.tulos === "luotu" || r.tulos === "paivitetty" : true
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {k.nimi}
          {k.taulukko && k.taulukko !== k.nimi && <span className="text-ink-muted font-normal text-sm"> (välilehti {k.taulukko})</span>}
        </h3>
        <Yhteenveto y={k.yhteenveto} />
      </div>

      {k.puuttuvatPakolliset.length > 0 && (
        <p className="text-sm text-critical">Pakollinen sarake puuttuu: {k.puuttuvatPakolliset.join(", ")}</p>
      )}
      <p className="text-xs text-ink-2">
        Tunnistetut sarakkeet:{" "}
        {k.tunnistetut.map((t) => (t.otsikko === t.sarake ? t.otsikko : `${t.otsikko} → ${t.sarake}`)).join(", ") || "–"}
        {k.tuntemattomat.length > 0 && <> · Ohitetut tuntemattomat: {k.tuntemattomat.join(", ")}</>}
        {k.vainVienti.length > 0 && <> · Vain vientiä varten, ohitettu: {k.vainVienti.join(", ")}</>}
      </p>

      {rivit.length > 0 ? (
        <div className="max-h-80 overflow-auto border border-line rounded-md">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
                <th className="p-2 w-16">Rivi</th>
                <th className="p-2 w-24">Tulos</th>
                <th className="p-2">Tieto</th>
                <th className="p-2">Viesti</th>
              </tr>
            </thead>
            <tbody>
              {rivit.map((r) => (
                <tr key={r.rivi} className="border-b border-line last:border-0 align-top">
                  <td className="p-2 font-mono text-ink-2">{r.rivi}</td>
                  <td className="p-2">
                    <span className={`badge ${TULOKSEN_TYYLI[r.tulos]}`}>{TULOKSEN_NIMI[r.tulos]}</span>
                  </td>
                  <td className="p-2">{r.tunniste}</td>
                  <td className="p-2 text-critical">{r.viesti}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Ei näytettäviä rivejä.</p>
      )}
    </div>
  );
}

export function TiedonsiirtoTuontiClient({
  kohteet,
  oletusKohde,
  oletukset,
  automaattinen = true,
}: {
  kohteet: KohdeValinta[];
  oletusKohde?: string;
  /** Oletusarvot sarakkeille, esim. { projekti: "..." } projektisivun tuonnissa. */
  oletukset?: Record<string, string>;
  /** Näytetäänkö "Tunnista välilehdistä" -vaihtoehto. */
  automaattinen?: boolean;
}) {
  const router = useRouter();
  const [tiedosto, setTiedosto] = useState<File | null>(null);
  const [kohde, setKohde] = useState(oletusKohde ?? (automaattinen ? "automaattinen" : kohteet[0]?.avain));
  const [taulukko, setTaulukko] = useState<string | undefined>(undefined);
  const [tapa, setTapa] = useState("lisaa-ja-paivita");
  const [virheet, setVirheet] = useState("peru");
  const [raportti, setRaportti] = useState<TuontiRaportti | null>(null);
  const [virhe, setVirhe] = useState<string | null>(null);
  const [kaynnissa, setKaynnissa] = useState<"esikatselu" | "tallennus" | null>(null);
  const [suodatin, setSuodatin] = useState<Suodatin>("kaikki");
  const [inputAvain, setInputAvain] = useState(0);

  const osiot = useMemo(() => Array.from(new Set(kohteet.map((k) => k.osio))), [kohteet]);

  function nollaa() {
    setRaportti(null);
    setVirhe(null);
    setTaulukko(undefined);
  }

  async function laheta(esikatselu: boolean, valittuTaulukko = taulukko) {
    if (!tiedosto) return;
    setKaynnissa(esikatselu ? "esikatselu" : "tallennus");
    setVirhe(null);
    const data = new FormData();
    data.set("tiedosto", tiedosto);
    data.set("kohde", kohde);
    data.set("tapa", tapa);
    data.set("virheet", virheet);
    data.set("esikatselu", String(esikatselu));
    if (oletukset) data.set("oletukset", JSON.stringify(oletukset));
    if (valittuTaulukko) data.set("taulukko", valittuTaulukko);
    try {
      const res = await fetch("/api/tiedonsiirto/tuonti", { method: "POST", body: data });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        const e = json?.error;
        setVirhe(typeof e === "string" ? e : "Tuonti epäonnistui");
        setRaportti(null);
        return;
      }
      const r = json as TuontiRaportti;
      setRaportti(r);
      setSuodatin(r.yhteenveto.virhe > 0 ? "virheet" : "kaikki");
      if (r.tallennettu) {
        setTiedosto(null);
        setInputAvain((n) => n + 1);
        router.refresh();
      }
    } catch {
      setVirhe("Palvelimeen ei saatu yhteyttä");
    } finally {
      setKaynnissa(null);
    }
  }

  const voiTallentaa =
    raportti?.esikatselu &&
    raportti.yhteenveto.luotu + raportti.yhteenveto.paivitetty > 0 &&
    (virheet === "ohita" || raportti.yhteenveto.virhe === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm col-span-2">
          <span className="text-ink-2">Tiedosto (.xlsx, .csv tai .json, enintään 15 Mt)</span>
          <input
            key={inputAvain}
            type="file"
            accept=".xlsx,.xlsm,.csv,.txt,.tsv,.json"
            className={kentta}
            onChange={(e) => {
              setTiedosto(e.target.files?.[0] ?? null);
              nollaa();
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">Kohde</span>
          <select className={kentta} value={kohde} onChange={(e) => (setKohde(e.target.value), nollaa())}>
            {automaattinen && <option value="automaattinen">Tunnista välilehdistä (Excel-työkirja tai JSON-varmuuskopio)</option>}
            {osiot.map((o) => (
              <optgroup key={o} label={o}>
                {kohteet
                  .filter((k) => k.osio === o)
                  .map((k) => (
                    <option key={k.avain} value={k.avain}>
                      {k.nimi}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">Tuontitapa</span>
          <select className={kentta} value={tapa} onChange={(e) => (setTapa(e.target.value), nollaa())}>
            <option value="lisaa-ja-paivita">Lisää uudet ja päivitä olemassa olevat</option>
            <option value="vain-uudet">Lisää vain uudet (olemassa olevat ohitetaan)</option>
            <option value="vain-paivita">Päivitä vain olemassa olevat (uudet ohitetaan)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm col-span-2">
          <span className="text-ink-2">Jos rivillä on virhe</span>
          <select className={kentta} value={virheet} onChange={(e) => (setVirheet(e.target.value), nollaa())}>
            <option value="peru">Älä tallenna mitään (koko tuonti perutaan)</option>
            <option value="ohita">Tallenna virheettömät rivit, ohita virheelliset</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!tiedosto || kaynnissa !== null}
          onClick={() => laheta(true)}
          className="btn btn-primary"
        >
          {kaynnissa === "esikatselu" ? "Tarkistetaan…" : "1. Esikatsele"}
        </button>
        <button
          type="button"
          disabled={!voiTallentaa || kaynnissa !== null}
          onClick={() => laheta(false)}
          className="btn btn-secondary"
        >
          {kaynnissa === "tallennus" ? "Tallennetaan…" : "2. Tallenna tuonti"}
        </button>
        <span className="text-xs text-ink-muted">Esikatselu ei muuta mitään. Tallennus käyttää samoja asetuksia.</span>
      </div>

      {virhe && <p className="text-sm text-critical">{virhe}</p>}

      {raportti && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm font-semibold ${raportti.tallennettu ? "text-good" : raportti.yhteenveto.virhe > 0 ? "text-critical" : ""}`}>
              {raportti.viesti}
            </p>
            <Yhteenveto y={raportti.yhteenveto} />
          </div>
          {kohde !== "automaattinen" && raportti.kaikkiTaulukot.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-2">Luettu välilehti:</span>
              <select
                className={kentta}
                value={taulukko ?? raportti.kohteet[0]?.taulukko ?? ""}
                disabled={kaynnissa !== null}
                onChange={(e) => {
                  setTaulukko(e.target.value);
                  laheta(true, e.target.value);
                }}
              >
                {raportti.kaikkiTaulukot.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="text-xs text-ink-muted">Valittu automaattisesti tunnistettujen sarakkeiden perusteella.</span>
            </label>
          )}
          {raportti.ohitetutTaulukot.length > 0 && kohde === "automaattinen" && (
            <p className="text-xs text-ink-2">Tunnistamattomat välilehdet ohitettiin: {raportti.ohitetutTaulukot.join(", ")}</p>
          )}
          <div className="flex gap-2 text-xs">
            {(["kaikki", "muutokset", "virheet"] as Suodatin[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSuodatin(s)}
                className={`rounded-full px-3 py-1 border ${suodatin === s ? "border-ink font-semibold" : "border-line text-ink-2"}`}
              >
                {s === "kaikki" ? "Kaikki rivit" : s === "muutokset" ? "Vain muutokset" : "Vain virheet"}
              </button>
            ))}
          </div>
          {raportti.kohteet.map((k) => (
            <KohteenRaportti key={k.kohde} k={k} suodatin={suodatin} />
          ))}
        </div>
      )}
    </div>
  );
}
