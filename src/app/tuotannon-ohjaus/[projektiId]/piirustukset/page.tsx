import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { haeKohdistukset } from "@/lib/rakennukset";
import { KohdeValinta, kohdeTeksti } from "@/components/KohdeValinta";
import { addDrawing } from "@/lib/actions/tuotannonohjaus";

export const dynamic = "force-dynamic";

export default async function PiirustuksetPage({
  params,
}: {
  params: { projektiId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: {
      productionFolder: {
        include: { drawings: { orderBy: { uploadedAt: "desc" }, include: { building: true, element: true } } },
      },
    },
  });
  if (!project) notFound();
  const rakennukset = await haeKohdistukset(project.id);

  const drawings = project.productionFolder?.drawings ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Tuotannon ohjaus &raquo; {project.name} &raquo; Piirustukset
        </p>
        <h1 className="text-2xl font-semibold">Piirustukset</h1>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi piirustus</h2>
        <form action={addDrawing} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <KohdeValinta projektit={[project]} rakennukset={rakennukset} tyhja="Koko projekti" projektitasolla={false} />
          <input name="title" placeholder="Otsikko" required className="field" />
          <input name="revision" placeholder="Revisio" defaultValue="A" className="field" />
          <input name="fileUrl" placeholder="Linkki tiedostoon" className="field" />
          <button className="justify-self-start btn btn-primary">
            Lisää
          </button>
        </form>
      </div>

      <div className="card divide-y divide-line">
        {drawings.map((d) => (
          <div key={d.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-ink-2 mt-0.5">
                Revisio {d.revision}
                {kohdeTeksti(d) && <span className="font-mono"> · {kohdeTeksti(d)}</span>}
              </div>
            </div>
            {d.fileUrl && (
              <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                Avaa
              </a>
            )}
          </div>
        ))}
        {drawings.length === 0 && (
          <div className="p-6 text-center text-ink-muted text-sm">Ei vielä piirustuksia.</div>
        )}
      </div>
    </div>
  );
}
