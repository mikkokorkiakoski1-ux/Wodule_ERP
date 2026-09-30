import { prisma } from "@/lib/prisma";
import { createOffer } from "@/lib/actions/asiakkuudet";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LUONNOS: "Luonnos",
  LAHETETTY: "Lähetetty",
  HYVAKSYTTY: "Hyväksytty",
  HYLATTY: "Hylätty",
};

export default async function TarjouksetPage() {
  const [offers, customers] = await Promise.all([
    prisma.offer.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true, project: true },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tarjoukset</h1>
        <p className="text-ink-2 text-sm mt-1">Asiakkuuksien hallinta &raquo; Tarjoukset</p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi tarjous</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-ink-muted">Lisää ensin asiakas Asiakkuuksien hallinta -sivulla.</p>
        ) : (
          <form action={createOffer} className="grid grid-cols-2 gap-3">
            <select name="customerId" required className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised">
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Otsikko" required className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
            <input name="amountEuros" type="number" step="0.01" placeholder="Summa (€)" className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
            <input name="validUntil" type="date" className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
            <button className="justify-self-start bg-ink text-surface rounded-full px-4 py-2 text-sm font-semibold">
              Lisää tarjous
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Asiakas</th>
              <th className="p-3">Otsikko</th>
              <th className="p-3">Tila</th>
              <th className="p-3 text-right">Summa</th>
              <th className="p-3">Voimassa</th>
              <th className="p-3">Projekti</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{o.customer.name}</td>
                <td className="p-3">{o.title}</td>
                <td className="p-3">
                  <span className="badge muted">{STATUS_LABEL[o.status]}</span>
                </td>
                <td className="p-3 text-right font-mono">
                  {o.amountCents != null ? (o.amountCents / 100).toFixed(2) + " €" : "–"}
                </td>
                <td className="p-3 text-ink-2">
                  {o.validUntil ? new Date(o.validUntil).toLocaleDateString("fi-FI") : "–"}
                </td>
                <td className="p-3 text-ink-2">{o.project ? o.project.name : "–"}</td>
              </tr>
            ))}
            {offers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  Ei vielä tarjouksia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
