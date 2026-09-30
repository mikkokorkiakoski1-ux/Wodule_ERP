import { prisma } from "@/lib/prisma";
import { createQaDocument } from "@/lib/actions/laadunvarmistus";

export const dynamic = "force-dynamic";

export default async function DopitPage() {
  const documents = await prisma.qaDocument.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Laadunvarmistus &raquo; Dopit</p>
        <h1 className="text-2xl font-semibold">Dopit</h1>
        <p className="text-ink-2 text-sm mt-1">
          Laadunvarmistuksen dokumentit. Tiedoston lataus (varsinainen tiedostotallennus) on jätetty
          Claude Coden jatkokehitykseen - <code>fileUrl</code> osoittaa toistaiseksi ulkoiseen linkkiin.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi dokumentti</h2>
        <form action={createQaDocument} className="grid grid-cols-2 gap-3">
          <input name="title" placeholder="Otsikko" required className="field" />
          <input name="category" placeholder="Kategoria" className="field" />
          <input name="fileUrl" placeholder="Linkki tiedostoon" className="col-span-2 field" />
          <button className="justify-self-start btn btn-primary">
            Lisää dokumentti
          </button>
        </form>
      </div>

      <div className="card divide-y divide-line">
        {documents.map((d) => (
          <div key={d.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{d.title}</div>
              {d.category && <div className="text-xs text-ink-2">{d.category}</div>}
            </div>
            {d.fileUrl && (
              <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                Avaa
              </a>
            )}
          </div>
        ))}
        {documents.length === 0 && (
          <div className="p-6 text-center text-ink-muted text-sm">Ei vielä dokumentteja.</div>
        )}
      </div>
    </div>
  );
}
