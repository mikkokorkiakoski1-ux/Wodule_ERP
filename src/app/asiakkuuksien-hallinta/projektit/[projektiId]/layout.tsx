import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjektinValilehdet } from "@/components/ProjektinValilehdet";

// Projektin alasivujen yhteinen otsikko ja välilehdet.
export default async function ProjektiLayout({
  params,
  children,
}: {
  params: { projektiId: string };
  children: React.ReactNode;
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    select: { id: true, name: true, customer: { select: { name: true } } },
  });
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-ink-muted font-mono uppercase">
            <Link href="/asiakkuuksien-hallinta" className="hover:text-ink">
              Asiakkuuksien hallinta
            </Link>{" "}
            &raquo;{" "}
            <Link href="/asiakkuuksien-hallinta/projektit" className="hover:text-ink">
              Projektit
            </Link>{" "}
            &raquo; {project.customer.name}
          </p>
          <h1 className="text-2xl">{project.name}</h1>
        </div>
        <ProjektinValilehdet projectId={project.id} />
      </div>
      {children}
    </div>
  );
}
