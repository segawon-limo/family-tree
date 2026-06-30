import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// DELETE relasi spouse. BEDA dengan person -- ini hard delete, bukan
// soft delete, karena relasi pernikahan yang salah input tidak ada
// nilai historisnya utk disimpan (beda dgn data orang).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  await prisma.spouse.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// PATCH: ubah status pernikahan (misal dari 'menikah' jadi 'cerai'/'wafat')
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { status } = await req.json();
  if (!['menikah', 'cerai', 'wafat'].includes(status)) {
    return NextResponse.json({ error: 'Status tidak valid.' }, { status: 400 });
  }
  const updated = await prisma.spouse.update({ where: { id }, data: { status } });
  return NextResponse.json(updated);
}
