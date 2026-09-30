import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createOrderConfirmation } from "@/lib/actions/asiakkuudet";

export const dynamic = "force-dynamic";

export default async function ProjektiYhteenvetoPage({
  params,
}: {
  params: { projektiId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: {
      customer: true,
      offer: true,
      orderConfirmation: true,
      procurementPlan: { include: { items: true } },
      milestones: true,
      productionScheduleItems: true,
    },
  });

  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Asiakkuuksien hallinta &raquo; Projektit &raquo; Yhteenvetosivu
        </p>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-ink-2 text-sm mt-1">{project.customer.name}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Tila</div>
          <div className="font-semibold mt-1">{project.status}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Virstanpylväitä</div>
          <div className="font-semibold mt-1">{project.milestones.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Tuotantoaikataulun rivejä</div>
          <div className="font-semibold mt-1">{project.productionScheduleItems.length}</div>
        </div>
      </div>

      {project.description && (
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Kuvaus</h2>
          <p className="text-sm text-ink-2 whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Link href={`/asiakkuuksien-hallinta/projektit/${project.id}/aikataulu`} className="card p-4 hover:border-line-strong">
          <div className="font-semibold">Projektiaikataulu</div>
          <div className="text-sm text-ink-2 mt-1">Asiakkaalle näkyvät virstanpylväät</div>
        </Link>
        <Link
          href={`/asiakkuuksien-hallinta/projektit/${project.id}/hankintasuunnitelma`}
          className="card p-4 hover:border-line-strong"
        >
          <div className="font-semibold">Hankintasuunnitelma</div>
          <div className="text-sm text-ink-2 mt-1">
            {project.procurementPlan?.items.length ?? 0} hankintanimikettä
          </div>
        </Link>
        <Link
          href="/asiakkuuksien-hallinta/projektit/tuotantoaikataulu"
          className="card p-4 hover:border-line-strong"
        >
          <div className="font-semibold">Tuotantoaikataulu projektit</div>
          <div className="text-sm text-ink-2 mt-1">Koko tuotannon Gantt-aikajana</div>
        </Link>
        <Link href={`/tuotannon-ohjaus/${project.id}`} className="card p-4 hover:border-line-strong">
          <div className="font-semibold">Tuotannon ohjaus</div>
          <div className="text-sm text-ink-2 mt-1">Sharepoint-tuotantokansio, työmääräimet, piirustukset</div>
        </Link>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Tilausvahvistus</h2>
        {project.orderConfirmation ? (
          <div className="text-sm">
            <div>
              Numero: <span className="font-mono">{project.orderConfirmation.number}</span>
            </div>
            <div className="text-ink-2 mt-1">
              Vahvistettu {new Date(project.orderConfirmation.confirmedAt).toLocaleDateString("fi-FI")}
            </div>
            {project.orderConfirmation.notes && (
              <div className="text-ink-2 mt-1">{project.orderConfirmation.notes}</div>
            )}
          </div>
        ) : (
          <form action={createOrderConfirmation} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input
              name="number"
              placeholder="Tilausvahvistuksen numero"
              required
              className="field"
            />
            <input
              name="notes"
              placeholder="Huomiot"
              className="field"
            />
            <button className="justify-self-start btn btn-primary">
              Vahvista tilaus
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
