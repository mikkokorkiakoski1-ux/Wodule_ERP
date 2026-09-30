import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addMilestone, toggleMilestone } from "@/lib/actions/asiakkuudet";

export const dynamic = "force-dynamic";

export default async function ProjektiaikatauluPage({
  params,
}: {
  params: { projektiId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: { milestones: { orderBy: { seq: "asc" } } },
  });
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Asiakkuuksien hallinta &raquo; Projektit &raquo; {project.name} &raquo; Projektiaikataulu
        </p>
        <h1 className="text-2xl font-semibold">Projektiaikataulu</h1>
        <p className="text-ink-2 text-sm mt-1">
          Asiakkaalle näkyvät virstanpylväät. Tuotannon yksityiskohtainen viikkoaikataulu on{" "}
          <a className="underline" href="/asiakkuuksien-hallinta/projektit/tuotantoaikataulu">
            Tuotantoaikataulu projektit
          </a>
          -näkymässä.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi virstanpylväs</h2>
        <form action={addMilestone} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="title" placeholder="Otsikko" required className="field" />
          <input name="dueDate" type="date" className="field" />
          <button className="justify-self-start btn btn-primary">
            Lisää
          </button>
        </form>
      </div>

      <div className="card divide-y divide-line">
        {project.milestones.map((m) => (
          <form
            key={m.id}
            action={async () => {
              "use server";
              await toggleMilestone(m.id, project.id, !m.done);
            }}
            className="p-4 flex items-center justify-between gap-3"
          >
            <div>
              <div className={m.done ? "line-through text-ink-muted" : "font-medium"}>{m.title}</div>
              {m.dueDate && (
                <div className="text-xs text-ink-2 mt-0.5">
                  {new Date(m.dueDate).toLocaleDateString("fi-FI")}
                </div>
              )}
            </div>
            <button type="submit" className={`badge ${m.done ? "ok" : "muted"}`}>
              {m.done ? "Valmis" : "Merkitse valmiiksi"}
            </button>
          </form>
        ))}
        {project.milestones.length === 0 && (
          <div className="p-6 text-center text-ink-muted text-sm">Ei vielä virstanpylväitä.</div>
        )}
      </div>
    </div>
  );
}
