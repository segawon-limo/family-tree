import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch (e) { return e as Response; }
  const { id } = params;
  await prisma.spouse.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch (e) { return e as Response; }
  const { id } = params;
  const { status } = await req.json();
  if (!['menikah', 'cerai', 'wafat'].includes(status)) {
    return NextResponse.json({ error: 'Status tidak valid.' }, { status: 400 });
  }
  const updated = await prisma.spouse.update({ where: { id }, data: { status } });
  return NextResponse.json(updated);
}