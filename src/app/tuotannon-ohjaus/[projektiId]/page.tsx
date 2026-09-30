import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setSharepointUrl } from "@/lib/actions/tuotannonohjaus";

export const dynamic = "force-dynamic";

export default async function TuotantokansioPage({
  params,
}: {
  params: { projektiId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: {
      customer: true,
      productionFolder: { include: { _count: { select: { workOrders: true, drawings: true } } } },
    },
  });
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Tuotannon ohjaus &raquo; Sharepoint tuotantokansio
        </p>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-ink-2 text-sm mt-1">{project.customer.name}</p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Sharepoint-tuotantokansio</h2>
        <form action={setSharepointUrl} className="flex gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <input
            name="sharepointUrl"
            placeholder="https://…sharepoint.com/…"
            defaultValue={project.productionFolder?.sharepointUrl ?? ""}
            required
            className="flex-1 border border-line rounded-md px-3 py-2 text-sm bg-surface-raised"
          />
          <button className="bg-ink text-surface rounded-full px-4 py-2 text-sm font-semibold">
            Tallenna
          </button>
        </form>
        {project.productionFolder?.syncedAt && (
          <p className="text-xs text-ink-muted mt-2">
            Viimeksi synkronoitu {new Date(project.productionFolder.syncedAt).toLocaleString("fi-FI")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href={`/tuotannon-ohjaus/${project.id}/tyomaaraimet`} className="card p-4 hover:border-line-strong">
          <div className="font-semibold">Työmääräimet</div>
          <div className="text-2xl font-mono mt-2">{project.productionFolder?._count.workOrders ?? 0}</div>
        </Link>
        <Link href={`/tuotannon-ohjaus/${project.id}/piirustukset`} className="card p-4 hover:border-line-strong">
          <div className="font-semibold">Piirustukset</div>
          <div className="text-2xl font-mono mt-2">{project.productionFolder?._count.drawings ?? 0}</div>
        </Link>
      </div>
    </div>
  );
}
