import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// PATCH /api/account/nama
// Ganti nama SENDIRI saja -- pakai session.personId, TIDAK menerima
// personId dari body. Kalau nerima personId dari body, ini jadi endpoint
// "ganti nama siapa saja" yang sama persis dengan bug yang baru saja
// diperbaiki di endpoint foto (lihat app/api/admin/persons/[id]/foto).
export async function PATCH(req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    return e as Response;
  }

  if (!session.personId) {
    return NextResponse.json(
      { error: 'Akun ini belum terhubung ke node person manapun -- tidak ada yang bisa diganti namanya.' },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const nama = typeof body.nama === 'string' ? body.nama.trim() : '';

  if (nama.length < 2) {
    return NextResponse.json({ error: 'Nama minimal 2 karakter.' }, { status: 400 });
  }
  if (nama.length > 100) {
    return NextResponse.json({ error: 'Nama maksimal 100 karakter.' }, { status: 400 });
  }

  await prisma.person.update({
    where: { id: session.personId },
    data: { nama },
  });

  return NextResponse.json({ ok: true, nama });
}