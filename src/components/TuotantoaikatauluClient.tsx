"use client";

import { useEffect, useMemo, useState } from "react";
import {
  recompute,
  computeKpis,
  statusLabel,
  type ScheduleInput,
  type ScheduleComputed,
} from "@/lib/production-schedule";

// API:sta tuleva rivi - päivämäärät ovat JSON:ssa ISO-merkkijonoja.
interface ApiItem {
  id: string;
  seq: number;
  tilaaja: string;
  projekti: string;
  rakennuksia: number | null;
  luvattu: string | null;
  aloitus: string | null;
  siirto: number;
  tuntimenekki: number;
  tyontekijoita: number;
  tyopisteita: number;
  kesto: number;
  valmiusaste: number | null;
}

const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const FALLBACK_COLOR = "#898781";

function toScheduleInput(items: ApiItem[]): ScheduleInput[] {
  return items.map((d) => ({
    ...d,
    aloitus: d.aloitus ? new Date(d.aloitus) : null,
  }));
}

function fmtDate(d: Date | null): string {
  if (!d) return "–";
  return d.toLocaleDateString("fi-FI");
}

function fmtKesto(v: number | null): string {
  if (v == null || !isFinite(v)) return "–";
  return Math.round(v * 10) / 10 + " pv";
}

function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const emptyForm = {
  tilaaja: "",
  projekti: "",
  rakennuksia: "1",
  luvattu: "",
  tuntimenekki: "",
  tyontekijoita: "",
  tyopisteita: "4",
  kesto: "",
  valmiusaste: "",
  siirto: "0",
  aloitus: "",
};

type FormState = typeof emptyForm;

export function TuotantoaikatauluClient() {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/tuotantoaikataulu", { cache: "no-store" });
      if (!res.ok) throw new Error("Haku epäonnistui");
      setItems(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tuntematon virhe");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const computed = useMemo(() => recompute(toScheduleInput(items)), [items]);
  const kpis = useMemo(() => computeKpis(computed), [computed]);

  const customers = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    [...computed]
      .sort((a, b) => a.seq - b.seq)
      .forEach((p) => {
        if (!seen.has(p.tilaaja)) {
          seen.add(p.tilaaja);
          order.push(p.tilaaja);
        }
      });
    return order;
  }, [computed]);

  const colorOf = (tilaaja: string) => {
    const idx = customers.indexOf(tilaaja);
    return idx >= 0 && idx < PALETTE.length ? PALETTE[idx] : FALLBACK_COLOR;
  };

  const visible = computed.filter((p) => {
    if (excluded.has(p.tilaaja)) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!p.projekti.toLowerCase().includes(s) && !p.tilaaja.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  // ---- Gantt-mitoitus ----
  const validDates = computed.flatMap((p) => [p.aloitusDate, p.ennusteDate]).filter(Boolean) as Date[];
  const today = new Date();
  const allDates = validDates.length ? [...validDates, today] : [today];
  const minStart = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxEnd = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const rangeStart = new Date(minStart);
  rangeStart.setDate(rangeStart.getDate() - 7);
  const DAY_W = 14;
  const totalDays = Math.max(1, Math.round((maxEnd.getTime() - rangeStart.getTime()) / 86400000) + 14);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p: ScheduleComputed) {
    setEditingId(p.id);
    setForm({
      tilaaja: p.tilaaja,
      projekti: p.projekti,
      rakennuksia: String(p.rakennuksia ?? 1),
      luvattu: "",
      tuntimenekki: String(p.tuntimenekki),
      tyontekijoita: String(p.tyontekijoita),
      tyopisteita: String(p.tyopisteita),
      kesto: String(p.kesto),
      valmiusaste: p.valmiusaste != null ? String(p.valmiusaste) : "",
      siirto: String(p.siirto),
      aloitus: toDateInputValue(p.aloitusDate && p.aloitus ? p.aloitus : null),
    });
    setFormError(null);
    setModalOpen(true);
  }

  const isRootEdit = editingId
    ? computed.find((p) => p.id === editingId)?.isRoot ?? false
    : items.length === 0;

  const liveLaskennallinenKesto = useMemo(() => {
    const t = Number(form.tuntimenekki);
    const w = Number(form.tyontekijoita);
    const s = Number(form.tyopisteita);
    if (!isFinite(t) || !isFinite(w) || !isFinite(s) || s <= 0) return null;
    const denom = (w / s) * 7.5;
    if (!isFinite(denom) || denom <= 0) return null;
    return t / denom;
  }, [form.tuntimenekki, form.tyontekijoita, form.tyopisteita]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.tilaaja.trim() || !form.projekti.trim()) {
      setFormError("Tilaaja ja projekti ovat pakollisia.");
      return;
    }
    if (!form.kesto || Number(form.kesto) < 1) {
      setFormError("Kesto pitää olla vähintään 1 työpäivä.");
      return;
    }
    if (isRootEdit && !form.aloitus) {
      setFormError("Aseta aloituspäivä: tämä on aikataulun ensimmäinen projekti.");
      return;
    }

    const payload = {
      tilaaja: form.tilaaja.trim(),
      projekti: form.projekti.trim(),
      rakennuksia: Number(form.rakennuksia || 0),
      luvattu: form.luvattu || null,
      tuntimenekki: Number(form.tuntimenekki || 0),
      tyontekijoita: Number(form.tyontekijoita || 0),
      tyopisteita: Number(form.tyopisteita || 0),
      kesto: Number(form.kesto || 0),
      valmiusaste: form.valmiusaste === "" ? null : Number(form.valmiusaste),
      siirto: Number(form.siirto || 0),
      aloitus: form.aloitus || null,
    };

    setSaving(true);
    try {
      const res = editingId
        ? await fetch(`/api/tuotantoaikataulu/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/tuotantoaikataulu", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        setFormError("Tallennus epäonnistui. Yritä uudelleen.");
        return;
      }

      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm("Poistetaanko projekti?")) return;
    await fetch(`/api/tuotantoaikataulu/${editingId}`, { method: "DELETE" });
    setModalOpen(false);
    await load();
  }

  async function swapSeq(idA: string | null, idB: string | null) {
    if (!idA || !idB) return;
    await fetch("/api/tuotantoaikataulu/jarjestys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idA, idB }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-muted font-mono uppercase">
            Asiakkuuksien hallinta &raquo; Projektit &raquo; Tuotantoaikataulu projektit
          </p>
          <h1 className="text-2xl font-semibold">Tuotantoaikataulu</h1>
        </div>
        <button
          onClick={openAdd}
          className="btn btn-primary"
        >
          + Lisää projekti
        </button>
      </div>

      {error && <div className="text-sm text-critical">{error}</div>}

      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Projekteja yhteensä</div>
          <div className="text-2xl font-semibold font-mono">{kpis.total}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Käynnissä tänään</div>
          <div className="text-2xl font-semibold font-mono">{kpis.activeToday}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Myöhässä aikataulusta</div>
          <div className="text-2xl font-semibold font-mono text-critical">{kpis.late}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-muted">Edistymä kirjattu</div>
          <div className="text-2xl font-semibold font-mono">
            {kpis.progressRecorded} / {kpis.total}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {customers.map((c) => (
          <button
            key={c}
            onClick={() =>
              setExcluded((prev) => {
                const next = new Set(prev);
                if (next.has(c)) next.delete(c);
                else next.add(c);
                return next;
              })
            }
            className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium"
            style={{ opacity: excluded.has(c) ? 0.45 : 1 }}
          >
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: colorOf(c) }} />
            {c}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Etsi projektia…"
          className="ml-auto field py-1.5"
        />
      </div>

      {/* Yksinkertaistettu Gantt-aikajana */}
      <div className="card p-4 overflow-x-auto">
        <div style={{ minWidth: totalDays * DAY_W + 200 }}>
          {visible.map((p) => {
            const barLeft = p.aloitusDate
              ? Math.round((p.aloitusDate.getTime() - rangeStart.getTime()) / 86400000) * DAY_W
              : 0;
            const barWidth = p.aloitusDate && p.ennusteDate
              ? Math.max(
                  (Math.round((p.ennusteDate.getTime() - p.aloitusDate.getTime()) / 86400000) + 1) * DAY_W,
                  6
                )
              : 120;
            return (
              <div key={p.id} className="flex items-center h-9 border-b border-line last:border-0">
                <div className="w-48 shrink-0 text-xs font-medium truncate pr-2">{p.projekti}</div>
                <div className="relative flex-1 h-6">
                  <div
                    title={`${p.projekti} · ${p.tilaaja} · ${fmtDate(p.aloitusDate)}–${fmtDate(p.ennusteDate)}${p.isLate ? " · myöhässä" : ""}`}
                    className="absolute h-6 rounded"
                    style={{
                      left: p.invalid ? 0 : barLeft,
                      width: barWidth,
                      background: p.invalid ? "transparent" : colorOf(p.tilaaja),
                      border: p.invalid ? "1px dashed var(--line-strong)" : p.isLate ? "2px solid var(--status-critical)" : "none",
                      opacity: p.isDone ? 0.55 : 1,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="p-6 text-center text-ink-muted text-sm">Ei näkyviä projekteja.</div>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-muted font-mono border-b border-line">
              <th className="p-3"></th>
              <th className="p-3">Tilaaja</th>
              <th className="p-3">Projekti</th>
              <th className="p-3">Aloitus</th>
              <th className="p-3">Ennuste</th>
              <th className="p-3">Kesto</th>
              <th className="p-3">Laskennallinen kesto</th>
              <th className="p-3">Valmiusaste</th>
              <th className="p-3 text-right">Tuntimenekki</th>
              <th className="p-3 text-right">Työntekijöitä</th>
              <th className="p-3">Tila</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const label = statusLabel(p);
              const badgeClass = p.invalid || label === "Tulossa" ? "muted" : label === "Myöhässä" ? "crit" : "ok";
              return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        disabled={!p.prevId}
                        onClick={() => swapSeq(p.id, p.prevId)}
                        className="w-6 h-6 border border-line rounded text-xs disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        disabled={!p.nextId}
                        onClick={() => swapSeq(p.id, p.nextId)}
                        className="w-6 h-6 border border-line rounded text-xs disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: colorOf(p.tilaaja) }} />
                      {p.tilaaja}
                    </span>
                  </td>
                  <td className="p-3 font-medium">{p.projekti}</td>
                  <td className="p-3">{fmtDate(p.aloitusDate)}</td>
                  <td className="p-3">{fmtDate(p.ennusteDate)}</td>
                  <td className="p-3">{p.kesto} pv</td>
                  <td className="p-3">{fmtKesto(p.laskennallinenKesto)}</td>
                  <td className="p-3">{p.valmiusaste != null ? `${Math.round(p.valmiusaste)} %` : "–"}</td>
                  <td className="p-3 text-right font-mono">{p.tuntimenekki}</td>
                  <td className="p-3 text-right font-mono">{p.tyontekijoita}</td>
                  <td className="p-3">
                    <span className={`badge ${badgeClass}`}>{p.invalid ? "Aseta pvm" : label}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => openEdit(p)} className="text-xs underline">
                      Muokkaa
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={12} className="p-6 text-center text-ink-muted">
                  Ei projekteja.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-start justify-center p-8 z-50 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="card p-6 w-full max-w-lg bg-surface-raised">
            <h2 className="font-semibold text-lg mb-4">
              {editingId ? "Muokkaa projektia" : "Lisää projekti"}
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
              <input
                placeholder="Tilaaja"
                value={form.tilaaja}
                onChange={(e) => setForm({ ...form, tilaaja: e.target.value })}
                className="field col-span-2"
              />
              <input
                placeholder="Projekti"
                value={form.projekti}
                onChange={(e) => setForm({ ...form, projekti: e.target.value })}
                className="field col-span-2"
              />
              <input
                type="number"
                placeholder="Rakennuksia"
                value={form.rakennuksia}
                onChange={(e) => setForm({ ...form, rakennuksia: e.target.value })}
                className="field"
              />
              <input
                type="date"
                value={form.luvattu}
                onChange={(e) => setForm({ ...form, luvattu: e.target.value })}
                className="field"
                title="Luvattu toimitus"
              />
              <input
                type="number"
                placeholder="Tuntimenekki (h)"
                value={form.tuntimenekki}
                onChange={(e) => setForm({ ...form, tuntimenekki: e.target.value })}
                className="field"
              />
              <input
                type="number"
                placeholder="Työntekijöitä"
                value={form.tyontekijoita}
                onChange={(e) => setForm({ ...form, tyontekijoita: e.target.value })}
                className="field"
              />
              <input
                type="number"
                placeholder="Työpisteitä linjalla"
                value={form.tyopisteita}
                onChange={(e) => setForm({ ...form, tyopisteita: e.target.value })}
                className="field"
              />
              <div className="flex flex-col gap-1">
                <input
                  type="number"
                  placeholder="Kesto (työpäivää)"
                  value={form.kesto}
                  onChange={(e) => setForm({ ...form, kesto: e.target.value })}
                  className="field"
                />
                <span className="text-[10.5px] text-ink-muted">
                  Laskennallinen kesto: {fmtKesto(liveLaskennallinenKesto)} (tueksi, ei vaikuta aikatauluun)
                </span>
              </div>
              <input
                type="number"
                placeholder="Valmiusaste (%)"
                value={form.valmiusaste}
                onChange={(e) => setForm({ ...form, valmiusaste: e.target.value })}
                className="field"
              />
              <input
                type="number"
                placeholder="Siirto (pv edellisestä)"
                value={form.siirto}
                onChange={(e) => setForm({ ...form, siirto: e.target.value })}
                disabled={isRootEdit}
                className="field disabled:opacity-40"
              />
              <div className="col-span-2 flex flex-col gap-1">
                <input
                  type="date"
                  value={form.aloitus}
                  onChange={(e) => setForm({ ...form, aloitus: e.target.value })}
                  className="field"
                />
                <span className="text-[10.5px] text-ink-muted">
                  {isRootEdit
                    ? "Pakollinen: tämä on aikataulun ensimmäinen projekti."
                    : "Jätä tyhjäksi: lasketaan automaattisesti edellisen projektin ennusteesta + siirto."}
                </span>
              </div>

              {formError && <div className="col-span-2 text-sm text-critical">{formError}</div>}

              <div className="col-span-2 flex items-center justify-between mt-2">
                {editingId ? (
                  <button type="button" onClick={handleDelete} className="text-sm text-critical">
                    Poista projekti
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="btn btn-ghost"
                  >
                    Peruuta
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn btn-primary"
                  >
                    Tallenna
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
