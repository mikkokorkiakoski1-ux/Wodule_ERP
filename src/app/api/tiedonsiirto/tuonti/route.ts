import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { tuontiInput } from "@/lib/validation";
import { TiedostoVirhe, lueTiedosto, tunnistaMuoto } from "@/lib/tiedonsiirto/tiedostot";
import { TuontiVirhe, kirjaaTuonti, tuo } from "@/lib/tiedonsiirto/tuonti";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAKSIMIKOKO = 15 * 1024 * 1024;

// POST multipart/form-data: tiedosto, kohde, tapa, virheet, esikatselu
// -> TuontiRaportti. Esikatselu ei muuta tietokantaa.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const tiedosto = form.get("tiedosto");
  if (!(tiedosto instanceof File) || tiedosto.size === 0) {
    return NextResponse.json({ error: "Valitse tuotava tiedosto" }, { status: 400 });
  }
  if (tiedosto.size > MAKSIMIKOKO) {
    return NextResponse.json({ error: "Tiedosto on liian suuri (enintään 15 Mt)" }, { status: 400 });
  }
  const muoto = tunnistaMuoto(tiedosto.name);
  if (!muoto) {
    return NextResponse.json({ error: "Tuetut tiedostomuodot ovat .csv, .xlsx ja .json" }, { status: 400 });
  }

  const parsed = tuontiInput.safeParse({
    kohde: form.get("kohde"),
    tapa: form.get("tapa") || undefined,
    virheet: form.get("virheet") || undefined,
    esikatselu: form.get("esikatselu"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const taulukot = await lueTiedosto(new Uint8Array(await tiedosto.arrayBuffer()), muoto);
    const raportti = await tuo(taulukot, parsed.data);
    if (raportti.tallennettu) {
      await kirjaaTuonti(raportti, parsed.data.kohde, muoto, tiedosto.name);
      revalidatePath("/", "layout");
    }
    return NextResponse.json(raportti);
  } catch (e) {
    if (e instanceof TiedostoVirhe || e instanceof TuontiVirhe) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
