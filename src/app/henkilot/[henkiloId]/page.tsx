import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { haeTehtavalista } from "@/lib/projektinhallinta";
import { Tehtavalista } from "@/components/Tehtavalista";

export const dynamic = "force-dynamic";

// Henkilön tehtäväluettelo kaikista projekteista: hankinnat vaiheineen ja
// omat tehtävät takarajajärjestyksessä.
export default async function HenkilonTehtavatPage({
  params,
  searchParams,
}: {
  params: { henkiloId: string };
  searchParams: { valmiit?: string };
}) {
  const henkilo = await prisma.user.findUnique({
    where: { id: params.henkiloId },
    include: { memberships: { include: { project: true } } },
  });
  if (!henkilo) notFound();

  const [kaikki, henkilot] = await Promise.all([
    haeTehtavalista({ userId: henkilo.id }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  const rivit = searchParams.valmiit ? kaikki : kaikki.filter((r) => !r.paattynyt);
  const avoimet = kaikki.filter((r) => !r.paattynyt);
  const polku = `/henkilot/${henkilo.id}`;
  const paluu = searchParams.valmiit ? `${polku}?valmiit=1` : polku;

  const projekteittain = new Map<string, typeof rivit>();
  for (const r of rivit) projekteittain.set(r.projectId, [...(projekteittain.get(r.projectId) ?? []), r]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          <Link href="/henkilot" className="hover:text-ink">
            Henkilöt
          </Link>{" "}
          &raquo; {henkilo.name}
        </p>
        <h1 className="text-2xl">{henkilo.name}</h1>
        <p className="text-ink-2 text-sm mt-1">
          {[henkilo.email, henkilo.phone].filter(Boolean).join(" · ")}
          {henkilo.memberships.length > 0 && (
            <> · {henkilo.memberships.map((m) => `${m.role} (${m.project.name})`).join(", ")}</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Avoimia tehtäviä</div>
          <div className="font-heading text-2xl font-bold">{avoimet.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Myöhässä</div>
          <div className={`font-heading text-2xl font-bold ${avoimet.some((r) => r.kiire === "myohassa") ? "text-critical" : ""}`}>
            {avoimet.filter((r) => r.kiire === "myohassa").length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Takaraja seuraavan 7 päivän aikana</div>
          <div className="font-heading text-2xl font-bold">{avoimet.filter((r) => r.kiire === "lahestyy").length}</div>
        </div>
      </div>

      <div className="flex justify-end text-xs">
        <Link href={searchParams.valmiit ? polku : `${polku}?valmiit=1`} className="underline">
          {searchParams.valmiit ? "Piilota valmiit" : "Näytä valmiit"}
        </Link>
      </div>

      {Array.from(projekteittain.entries()).map(([projectId, r]) => (
        <section key={projectId} className="card">
          <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
            <h2 className="text-base">{r[0].projekti}</h2>
            <Link href={`/projektit/${projectId}/tehtavat`} className="underline text-xs">
              Projektin tehtäväluettelo
            </Link>
          </header>
          <Tehtavalista rivit={r} henkilot={henkilot} paluu={paluu} />
        </section>
      ))}
      {rivit.length === 0 && <div className="card p-6 text-center text-sm text-ink-muted">Ei avoimia tehtäviä.</div>}
    </div>
  );
}
