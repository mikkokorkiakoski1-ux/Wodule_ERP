import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createProject } from "@/lib/actions/asiakkuudet";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SUUNNITTELU: "Suunnittelu",
  KAYNNISSA: "Käynnissä",
  VALMIS: "Valmis",
  KESKEYTETTY: "Keskeytetty",
};

export default async function ProjektitPage() {
  const [projects, customers, offers] = await Promise.all([
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.offer.findMany({ where: { project: { is: null } }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Projektit</h1>
        <p className="text-ink-2 text-sm mt-1">
          Asiakkuuksien hallinta &raquo; Projektit. Ks. myös{" "}
          <Link className="underline" href="/asiakkuuksien-hallinta/projektit/tuotantoaikataulu">
            Tuotantoaikataulu projektit
          </Link>
          .
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi projekti</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-ink-muted">Lisää ensin asiakas.</p>
        ) : (
          <form action={createProject} className="grid grid-cols-2 gap-3">
            <select name="customerId" required className="field">
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="name" placeholder="Projektin nimi" required className="field" />
            <select name="offerId" className="field">
              <option value="">(ei liitetä tarjoukseen)</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
            <input name="promisedDeliveryDate" type="date" className="field" />
            <textarea
              name="description"
              placeholder="Kuvaus"
              className="col-span-2 field"
            />
            <button className="justify-self-start btn btn-primary">
              Lisää projekti
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Projekti</th>
              <th className="p-3">Asiakas</th>
              <th className="p-3">Tila</th>
              <th className="p-3">Luvattu toimitus</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-ink-2">{p.customer.name}</td>
                <td className="p-3">
                  <span className="badge muted">{STATUS_LABEL[p.status]}</span>
                </td>
                <td className="p-3 text-ink-2">
                  {p.promisedDeliveryDate
                    ? new Date(p.promisedDeliveryDate).toLocaleDateString("fi-FI")
                    : "–"}
                </td>
                <td className="p-3 text-right">
                  <Link
                    href={`/asiakkuuksien-hallinta/projektit/${p.id}`}
                    className="underline text-sm"
                  >
                    Avaa (Yhteenveto)
                  </Link>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-muted">
                  Ei vielä projekteja.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
