import { NextRequest, NextResponse } from "next/server";
import { vientiInput } from "@/lib/validation";
import { VientiVirhe, latausvastaus, muodostaVienti } from "@/lib/tiedonsiirto/vienti";

export const dynamic = "force-dynamic";

// GET ?kohde=<avain|kaikki>&muoto=csv|xlsx|json -> ladattava tiedosto
export async function GET(req: NextRequest) {
  const parsed = vientiInput.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return latausvastaus(await muodostaVienti(parsed.data.kohde, parsed.data.muoto));
  } catch (e) {
    if (e instanceof VientiVirhe) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
