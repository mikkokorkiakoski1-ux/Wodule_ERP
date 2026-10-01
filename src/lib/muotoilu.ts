/** Näyttömuotoilut: päivämäärät, viikot ja eurot suomalaisittain. */
import { isoViikko } from "@/lib/projektiaikataulu";

export function pvm(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("fi-FI") : "–";
}

/** Lyhyt päivämäärä ilman vuotta, esim. "8.9." */
export function lyhytPvm(d: Date | null | undefined): string {
  return d ? `${d.getDate()}.${d.getMonth() + 1}.` : "–";
}

export function viikko(d: Date | null | undefined): string {
  return d ? `vko ${isoViikko(d)}` : "–";
}

export function euro(sentit: number | null | undefined): string {
  if (sentit === null || sentit === undefined) return "–";
  return (sentit / 100).toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
}

/** Päivämäärä <input type="date"> -kentän arvoksi (VVVV-KK-PP). */
export function syotePvm(d: Date | null | undefined): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Senttimäärä euro-syötteeksi, esim. 90000 -> "900". */
export function syoteEuro(sentit: number | null | undefined): string {
  return sentit === null || sentit === undefined ? "" : String(sentit / 100).replace(".", ",");
}
