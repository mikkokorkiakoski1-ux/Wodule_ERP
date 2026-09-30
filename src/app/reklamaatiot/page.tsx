import { prisma } from "@/lib/prisma";
import { createComplaint, updateComplaintStatus } from "@/lib/actions/reklamaatiot";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  AVOIN: "Avoin",
  SELVITYKSESSA: "Selvityksessä",
  RATKAISTU: "Ratkaistu",
  HYLATTY: "Hylätty",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL);

export default async function ReklamaatiotPage() {
  const [complaints, customers] = await Promise.all([
    prisma.complaint.findMany({ orderBy: { createdAt: "desc" }, include: { customer: true } }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Reklamaatiot</h1>
        <p className="text-ink-2 text-sm mt-1">Asiakkailta tulleet reklamaatiot ja niiden käsittely.</p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Uusi reklamaatio</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-ink-muted">Lisää ensin asiakas Asiakkuuksien hallinta -sivulla.</p>
        ) : (
          <form action={createComplaint} className="grid grid-cols-2 gap-3">
            <select name="customerId" required className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised">
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Otsikko" required className="border border-line rounded-md px-3 py-2 text-sm bg-surface-raised" />
            <textarea
              name="description"
              placeholder="Kuvaus"
              required
              className="col-span-2 border border-line rounded-md px-3 py-2 text-sm bg-surface-raised"
            />
            <button className="justify-self-start bg-ink text-surface rounded-full px-4 py-2 text-sm font-semibold">
              Lisää reklamaatio
            </button>
          </form>
        )}
      </div>

      <div className="card divide-y divide-line">
        {complaints.map((c) => (
          <div key={c.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{c.title}</div>
              <div className="text-xs text-ink-2 mt-0.5">{c.customer.name}</div>
              <div className="text-sm text-ink-2 mt-1">{c.description}</div>
            </div>
            <form action={updateComplaintStatus} className="flex items-center gap-2 shrink-0">
              <input type="hidden" name="id" value={c.id} />
              <select
                name="status"
                defaultValue={c.status}
                className="border border-line rounded-md px-2 py-1 text-xs bg-surface-raised"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <button className="badge muted" type="submit">
                Päivitä
              </button>
            </form>
          </div>
        ))}
        {complaints.length === 0 && (
          <div className="p-6 text-center text-ink-muted text-sm">Ei vielä reklamaatioita.</div>
        )}
      </div>
    </div>
  );
}
