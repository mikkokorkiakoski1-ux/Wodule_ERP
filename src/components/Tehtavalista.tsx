// Tehtäväluettelon taulukko: hankintarivit vaiheineen ja projektin omat
// tehtävät. Käytössä projektin Tehtäväluettelo-sivulla ja henkilön sivulla.
import Link from "next/link";
import type { User } from "@prisma/client";
import {
  asetaTehtavanTila,
  asetaVastuuhenkilo,
  siirraSeuraavaanVaiheeseen,
} from "@/lib/actions/projektinhallinta";
import { TEHTAVAN_TILAT, type TehtavalistanRivi } from "@/lib/projektinhallinta";
import { seuraavaVaihe, vaiheenNimi } from "@/lib/hankinta";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Takaraja } from "@/components/projektinhallinta";

export function Tehtavalista({
  rivit,
  henkilot,
  paluu,
  naytaProjekti = false,
  naytaVastuu = true,
}: {
  rivit: TehtavalistanRivi[];
  henkilot: User[];
  paluu: string;
  naytaProjekti?: boolean;
  naytaVastuu?: boolean;
}) {
  if (rivit.length === 0) return <p className="p-6 text-center text-sm text-ink-muted">Ei tehtäviä.</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
          <th className="p-3 w-28">Takaraja</th>
          <th className="p-3">Tehtävä</th>
          <th className="p-3 w-40">Vaihe / tila</th>
          {naytaVastuu && <th className="p-3 w-44">Vastuuhenkilö</th>}
          <th className="p-3 w-32" />
        </tr>
      </thead>
      <tbody>
        {rivit.map((r) => {
          const pohja = `/projektit/${r.projectId}`;
          const seuraava = r.vaihe ? seuraavaVaihe(r.vaihe) : null;
          return (
            <tr key={`${r.tyyppi}-${r.id}`} className={`border-b border-line last:border-0 align-top ${r.paattynyt ? "text-ink-muted" : ""}`}>
              <td className="p-3">
                <Takaraja paiva={r.takaraja} kiire={r.kiire} />
              </td>
              <td className="p-3">
                <div className={`font-medium ${r.paattynyt ? "line-through" : ""}`}>{r.otsikko}</div>
                <div className="text-xs text-ink-2">
                  {[naytaProjekti ? r.projekti : null, r.alue, r.toimenpide].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td className="p-3">
                {r.tyyppi === "hankinta" ? (
                  <span className="badge muted">{r.tila}</span>
                ) : (
                  <form action={asetaTehtavanTila}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="paluu" value={paluu} />
                    <AutoSubmitSelect
                      name="status"
                      defaultValue={TEHTAVAN_TILAT.find((s) => s.nimi === r.tila)?.arvo}
                      className="field !text-xs !py-1 !px-2"
                      aria-label="Tila"
                    >
                      {TEHTAVAN_TILAT.map((s) => (
                        <option key={s.arvo} value={s.arvo}>
                          {s.nimi}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </form>
                )}
              </td>
              {naytaVastuu && (
                <td className="p-3">
                  <form action={asetaVastuuhenkilo}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="tyyppi" value={r.tyyppi} />
                    <input type="hidden" name="paluu" value={paluu} />
                    <AutoSubmitSelect
                      name="assigneeId"
                      defaultValue={r.assignee?.id ?? ""}
                      className="field !text-xs !py-1 !px-2 w-full"
                      aria-label="Vastuuhenkilö"
                    >
                      <option value="">Ei vastuuhenkilöä</option>
                      {henkilot
                        .filter((h) => h.active || h.id === r.assignee?.id)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                    </AutoSubmitSelect>
                  </form>
                </td>
              )}
              <td className="p-3 text-right whitespace-nowrap">
                <div className="flex flex-col items-end gap-1">
                  {seuraava && (
                    <form action={siirraSeuraavaanVaiheeseen}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="paluu" value={paluu} />
                      <button className="btn btn-ghost btn-sm" title={`Merkitse vaihe ${r.vaihe ? vaiheenNimi(r.vaihe) : ""} tehdyksi`}>
                        {vaiheenNimi(seuraava)} →
                      </button>
                    </form>
                  )}
                  <Link
                    href={
                      r.tyyppi === "hankinta"
                        ? `${pohja}/hankintasuunnitelma?muokkaa=${r.id}#lomake`
                        : `${pohja}/tehtavat?muokkaa=${r.id}#lomake`
                    }
                    className="underline text-xs"
                  >
                    Muokkaa
                  </Link>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
