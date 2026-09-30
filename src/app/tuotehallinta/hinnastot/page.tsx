import { prisma } from "@/lib/prisma";
import { createPriceList, addPriceListItem } from "@/lib/actions/tuotehallinta";

export const dynamic = "force-dynamic";

export default async function HinnastotPage() {
  const [priceLists, products] = await Promise.all([
    prisma.priceList.findMany({
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } },
    }),
    prisma.product.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Tuotehallinta &raquo; Hinnastot</p>
        <h1 className="text-2xl font-semibold">Hinnastot</h1>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi hinnasto</h2>
        <form action={createPriceList} className="grid grid-cols-2 gap-3">
          <input name="name" placeholder="Nimi" required className="field" />
          <input name="validFrom" type="date" className="field" />
          <button className="justify-self-start btn btn-primary">
            Lisää hinnasto
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-4">
        {priceLists.map((pl) => (
          <div key={pl.id} className="card p-5">
            <h3 className="font-semibold mb-3">{pl.name}</h3>

            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
                  <th className="p-2">Nimike</th>
                  <th className="p-2 text-right">Hinta</th>
                </tr>
              </thead>
              <tbody>
                {pl.items.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="p-2">
                      {i.product.code} - {i.product.name}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {(i.unitPriceCents / 100).toFixed(2)} {i.currency}
                    </td>
                  </tr>
                ))}
                {pl.items.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-3 text-center text-ink-muted">
                      Ei vielä nimikkeitä tällä hinnastolla.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {products.length > 0 && (
              <form action={addPriceListItem} className="flex gap-2 items-center">
                <input type="hidden" name="priceListId" value={pl.id} />
                <select name="productId" required className="field">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
                <input
                  name="unitPriceEuros"
                  type="number"
                  step="0.01"
                  placeholder="Hinta (€)"
                  required
                  className="field w-32"
                />
                <button className="btn btn-primary btn-sm">
                  Lisää
                </button>
              </form>
            )}
          </div>
        ))}
        {priceLists.length === 0 && (
          <div className="card p-6 text-center text-ink-muted text-sm">Ei vielä hinnastoja.</div>
        )}
      </div>
    </div>
  );
}
