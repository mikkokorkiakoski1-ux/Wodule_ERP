import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addWorkOrder } from "@/lib/actions/tuotannonohjaus";

export const dynamic = "force-dynamic";

export default async function TyomaaraimetPage({
  params,
}: {
  params: { projektiId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: { productionFolder: { include: { workOrders: { orderBy: { createdAt: "desc" } } } } },
  });
  if (!project) notFound();

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
          <input name="number" placeholder="Numero" required className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
          <input name="hoursEstimated" type="number" step="0.5" placeholder="Arvioidut tunnit" className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
          <input name="description" placeholder="Kuvaus" className="col-span-2 border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
          <button className="justify-self-start bg-ink text-surface rounded-full px-4 py-2 text-sm font-semibold">
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
