// Yhdistetty valintalista projektille, rakennukselle tai elementille.
// Arvo on muotoa "projekti:<id>", "rakennus:<id>" tai "elementti:<id>".
import type { haeKohdistukset } from "@/lib/rakennukset";
import { rakennuksenNimi } from "@/lib/rakennukset";

type Kohdistukset = Awaited<ReturnType<typeof haeKohdistukset>>;

export function KohdeValinta({
  projektit,
  rakennukset,
  name = "kohde",
  tyhja = "Ei kohdistusta",
  projektitasolla = true,
  className = "field",
}: {
  projektit: { id: string; name: string }[];
  rakennukset: Kohdistukset;
  name?: string;
  tyhja?: string;
  /** Salli koko projektin valinta (reklamaatiot). Muuten vain rakennus tai elementti. */
  projektitasolla?: boolean;
  className?: string;
}) {
  return (
    <select name={name} defaultValue="" className={className} aria-label="Kohde">
      <option value="">{tyhja}</option>
      {projektit.map((p) => {
        const omat = rakennukset.filter((r) => r.projectId === p.id);
        if (!projektitasolla && omat.length === 0) return null;
        return (
          <optgroup key={p.id} label={p.name}>
            {projektitasolla && <option value={`projekti:${p.id}`}>{p.name} (koko projekti)</option>}
            {omat.map((r) => [
              <option key={r.id} value={`rakennus:${r.id}`}>
                {p.name} · {rakennuksenNimi(r)}
              </option>,
              ...r.elements.map((e) => (
                <option key={e.id} value={`elementti:${e.id}`}>
                  {p.name} · {r.code} · {e.code}
                </option>
              )),
            ])}
          </optgroup>
        );
      })}
    </select>
  );
}

/** Kohdistuksen näyttöteksti listoihin, esim. "Sröm · A · A-US-01". */
export function kohdeTeksti(c: {
  project?: { name: string } | null;
  building?: { code: string } | null;
  element?: { code: string } | null;
}): string | null {
  const osat = [c.project?.name, c.building?.code, c.element?.code].filter(Boolean);
  return osat.length ? osat.join(" · ") : null;
}
