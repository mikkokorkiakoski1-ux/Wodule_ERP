import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TuotehallintaPage() {
  const [productCount, priceListCount] = await Promise.all([
    prisma.product.count(),
    prisma.priceList.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tuotehallinta</h1>
        <p className="text-ink-2 text-sm mt-1">Nimikkeistö ja hinnastot.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/tuotehallinta/nimikkeisto" className="card p-5 hover:border-line-strong">
          <div className="font-semibold">Nimikkeistö</div>
          <div className="text-2xl font-mono mt-2">{productCount}</div>
          <div className="text-xs text-ink-muted mt-1">nimikettä</div>
        </Link>
        <Link href="/tuotehallinta/hinnastot" className="card p-5 hover:border-line-strong">
          <div className="font-semibold">Hinnastot</div>
          <div className="text-2xl font-mono mt-2">{priceListCount}</div>
          <div className="text-xs text-ink-muted mt-1">hinnastoa</div>
        </Link>
      </div>
    </div>
  );
}
