import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createOrderConfirmation } from "@/lib/actions/asiakkuudet";
import { lisaaJasen, poistaJasen } from "@/lib/actions/projektinhallinta";
import { ORGANISAATION_ROOLIT, haeHankinnat, haeTehtavalista } from "@/lib/projektinhallinta";
import { onPaattynyt, type Vaihe } from "@/lib/hankinta";
import { euro, pvm } from "@/lib/muotoilu";
import { HenkiloValinta, Takaraja, Virhe } from "@/components/projektinhallinta";

export const dynamic = "force-dynamic";

const TILAT: Record<string, string> = {
  SUUNNITTELU: "Suunnittelu",
  KAYNNISSA: "Käynnissä",
  VALMIS: "Valmis",
  KESKEYTETTY: "Keskeytetty",
};

export default async function ProjektiYhteenvetoPage({
  params,
  searchParams,
}: {
  params: { projektiId: string };
  searchParams: { virhe?: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projektiId },
    include: {
      offer: true,
      orderConfirmation: true,
      members: { include: { user: true }, orderBy: { role: "asc" } },
      productionScheduleItems: true,
    },
  });
  if (!project) notFound();

  const polku = `/asiakkuuksien-hallinta/projektit/${project.id}`;
  const [{ aikataulu, rivit: hankinnat }, tehtavat, henkilot] = await Promise.all([
    haeHankinnat(project.id),
    haeTehtavalista({ projectId: project.id }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  const aloitukset = aikataulu.map((t) => t.aloitus).filter((d): d is Date => !!d);
  const ennusteet = aikataulu.map((t) => t.ennuste).filter((d): d is Date => !!d);
  const alku = aloitukset.length ? new Date(Math.min(...aloitukset.map(Number))) : null;
  const loppu = ennusteet.length ? new Date(Math.max(...ennusteet.map(Number))) : null;
  const avoimetHankinnat = hankinnat.filter((h) => !onPaattynyt(h.phase as Vaihe));
  const avoimetTehtavat = tehtavat.filter((t) => !t.paattynyt);
  const myohassa = avoimetTehtavat.filter((t) => t.kiire === "myohassa").length;
  const kustannus = hankinnat.reduce((s, h) => s + (h.costCents ?? 0), 0);
  const seuraavat = avoimetTehtavat.filter((t) => t.takaraja).slice(0, 6);

  return (
    <>
      <Virhe viesti={searchParams.virhe} />

      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Tila</div>
          <div className="font-heading text-lg font-bold mt-1">{TILAT[project.status] ?? project.status}</div>
          {project.promisedDeliveryDate && (
            <div className="text-xs text-ink-2 mt-1">Luvattu toimitus {pvm(project.promisedDeliveryDate)}</div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Aikataulu</div>
          <div className="font-heading text-lg font-bold mt-1">
            {alku ? `${pvm(alku)} – ${pvm(loppu)}` : "–"}
          </div>
          <div className="text-xs text-ink-2 mt-1">{aikataulu.length} tehtävää</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Hankinnat</div>
          <div className="font-heading text-lg font-bold mt-1">
            {avoimetHankinnat.length} / {hankinnat.length} avoinna
          </div>
          <div className="text-xs text-ink-2 mt-1">Kustannukset {euro(kustannus)} (alv 0 %)</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Tehtäviä myöhässä</div>
          <div className={`font-heading text-lg font-bold mt-1 ${myohassa ? "text-critical" : ""}`}>{myohassa}</div>
          <div className="text-xs text-ink-2 mt-1">{avoimetTehtavat.length} avointa tehtävää</div>
        </div>
      </div>

      {project.description && (
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Kuvaus</h2>
          <p className="text-sm text-ink-2 whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Seuraavat takarajat</h2>
            <Link href={`${polku}/tehtavat`} className="underline text-xs">
              Tehtäväluettelo
            </Link>
          </div>
          {seuraavat.length === 0 ? (
            <p className="text-sm text-ink-muted">Ei avoimia tehtäviä, joilla on takaraja.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {seuraavat.map((t) => (
                <li key={`${t.tyyppi}-${t.id}`} className="py-2 flex items-center gap-3 text-sm">
                  <Takaraja paiva={t.takaraja} kiire={t.kiire} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{t.otsikko}</div>
                    <div className="text-xs text-ink-2">
                      {t.toimenpide || t.tila} · {t.assignee?.name ?? "ei vastuuhenkilöä"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 flex flex-col gap-3">
          <h2 className="font-semibold">Projektiorganisaatio</h2>
          {project.members.length === 0 ? (
            <p className="text-sm text-ink-muted">Vastuuhenkilöitä ei ole vielä nimetty.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {project.members.map((m) => (
                <li key={m.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-ink-2">{m.role}</span>
                  <span className="flex items-center gap-3">
                    <Link href={`/henkilot/${m.user.id}`} className="font-medium hover:underline">
                      {m.user.name}
                    </Link>
                    <form action={poistaJasen}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="paluu" value={polku} />
                      <button className="text-xs text-ink-muted hover:text-critical" aria-label={`Poista ${m.user.name} roolista ${m.role}`}>
                        Poista
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={lisaaJasen} className="grid grid-cols-[1fr_1fr_auto] gap-2 pt-1">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="paluu" value={polku} />
            <input name="role" list="organisaation-roolit" placeholder="Rooli" required className="field" />
            <datalist id="organisaation-roolit">
              {ORGANISAATION_ROOLIT.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <HenkiloValinta henkilot={henkilot} name="userId" tyhja="Valitse henkilö" />
            <button className="btn btn-secondary btn-sm">Lisää</button>
          </form>
          {henkilot.length === 0 && (
            <p className="text-xs text-ink-muted">
              Lisää ensin henkilöitä{" "}
              <Link href="/henkilot" className="underline">
                henkilörekisteriin
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/asiakkuuksien-hallinta/projektit/tuotantoaikataulu" className="card p-4 hover:border-accent">
          <div className="font-semibold">Tuotantoaikataulu projektit</div>
          <div className="text-sm text-ink-2 mt-1">
            Koko tuotannon Gantt-aikajana · {project.productionScheduleItems.length} tämän projektin riviä
          </div>
        </Link>
        <Link href={`/tuotannon-ohjaus/${project.id}`} className="card p-4 hover:border-accent">
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
            <div className="text-ink-2 mt-1">Vahvistettu {pvm(project.orderConfirmation.confirmedAt)}</div>
            {project.orderConfirmation.notes && <div className="text-ink-2 mt-1">{project.orderConfirmation.notes}</div>}
          </div>
        ) : (
          <form action={createOrderConfirmation} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input name="number" placeholder="Tilausvahvistuksen numero" required className="field" />
            <input name="notes" placeholder="Huomiot" className="field" />
            <button className="justify-self-start btn btn-primary">Vahvista tilaus</button>
          </form>
        )}
      </div>
    </>
  );
}
