import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productionScheduleItemInput } from "@/lib/validation";

export async function GET() {
  const items = await prisma.productionScheduleItem.findMany({
    orderBy: { seq: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = productionScheduleItemInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const max = await prisma.productionScheduleItem.aggregate({ _max: { seq: true } });
  const nextSeq = (max._max.seq ?? 0) + 1;

  const created = await prisma.productionScheduleItem.create({
    data: {
      ...parsed.data,
      luvattu: parsed.data.luvattu ?? null,
      aloitus: parsed.data.aloitus ?? null,
      valmiusaste: parsed.data.valmiusaste ?? null,
      seq: nextSeq,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
