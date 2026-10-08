import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { taydennaSyote } from "@/lib/tarjouslaskenta";
import { haeLaskurinHinnat } from "@/lib/tarjouslaskuri-kirjasto";
import { rakennuksenNimi } from "@/lib/rakennukset";
import { Ilmoitus, Virhe } from "@/components/projektinhallinta";
import { TarjouslaskuriClient } from "@/components/TarjouslaskuriClient";

export const dynamic = "force-dynamic";

export default async function TarjouslaskentaPage({
  searchParams,
}: {
  searchParams: { rakennus?: string; virhe?: string; ilmoitus?: string };
}) {
  const [rakennus, hinnat, kirjastossa] = await Promise.all([
    searchParams.rakennus
      ? prisma.building.findUnique({
          where: { id: searchParams.rakennus },
          include: { offer: true, project: true, _count: { select: { parts: { where: { source: "LASKURI" } } } } },
        })
      : null,
    haeLaskurinHinnat(prisma),
    prisma.structureType.count({ where: { laskuriAvain: { not: null } } }),
  ]);
  const paluu = rakennus
    ? rakennus.projectId
      ? `/projektit/${rakennus.projectId}/rakennukset/${rakennus.id}`
      : `/asiakkuuksien-hallinta/tarjoukset/${rakennus.offerId}`
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Asiakkuuksien hallinta &raquo; Tarjouslaskenta
          {rakennus && (
            <>
              {" "}
              &raquo;{" "}
              <Link href={paluu!} className="hover:text-ink">
                {rakennus.project ? rakennus.project.name : rakennus.offer?.title} · {rakennuksenNimi(rakennus)}
              </Link>
            </>
          )}
        </p>
        <h1 className="text-2xl">Tarjouslaskenta</h1>
        <p className="text-ink-2 text-sm mt-1 max-w-3xl">
          Woodcomp Modulesin kustannusarviolaskuri: antaa konseptin mukaisen rakennuksen omakustannuksen ja myyntihinnan arviolta
          5 % tarkkuudella. Rivit on lajiteltu litteroittain. Määrät lasketaan syötteistä ja yksikköhinnat tulevat{" "}
          <Link href="/tuotehallinta/rakenneosat?lahde=laskuri" className="underline">
            rakenneosakirjastosta
          </Link>
          {kirjastossa === 0 && " (kirjastossa ei vielä ole laskurin rivejä, joten käytössä ovat laskurin oletushinnat)"}. Kun laskenta
          tallennetaan rakennukselle, rivit viedään sen määräluetteloon, josta muodostuvat tarjouksen omakustannus, kate ja hankinnat.
        </p>
      </div>

      <Virhe viesti={searchParams.virhe} />
      <Ilmoitus viesti={searchParams.ilmoitus} />

      {!rakennus && searchParams.rakennus && <Virhe viesti="Rakennusta ei löytynyt." />}

      <TarjouslaskuriClient
        alkusyote={taydennaSyote(rakennus?.laskentaSyote)}
        hinnat={hinnat}
        rakennus={rakennus ? { id: rakennus.id, nimi: rakennus.code, aiempiaRiveja: rakennus._count.parts } : undefined}
        paluu={paluu}
      />
    </div>
  );
}
