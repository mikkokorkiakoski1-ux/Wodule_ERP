import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderInput } from "@/lib/validation";

// Vaihtaa kahden rivin seq-arvon keskenään (sama "swapSeq" -logiikka kuin
// aiemmassa Artifact-työkalussa).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = reorderInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [a, b] = await Promise.all([
    prisma.productionScheduleItem.findUniqueOrThrow({ where: { id: parsed.data.idA } }),
    prisma.productionScheduleItem.findUniqueOrThrow({ where: { id: parsed.data.idB } }),
  ]);

  await prisma.$transaction([
    prisma.productionScheduleItem.update({ where: { id: a.id }, data: { seq: b.seq } }),
    prisma.productionScheduleItem.update({ where: { id: b.id }, data: { seq: a.seq } }),
  ]);

  return NextResponse.json({ ok: true });
}
