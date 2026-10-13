import { NextResponse } from "next/server";
import { muodostaTarjousPdf } from "@/lib/tarjous-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/tarjoukset/<id>/pdf -> tarjouksen PDF. ?lataa=1 lataa tiedoston,
// muuten PDF avautuu selaimeen tulostettavaksi. ?sisalto=0 jättää
// rakennusten sisältöerittelyn pois (pelkkä yhteenveto).
export async function GET(req: Request, { params }: { params: { tarjousId: string } }) {
  const haku = new URL(req.url).searchParams;
  const pdf = await muodostaTarjousPdf(params.tarjousId, { sisalto: haku.get("sisalto") !== "0" });
  if (!pdf) return NextResponse.json({ error: "Tarjousta ei löydy" }, { status: 404 });
  const lataa = haku.get("lataa") === "1";
  return new NextResponse(new Uint8Array(pdf.tiedosto), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${lataa ? "attachment" : "inline"}; filename="${pdf.tiedostonimi}"`,
      "Cache-Control": "no-store",
    },
  });
}
