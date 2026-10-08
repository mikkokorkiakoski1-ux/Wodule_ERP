"use client";

// Tarjouslaskuri: syötteet, hinta-arvio, vertailu toteutuneisiin projekteihin
// ja kustannuserittely litteroittain. Laskenta (src/lib/tarjouslaskenta.ts)
// ajetaan selaimessa joka muutoksella; tallennus vie laskurin rivit
// rakennuksen määräluetteloon (tallennaLaskenta).
import { useMemo, useState } from "react";
import {
  KATOT,
  KEITTIOT,
  LITTERAT,
  PORTAAT,
  SISAKATOT,
  VERTAILU,
  laske,
  type LaskettuRivi,
  type Syote,
} from "@/lib/tarjouslaskenta";
import { tallennaLaskenta } from "@/lib/actions/tarjouslaskenta";

type Kentta =
  | { avain: keyof Syote; otsikko: string; tyyppi: "luku"; yksikko?: string; min?: number; max?: number; askel?: number; ohje?: string }
  | { avain: keyof Syote; otsikko: string; tyyppi: "valinta"; valinnat: readonly string[] }
  | { avain: keyof Syote; otsikko: string; tyyppi: "kytkin" };

const OSIOT: { otsikko: string; auki?: boolean; kentat: Kentta[] }[] = [
  {
    otsikko: "Päämitat (ulkomitat)",
    auki: true,
    kentat: [
      { avain: "leveys", otsikko: "Leveys ulkoseinien mukaan", tyyppi: "luku", yksikko: "mm", min: 1500, max: 20000, askel: 50 },
      { avain: "pituus", otsikko: "Pituus ulkoseinien mukaan", tyyppi: "luku", yksikko: "mm", min: 1500, max: 40000, askel: 50 },
      { avain: "terassi", otsikko: "Katetun terassin pinta-ala", tyyppi: "luku", yksikko: "m²", min: 0, max: 60, askel: 0.1 },
      { avain: "sisakorkeus", otsikko: "Sisäkorkeus (matalin reuna)", tyyppi: "luku", yksikko: "mm", min: 1900, max: 3200, askel: 10 },
      { avain: "katto", otsikko: "Vesikaton muoto", tyyppi: "valinta", valinnat: KATOT },
      { avain: "sisakatto", otsikko: "Sisäkaton muoto", tyyppi: "valinta", valinnat: SISAKATOT },
      { avain: "raystas", otsikko: "Räystään pituus", tyyppi: "luku", yksikko: "mm", min: 0, max: 600, askel: 10 },
    ],
  },
  {
    otsikko: "Parvi",
    kentat: [
      { avain: "parvi", otsikko: "Matala parvi KPH:n tai eteisen yläpuolella", tyyppi: "kytkin" },
      { avain: "parviAla", otsikko: "Parven pinta-ala", tyyppi: "luku", yksikko: "m²", min: 0, max: 40, askel: 0.1 },
      { avain: "porras", otsikko: "Porras", tyyppi: "valinta", valinnat: Object.keys(PORTAAT) },
    ],
  },
  {
    otsikko: "Ikkunat ja ulko-ovet",
    kentat: [
      { avain: "ikkKiinteaKpl", otsikko: "Kiinteät ikkunat", tyyppi: "luku", yksikko: "kpl", min: 0, max: 30, askel: 1 },
      { avain: "ikkKiinteaAla", otsikko: "Kiinteiden ikkunoiden ala yht.", tyyppi: "luku", yksikko: "m²", min: 0, max: 60, askel: 0.1 },
      { avain: "ikkAvattavaKpl", otsikko: "Avattavat ikkunat", tyyppi: "luku", yksikko: "kpl", min: 0, max: 20, askel: 1 },
      { avain: "ikkAvattavaAla", otsikko: "Avattavien ikkunoiden ala yht.", tyyppi: "luku", yksikko: "m²", min: 0, max: 20, askel: 0.01 },
      { avain: "umpiovet", otsikko: "Umpiovet (Skaala U=1,0)", tyyppi: "luku", yksikko: "kpl", min: 0, max: 10, askel: 1 },
      { avain: "terassiovet", otsikko: "Täysikorkea lasiaukko (terassiovi)", tyyppi: "luku", yksikko: "kpl", min: 0, max: 10, askel: 1 },
    ],
  },
  {
    otsikko: "Märkätilat",
    kentat: [
      { avain: "kph", otsikko: "Kylpyhuone (vakiovarusteet)", tyyppi: "kytkin" },
      { avain: "kphAla", otsikko: "Kylpyhuoneen lattiapinta-ala", tyyppi: "luku", yksikko: "m²", min: 0, max: 20, askel: 0.1 },
      { avain: "sauna", otsikko: "Lämpimän tilan sauna sähkökiukaalla", tyyppi: "kytkin" },
      { avain: "saunaAla", otsikko: "Saunan pinta-ala", tyyppi: "luku", yksikko: "m²", min: 0, max: 20, askel: 0.1 },
    ],
  },
  {
    otsikko: "Kiintokalusteet ja varusteet",
    kentat: [
      { avain: "keittio", otsikko: "Vakiokeittiö", tyyppi: "valinta", valinnat: Object.keys(KEITTIOT) },
      { avain: "eteisenKomero", otsikko: "Eteisen komero", tyyppi: "luku", yksikko: "kpl", min: 0, max: 5, askel: 1 },
      { avain: "makuuhuoneenKomero", otsikko: "Makuuhuoneen komero", tyyppi: "luku", yksikko: "kpl", min: 0, max: 5, askel: 1 },
      { avain: "takka", otsikko: "Takka Contura 810 + piippu", tyyppi: "luku", yksikko: "kpl", min: 0, max: 3, askel: 1 },
      { avain: "ilp", otsikko: "Ilmalämpöpumppu", tyyppi: "luku", yksikko: "kpl", min: 0, max: 3, askel: 1 },
      { avain: "lattialammitysKuiva", otsikko: "Lattialämmitys, kuiva tila", tyyppi: "kytkin" },
    ],
  },
  {
    otsikko: "Hinnoittelu",
    auki: true,
    kentat: [
      { avain: "kate", otsikko: "Kate", tyyppi: "luku", yksikko: "%", min: 0, max: 80, askel: 1 },
      {
        avain: "paatykolmio",
        otsikko: "Päätykolmion kustannuskerroin (harjakatto)",
        tyyppi: "luku",
        yksikko: "%",
        min: 0,
        max: 100,
        askel: 5,
        ohje: "0 % = päätykolmio ei maksa · 100 % = alkuperäisen Excelin (ylihinnoiteltu) laskenta",
      },
      { avain: "katePuumesta", otsikko: "Jälleenmyyjän (Puumesta) kate", tyyppi: "luku", yksikko: "%", min: 0, max: 50, askel: 1 },
    ],
  },
];

const eur = (v: number) => v.toLocaleString("fi-FI", { maximumFractionDigits: 0 }) + " €";
const eur2 = (v: number) => v.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const luku = (v: number) => v.toLocaleString("fi-FI", { maximumFractionDigits: 2 });
const LITTERAN_NIMI = Object.fromEntries(LITTERAT.map((l) => [l.koodi, l.nimi]));

function Laji({ r }: { r: LaskettuRivi }) {
  if (r.laji === "TEHDASTYO") return <span className="badge info ml-2">tehdastyö</span>;
  if (r.laji === "ALIURAKKA") return <span className="badge muted ml-2">aliurakka</span>;
  return null;
}

export function TarjouslaskuriClient({
  alkusyote,
  hinnat,
  rakennus,
  paluu,
}: {
  alkusyote: Syote;
  /** Kirjaston yksikköhinnat (avain -> €). */
  hinnat: Record<string, number>;
  /** Rakennus, johon laskenta tallennetaan; ilman sitä laskuri on vain arvio. */
  rakennus?: { id: string; nimi: string; aiempiaRiveja: number };
  paluu?: string;
}) {
  const [s, setS] = useState<Syote>(alkusyote);
  const [erittely, setErittely] = useState(false);
  const l = useMemo(() => laske(s, hinnat), [s, hinnat]);
  const aseta = <K extends keyof Syote>(k: K, v: Syote[K]) => setS((x) => ({ ...x, [k]: v }));

  const litteroittain = useMemo(() => {
    const ryhmat = new Map<string, LaskettuRivi[]>();
    for (const r of l.rivit) ryhmat.set(r.littera, [...(ryhmat.get(r.littera) ?? []), r]);
    return [...ryhmat.entries()];
  }, [l]);

  const ala = VERTAILU.min * 0.85;
  const yla = VERTAILU.max * 1.15;
  const kohta = (v: number) => Math.max(0, Math.min(100, ((v - ala) / (yla - ala)) * 100));
  const vaihteluvalilla = l.eurBm2 >= VERTAILU.min && l.eurBm2 <= VERTAILU.max;
  const pros = (v: number) => (l.omakustannus > 0 ? (v / l.omakustannus) * 100 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] gap-4 items-start">
        <div className="flex flex-col gap-3">
          {OSIOT.map((o) => (
            <details key={o.otsikko} open={o.auki} className="card">
              <summary className="cursor-pointer font-heading font-semibold px-5 py-3">{o.otsikko}</summary>
              <div className="grid grid-cols-2 gap-3 px-5 pb-5">
                {o.kentat.map((k) => (
                  <label key={k.avain} className="flex flex-col gap-1 text-xs text-ink-2">
                    {k.otsikko}
                    {k.tyyppi === "luku" && (
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          className="field font-mono"
                          value={s[k.avain] as number}
                          min={k.min}
                          max={k.max}
                          step={k.askel}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            aseta(k.avain, (Number.isFinite(v) ? v : 0) as never);
                          }}
                        />
                        {k.yksikko && <span className="font-mono text-ink-muted w-8">{k.yksikko}</span>}
                      </span>
                    )}
                    {k.tyyppi === "valinta" && (
                      <select className="field" value={s[k.avain] as string} onChange={(e) => aseta(k.avain, e.target.value as never)}>
                        {k.valinnat.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                    {k.tyyppi === "kytkin" && (
                      <span className="flex items-center gap-2 py-2 text-sm text-ink">
                        <input type="checkbox" checked={s[k.avain] as boolean} onChange={(e) => aseta(k.avain, e.target.checked as never)} />
                        {s[k.avain] ? "Kyllä" : "Ei"}
                      </span>
                    )}
                    {"ohje" in k && k.ohje && <span className="text-[11px] text-ink-muted">{k.ohje}</span>}
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>

        <div className="flex flex-col gap-3 sticky top-4">
          <div className="card p-5 flex flex-col gap-2 text-sm">
            <div className="flex justify-between items-baseline">
              <span className="font-semibold">Omakustannus</span>
              <span className="font-heading text-2xl font-bold">{eur(l.omakustannus)}</span>
            </div>
            <div className="flex justify-between text-ink-2">
              <span>Tehdastyö</span>
              <span className="font-mono">
                {eur(l.tehdastyo)} · {pros(l.tehdastyo).toFixed(1)} %
              </span>
            </div>
            <div className="flex justify-between text-ink-2">
              <span>Aliurakka</span>
              <span className="font-mono">
                {eur(l.aliurakka)} · {pros(l.aliurakka).toFixed(1)} %
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <span>Kate {s.kate} %</span>
              <span className="font-mono">{eur(l.kateEur)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Myyntihinta alv 0 %</span>
              <span className="font-mono">{eur(l.myyntihinta)}</span>
            </div>
            <div className="flex justify-between text-ink-2 border-t border-line pt-2">
              <span>Jälleenmyyjän kate {s.katePuumesta} %</span>
              <span className="font-mono">{eur(l.katePuumestaEur)}</span>
            </div>
            <div className="flex justify-between text-ink-2">
              <span>Myyntihinta jälleenmyyjältä alv 0 %</span>
              <span className="font-mono">{eur(l.myyntihintaPuumesta)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Myyntihinta jälleenmyyjältä alv 25,5 %</span>
              <span className="font-mono">{eur(l.myyntihintaPuumestaAlv)}</span>
            </div>
          </div>

          <div className="card p-5 flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase text-ink-2">Vertailu toteutuneisiin projekteihin (€/B-m²)</div>
            <div className="relative h-2 mt-4 rounded-full bg-line">
              <div className="absolute -top-2 h-6 w-px bg-ink-2" style={{ left: `${kohta(VERTAILU.mediaani)}%` }} title="Mediaani" />
              <div
                className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full bg-accent border-2 border-surface"
                style={{ left: `${kohta(l.eurBm2)}%` }}
                title="Tämä laskelma"
              />
            </div>
            <div className="flex justify-between font-mono text-[11px] text-ink-muted">
              <span>{Math.round(VERTAILU.min)} €</span>
              <span>mediaani {Math.round(VERTAILU.mediaani)} €</span>
              <span>{Math.round(VERTAILU.max)} €</span>
            </div>
            <p className={`text-xs ${vaihteluvalilla ? "text-ink-2" : "text-critical"}`}>
              <b>{Math.round(l.eurBm2)} €/m²</b> (B-m² {luku(l.geometria.bruttoala)}).{" "}
              {vaihteluvalilla
                ? `Toteutuneiden ${VERTAILU.n} pienprojektin vaihteluvälillä.`
                : `Toteutuneiden ${VERTAILU.n} projektin vaihteluvälin ulkopuolella: tarkista syötteet ja päätykolmion kerroin.`}
            </p>
          </div>

          {rakennus ? (
            <form action={tallennaLaskenta} className="card p-5 flex flex-col gap-2">
              <input type="hidden" name="buildingId" value={rakennus.id} />
              <input type="hidden" name="syote" value={JSON.stringify(s)} />
              {paluu && <input type="hidden" name="paluu" value={paluu} />}
              <button className="btn btn-primary">Tallenna rakennukselle {rakennus.nimi}</button>
              <p className="text-xs text-ink-2">
                Laskurin {l.rivit.filter((r) => r.maara !== 0).length} riviä viedään rakennuksen määräluetteloon litteroittain
                {rakennus.aiempiaRiveja > 0 && `, ja aiemmat ${rakennus.aiempiaRiveja} laskurin riviä korvataan`}. Käsin syötetyt ja BIM-rivit
                säilyvät.
              </p>
            </form>
          ) : (
            <p className="text-xs text-ink-muted px-1">
              Tämä on pelkkä arvio. Tallentaaksesi laskennan avaa laskuri tarjouksen tai projektin rakennuksesta.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <button type="button" onClick={() => setErittely((e) => !e)} className="w-full text-left px-5 py-3 font-heading font-semibold">
          {erittely ? "▾" : "▸"} Kustannuserittely litteroittain ({l.rivit.filter((r) => r.summa !== 0).length} riviä)
        </button>
        {erittely && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
                <th className="px-5 py-2">Rivi</th>
                <th className="px-3 py-2 text-right">Yks. hinta</th>
                <th className="px-3 py-2 text-right">Määrä</th>
                <th className="px-5 py-2 text-right">Yhteensä</th>
              </tr>
            </thead>
            <tbody>
              {litteroittain.map(([littera, rivit]) => (
                <LitteraRyhma key={littera} littera={littera} rivit={rivit} />
              ))}
              <tr className="border-t-2 border-ink font-semibold">
                <td className="px-5 py-2">Omakustannus yhteensä</td>
                <td />
                <td />
                <td className="px-5 py-2 text-right font-mono">{eur(l.omakustannus)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LitteraRyhma({ littera, rivit }: { littera: string; rivit: LaskettuRivi[] }) {
  const summa = rivit.reduce((a, r) => a + r.summa, 0);
  return (
    <>
      <tr className="bg-surface-raised border-b border-line">
        <td className="px-5 py-1.5 font-mono text-xs font-semibold uppercase">
          {littera} {LITTERAN_NIMI[littera]}
        </td>
        <td />
        <td />
        <td className="px-5 py-1.5 text-right font-mono text-xs font-semibold">{eur(summa)}</td>
      </tr>
      {rivit.map((r) => (
        <tr key={r.avain} className={`border-b border-line ${r.summa === 0 ? "text-ink-muted" : ""}`}>
          <td className="px-5 py-1">
            <span className="font-mono text-xs text-ink-muted mr-2">{r.avain}</span>
            {r.nimi}
            <Laji r={r} />
          </td>
          <td className="px-3 py-1 text-right font-mono">{luku(r.yksikkohinta)}</td>
          <td className="px-3 py-1 text-right font-mono">
            {luku(r.maara)} {r.yksikko}
          </td>
          <td className="px-5 py-1 text-right font-mono">{eur2(r.summa)}</td>
        </tr>
      ))}
    </>
  );
}
