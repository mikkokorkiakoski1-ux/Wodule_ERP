import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TuotannonOhjausPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      productionFolder: { include: { _count: { select: { workOrders: true, drawings: true } } } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tuotannon ohjaus</h1>
        <p className="text-ink-2 text-sm mt-1">
          Jokaisella projektilla on oma Sharepoint-tuotantokansio työmääräimineen ja piirustuksineen.
        </p>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Projekti</th>
              <th className="p-3">Asiakas</th>
              <th className="p-3">Sharepoint</th>
              <th className="p-3 text-right">Työmääräimiä</th>
              <th className="p-3 text-right">Piirustuksia</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-ink-2">{p.customer.name}</td>
                <td className="p-3">
                  <span className={`badge ${p.productionFolder?.sharepointUrl ? "ok" : "muted"}`}>
                    {p.productionFolder?.sharepointUrl ? "Yhdistetty" : "Ei yhdistetty"}
                  </span>
                </td>
                <td className="p-3 text-right font-mono">{p.productionFolder?._count.workOrders ?? 0}</td>
                <td className="p-3 text-right font-mono">{p.productionFolder?._count.drawings ?? 0}</td>
                <td className="p-3 text-right">
                  <Link href={`/tuotannon-ohjaus/${p.id}`} className="underline text-xs">
                    Avaa kansio
                  </Link>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  Ei vielä projekteja. Lisää projekti Asiakkuuksien hallinnassa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
