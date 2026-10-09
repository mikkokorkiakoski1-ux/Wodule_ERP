// Tarjouslaskentapohjien lomakkeet (tallenna pohjaksi, käytä pohjaa) ja
// rakennuksen valinta tarjouslaskentaan.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { kaytaPohjaa, tallennaPohjaksi } from "@/lib/actions/laskentapohjat";
import { rakennuksenNimi } from "@/lib/rakennukset";
import { Kentta } from "@/components/projektinhallinta";

/** Pohjan käyttö ja tallennus rakennukselle. */
export async function PohjaLomakkeet({ rakennusId, rakennusKoodi, paluu, riveja }: { rakennusId: string; rakennusKoodi: string; paluu: string; riveja: number }) {
  const pohjat = await prisma.laskentapohja.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { rivit: true } } } });
  return (
    <div className="card p-5 flex flex-col gap-4">
      <h3 className="font-semibold">Laskentapohjat</h3>
      {pohjat.length > 0 ? (
        <form action={kaytaPohjaa} className="grid grid-cols-[2fr_1fr_auto] gap-2 items-end">
          <input type="hidden" name="buildingId" value={rakennusId} />
          <input type="hidden" name="paluu" value={paluu} />
          <Kentta otsikko="Käytä pohjaa">
            <select name="pohjaId" required defaultValue="" className="field">
              <option value="" disabled>
                Valitse pohja
              </option>
              {pohjat.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p._count.rivit} riviä)
                </option>
              ))}
            </select>
          </Kentta>
          <Kentta otsikko="Rivit">
            <select name="tapa" defaultValue={riveja ? "lisaa" : "korvaa"} className="field">
              <option value="lisaa">Lisää nykyisiin</option>
              <option value="korvaa">Korvaa nykyiset (BIM säilyy)</option>
            </select>
          </Kentta>
          <button className="btn btn-secondary btn-sm">Käytä</button>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">Ei vielä tallennettuja pohjia.</p>
      )}
      <form action={tallennaPohjaksi} className="grid grid-cols-[2fr_2fr_auto] gap-2 items-end border-t border-line pt-4">
        <input type="hidden" name="buildingId" value={rakennusId} />
        <input type="hidden" name="paluu" value={paluu} />
        <Kentta otsikko={`Tallenna rakennuksen ${rakennusKoodi} laskenta pohjaksi`}>
          <input name="name" list="pohjien-nimet" placeholder="Pohjan nimi, esim. Paritalo 120 m²" required className="field" />
          <datalist id="pohjien-nimet">
            {pohjat.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </Kentta>
        <Kentta otsikko="Kuvaus">
          <input name="description" className="field" />
        </Kentta>
        <button className="btn btn-primary btn-sm" disabled={riveja === 0}>
          Tallenna pohjaksi
        </button>
        <label className="col-span-3 flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" name="paivita" /> Päivitä olemassa oleva samanniminen pohja
        </label>
      </form>
      <Link href={`/asiakkuuksien-hallinta/tarjouslaskenta/pohjat?rakennus=${rakennusId}`} className="text-xs underline self-start">
        Hallitse pohjia
      </Link>
    </div>
  );
}

/** Rakennuksen valinta, kun tarjouslaskenta avataan ilman rakennusta. */
export async function RakennuksenValinta({ kohde }: { kohde: "laskuri" | "manuaalinen" }) {
  const rakennukset = await prisma.building.findMany({
    where: { OR: [{ offer: { project: { is: null } }, projectId: null }, { projectId: { not: null } }] },
    include: { offer: { include: { customer: true } }, project: { include: { customer: true } }, _count: { select: { parts: true } } },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const polku = kohde === "laskuri" ? "/asiakkuuksien-hallinta/tarjouslaskenta" : "/asiakkuuksien-hallinta/tarjouslaskenta/manuaalinen";
  return (
    <div className="card p-5 flex flex-col gap-3">
      <h3 className="font-semibold">Valitse rakennus</h3>
      <p className="text-sm text-ink-2">
        Laskenta tallennetaan rakennuksen määräluetteloon. Lisää rakennus ensin{" "}
        <Link href="/asiakkuuksien-hallinta/tarjoukset" className="underline">
          tarjoukselle
        </Link>{" "}
        tai projektille.
      </p>
      {rakennukset.length === 0 ? (
        <p className="text-sm text-ink-muted">Ei vielä rakennuksia.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {rakennukset.map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-3">
              <span>
                {r.project ? (
                  <span className="badge muted mr-2">projekti</span>
                ) : (
                  <span className="badge info mr-2">tarjous</span>
                )}
                {r.project ? `${r.project.customer.name}: ${r.project.name}` : `${r.offer?.customer.name}: ${r.offer?.title}`} · {rakennuksenNimi(r)}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-ink-muted">{r._count.parts} riviä</span>
                <Link href={`${polku}?rakennus=${r.id}`} className="btn btn-secondary btn-sm">
                  Avaa
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
