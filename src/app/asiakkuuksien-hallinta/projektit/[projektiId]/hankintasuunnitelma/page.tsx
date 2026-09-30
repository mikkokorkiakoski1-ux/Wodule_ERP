import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addProcurementItem } from "@/lib/actions/asiakkuudet";

export const dynamic = "force-dynamic";

export default async function HankintasuunnitelmaPage({
  params,
}: {
  params: { projektiId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: { procurementPlan: { include: { items: true } } },
  });
  if (!project) notFound();

  const items = project.procurementPlan?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Asiakkuuksien hallinta &raquo; Projektit &raquo; {project.name} &raquo; Hankintasuunnitelma
        </p>
        <h1 className="text-2xl font-semibold">Hankintasuunnitelma</h1>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi hankintanimike</h2>
        <form action={addProcurementItem} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="description" placeholder="Kuvaus" required className="field col-span-2" />
          <input name="quantity" type="number" step="0.01" placeholder="Määrä" defaultValue={1} className="field" />
          <input name="unit" placeholder="Yksikkö" defaultValue="kpl" className="field" />
          <input name="supplier" placeholder="Toimittaja" className="field" />
          <input name="neededBy" type="date" className="field" />
          <button className="justify-self-start btn btn-primary">
            Lisää
          </button>
        </form>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Kuvaus</th>
              <th className="p-3 text-right">Määrä</th>
              <th className="p-3">Toimittaja</th>
              <th className="p-3">Tarvitaan</th>
              <th className="p-3">Tilattu</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{i.description}</td>
                <td className="p-3 text-right font-mono">
                  {i.quantity} {i.unit}
                </td>
                <td className="p-3 text-ink-2">{i.supplier || "–"}</td>
                <td className="p-3 text-ink-2">
                  {i.neededBy ? new Date(i.neededBy).toLocaleDateString("fi-FI") : "–"}
                </td>
                <td className="p-3">
                  <span className={`badge ${i.ordered ? "ok" : "muted"}`}>
                    {i.ordered ? "Kyllä" : "Ei"}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-muted">
                  Ei vielä hankintanimikkeitä.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
