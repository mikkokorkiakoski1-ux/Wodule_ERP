import { prisma } from "@/lib/prisma";
import { createChecklist, addChecklistItem, setChecklistItemResult } from "@/lib/actions/laadunvarmistus";

export const dynamic = "force-dynamic";

export default async function TarkastuslistatPage() {
  const checklists = await prisma.qaChecklist.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { seq: "asc" } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted font-mono uppercase">Laadunvarmistus &raquo; Tarkastuslistat</p>
        <h1 className="text-2xl font-semibold">Tarkastuslistat</h1>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi tarkastuslista</h2>
        <form action={createChecklist} className="flex gap-3">
          <input name="title" placeholder="Otsikko" required className="flex-1 field" />
          <button className="btn btn-primary">Lisää</button>
        </form>
      </div>

      <div className="flex flex-col gap-4">
        {checklists.map((cl) => (
          <div key={cl.id} className="card p-5">
            <h3 className="font-semibold mb-3">{cl.title}</h3>
            <div className="flex flex-col gap-2 mb-3">
              {cl.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{item.label}</span>
                  <div className="flex gap-1 shrink-0">
                    <form
                      action={async () => {
                        "use server";
                        await setChecklistItemResult(item.id, true);
                      }}
                    >
                      <button
                        className={`badge ${item.passed === true ? "ok" : "muted"}`}
                        title="Hyväksytty"
                      >
                        OK
                      </button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await setChecklistItemResult(item.id, false);
                      }}
                    >
                      <button
                        className={`badge ${item.passed === false ? "crit" : "muted"}`}
                        title="Hylätty"
                      >
                        Ei OK
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              {cl.items.length === 0 && (
                <div className="text-sm text-ink-muted">Ei vielä tarkastuskohtia.</div>
              )}
            </div>
            <form action={addChecklistItem} className="flex gap-2">
              <input type="hidden" name="checklistId" value={cl.id} />
              <input
                name="label"
                placeholder="Uusi tarkastuskohta"
                required
                className="flex-1 field !text-xs"
              />
              <button className="badge muted">Lisää kohta</button>
            </form>
          </div>
        ))}
        {checklists.length === 0 && (
          <div className="card p-6 text-center text-ink-muted text-sm">Ei vielä tarkastuslistoja.</div>
        )}
      </div>
    </div>
  );
}
