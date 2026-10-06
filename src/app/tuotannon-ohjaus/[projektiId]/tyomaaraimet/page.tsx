import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { haeKohdistukset } from "@/lib/rakennukset";
import { KohdeValinta, kohdeTeksti } from "@/components/KohdeValinta";
import { addWorkOrder } from "@/lib/actions/tuotannonohjaus";

export const dynamic = "force-dynamic";

export default async function TyomaaraimetPage({
  params,
}: {
  params: { projektiId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: {
      productionFolder: {
        include: { workOrders: { orderBy: { createdAt: "desc" }, include: { building: true, element: true } } },
      },
    },
  });
  if (!project) notFound();
  const rakennukset = await haeKohdistukset(project.id);

  const workOrders = project.productionFolder?.workOrders ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Tuotannon ohjaus &raquo; {project.name} &raquo; Työmääräimet
        </p>
        <h1 className="text-2xl font-semibold">Työmääräimet</h1>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi työmääräin</h2>
        <form action={addWorkOrder} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <KohdeValinta projektit={[project]} rakennukset={rakennukset} tyhja="Koko projekti" projektitasolla={false} />
          <input name="number" placeholder="Numero" required className="field" />
          <input name="hoursEstimated" type="number" step="0.5" placeholder="Arvioidut tunnit" className="field" />
          <input name="description" placeholder="Kuvaus" className="field" />
          <button className="justify-self-start btn btn-primary">
            Lisää
          </button>
        </form>
      </div>

      <div className="card divide-y divide-line">
        {workOrders.map((w) => (
          <div key={w.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium font-mono">{w.number}</div>
              {w.description && <div className="text-sm text-ink-2 mt-0.5">{w.description}</div>}
              {kohdeTeksti(w) && <div className="text-xs text-ink-muted font-mono mt-0.5">{kohdeTeksti(w)}</div>}
            </div>
            <div className="text-sm text-ink-2 font-mono">
              {w.hoursActual ?? "–"} / {w.hoursEstimated ?? "–"} h
            </div>
          </div>
        ))}
        {workOrders.length === 0 && (
          <div className="p-6 text-center text-ink-muted text-sm">Ei vielä työmääräimiä.</div>
        )}
      </div>
    </div>
  );
}
