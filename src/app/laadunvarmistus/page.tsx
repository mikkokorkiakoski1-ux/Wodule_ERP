import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LaadunvarmistusPage() {
  const [checklistCount, documentCount] = await Promise.all([
    prisma.qaChecklist.count(),
    prisma.qaDocument.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Laadunvarmistus</h1>
        <p className="text-ink-2 text-sm mt-1">Tarkastuslistat ja dokumentit (dopit).</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/laadunvarmistus/tarkastuslistat" className="card p-5 hover:border-line-strong">
          <div className="font-semibold">Tarkastuslistat</div>
          <div className="text-2xl font-mono mt-2">{checklistCount}</div>
          <div className="text-xs text-ink-muted mt-1">tarkastuslistaa</div>
        </Link>
        <Link href="/laadunvarmistus/dopit" className="card p-5 hover:border-line-strong">
          <div className="font-semibold">Dopit</div>
          <div className="text-2xl font-mono mt-2">{documentCount}</div>
          <div className="text-xs text-ink-muted mt-1">dokumenttia</div>
        </Link>
      </div>
    </div>
  );
}
