import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TuotePage({ params }: { params: { tuoteId: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.tuoteId },
    include: { priceListItems: { include: { priceList: true } } },
  });
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">
          Tuotehallinta &raquo; Nimikkeistö &raquo; {product.code}
        </p>
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-ink-2 text-sm mt-1">
          {product.code} · {product.unit}
        </p>
      </div>

      {product.description && <p className="text-sm text-ink-2">{product.description}</p>}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Hinnasto</th>
              <th className="p-3 text-right">Yksikköhinta</th>
            </tr>
          </thead>
          <tbody>
            {product.priceListItems.map((i) => (
              <tr key={i.id} className="border-b border-line last:border-0">
                <td className="p-3">{i.priceList.name}</td>
                <td className="p-3 text-right font-mono">
                  {(i.unitPriceCents / 100).toFixed(2)} {i.currency}
                </td>
              </tr>
            ))}
            {product.priceListItems.length === 0 && (
              <tr>
                <td colSpan={2} className="p-6 text-center text-ink-muted">
                  Nimike ei ole vielä millään hinnastolla.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
