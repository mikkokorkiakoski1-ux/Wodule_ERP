import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createCustomer } from "@/lib/actions/asiakkuudet";

export const dynamic = "force-dynamic";

export default async function AsiakkuuksienHallintaPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { projects: true, offers: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Asiakkuuksien hallinta</h1>
        <p className="text-ink-2 text-sm mt-1">
          Asiakkaat, tarjoukset ja projektit. Ks. myös{" "}
          <Link className="underline" href="/asiakkuuksien-hallinta/tarjoukset">
            Tarjoukset
          </Link>
          ,{" "}
          <Link className="underline" href="/projektit">
            Projektit
          </Link>{" "}
          ja{" "}
          <Link className="underline" href="/projektit/tuotantoaikataulu">
            Tuotantoaikataulu projektit
          </Link>
          .
        </p>
        <p className="text-sm mt-1">
          <Link href="/tiedonsiirto?kohde=asiakkaat#tuonti" className="underline">
            Tuo asiakkaita tiedostosta
          </Link>{" "}
          ·{" "}
          <a href="/api/tiedonsiirto/vienti?kohde=asiakkaat&muoto=xlsx" className="underline">
            Vie Exceliin
          </a>
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi asiakas</h2>
        <form action={createCustomer} className="grid grid-cols-2 gap-3">
          <input name="name" placeholder="Nimi" required className="field" />
          <input name="businessId" placeholder="Y-tunnus" className="field" />
          <input name="contactName" placeholder="Yhteyshenkilö" className="field" />
          <input name="contactEmail" type="email" placeholder="Sähköposti" className="field" />
          <input name="contactPhone" placeholder="Puhelin" className="field" />
          <button className="justify-self-start btn btn-primary">
            Lisää asiakas
          </button>
        </form>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Nimi</th>
              <th className="p-3">Y-tunnus</th>
              <th className="p-3">Yhteyshenkilö</th>
              <th className="p-3 text-right">Tarjoukset</th>
              <th className="p-3 text-right">Projektit</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-ink-2">{c.businessId || "–"}</td>
                <td className="p-3 text-ink-2">{c.contactName || "–"}</td>
                <td className="p-3 text-right font-mono">{c._count.offers}</td>
                <td className="p-3 text-right font-mono">{c._count.projects}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-muted">
                  Ei vielä asiakkaita.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
