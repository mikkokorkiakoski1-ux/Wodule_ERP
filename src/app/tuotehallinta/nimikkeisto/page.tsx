import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/lib/actions/tuotehallinta";

export const dynamic = "force-dynamic";

export default async function NimikkeistoPage() {
  const products = await prisma.product.findMany({ orderBy: { code: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Tuotehallinta &raquo; Nimikkeistö</p>
        <h1 className="text-2xl font-semibold">Nimikkeistö</h1>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi nimike</h2>
        <form action={createProduct} className="grid grid-cols-2 gap-3">
          <input name="code" placeholder="Koodi" required className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
          <input name="name" placeholder="Nimi" required className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
          <input name="unit" placeholder="Yksikkö" defaultValue="kpl" className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
          <input name="description" placeholder="Kuvaus" className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
          <button className="justify-self-start bg-ink text-surface rounded-full px-4 py-2 text-sm font-semibold">
            Lisää nimike
          </button>
        </form>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3">Koodi</th>
              <th className="p-3">Nimi</th>
              <th className="p-3">Yksikkö</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="p-3 font-mono">{p.code}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-ink-2">{p.unit}</td>
                <td className="p-3 text-right">
                  <Link href={`/tuotehallinta/nimikkeisto/${p.id}`} className="underline text-xs">
                    Avaa
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-muted">
                  Ei vielä nimikkeitä.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
