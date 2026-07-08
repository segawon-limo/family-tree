import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, getScopedPersonIds } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireAdmin();
  } catch (e) {
    return e as Response;
  }
  const scopedIds = await getScopedPersonIds(session.sub);
  if (scopedIds !== null) {
    return NextResponse.json(
      { error: 'Cuma admin utama yang bisa mengelola sub-admin.' },
      { status: 403 }
    );
  }

  // CATATAN PRODUK, BUKAN BUG: revoke di sini TIDAK menurunkan role user
  // itu balik ke 'member' secara otomatis. Kalau admin utama mau
  // benar-benar mencabut status admin (bukan cuma satu scope-nya), itu
  // langkah terpisah yang perlu diputuskan manual -- user itu mungkin
  // masih punya AdminScope lain, atau memang mau tetap admin tanpa scope
  // (jadi super admin) untuk sementara.
  await prisma.adminScope.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}