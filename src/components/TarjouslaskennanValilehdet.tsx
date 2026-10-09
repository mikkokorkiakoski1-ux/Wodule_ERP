import Link from "next/link";

// Tarjouslaskennan tilat: laskuri (määrät syötteistä), manuaalinen
// (rivit itse rakenneosista, nimikkeistä ja vapaina riveinä) ja pohjat.
// Rakennus kulkee mukana välilehdeltä toiselle.
export function TarjouslaskennanValilehdet({ aktiivinen, rakennusId }: { aktiivinen: "laskuri" | "manuaalinen" | "pohjat"; rakennusId?: string }) {
  const haku = rakennusId ? `?rakennus=${rakennusId}` : "";
  const valilehdet = [
    { avain: "laskuri", nimi: "Laskuri", href: `/asiakkuuksien-hallinta/tarjouslaskenta${haku}` },
    { avain: "manuaalinen", nimi: "Manuaalinen", href: `/asiakkuuksien-hallinta/tarjouslaskenta/manuaalinen${haku}` },
    { avain: "pohjat", nimi: "Pohjat", href: `/asiakkuuksien-hallinta/tarjouslaskenta/pohjat${haku}` },
  ];
  return (
    <nav className="flex gap-1 border-b border-line">
      {valilehdet.map((v) => (
        <Link
          key={v.avain}
          href={v.href}
          aria-current={v.avain === aktiivinen ? "page" : undefined}
          className={`px-4 py-2 -mb-px border-b-2 font-heading text-[13px] font-semibold uppercase tracking-wide transition-colors ${
            v.avain === aktiivinen ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink hover:border-line-strong"
          }`}
        >
          {v.nimi}
        </Link>
      ))}
    </nav>
  );
}
