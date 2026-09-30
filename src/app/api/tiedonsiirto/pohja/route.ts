import { NextRequest, NextResponse } from "next/server";
import { pohjaInput } from "@/lib/validation";
import { VientiVirhe, latausvastaus, muodostaPohja } from "@/lib/tiedonsiirto/vienti";

export const dynamic = "force-dynamic";

// GET ?kohde=<avain|kaikki>&muoto=csv|xlsx -> tyhjä tuontipohja esimerkkirivillä
export async function GET(req: NextRequest) {
  const parsed = pohjaInput.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return latausvastaus(await muodostaPohja(parsed.data.kohde, parsed.data.muoto));
  } catch (e) {
    if (e instanceof VientiVirhe) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
