import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createChecklist, addChecklistItem, setChecklistItemResult } from "@/lib/actions/laadunvarmistus";
import { haeKohdistukset } from "@/lib/rakennukset";
import { KohdeValinta, kohdeTeksti } from "@/components/KohdeValinta";

export const dynamic = "force-dynamic";

type Lista = Awaited<ReturnType<typeof haeListat>>[number];

function haeListat() {
  return prisma.qaChecklist.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { seq: "asc" } },
      building: { include: { project: true } },
      element: true,
    },
  });
}

function ListaKortti({ cl }: { cl: Lista }) {
  const kohde = kohdeTeksti({ project: cl.building?.project, building: cl.building, element: cl.element });
  return (
    <div id={`lista-${cl.id}`} className="card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-semibold">{cl.title}</h3>
        {cl.isTemplate ? (
          <span className="badge info">Pohja</span>
        ) : (
          kohde &&
          cl.building?.projectId && (
            <Link href={`/projektit/${cl.building.projectId}/rakennukset/${cl.building.id}#tarkastukset`} className="text-xs underline">
              {kohde}
            </Link>
          )
        )}
      </div>
      <div className="flex flex-col gap-2 mb-3">
        {cl.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{item.label}</span>
            {!cl.isTemplate && (
              <div className="flex gap-1 shrink-0">
                <form
                  action={async () => {
                    "use server";
                    await setChecklistItemResult(item.id, true);
                  }}
                >
                  <button className={`badge ${item.passed === true ? "ok" : "muted"}`} title="Hyväksytty">
                    OK
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await setChecklistItemResult(item.id, false);
                  }}
                >
                  <button className={`badge ${item.passed === false ? "crit" : "muted"}`} title="Hylätty">
                    Ei OK
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
        {cl.items.length === 0 && <div className="text-sm text-ink-muted">Ei vielä tarkastuskohtia.</div>}
      </div>
      <form action={addChecklistItem} className="flex gap-2">
        <input type="hidden" name="checklistId" value={cl.id} />
        <input name="label" placeholder="Uusi tarkastuskohta" required className="flex-1 field !text-xs" />
        <button className="badge muted">Lisää kohta</button>
      </form>
    </div>
  );
}

export default async function TarkastuslistatPage() {
  const [checklists, projects, rakennukset] = await Promise.all([
    haeListat(),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    haeKohdistukset(),
  ]);
  const pohjat = checklists.filter((c) => c.isTemplate);
  const tarkastukset = checklists.filter((c) => !c.isTemplate);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Laadunvarmistus &raquo; Tarkastuslistat</p>
        <h1 className="text-2xl font-semibold">Tarkastuslistat</h1>
        <p className="text-ink-2 text-sm mt-1 max-w-3xl">
          Pohjat ovat vakiotarkastuksia (esim. elementin lähtötarkastus). Rakennuksen sivulla pohjasta kopioidaan tarkastuslista
          rakennukselle tai yksittäiselle elementille, ja tulokset kirjataan kopioon.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi tarkastuslista</h2>
        <form action={createChecklist} className="grid grid-cols-[2fr_2fr_auto_auto] gap-3 items-center">
          <input name="title" placeholder="Otsikko" required className="field" />
          <KohdeValinta projektit={projects} rakennukset={rakennukset} tyhja="Ei kohdistusta" projektitasolla={false} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isTemplate" /> Pohja
          </label>
          <button className="btn btn-primary">Lisää</button>
        </form>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl">Pohjat</h2>
        {pohjat.map((cl) => (
          <ListaKortti key={cl.id} cl={cl} />
        ))}
        {pohjat.length === 0 && (
          <div className="card p-6 text-center text-ink-muted text-sm">Ei vielä pohjia. Merkitse uusi lista pohjaksi.</div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl">Tarkastukset</h2>
        {tarkastukset.map((cl) => (
          <ListaKortti key={cl.id} cl={cl} />
        ))}
        {tarkastukset.length === 0 && <div className="card p-6 text-center text-ink-muted text-sm">Ei vielä tarkastuksia.</div>}
      </section>
    </div>
  );
}
